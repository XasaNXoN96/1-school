'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { HttpError, send, readBody, parseCookies, serveFile } = require('./http');
const { openDb } = require('./db');
const A = require('./auth');
const { buildRoutes } = require('./routes');
const { createNotifier } = require('./notify');
const { runReminders } = require('./reminders');
const { handleRawUpload } = require('./rawupload');
const { renderLite } = require('./lite');
const { faceRoutes } = require('./routes-face');
const { createFaceEngine } = require('./face');

const COOKIE = 'sid';

// Ограничитель попыток входа (в памяти): 10 неудач за 15 минут с одного IP.
function createLoginLimiter() {
  const hits = new Map();
  return {
    blocked(ip) {
      const arr = (hits.get(ip) || []).filter((t) => Date.now() - t < 900_000);
      hits.set(ip, arr);
      return arr.length >= 10;
    },
    fail(ip) { hits.set(ip, [...(hits.get(ip) || []), Date.now()]); },
    reset(ip) { hits.delete(ip); },
  };
}

function createApp({ dbFile, dataDir, publicDir, cookieSecure = false, scheduler = true, botToken = '', publicUrl = '', faceEngine = null }) {
  const db = openDb(dbFile);
  const notifier = createNotifier(db);
  const uploadsDir = path.join(dataDir, 'uploads');
  const engine = faceEngine || createFaceEngine({ dir: path.join(publicDir, 'vendor', 'face') });
  const routes = buildRoutes({ db, notifier, uploadsDir });
  routes.push(...faceRoutes({ db, notifier, engine, botToken, publicUrl }));
  const limiter = createLoginLimiter();

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const pathname = url.pathname;

      if (pathname.startsWith('/api/')) return await handleApi(req, res, url);

      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Метод не поддерживается');
      if (pathname === '/lite' || pathname.startsWith('/lite/')) {
        const html = renderLite(db, pathname, url.searchParams.get('lang'));
        if (!html) throw new HttpError(404, 'Не найдено');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'" });
        return res.end(html);
      }
      if (pathname.startsWith('/uploads/')) {
        if (serveFile(res, uploadsDir, pathname.slice('/uploads/'.length), { 'Cache-Control': 'public, max-age=604800, immutable' }, req)) return;
        throw new HttpError(404, 'Не найдено');
      }
      const rel = pathname === '/' ? 'index.html' : pathname === '/checkin' ? 'checkin.html' : pathname.slice(1);
      // Страница проверки открывается как Telegram Mini App (в т.ч. во фрейме web.telegram.org) и использует камеру и геолокацию
      const extra = rel === 'checkin.html' ? {
        'X-Frame-Options': null,
        'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self' https://telegram.org; frame-ancestors https://web.telegram.org https://*.telegram.org https://telegram.org",
        'Permissions-Policy': 'camera=(self), geolocation=(self)',
      } : {};
      if (serveFile(res, publicDir, rel, { 'Cache-Control': 'no-cache', ...extra }, req)) return;
      throw new HttpError(404, 'Не найдено');
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      if (!res.headersSent) send(res, status, { error: status === 500 ? 'Внутренняя ошибка сервера' : e.message });
    }
  });

  // Журнал действий: кто и что менял (содержимое запросов не сохраняем — там могут быть пароли)
  const AUDIT_LABELS = [['users', 'Сотрудники'], ['news', 'Новости'], ['announcements', 'Объявления'], ['media', 'Медиа'], ['pages', 'Страницы'],
    ['students', 'Ученики'], ['achievements', 'Достижения'], ['tasks', 'Поручения'], ['events', 'Календарь'], ['faq', 'Вопросы и ответы'],
    ['applications', 'Заявки'], ['faces', 'Лица сотрудников'], ['checkins', 'Проверка по лицу'], ['face-settings', 'Настройки проверки по лицу'], ['settings', 'Настройки'], ['stats', 'Статистика'], ['attendance', 'Посещаемость'], ['holidays', 'Праздники'], ['lessons', 'Расписание']];
  const AUDIT_VERBS = { POST: 'добавил(а)/изменил(а)', PUT: 'изменил(а)', DELETE: 'удалил(а)' };
  function logAudit(user, method, pathname) {
    const seg = pathname.split('/')[2] || '';
    if (['ping', 'notices', 'upload', 'upload-raw', 'plans', 'checkin'].includes(seg)) return;
    const label = (AUDIT_LABELS.find(([k]) => k === seg) || [seg, seg])[1];
    let verb = AUDIT_VERBS[method] || method;
    if (/\/freeze$/.test(pathname)) verb = 'заморозил(а)/разморозил(а)'; else if (/reset-password$/.test(pathname)) verb = 'сменил(а) пароль'; else if (/\/(done|read)$/.test(pathname)) verb = 'отметил(а)'; else if (/\/review$/.test(pathname)) verb = 'принял(а) решение по отметке';
    try { db.prepare('INSERT INTO audit_log (user_id, user_name, action, target) VALUES (?,?,?,?)').run(user.id, user.full_name, verb, label); } catch { /* журнал не должен ломать запрос */ }
  }

  async function handleApi(req, res, url) {
    const method = req.method;
    if (method === 'POST' && url.pathname === '/api/upload-raw') {
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) throw new HttpError(403, 'Запрос с другого сайта запрещён');
      const who = A.userFromToken(db, parseCookies(req.headers.cookie)[COOKIE]);
      A.requireRole(who, 'manager');
      return send(res, 200, await handleRawUpload(req, uploadsDir, url.searchParams.get('ext')), { 'Cache-Control': 'no-store' });
    }
    if (method === 'GET' && url.pathname === '/api/backup') {
      const who = A.userFromToken(db, parseCookies(req.headers.cookie)[COOKIE]);
      if (!who || who.role !== 'director') throw new HttpError(403, 'Копию базы может скачать только директор');
      const tmp = path.join(dataDir, `backup-${Date.now()}.sqlite`);
      try {
        db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
        const buf = fs.readFileSync(tmp);
        db.prepare('INSERT INTO audit_log (user_id, user_name, action, target) VALUES (?,?,?,?)').run(who.id, who.full_name, 'скачал(а) резервную копию', 'База данных');
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': buf.length, 'Cache-Control': 'no-store',
          'Content-Disposition': `attachment; filename="school-backup-${new Date().toISOString().slice(0, 10)}.sqlite"` });
        return res.end(buf);
      } finally { fs.rmSync(tmp, { force: true }); }
    }
    let match = null;
    for (const r of routes) {
      if (r.method !== method) continue;
      const m = r.re.exec(url.pathname);
      if (m) { match = { r, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) }; break; }
    }
    if (!match) throw new HttpError(404, 'Не найдено');

    const mutating = method !== 'GET';
    if (mutating) {
      // CSRF: только JSON и только с того же origin.
      if (!(req.headers['content-type'] || '').startsWith('application/json') && Number(req.headers['content-length'] || 0) > 0) {
        throw new HttpError(415, 'Ожидается JSON');
      }
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) throw new HttpError(403, 'Запрос с другого сайта запрещён');
    }

    const cookies = parseCookies(req.headers.cookie);
    const user = A.userFromToken(db, cookies[COOKIE]);
    A.requireRole(user, match.r.guard);
    // «был на сайте»: обновляем не чаще раза в 30 секунд
    if (user && Date.now() - (user.last_seen ? Date.parse(String(user.last_seen).replace(' ', 'T') + 'Z') : 0) > 30000) {
      db.prepare("UPDATE users SET last_seen=datetime('now') WHERE id=?").run(user.id);
    }

    const ip = req.socket.remoteAddress || '';
    const isLogin = method === 'POST' && url.pathname === '/api/auth/login';
    if (isLogin && limiter.blocked(ip)) throw new HttpError(429, 'Слишком много попыток входа. Подождите 15 минут.');

    const body = mutating ? await readBody(req, url.pathname === '/api/upload' ? 9_000_000 : /^\/api\/(checkin\/finish|faces\/\d+)$/.test(url.pathname) ? 3_000_000 : 1_000_000) : {};
    const out = { cookies: [] };
    const cookieAttrs = `Path=/; HttpOnly; SameSite=Lax${cookieSecure ? '; Secure' : ''}`;
    const ctx = {
      req, res, params: match.params, query: Object.fromEntries(url.searchParams), body, user,
      setSession(userId, persistent = true) {
        A.destroySession(db, cookies[COOKIE]);
        const s = A.createSession(db, userId);
        // «Запомнить меня» выключено — cookie живёт до закрытия браузера
        out.cookies.push(`${COOKIE}=${s.token}; ${cookieAttrs}${persistent ? `; Expires=${new Date(s.expires).toUTCString()}` : ''}`);
      },
      clearSession() {
        A.destroySession(db, cookies[COOKIE]);
        out.cookies.push(`${COOKIE}=; ${cookieAttrs}; Max-Age=0`);
      },
    };
    let result;
    try {
      result = await match.r.handler(ctx);
    } catch (e) {
      if (isLogin && e instanceof HttpError && e.status === 401) limiter.fail(ip);
      throw e;
    }
    if (isLogin) limiter.reset(ip);
    if (mutating && user && !isLogin) logAudit(user, method, url.pathname);
    send(res, 200, result ?? { ok: true }, { 'Cache-Control': 'no-store', ...(out.cookies.length ? { 'Set-Cookie': out.cookies } : {}) });
  }

  let timer = null;
  if (scheduler) { timer = setInterval(() => { try { runReminders(db, notifier); } catch (e) { console.error('[reminders]', e.message); } }, 30_000); timer.unref(); }
  return { server, db, notifier, engine, stopScheduler: () => clearInterval(timer) };
}

module.exports = { createApp };
