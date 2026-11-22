'use strict';
// Обращения родителей: запись на приём, справки, обращения/жалобы (в т.ч. анонимные), настройки приёма.
const crypto = require('node:crypto');
const { HttpError } = require('./http');
const { getSettings, setSetting } = require('./db');
const { localNow, toMinutes } = require('./attendance');
const A = require('./auth');
const V = require('./validate');

const TOPICS = ['complaint', 'suggestion', 'thanks', 'question'];
const pad = (n) => String(n).padStart(2, '0');
const fmtMin = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const newFeedbackCode = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return 'F' + Array.from(crypto.randomBytes(8), (b) => alphabet[b % alphabet.length]).join('');
};

function requestRoutes({ db, notifier, parentHelpers }) {
  const { routes, get, post, put, del } = V.makeRouter();
  const one = (sql, ...p) => db.prepare(sql).get(...p);
  const all = (sql, ...p) => db.prepare(sql).all(...p);
  const run = (sql, ...p) => db.prepare(sql).run(...p);
  const now = () => localNow(new Date(), getSettings(db).timezone);
  const apptLimit = V.rateLimiter(4, 3600_000);
  const fbLimit = V.rateLimiter(4, 3600_000);
  const fbLookup = V.rateLimiter(30, 600_000);

  // ---------- настройки приёма и бота ----------
  const SCHOOL_KEYS = ['bot_username', 'appt_start', 'appt_end', 'appt_step', 'appt_days'];
  get('/api/school-settings', 'manager', () => { const s = getSettings(db); return Object.fromEntries(SCHOOL_KEYS.map((k) => [k, s[k]])); });
  put('/api/school-settings', 'manager', ({ body }) => {
    const clean = {};
    if ('bot_username' in body) { const v = V.str(body.bot_username, 40).replace(/^@/, ''); if (v && !/^[A-Za-z0-9_]{3,40}$/.test(v)) throw new HttpError(400, 'Имя бота: латиница, цифры и _'); clean.bot_username = v; }
    if ('appt_start' in body) clean.appt_start = V.hhmm(body.appt_start);
    if ('appt_end' in body) clean.appt_end = V.hhmm(body.appt_end);
    if ('appt_step' in body) clean.appt_step = String(V.int(body.appt_step, 20, 5, 120));
    if ('appt_days' in body) {
      const d = [...new Set(String(body.appt_days).split(',').map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 7))].sort();
      if (!d.length) throw new HttpError(400, 'Выберите хотя бы один день приёма');
      clean.appt_days = d.join(',');
    }
    const cur = { ...getSettings(db), ...clean };
    if (toMinutes(cur.appt_end) <= toMinutes(cur.appt_start)) throw new HttpError(400, 'Конец приёма должен быть позже начала');
    for (const [k, v] of Object.entries(clean)) setSetting(db, k, v);
    return { ok: true };
  });

  // ---------- запись на приём ----------
  const people = () => all(`SELECT id, full_name, subject, role, photo FROM users WHERE active=1 AND frozen=0
    AND (role IN ('director','assistant') OR (role='teacher' AND show_public=1)) ORDER BY (role='director') DESC, (role='assistant') DESC, full_name`);
  const onLeave = (userId, d) => !!one("SELECT 1 x FROM leave_requests WHERE user_id=? AND status='approved' AND date_from<=? AND date_to>=?", userId, d, d);

  function slotsFor(userId, d) {
    const s = getSettings(db), t = now();
    if (d < t.date || d > V.addDays(t.date, 30)) return [];
    if (!s.appt_days.split(',').map(Number).includes(V.weekdayOf(d))) return [];
    if (one('SELECT 1 x FROM holidays WHERE date=?', d) || onLeave(userId, d)) return [];
    const taken = new Set(all("SELECT time FROM appointments WHERE with_user_id=? AND date=? AND status IN ('new','confirmed')", userId, d).map((r) => r.time));
    const step = Math.max(5, Number(s.appt_step) || 20), from = toMinutes(s.appt_start), to = toMinutes(s.appt_end);
    const out = [];
    for (let m = from; m + step <= to; m += step) {
      const hhmm = fmtMin(m);
      if (taken.has(hhmm)) continue;
      if (d === t.date && m < toMinutes(t.time) + 30) continue; // не раньше чем через 30 минут
      out.push(hhmm);
    }
    return out;
  }

  get('/api/public/appointments/people', 'public', () => ({ people: people(), start: getSettings(db).appt_start, end: getSettings(db).appt_end, days: getSettings(db).appt_days }));
  get('/api/public/appointments/slots', 'public', ({ query }) => {
    const id = V.int(query.user_id, 0, 1);
    V.must(people().find((p) => p.id === id), 'Сотрудник не найден');
    return { slots: slotsFor(id, V.date(query.date)) };
  });
  post('/api/public/appointments', 'public', ({ req, body }) => {
    if (body.website) return { ok: true };
    const ip = req.socket.remoteAddress || '';
    if (!apptLimit.ok(ip)) throw new HttpError(429, 'Слишком много записей. Попробуйте позже.');
    const uid = V.int(body.user_id, 0, 1), d = V.date(body.date), time = V.hhmm(body.time);
    const person = V.must(people().find((p) => p.id === uid), 'Сотрудник не найден');
    const name = V.str(body.name, 100, true, 'имя'), phone = V.str(body.phone, 40, true, 'телефон'), topic = V.str(body.topic, 300);
    if (!/^[+\d][\d\s()+-]{6,}$/.test(phone)) throw new HttpError(400, 'Укажите корректный телефон');
    if (!slotsFor(uid, d).includes(time)) throw new HttpError(409, 'Это время недоступно. Выберите другое.');
    let r;
    try { r = run('INSERT INTO appointments (with_user_id, date, time, name, phone, topic) VALUES (?,?,?,?,?,?)', uid, d, time, name, phone, topic); }
    catch { throw new HttpError(409, 'Это время только что заняли. Выберите другое.'); }
    apptLimit.hit(ip); // считаем только состоявшиеся записи, а не опечатки
    notifier.notify([...new Set([uid, ...notifier.managerIds()])], `🗓 Запись на приём: ${name} (${phone}) к ${person.full_name} — ${d} в ${time}${topic ? '. Тема: ' + topic : ''}`);
    return { ok: true, id: Number(r.lastInsertRowid), with: person.full_name, date: d, time };
  });

  const APPT_SQL = 'SELECT a.*, u.full_name AS with_name FROM appointments a JOIN users u ON u.id=a.with_user_id';
  get('/api/appointments', 'auth', ({ user, query }) => {
    const status = query.status ? V.oneOf(query.status, ['new', 'confirmed', 'declined', 'done'], 'статус') : '';
    const mine = A.isManager(user) ? '' : user.role === 'teacher' ? 'a.with_user_id=?' : null;
    if (mine === null) throw new HttpError(403, 'Недостаточно прав');
    const where = [mine, status && 'a.status=?'].filter(Boolean).join(' AND ');
    return all(`${APPT_SQL} ${where ? 'WHERE ' + where : ''} ORDER BY (a.status='new') DESC, a.date DESC, a.time DESC LIMIT 300`, ...[mine ? user.id : null, status || null].filter((x) => x !== null));
  });
  post('/api/appointments/:id/status', 'auth', ({ user, params, body }) => {
    const a = V.must(one('SELECT * FROM appointments WHERE id=?', params.id));
    if (!A.isManager(user) && a.with_user_id !== user.id) throw new HttpError(403, 'Недостаточно прав');
    run('UPDATE appointments SET status=?, note=? WHERE id=?', V.oneOf(body.status, ['new', 'confirmed', 'declined', 'done'], 'статус'), V.str(body.note, 300), a.id);
    return { ok: true };
  });
  del('/api/appointments/:id', 'manager', ({ params }) => { run('DELETE FROM appointments WHERE id=?', params.id); return { ok: true }; });

  // ---------- справки ----------
  const CERT_SQL = `SELECT c.*, s.full_name, s.class_name FROM cert_requests c JOIN students s ON s.id=c.student_id`;
  get('/api/certs', 'manager', () => all(`${CERT_SQL} ORDER BY (c.status='new') DESC, c.id DESC LIMIT 300`));
  get('/api/certs/:id', 'manager', ({ params }) => {
    const c = V.must(one(`${CERT_SQL} WHERE c.id=?`, params.id));
    const s = getSettings(db);
    const dir = one("SELECT full_name FROM users WHERE role='director' AND active=1 ORDER BY id LIMIT 1");
    return { cert: c, school: { name: s.school_name, city: s.city, address: s.address, phone: s.phone }, director: dir?.full_name || '', date: now().date };
  });
  post('/api/certs/:id/status', 'manager', ({ user, params, body }) => {
    const c = V.must(one('SELECT * FROM cert_requests WHERE id=?', params.id));
    const status = V.oneOf(body.status, ['new', 'ready', 'rejected'], 'статус'), note = V.str(body.note, 300);
    run("UPDATE cert_requests SET status=?, note=?, decided_at=datetime('now'), decided_by=? WHERE id=?", status, note, user.id, c.id);
    if (status !== 'new') {
      parentHelpers.notifyParents(c.student_id, status === 'ready' ? `📄 Справка готова. Получить можно в канцелярии школы.${note ? ' ' + note : ''}` : `📄 В выдаче справки отказано.${note ? ' ' + note : ''}`, 'info');
    }
    return { ok: true };
  });
  del('/api/certs/:id', 'manager', ({ params }) => { run('DELETE FROM cert_requests WHERE id=?', params.id); return { ok: true }; });

  // ---------- обращения (можно анонимно) ----------
  post('/api/public/feedback', 'public', ({ req, body }) => {
    if (body.website) return { ok: true, code: 'F00000000' };
    if (!fbLimit.ok(req.socket.remoteAddress || '')) throw new HttpError(429, 'Слишком много обращений. Попробуйте позже.');
    const topic = V.oneOf(body.topic || 'question', TOPICS, 'тема'), message = V.str(body.message, 3000, true, 'сообщение');
    if (message.length < 5) throw new HttpError(400, 'Сообщение слишком короткое');
    const contact = V.str(body.contact, 120); // необязательно — можно анонимно
    let code = newFeedbackCode();
    for (let i = 0; i < 5 && one('SELECT 1 x FROM feedback WHERE code=?', code); i++) code = newFeedbackCode();
    run('INSERT INTO feedback (code, topic, message, contact) VALUES (?,?,?,?)', code, topic, message, contact);
    fbLimit.hit(req.socket.remoteAddress || '');
    notifier.notifyManagers(`💬 Новое обращение (${{ complaint: 'жалоба', suggestion: 'предложение', thanks: 'благодарность', question: 'вопрос' }[topic]})${contact ? '' : ' — анонимно'}`);
    return { ok: true, code };
  });
  get('/api/public/feedback/:code', 'public', ({ req, params }) => {
    if (!fbLookup.take(req.socket.remoteAddress || '')) throw new HttpError(429, 'Слишком много запросов');
    const f = V.must(one('SELECT topic, status, answer, created_at, answered_at FROM feedback WHERE code=?', String(params.code).toUpperCase()), 'Обращение с таким кодом не найдено');
    return f;
  });
  get('/api/feedback', 'manager', () => all('SELECT * FROM feedback ORDER BY (status=\'new\') DESC, id DESC LIMIT 300'));
  post('/api/feedback/:id/answer', 'manager', ({ params, body }) => {
    const f = V.must(one('SELECT * FROM feedback WHERE id=?', params.id));
    const answer = V.str(body.answer, 3000, true, 'ответ');
    run("UPDATE feedback SET answer=?, status='answered', answered_at=datetime('now') WHERE id=?", answer, f.id);
    return { ok: true };
  });
  post('/api/feedback/:id/seen', 'manager', ({ params }) => { run("UPDATE feedback SET status='seen' WHERE id=? AND status='new'", params.id); return { ok: true }; });
  del('/api/feedback/:id', 'manager', ({ params }) => { run('DELETE FROM feedback WHERE id=?', params.id); return { ok: true }; });

  return { routes };
}

module.exports = { requestRoutes };
