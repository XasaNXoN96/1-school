'use strict';
// API проверки по лицу: для сотрудников (/api/checkin/*, /api/my/checkins) и для администраторов (/api/faces*, /api/checkins*).
const { HttpError } = require('./http');
const A = require('./auth');
const { getSettings, setSetting } = require('./db');
const { localNow } = require('./attendance');
const C = require('./checkin');

const dataUrl = (buf) => (buf ? `data:image/jpeg;base64,${Buffer.from(buf).toString('base64')}` : null);

function faceRoutes({ db, notifier, engine, botToken, publicUrl = '' }) {
  const routes = [];
  const add = (method, pattern, guard, handler) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    routes.push({ method, re, keys, guard, handler });
  };
  const one = (sql, ...p) => db.prepare(sql).get(...p);
  const all = (sql, ...p) => db.prepare(sql).all(...p);

  // Кто проверяется: подписанные данные Telegram Mini App или обычный вход в панель.
  function who({ user, body, query }) {
    const init = body?.initData || query?.initData;
    if (init) {
      const tg = C.verifyInitData(init, botToken);
      if (!tg) throw new HttpError(401, 'Не удалось подтвердить Telegram. Откройте страницу из бота заново.');
      const u = one('SELECT * FROM users WHERE telegram_id=? AND active=1 AND frozen=0', String(tg.id));
      if (!u) throw new HttpError(403, 'Этот Telegram не привязан к сотруднику.');
      return { u, via: 'telegram' };
    }
    if (!user) throw new HttpError(401, 'Войдите в панель или откройте страницу из Telegram-бота.');
    return { u: user, via: 'web' };
  }

  // ---- сотрудник ----
  add('POST', '/api/checkin/start', 'public', (ctx) => {
    const { u, via } = who(ctx);
    if (engine.busy()) throw new HttpError(503, 'Сервер занят проверками, повторите через минуту');
    const s = C.startSession(db, u, ctx.body.kind);
    return { ...s, via, name: u.full_name, engine: engine.available };
  });
  add('POST', '/api/checkin/finish', 'public', async (ctx) => {
    const { u, via } = who(ctx);
    return C.finishCheckin({ db, notifier, engine, user: u, body: ctx.body, via });
  });
  // Состояние дня для экрана проверки (до начала)
  add('POST', '/api/checkin/state', 'public', (ctx) => {
    const { u } = who(ctx);
    const s = getSettings(db);
    const today = localNow(new Date(), s.timezone).date;
    const row = one('SELECT check_in, check_out, review FROM attendance WHERE user_id=? AND date=?', u.id, today);
    return {
      name: u.full_name, enrolled: !!one('SELECT 1 x FROM face_samples WHERE user_id=? LIMIT 1', u.id), engine: engine.available,
      check_in: row?.check_in?.slice(11, 16) || null, check_out: row?.check_out?.slice(11, 16) || null, review: row?.review || '',
      radius_m: parseInt(s.radius_m, 10) || 150,
    };
  });
  add('GET', '/api/my/checkins', 'auth', ({ user }) => {
    const rows = all('SELECT id, date, kind, status, reason, message, via, distance, zone_ok, face_ok, live_ok, created_at FROM checkin_attempts WHERE user_id=? ORDER BY id DESC LIMIT 20', user.id);
    return {
      enrolled: one('SELECT COUNT(*) c FROM face_samples WHERE user_id=?', user.id).c,
      required: getSettings(db).face_required === '1', engine: engine.available, attempts: rows,
    };
  });

  // ---- администратор ----
  add('GET', '/api/faces', 'manager', () => ({
    settings: (() => { const s = getSettings(db); return { face_required: s.face_required, face_match: s.face_match, face_review: s.face_review, gps_max_accuracy: s.gps_max_accuracy, radius_m: s.radius_m }; })(),
    engine: engine.available, max: C.MAX_SAMPLES, telegram: !!botToken, miniapp: /^https:\/\//i.test(publicUrl),
    users: all(`SELECT u.id, u.full_name, u.role, u.photo, u.subject,
        (SELECT COUNT(*) FROM face_samples f WHERE f.user_id=u.id) samples
        FROM users u WHERE u.active=1 AND u.role IN ('teacher','staff','assistant') ORDER BY u.full_name`),
  }));
  add('GET', '/api/faces/:id', 'manager', ({ params }) => ({
    samples: all('SELECT id, thumb, created_at FROM face_samples WHERE user_id=? ORDER BY id', params.id).map((r) => ({ id: r.id, thumb: dataUrl(r.thumb), created_at: r.created_at })),
  }));
  add('POST', '/api/faces/:id', 'manager', async ({ user, params, body }) => {
    const target = one('SELECT * FROM users WHERE id=? AND active=1', params.id);
    if (!target) throw new HttpError(404, 'Сотрудник не найден');
    if (!A.canManageUser(user, target) && target.id !== user.id) throw new HttpError(403, 'Недостаточно прав');
    return C.enrollFace({ db, engine, actor: user, target, image: body.image, thumb: body.thumb });
  });
  add('DELETE', '/api/faces/sample/:id', 'manager', ({ user, params }) => {
    const s = one('SELECT f.id, f.user_id, u.role FROM face_samples f JOIN users u ON u.id=f.user_id WHERE f.id=?', params.id);
    if (!s) throw new HttpError(404, 'Не найдено');
    if (!A.canManageUser(user, { role: s.role }) && s.user_id !== user.id) throw new HttpError(403, 'Недостаточно прав');
    db.prepare('DELETE FROM face_samples WHERE id=?').run(s.id);
    return { ok: true };
  });
  add('GET', '/api/checkins', 'manager', ({ query }) => {
    const where = [], args = [];
    if (/^\d{4}-\d{2}-\d{2}$/.test(query.date || '')) { where.push('a.date=?'); args.push(query.date); }
    if (['ok', 'pending', 'rejected'].includes(query.status)) { where.push('a.status=?'); args.push(query.status); }
    if (/^\d+$/.test(query.user || '')) { where.push('a.user_id=?'); args.push(Number(query.user)); }
    const rows = all(`SELECT a.*, u.full_name, u.photo FROM checkin_attempts a JOIN users u ON u.id=a.user_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY a.id DESC LIMIT 100`, ...args);
    const s = getSettings(db);
    return {
      pending: one("SELECT COUNT(*) c FROM checkin_attempts WHERE status='pending'").c,
      settings: { face_required: s.face_required, face_match: s.face_match, face_review: s.face_review, gps_max_accuracy: s.gps_max_accuracy, radius_m: s.radius_m },
      attempts: rows.map((r) => {
        let details = {}; try { details = JSON.parse(r.details || '{}'); } catch { /* пусто */ }
        const { thumb, ...rest } = r;
        return { ...rest, thumb: dataUrl(thumb), details };
      }),
    };
  });
  add('POST', '/api/checkins/:id/review', 'manager', ({ user, params, body }) =>
    C.reviewAttempt({ db, notifier, actor: user, id: Number(params.id), approve: !!body.approve, note: body.note }));
  // Настройки проверки (отдельно от общих, чтобы проверять числа)
  add('PUT', '/api/face-settings', 'manager', ({ body }) => {
    const num = (v, min, max, name) => { const n = parseFloat(v); if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, `${name}: от ${min} до ${max}`); return String(n); };
    if ('face_required' in body) setSetting(db, 'face_required', body.face_required ? '1' : '0');
    if ('face_match' in body) setSetting(db, 'face_match', num(body.face_match, 0.3, 0.6, 'Порог совпадения'));
    if ('face_review' in body) setSetting(db, 'face_review', num(body.face_review, 0.4, 0.7, 'Порог проверки'));
    if ('gps_max_accuracy' in body) setSetting(db, 'gps_max_accuracy', String(Math.round(num(body.gps_max_accuracy, 10, 500, 'Точность GPS'))));
    const s = getSettings(db);
    if (parseFloat(s.face_review) < parseFloat(s.face_match)) throw new HttpError(400, 'Порог проверки не может быть меньше порога совпадения');
    return { ok: true };
  });
  return routes;
}

module.exports = { faceRoutes };
