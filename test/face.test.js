'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { openDb, setSetting } = require('../server/db');
const { createNotifier } = require('../server/notify');
const { hashPassword } = require('../server/auth');
const C = require('../server/checkin');
const L = require('../public/js/liveness.js');
const { monthReport } = require('../server/salary');
const { createBot } = require('../server/bot');
const { createFaceEngine } = require('../server/face');
const { startTestApp } = require('./helpers');

const SCHOOL = { lat: 40.5, lon: 68.0 };
const INSIDE = { lat: 40.5003, lon: 68.0002, accuracy: 20 };   // ≈ 40 м
const OUTSIDE = { lat: 40.505, lon: 68.0, accuracy: 20 };      // ≈ 555 м
// 2026-11-16 — понедельник; 09:05 по Ташкенту (UTC+5) = 04:05Z
const T0 = Date.UTC(2026, 10, 16, 4, 5);

// ---------- поддельный движок: кадр = крошечный PNG, результат задаётся заранее ----------
function tinyPng(seed) {
  const w = 4, h = 4, raw = Buffer.alloc((w * 3 + 1) * h, seed & 255);
  for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0;
  const chunk = (type, data) => { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length, 0); b.write(type, 4); data.copy(b, 8); b.writeUInt32BE(0, 8 + data.length); return b; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
let seed = 0;
const fake = () => {
  const map = new Map();
  return {
    available: true, busy: () => false, close() {},
    frame(result) { const png = tinyPng(++seed); map.set(png.toString('base64'), result); return png.toString('base64'); },
    async analyze(buf) { const r = map.get(buf.toString('base64')); if (!r) throw new Error('нет результата'); return r; },
  };
};
function landmarks({ earL = 0.3, earR = 0.3, mouth = 0.4, yaw = 0.5 } = {}) {
  const p = Array.from({ length: 68 }, () => [0, 0]);
  p[0] = [100, 100]; p[16] = [200, 100]; p[30] = [100 + yaw * 100, 130];
  const eye = (a, x, ear) => { const g = ear * 20; p[a] = [x, 80]; p[a + 3] = [x + 20, 80]; p[a + 1] = [x + 6, 80 - g / 2]; p[a + 5] = [x + 6, 80 + g / 2]; p[a + 2] = [x + 14, 80 - g / 2]; p[a + 4] = [x + 14, 80 + g / 2]; };
  eye(36, 110, earR); eye(42, 150, earL);
  const w = mouth * 100; p[48] = [150 - w / 2, 160]; p[54] = [150 + w / 2, 160];
  return p;
}
const person = (id) => { const v = new Array(128).fill(0); v[id] = 1; return v; };
const near = (v, delta) => { const o = [...v]; o[100] += delta; return o; };
const face = (desc, lm = {}, extra = {}) => ({ width: 320, height: 240, count: 1, score: 0.9, box: { x: 100, y: 50, w: 120, h: 140 }, landmarks: landmarks(lm), descriptor: desc, ...extra });
const ACTIONS = {
  wink_left: { earL: 0.1 }, wink_right: { earR: 0.1 }, smile: { mouth: 0.46 }, turn_left: { yaw: 0.68 }, turn_right: { yaw: 0.32 },
};

function setup() {
  const db = openDb(':memory:');
  setSetting(db, 'school_lat', SCHOOL.lat); setSetting(db, 'school_lon', SCHOOL.lon);
  setSetting(db, 'face_required', '1');
  const notifier = createNotifier(db); const sent = [];
  notifier.setTransport(async (tg, text) => sent.push([tg, text]));
  const mk = (name, role) => {
    const r = db.prepare(`INSERT INTO users (username,password_hash,full_name,role,monthly_salary,shift_start,shift_end,work_days,telegram_id)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(name, hashPassword('password1'), name, role, 2_600_000, '09:00', '14:00', '1,2,3,4,5,6', name === 'anna' ? '222' : name === 'boris' ? '333' : '111');
    return db.prepare('SELECT * FROM users WHERE id=?').get(r.lastInsertRowid);
  };
  const director = mk('director', 'director'), anna = mk('anna', 'teacher'), boris = mk('boris', 'teacher');
  const enroll = (u, desc) => db.prepare('INSERT INTO face_samples (user_id, descriptor) VALUES (?,?)').run(u.id, Buffer.from(new Float32Array(desc).buffer));
  enroll(anna, person(1)); enroll(boris, person(2));
  return { db, notifier, sent, director, anna, boris, engine: fake() };
}

// Полная проверка с заданиями: neutral + два задания из сессии. perform — какие задания человек реально выполнил.
async function attempt(env, user, { kind = 'in', loc = INSIDE, desc = person(1), perform = true, mutate, nowMs = T0, delay = 5000, token, frames } = {}) {
  const s = token ? { token, challenges: ['smile', 'wink_left'] } : C.startSession(env.db, user, kind, nowMs);
  const fr = frames || [env.engine.frame(face(desc)),
    ...s.challenges.map((c) => env.engine.frame(face(near(desc, 0.05), perform ? ACTIONS[c] : {})))];
  const body = { token: s.token, lat: loc.lat, lon: loc.lon, accuracy: loc.accuracy, loc_time: nowMs + delay, frames: fr, ...(mutate || {}) };
  return C.finishCheckin({ db: env.db, notifier: env.notifier, engine: env.engine, user, body, nowMs: nowMs + delay });
}
const att = (env, u) => env.db.prepare('SELECT * FROM attendance WHERE user_id=?').get(u.id);

test('успех: место, лицо и «живость» подтверждены — приход засчитан, учитель и журнал видят результат', async () => {
  const env = setup();
  const r = await attempt(env, env.anna);
  assert.equal(r.status, 'ok');
  assert.deepEqual([r.checks.zone.ok, r.checks.face.ok, r.checks.live.ok], [true, true, true]);
  assert.equal(r.checks.live.steps.length, 2);
  assert.equal(att(env, env.anna).verify, 'face');
  assert.equal(att(env, env.anna).status, 'present');
  const row = env.db.prepare('SELECT * FROM checkin_attempts WHERE id=?').get(r.id);
  assert.equal(row.zone_ok, 1); assert.equal(row.face_ok, 1); assert.equal(row.live_ok, 1); assert.ok(row.distance < 100);
  assert.ok(env.db.prepare('SELECT 1 FROM notices WHERE user_id=?').get(env.anna.id), 'учитель получил уведомление');
  assert.equal(r.checks.face.distance, undefined, 'числа расстояния до эталона учителю не показываются');
});

test('вне круга: отметка не засчитывается, директор уведомлён', async () => {
  const env = setup();
  const r = await attempt(env, env.anna, { loc: OUTSIDE });
  assert.equal(r.status, 'rejected'); assert.equal(r.reason, 'outside_zone');
  assert.equal(r.checks.zone.ok, false); assert.ok(r.checks.zone.distance > 500);
  assert.equal(att(env, env.anna), undefined);
  assert.ok(env.db.prepare('SELECT 1 FROM notices WHERE user_id=? AND text LIKE ?').get(env.director.id, '%отклонена%'));
});

test('геопозиция: грубая точность, устаревшие данные и пустые координаты отклоняются', async () => {
  const env = setup();
  assert.equal((await attempt(env, env.anna, { loc: { ...INSIDE, accuracy: 900 } })).reason, 'gps_inaccurate');
  assert.equal((await attempt(env, env.anna, { mutate: { loc_time: T0 - 600_000 } })).reason, 'gps_stale');
  assert.equal((await attempt(env, env.anna, { mutate: { lat: null, lon: null } })).reason, 'gps_missing');
  assert.equal(att(env, env.anna), undefined);
});

test('чужое лицо: другой сотрудник не может отметиться за коллегу', async () => {
  const env = setup();
  // Борис стоит в зоне и пытается пройти проверку в сессии Анны
  const r = await attempt(env, env.anna, { desc: person(2) });
  assert.equal(r.status, 'rejected'); assert.ok(['other_person', 'face_mismatch'].includes(r.reason));
  assert.equal(r.checks.face.ok, false); assert.equal(att(env, env.anna), undefined);
  const row = env.db.prepare('SELECT * FROM checkin_attempts WHERE id=?').get(r.id);
  assert.equal(row.other_user, 'boris', 'в журнале видно, на кого похоже лицо');
});

test('фото вместо человека: задания не выполнены — отказ', async () => {
  const env = setup();
  const r = await attempt(env, env.anna, { perform: false });
  assert.equal(r.status, 'rejected'); assert.equal(r.reason, 'liveness_failed');
  assert.equal(r.checks.live.ok, false); assert.equal(att(env, env.anna), undefined);
});

test('смена человека между кадрами и несколько лиц в кадре — отказ', async () => {
  const env = setup();
  const s = C.startSession(env.db, env.anna, 'in', T0);
  const frames = [env.engine.frame(face(person(1))), env.engine.frame(face(person(9), ACTIONS[s.challenges[0]])), env.engine.frame(face(person(1), ACTIONS[s.challenges[1]]))];
  const r = await attempt(env, env.anna, { token: s.token, frames, nowMs: T0 });
  // token-режим: задания берём из сессии
  assert.equal(r.status, 'rejected');
  const env2 = setup();
  const r2 = await attempt(env2, env2.anna, { frames: [env2.engine.frame(face(person(1), {}, { count: 2 })), env2.engine.frame(face(person(1))), env2.engine.frame(face(person(1)))], token: C.startSession(env2.db, env2.anna, 'in', T0).token });
  assert.equal(r2.reason, 'multiple_faces');
});

test('пограничное совпадение: условный приход, админ отклоняет — день не оплачивается', async () => {
  const env = setup();
  const r = await attempt(env, env.anna, { desc: near(person(1), 0.5) });
  assert.equal(r.status, 'pending');
  assert.equal(att(env, env.anna).review, 'pending'); assert.equal(att(env, env.anna).status, 'present');
  assert.ok(env.db.prepare('SELECT 1 FROM notices WHERE user_id=? AND text LIKE ?').get(env.director.id, '%проверка%'));
  C.reviewAttempt({ db: env.db, notifier: env.notifier, actor: env.director, id: r.id, approve: false, note: 'не он' });
  assert.equal(att(env, env.anna), undefined, 'отметка отменена');
  assert.equal(env.db.prepare('SELECT status FROM checkin_attempts WHERE id=?').get(r.id).status, 'rejected');
  const rep = monthReport(env.db, env.anna, '2026-11', new Date(T0 + 86400_000));
  assert.equal(rep.present, 0);
  assert.throws(() => C.reviewAttempt({ db: env.db, notifier: env.notifier, actor: env.director, id: r.id, approve: true }), /не ожидает/);
});

test('условный приход подтверждён админом — день засчитан', async () => {
  const env = setup();
  const r = await attempt(env, env.anna, { desc: near(person(1), 0.5) });
  C.reviewAttempt({ db: env.db, notifier: env.notifier, actor: env.director, id: r.id, approve: true });
  assert.equal(att(env, env.anna).review, ''); assert.equal(att(env, env.anna).status, 'present');
  assert.equal(monthReport(env.db, env.anna, '2026-11', new Date(T0 + 86400_000)).present, 1);
});

test('зарплата по дням: за дни без отметки не платим, за отклонённые — тоже', async () => {
  const env = setup();
  await attempt(env, env.anna, { nowMs: T0 });                              // пн — принято
  await attempt(env, env.anna, { nowMs: T0 + 86400_000, loc: OUTSIDE });    // вт — вне зоны
  const rep = monthReport(env.db, env.anna, '2026-11', new Date(T0 + 2 * 86400_000));
  assert.equal(rep.present, 1);
  assert.equal(rep.earned, rep.per_day);
});

test('сессия одноразовая, привязана к человеку, не раньше минимального времени и не позже срока', async () => {
  const env = setup();
  const s = C.startSession(env.db, env.anna, 'in', T0);
  const mk = () => [env.engine.frame(face(person(1))), ...s.challenges.map((c) => env.engine.frame(face(person(1), ACTIONS[c])))];
  const base = { token: s.token, lat: INSIDE.lat, lon: INSIDE.lon, accuracy: 10, frames: mk() };
  const fin = (user, body, nowMs) => C.finishCheckin({ db: env.db, notifier: env.notifier, engine: env.engine, user, body, nowMs });
  await assert.rejects(fin(env.boris, base, T0 + 5000), /не найдена/);              // чужая сессия
  await assert.rejects(fin(env.anna, base, T0 + 500), /Слишком быстро/);             // слишком быстро (и сессия погашена)
  await assert.rejects(fin(env.anna, base, T0 + 6000), /уже использована/);          // повтор
  const s2 = C.startSession(env.db, env.anna, 'in', T0);
  await assert.rejects(fin(env.anna, { ...base, token: s2.token, frames: mk() }, T0 + 4 * 60_000), /вышло/);
  await assert.rejects(fin(env.anna, { ...base, token: 'x'.repeat(48) }, T0 + 5000), /не найдена/);
});

test('защита от повторов и перебора: после серии отказов проверка блокируется', async () => {
  const env = setup();
  for (let i = 0; i < 6; i++) await attempt(env, env.anna, { loc: OUTSIDE, nowMs: T0 + i * 1000 });
  assert.throws(() => C.startSession(env.db, env.anna, 'in', T0 + 7000), (e) => e.status === 429);
  assert.doesNotThrow(() => C.startSession(env.db, env.anna, 'in', T0 + 11 * 60_000));
});

test('без эталонного фото проверка не стартует; повторный приход и уход без прихода запрещены', async () => {
  const env = setup();
  env.db.prepare('DELETE FROM face_samples WHERE user_id=?').run(env.boris.id);
  assert.throws(() => C.startSession(env.db, env.boris, 'in', T0), /ещё не добавлено/);
  assert.throws(() => C.startSession(env.db, env.anna, 'out', T0), /Сначала отметьте приход/);
  await attempt(env, env.anna);
  assert.throws(() => C.startSession(env.db, env.anna, 'in', T0 + 60_000), /уже отмечен/);
});

test('уход подтверждается так же, как приход', async () => {
  const env = setup();
  await attempt(env, env.anna, { nowMs: T0 });
  const r = await attempt(env, env.anna, { kind: 'out', nowMs: T0 + 5 * 3600_000 + 5 * 60_000 });
  assert.equal(r.status, 'ok'); assert.ok(att(env, env.anna).check_out);
});

test('задания «живости»: моргание, улыбка, поворот', () => {
  const base = L.metrics(landmarks());
  const run = (c, lm) => L.check(c, L.metrics(landmarks(lm)), base).pass;
  assert.ok(run('wink_left', { earL: 0.1 })); assert.ok(!run('wink_left', { earR: 0.1 }));
  assert.ok(!run('wink_left', { earL: 0.1, earR: 0.1 }), 'оба глаза закрыты — не подмигивание');
  assert.ok(run('wink_right', { earR: 0.1 })); assert.ok(!run('wink_right', {}));
  assert.ok(run('smile', { mouth: 0.46 })); assert.ok(!run('smile', { mouth: 0.41 }));
  assert.ok(run('turn_left', { yaw: 0.68 })); assert.ok(run('turn_right', { yaw: 0.32 })); assert.ok(!run('turn_left', { yaw: 0.32 }));
  assert.ok(L.neutralOk(base)); assert.ok(!L.neutralOk(L.metrics(landmarks({ earL: 0.05 }))));
});

test('Telegram initData: подпись, подмена и срок давности', () => {
  const token = '123:ABC';
  const sign = (fields) => {
    const check = Object.entries(fields).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('\n');
    const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
    return new URLSearchParams({ ...fields, hash: crypto.createHmac('sha256', secret).update(check).digest('hex') }).toString();
  };
  const now = Date.now();
  const fields = { auth_date: String(Math.floor(now / 1000)), user: JSON.stringify({ id: 222, first_name: 'Anna' }), query_id: 'AAA' };
  assert.equal(C.verifyInitData(sign(fields), token, 3600, now).id, 222);
  assert.equal(C.verifyInitData(sign(fields).replace('222', '333'), token, 3600, now), null, 'подмена id');
  assert.equal(C.verifyInitData(sign(fields), 'other:token', 3600, now), null, 'чужой бот');
  assert.equal(C.verifyInitData(sign({ ...fields, auth_date: String(Math.floor(now / 1000) - 7200) }), token, 3600, now), null, 'просрочено');
  assert.equal(C.verifyInitData('', token), null);
});

test('HTTP: вход Telegram и cookie, чужой Telegram не пройдёт, админские API закрыты от учителей', async () => {
  const engine = fake();
  const app = await startTestApp({ faceEngine: engine, botToken: '123:ABC' });
  try {
    const { db } = app;
    const mk = (name, role, tg) => db.prepare(`INSERT INTO users (username,password_hash,full_name,role,monthly_salary,shift_start,shift_end,work_days,telegram_id) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(name, hashPassword('password1'), name, role, 1, '09:00', '14:00', '1,2,3,4,5,6,7', tg).lastInsertRowid;
    mk('dir', 'director', null); const aid = mk('anna', 'teacher', '222');
    db.prepare('INSERT INTO face_samples (user_id, descriptor) VALUES (?,?)').run(aid, Buffer.from(new Float32Array(person(1)).buffer));
    const anon = app.client();
    assert.equal((await anon('POST', '/api/checkin/start', { kind: 'in' })).status, 401);
    assert.equal((await anon('POST', '/api/checkin/start', { kind: 'in', initData: 'hash=' + '0'.repeat(64) })).status, 401);
    const teacher = app.client();
    await teacher('POST', '/api/auth/login', { username: 'anna', password: 'password1' });
    const st = await teacher('POST', '/api/checkin/state', {});
    assert.equal(st.status, 200); assert.equal(st.data.enrolled, true);
    const start = await teacher('POST', '/api/checkin/start', { kind: 'in' });
    assert.equal(start.status, 200); assert.equal(start.data.challenges.length, 2);
    assert.equal((await teacher('GET', '/api/faces')).status, 403);
    assert.equal((await teacher('GET', '/api/checkins')).status, 403);
    assert.equal((await teacher('POST', '/api/checkins/1/review', { approve: true })).status, 403);
    const mine = await teacher('GET', '/api/my/checkins');
    assert.equal(mine.status, 200); assert.equal(mine.data.enrolled, 1);
    const admin = app.client();
    await admin('POST', '/api/auth/login', { username: 'dir', password: 'password1' });
    assert.equal((await admin('GET', '/api/faces')).data.users.length, 1);
    assert.equal((await admin('PUT', '/api/face-settings', { face_match: 0.9 })).status, 400);
    assert.equal((await admin('PUT', '/api/face-settings', { face_required: true, face_match: 0.42, face_review: 0.5 })).status, 200);
    assert.equal(db.prepare("SELECT value FROM settings WHERE key='face_required'").get().value, '1');
  } finally { app.close(); }
});

test('бот: при включённой проверке по лицу обычная геолокация отметку не засчитывает', async () => {
  const env = setup();
  const msgs = [];
  const bot = createBot({ db: env.db, notifier: env.notifier, api: { sendMessage: async (id, text, extra) => msgs.push({ id, text, extra }) }, now: () => new Date(T0), publicUrl: 'https://school.example/' });
  const send = (message) => bot.handleUpdate({ update_id: 1, message: { chat: { id: 222, type: 'private' }, ...message } });
  await send({ text: '✅ Пришёл' });
  assert.equal(msgs.at(-1).extra.reply_markup.inline_keyboard[0][0].web_app.url, 'https://school.example/checkin?kind=in');
  await send({ location: SCHOOL });
  assert.equal(att(env, env.anna), undefined, 'геолокация из чата не засчитана');
  assert.ok(msgs.at(-1).extra.reply_markup.inline_keyboard, 'бот предлагает пройти проверку по лицу');
  const noHttps = createBot({ db: env.db, notifier: env.notifier, api: { sendMessage: async (id, text) => msgs.push({ id, text }) }, now: () => new Date(T0), publicUrl: 'http://localhost:3000' });
  await noHttps.handleUpdate({ update_id: 2, message: { chat: { id: 222, type: 'private' }, text: '🏁 Ушёл' } });
  assert.match(msgs.at(-1).text, /PUBLIC_URL/);
});

test('бот: без проверки по лицу устаревшая или пересланная геолокация не принимается', async () => {
  const env = setup(); setSetting(env.db, 'face_required', '0');
  const msgs = [];
  const bot = createBot({ db: env.db, notifier: env.notifier, api: { sendMessage: async (id, text) => msgs.push(text) }, now: () => new Date(T0) });
  const send = (message) => bot.handleUpdate({ update_id: 1, message: { chat: { id: 222, type: 'private' }, ...message } });
  await send({ text: '✅ Пришёл' });
  await send({ location: { latitude: 40.5, longitude: 68.0 }, date: Math.floor(T0 / 1000) - 3600 });
  assert.match(msgs.at(-1), /устарела/); assert.equal(att(env, env.anna), undefined);
  await send({ text: '✅ Пришёл' });
  await send({ location: { latitude: 40.5, longitude: 68.0 }, date: Math.floor(T0 / 1000), forward_date: 1 });
  assert.match(msgs.at(-1), /Пересланная/);
  await send({ text: '✅ Пришёл' });
  await send({ location: { latitude: 40.5, longitude: 68.0 }, date: Math.floor(T0 / 1000) });
  assert.equal(att(env, env.anna).status, 'present');
});

// ---------- настоящий движок на реальных фото (≈10–15 с) ----------
const fx = (n) => fs.readFileSync(path.join(__dirname, 'fixtures', n)).toString('base64');
const realDir = path.join(__dirname, '..', 'public', 'vendor', 'face');
test('настоящий движок: регистрация лиц, защита от дублей и распознавание человека', { timeout: 180_000, skip: !fs.existsSync(path.join(realDir, 'face-api.min.js')) }, async () => {
  const env = setup();
  env.db.prepare('DELETE FROM face_samples').run();
  const engine = createFaceEngine({ dir: realDir });
  env.engine = engine;
  try {
    const a = await C.enrollFace({ db: env.db, engine, actor: env.director, target: env.anna, image: fx('person-x.png') });
    assert.equal(a.count, 1);
    await C.enrollFace({ db: env.db, engine, actor: env.director, target: env.anna, image: fx('person-x-variant.png') });
    await assert.rejects(C.enrollFace({ db: env.db, engine, actor: env.director, target: env.boris, image: fx('person-x-variant.png') }), /слишком похоже/);
    await assert.rejects(C.enrollFace({ db: env.db, engine, actor: env.director, target: env.anna, image: fx('person-y.png') }), /не похоже/);
    await C.enrollFace({ db: env.db, engine, actor: env.director, target: env.boris, image: fx('person-y.png') });
    // Анна в кадре (задания не выполняет): лицо совпало, но живость не пройдена
    const f = fx('person-x-variant.png');
    const r = await attempt(env, env.anna, { frames: [f, f, f], token: C.startSession(env.db, env.anna, 'in', T0).token });
    assert.equal(r.reason, 'liveness_failed'); assert.equal(r.checks.face.ok, true); assert.equal(r.checks.zone.ok, true);
    // Борис показывает своё лицо в сессии Анны
    const y = fx('person-y.png');
    const r2 = await attempt(env, env.anna, { frames: [y, y, y], token: C.startSession(env.db, env.anna, 'in', T0 + 1000).token, nowMs: T0 + 1000 });
    assert.equal(r2.checks.face.ok, false); assert.ok(['other_person', 'face_mismatch'].includes(r2.reason) || r2.checks.face.ok === false);
    assert.equal(att(env, env.anna), undefined);
  } finally { engine.close(); }
});
