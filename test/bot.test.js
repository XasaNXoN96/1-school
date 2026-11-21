'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { openDb, setSetting } = require('../server/db');
const { createNotifier } = require('../server/notify');
const { hashPassword } = require('../server/auth');
const { createBot } = require('../server/bot');

test('бот: привязка по коду, приход по геолокации, опоздание уведомляет директора', async () => {
  const db = openDb(':memory:');
  setSetting(db, 'school_lat', 40.5); setSetting(db, 'school_lon', 68.0);
  const mk = (u, role, code, tg) => db.prepare(
    "INSERT INTO users (username,password_hash,full_name,role,link_code,telegram_id,monthly_salary) VALUES (?,?,?,?,?,?,3000000)")
    .run(u, hashPassword('password123'), u, role, code, tg);
  mk('director', 'director', null, '900'); mk('teacher', 'teacher', 'ABC234', null);

  const out = [];
  const api = { sendMessage: async (chat, text) => { out.push([String(chat), text]); } };
  const notifier = createNotifier(db); notifier.setTransport(api.sendMessage);
  let clock = new Date(Date.UTC(2026, 10, 16, 4, 45)); // пн 09:45 по Ташкенту
  const bot = createBot({ db, notifier, api, now: () => clock });
  const msg = (extra) => bot.handleUpdate({ update_id: 1, message: { chat: { id: 555, type: 'private' }, ...extra } });

  await msg({ text: 'Привет' });
  assert.match(out.at(-1)[1], /Сначала привяжите/);
  await msg({ text: '/start WRONG1' });
  assert.match(out.at(-1)[1], /не найден/);
  await msg({ text: '/start abc234' });
  assert.match(out.at(-1)[1], /привязан/);
  await msg({ text: '/start ABC234' });
  assert.match(out.at(-1)[1], /не найден/); // код одноразовый

  await msg({ location: { latitude: 40.5, longitude: 68.0 } });
  assert.match(out.at(-1)[1], /Сначала нажмите/);

  await msg({ text: '✅ Пришёл' });
  await msg({ location: { latitude: 40.5, longitude: 68.0 }, forward_origin: { type: 'user' } });
  assert.match(out.at(-1)[1], /Пересланная/);

  await msg({ text: '✅ Пришёл' });
  await msg({ location: { latitude: 40.5, longitude: 68.0 } });
  assert.match(out.at(-1)[1], /Опоздание на 45 мин/);
  assert.ok(out.find(([chat, t]) => chat === '900' && t.includes('Опоздание: teacher')));

  await msg({ text: '📊 Зарплата' });
  assert.match(out.at(-1)[1], /Оклад: 3.000.000|Оклад: 3\s?000\s?000/);
});
