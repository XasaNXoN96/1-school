'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { localNow } = require('../server/attendance');
const { createBot } = require('../server/bot');
const { runBackupIfDue, listBackups } = require('../server/backup');
const { startTestApp } = require('./helpers');

const PASS = 'Passw0rd!!';
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const wd = (d) => { const w = new Date(`${d}T00:00:00Z`).getUTCDay(); return w === 0 ? 7 : w; };
// ближайшая дата с нужным днём недели не раньше, чем через minDays дней
const nextWeekday = (app, weekday, minDays = 2) => { let d = addDays(localNow(new Date(), 'Asia/Tashkent').date, minDays); while (wd(d) !== weekday) d = addDays(d, 1); return d; };
const todayStr = () => localNow(new Date(), 'Asia/Tashkent').date;
const wait = async (fn, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const r = await fn(); if (r) return r; await new Promise((r2) => setTimeout(r2, 30)); } return null; };

async function boot() {
  const app = await startTestApp({ scheduler: false });
  const sent = [];
  app.notifier.setTransport((chat, text) => { sent.push({ chat, text }); return Promise.resolve(); });
  const dir = app.client();
  assert.equal((await dir('POST', '/api/setup', { username: 'dir', password: PASS, full_name: 'Директор Д.' })).status, 200);
  const mk = async (role, username, extra = {}) => (await dir('POST', '/api/users', { role, username, password: PASS, full_name: extra.full_name || username, ...extra })).data;
  const login = async (username) => { const c = app.client(); const r = await c('POST', '/api/auth/login', { username, password: PASS }); assert.equal(r.status, 200, username); return c; };
  return { app, sent, dir, mk, login };
}

test('родитель: вход по коду, оценки, посещаемость, чужой ребёнок недоступен', async (t) => {
  const { app, sent, dir, mk, login } = await boot(); t.after(app.close);
  const teacher = await mk('teacher', 'ann', { subject: 'Математика' });
  await mk('staff', 'bob');
  const s1 = (await dir('POST', '/api/students', { full_name: 'Алиев Али', class_name: '5-A' })).data;
  const s2 = (await dir('POST', '/api/students', { full_name: 'Каримова Лола', class_name: '5-A' })).data;
  const gen = await dir('POST', '/api/parents/generate-codes');
  assert.equal(gen.data.created, 2);
  const parents = (await dir('GET', '/api/parents')).data.students;
  const code1 = parents.find((p) => p.id === s1.id).parent_code, code2 = parents.find((p) => p.id === s2.id).parent_code;
  assert.match(code1, /^[A-Z2-9]{8}$/); assert.notEqual(code1, code2);

  // обычный сотрудник и учитель не видят коды в списке учеников
  const tc = await login('ann');
  const list = (await tc('GET', '/api/students')).data;
  assert.ok(list.length === 2 && list.every((s) => !('parent_code' in s) && !('parent_telegram_id' in s)));
  assert.ok((await dir('GET', '/api/students')).data.every((s) => 'parent_code' in s));

  // неверный код
  const p = app.client();
  assert.equal((await p('POST', '/api/parent/login', { code: 'ZZZZZZZZ' })).status, 401);
  assert.equal((await p('GET', '/api/parent/children')).status, 401);
  assert.equal((await p('POST', '/api/parent/login', { code: code1.toLowerCase() })).status, 200); // регистр не важен

  // учитель ставит оценку и отсутствие → родитель видит, в сообщениях след
  const today = todayStr();
  assert.equal((await tc('POST', '/api/journal/grade', { student_id: s1.id, subject: 'Математика', date: today, score: 5 })).status, 200);
  assert.equal((await tc('POST', '/api/journal/grade', { student_id: s1.id, subject: 'Математика', date: today, score: 4, kind: 'quiz', comment: 'ошибка в задаче 3' })).status, 200);
  assert.equal((await tc('POST', '/api/journal/attendance', { student_id: s1.id, date: today, status: 'absent' })).status, 200);
  const ov = (await p('GET', '/api/parent/overview')).data;
  assert.equal(ov.student.full_name, 'Алиев Али');
  assert.equal(ov.subjects[0].avg, 4.5);
  assert.equal(ov.attendance.counts.absent, 1);
  assert.ok(ov.messages.some((m) => m.kind === 'absence'));
  assert.ok(ov.messages.some((m) => m.kind === 'grade' && /Математика — 5/.test(m.text)));
  assert.equal((await p('GET', `/api/parent/overview?student_id=${s2.id}`)).status, 403);

  // проверка границ: оценка 6, будущая дата, чужой не-учитель
  assert.equal((await tc('POST', '/api/journal/grade', { student_id: s1.id, subject: 'Математика', date: today, score: 6 })).status, 400);
  assert.equal((await tc('POST', '/api/journal/grade', { student_id: s1.id, subject: 'Математика', date: addDays(today, 3), score: 5 })).status, 400);
  const bc = await login('bob');
  assert.equal((await bc('POST', '/api/journal/grade', { student_id: s1.id, subject: 'X', date: today, score: 5 })).status, 403);
  // удалить чужую оценку учитель не может, а директор может
  const gid = ov.subjects[0].items[0].id;
  await mk('teacher', 'eve');
  const ec = await login('eve');
  assert.equal((await ec('DELETE', `/api/journal/grade/${gid}`)).status, 403);
  assert.equal((await dir('DELETE', `/api/journal/grade/${gid}`)).status, 200);

  // новый код отзывает доступ родителя
  const fresh = (await dir('POST', `/api/students/${s1.id}/parent-code`)).data.code;
  assert.notEqual(fresh, code1);
  assert.equal((await p('GET', '/api/parent/overview')).status, 401);
  assert.equal((await app.client()('POST', '/api/parent/login', { code: code1 })).status, 401);
  // выход
  const p2 = app.client(); await p2('POST', '/api/parent/login', { code: fresh });
  assert.equal((await p2('POST', '/api/parent/logout')).status, 200);
  assert.equal((await p2('GET', '/api/parent/children')).status, 401);
  assert.equal(sent.length, 0); // Telegram родителя не привязан — в бот ничего не уходило
});

test('родитель с двумя детьми и привязка Telegram; домашка и рассылка', async (t) => {
  const { app, sent, dir, mk, login } = await boot(); t.after(app.close);
  await mk('teacher', 'ann', { subject: 'Математика' });
  const a = (await dir('POST', '/api/students', { full_name: 'Аня', class_name: '5-A' })).data;
  const b = (await dir('POST', '/api/students', { full_name: 'Борис', class_name: '6-Б' })).data;
  const c = (await dir('POST', '/api/students', { full_name: 'Вера', class_name: '6-Б' })).data;
  await dir('POST', '/api/parents/generate-codes');
  const codes = Object.fromEntries((await dir('GET', '/api/parents')).data.students.map((s) => [s.id, s.parent_code]));
  const p = app.client();
  await p('POST', '/api/parent/login', { code: codes[a.id] }); await p('POST', '/api/parent/login', { code: codes[b.id] });
  const kids = (await p('GET', '/api/parent/children')).data;
  assert.equal(kids.length, 2);
  assert.equal((await p('GET', '/api/parent/overview')).status, 400); // несколько детей — нужно указать

  // бот: родитель отправляет код → привязка; затем получает оценки и сообщения
  const botMsgs = [];
  const bot = createBot({ db: app.db, notifier: app.notifier, api: { sendMessage: async (chat, text) => { botMsgs.push({ chat, text }); } } });
  await bot.handleUpdate({ message: { chat: { id: 9001, type: 'private' }, text: `/start ${codes[b.id]}` } });
  await bot.handleUpdate({ message: { chat: { id: 9001, type: 'private' }, text: codes[c.id] } }); // второй ребёнок — просто кодом
  assert.match(botMsgs[0].text, /Подключено: Борис/); assert.match(botMsgs[1].text, /Подключено: Вера/);
  assert.equal(app.db.prepare("SELECT COUNT(*) c FROM students WHERE parent_telegram_id='9001'").get().c, 2);

  const tc = await login('ann');
  await tc('POST', '/api/journal/grade', { student_id: b.id, subject: 'Математика', date: todayStr(), score: 3 });
  assert.ok(sent.some((m) => m.chat === '9001' && /Борис: Математика — 3/.test(m.text)));
  // домашка классу 6-Б: одно сообщение на чат (двое детей, один Telegram)
  sent.length = 0;
  assert.equal((await tc('POST', '/api/homework', { class_name: '6-Б', subject: 'Математика', text: 'Номер 15, 16', due_date: addDays(todayStr(), 1) })).status, 200);
  assert.equal(sent.filter((m) => m.chat === '9001').length, 1);
  assert.equal((await tc('POST', '/api/homework', { class_name: '9-Я', subject: 'X', text: 'Y', due_date: todayStr() })).status, 400); // нет такого класса
  const bot2 = [];
  const botP = createBot({ db: app.db, notifier: app.notifier, api: { sendMessage: async (chat, text) => { bot2.push(text); } } });
  await botP.handleUpdate({ message: { chat: { id: 9001, type: 'private' }, text: '📝 Домашнее задание' } });
  assert.match(bot2[0], /Номер 15, 16/);
  await botP.handleUpdate({ message: { chat: { id: 9001, type: 'private' }, text: '📚 Оценки и посещаемость' } });
  assert.match(bot2[1], /Борис[\s\S]*Математика: 3/);
  // чужой человек в боте ничего не получает
  await botP.handleUpdate({ message: { chat: { id: 4242, type: 'private' }, text: 'привет' } });
  assert.match(bot2[2], /Сначала привяжите/);

  // рассылка: только класс 6-Б, фоновая отправка, счётчики
  sent.length = 0;
  const br = await dir('POST', '/api/broadcasts', { text: 'Собрание в пятницу', audience: 'class:6-Б' });
  assert.equal(br.status, 200);
  const done = await wait(async () => (await dir('GET', '/api/broadcasts')).data.find((x) => x.id === br.data.id && x.status === 'done'));
  assert.ok(done);
  assert.equal(done.total, 2); assert.equal(done.sent, 1); assert.equal(done.in_cabinet, 2);
  assert.equal(app.db.prepare("SELECT COUNT(*) c FROM parent_messages WHERE kind='broadcast' AND student_id=?").get(a.id).c, 0);
  assert.equal(app.db.prepare("SELECT COUNT(*) c FROM parent_messages WHERE kind='broadcast' AND student_id=?").get(c.id).c, 1);
  // рассылка сотрудникам; недопустимая аудитория; учитель не может рассылать
  assert.equal((await dir('POST', '/api/broadcasts', { text: 'x', audience: 'hackers' })).status, 400);
  assert.equal((await tc('POST', '/api/broadcasts', { text: 'x' })).status, 403);
  // отвязка
  await dir('POST', `/api/students/${b.id}/parent-unlink`);
  assert.equal(app.db.prepare('SELECT parent_telegram_id p FROM students WHERE id=?').get(b.id).p, '');
});

test('запись на приём: слоты, занятость, отмена освобождает время, защита от спама', async (t) => {
  const { app, dir, mk, login } = await boot(); t.after(app.close);
  const teacher = await mk('teacher', 'ann', { subject: 'Физика', show_public: true });
  await mk('teacher', 'hidden', { show_public: false });
  const pub = app.client();
  const people = (await pub('GET', '/api/public/appointments/people')).data.people;
  assert.ok(people.some((x) => x.id === teacher.id) && people.some((x) => x.full_name === 'Директор Д.'));
  assert.ok(!people.some((x) => x.full_name === 'hidden'));
  const day = nextWeekday(app, 2); // вторник
  const slots = (await pub('GET', `/api/public/appointments/slots?user_id=${teacher.id}&date=${day}`)).data.slots;
  assert.equal(slots[0], '14:00'); assert.equal(slots.length, 9); // 14:00–17:00 шаг 20
  assert.deepEqual((await pub('GET', `/api/public/appointments/slots?user_id=${teacher.id}&date=${nextWeekday(app, 7)}`)).data.slots, []); // воскресенье
  const book = (time, over = {}) => pub('POST', '/api/public/appointments', { user_id: teacher.id, date: day, time, name: 'Иванова', phone: '+998 90 123 45 67', topic: 'Успеваемость', ...over });
  const r = await book('14:20');
  assert.equal(r.status, 200); assert.equal(r.data.with, 'ann');
  assert.equal((await book('14:20')).status, 409);
  assert.equal((await book('14:30')).status, 409); // не из сетки слотов
  assert.equal((await book('15:00', { phone: 'abc' })).status, 400);
  assert.ok(!(await pub('GET', `/api/public/appointments/slots?user_id=${teacher.id}&date=${day}`)).data.slots.includes('14:20'));
  // уведомление получил сам учитель
  const tc = await login('ann');
  assert.ok(app.db.prepare("SELECT 1 x FROM notices WHERE user_id=? AND text LIKE '%Запись на приём%'").get(teacher.id));
  const mine = (await tc('GET', '/api/appointments')).data;
  assert.equal(mine.length, 1);
  assert.equal((await tc('POST', `/api/appointments/${mine[0].id}/status`, { status: 'declined', note: 'болею' })).status, 200);
  assert.ok((await pub('GET', `/api/public/appointments/slots?user_id=${teacher.id}&date=${day}`)).data.slots.includes('14:20')); // слот свободен
  assert.equal((await book('14:20')).status, 200);
  // чужие записи учитель не видит, а ставить статус не может
  const other = await mk('teacher', 'eve'); const ec = await login('eve');
  assert.equal((await ec('GET', '/api/appointments')).data.length, 0);
  assert.equal((await ec('POST', `/api/appointments/${(await tc('GET', '/api/appointments')).data.find((x) => x.status === 'new').id}/status`, { status: 'done' })).status, 403);
  // антиспам: ловушка и лимит 4/час
  assert.equal((await pub('POST', '/api/public/appointments', { website: 'x', user_id: teacher.id })).data.ok, true);
  assert.equal((await book('15:00')).status, 200);
  assert.equal((await book('15:20')).status, 200);
  assert.equal((await book('15:40')).status, 429);
  // отпуск преподавателя закрывает запись
  const d2 = nextWeekday(app, 3, 10);
  await tc('POST', '/api/leaves', { kind: 'vacation', date_from: d2, date_to: d2 });
  const lid = (await tc('GET', '/api/leaves')).data[0].id;
  await dir('POST', `/api/leaves/${lid}/decision`, { status: 'approved' });
  assert.deepEqual((await pub('GET', `/api/public/appointments/slots?user_id=${teacher.id}&date=${d2}`)).data.slots, []);
  // настройки приёма
  assert.equal((await dir('PUT', '/api/school-settings', { appt_start: '16:00', appt_end: '15:00' })).status, 400);
  assert.equal((await dir('PUT', '/api/school-settings', { appt_start: '09:00', appt_end: '12:00', appt_step: '30', bot_username: '@SchoolBot' })).status, 200);
  assert.equal((await pub('GET', `/api/public/appointments/slots?user_id=${teacher.id}&date=${nextWeekday(app, 4)}`)).data.slots.length, 6);
  assert.equal((await pub('GET', '/api/public/site')).data.bot_username, 'SchoolBot');
});

test('справки и обращения (в т.ч. анонимные)', async (t) => {
  const { app, dir, mk } = await boot(); t.after(app.close);
  const s = (await dir('POST', '/api/students', { full_name: 'Алиев Али', class_name: '5-A' })).data;
  await dir('POST', '/api/parents/generate-codes');
  const code = (await dir('GET', '/api/parents')).data.students[0].parent_code;
  const p = app.client();
  assert.equal((await p('POST', '/api/parent/certs', { student_id: s.id })).status, 401);
  await p('POST', '/api/parent/login', { code });
  assert.equal((await p('POST', '/api/parent/certs', { kind: 'study', purpose: 'для банка' })).status, 200);
  assert.equal((await p('POST', '/api/parent/certs', { kind: 'bogus' })).status, 400);
  await p('POST', '/api/parent/certs', {}); await p('POST', '/api/parent/certs', {});
  assert.equal((await p('POST', '/api/parent/certs', {})).status, 429); // не больше 3 необработанных
  const list = (await dir('GET', '/api/certs')).data;
  assert.equal(list[0].full_name, 'Алиев Али');
  const printData = (await dir('GET', `/api/certs/${list[0].id}`)).data;
  assert.equal(printData.director, 'Директор Д.'); assert.equal(printData.cert.class_name, '5-A');
  await dir('POST', `/api/certs/${list[0].id}/status`, { status: 'ready', note: 'Кабинет 12' });
  const ov = (await p('GET', '/api/parent/overview')).data;
  assert.ok(ov.certs.some((c) => c.status === 'ready' && c.note === 'Кабинет 12'));
  assert.ok(ov.messages.some((m) => /Справка готова/.test(m.text)));
  assert.equal((await app.client()('GET', '/api/certs')).status, 401);

  // анонимное обращение, код отслеживания, ответ
  const pub = app.client();
  const fb = await pub('POST', '/api/public/feedback', { topic: 'complaint', message: 'В столовой холодно, дети мёрзнут' });
  assert.equal(fb.status, 200); assert.match(fb.data.code, /^F[A-Z2-9]{8}$/);
  assert.equal((await pub('GET', `/api/public/feedback/${fb.data.code}`)).data.status, 'new');
  assert.equal((await pub('GET', '/api/public/feedback/FAAAAAAAA')).status, 404);
  assert.equal((await pub('POST', '/api/public/feedback', { topic: 'x', message: 'достаточно длинное' })).status, 400);
  assert.equal((await pub('POST', '/api/public/feedback', { message: 'ab' })).status, 400);
  const adminList = (await dir('GET', '/api/feedback')).data;
  assert.equal(adminList[0].contact, ''); // аноним — контакта нет
  await dir('POST', `/api/feedback/${adminList[0].id}/answer`, { answer: 'Спасибо, отопление починим' });
  const st = (await pub('GET', `/api/public/feedback/${fb.data.code}`)).data;
  assert.equal(st.status, 'answered'); assert.match(st.answer, /отопление/);
  assert.ok(!('message' in st)); // публичный ответ не раскрывает лишнего
  // учитель не видит обращения
  await mk('teacher', 'ann');
  const tc = app.client(); await tc('POST', '/api/auth/login', { username: 'ann', password: PASS });
  assert.equal((await tc('GET', '/api/feedback')).status, 403);
});

test('отпуск и больничный: одобрение, зарплата, отмена, права', async (t) => {
  const { app, dir, mk, login } = await boot(); t.after(app.close);
  const ann = await mk('teacher', 'ann', { monthly_salary: 3_000_000 });
  const asst = await mk('assistant', 'asst');
  const ac = await login('ann'), sc = await login('asst');
  const from = nextWeekday(app, 1, 3), to = addDays(from, 4); // пн–пт
  assert.equal((await ac('POST', '/api/leaves', { kind: 'vacation', date_from: to, date_to: from })).status, 400);
  assert.equal((await ac('POST', '/api/leaves', { kind: 'vacation', date_from: addDays(todayStr(), -2), date_to: todayStr() })).status, 400); // отпуск задним числом
  assert.equal((await ac('POST', '/api/leaves', { kind: 'vacation', date_from: from, date_to: addDays(from, 200) })).status, 400);
  const r = await ac('POST', '/api/leaves', { kind: 'vacation', date_from: from, date_to: to, reason: 'Семейные обстоятельства' });
  assert.equal(r.status, 200);
  assert.equal((await ac('POST', '/api/leaves', { kind: 'sick', date_from: addDays(from, 2), date_to: addDays(from, 3) })).status, 409); // пересечение
  assert.equal((await ac('POST', `/api/leaves/${r.data.id}/decision`, { status: 'approved' })).status, 403); // сам себе не одобрит
  assert.equal((await sc('POST', `/api/leaves/${r.data.id}/decision`, { status: 'approved' })).status, 200); // помощник — учителю может
  assert.equal((await sc('POST', `/api/leaves/${r.data.id}/decision`, { status: 'approved' })).status, 409);
  const exc = () => app.db.prepare("SELECT COUNT(*) c FROM attendance WHERE user_id=? AND status='excused'").get(ann.id).c;
  assert.equal(exc(), 5); // пн–пт, суббота не входит в заявку
  // оплачиваемые дни попадают в расчёт
  const m = from.slice(0, 7);
  const rep = (await dir('GET', `/api/attendance?month=${m}&user_id=${ann.id}`)).data;
  assert.equal(rep.days.find((d) => d.date === from).status, 'excused'); // будущие дни отпуска видны как «уважительно»
  // заявка директора: помощник решить не может
  const dr = await dir('POST', '/api/leaves', { kind: 'unpaid', date_from: from, date_to: from });
  assert.equal((await sc('POST', `/api/leaves/${dr.data.id}/decision`, { status: 'approved' })).status, 403);
  assert.equal((await dir('POST', `/api/leaves/${dr.data.id}/decision`, { status: 'approved' })).status, 403); // и сам директор — себе нет
  // отмена одобренной убирает только отметки отпуска
  app.db.prepare("INSERT INTO attendance (user_id, date, status) VALUES (?,?, 'present') ON CONFLICT(user_id,date) DO UPDATE SET status='present', note=''").run(ann.id, addDays(from, 5));
  assert.equal((await ac('POST', `/api/leaves/${r.data.id}/cancel`)).status, 403); // одобренную отменяет руководитель
  assert.equal((await sc('POST', `/api/leaves/${r.data.id}/cancel`)).status, 200);
  assert.equal(exc(), 0);
  assert.equal((await ac('GET', '/api/leaves')).data[0].status, 'cancelled');
  // отпуск не затирает фактический приход
  app.db.prepare("INSERT INTO attendance (user_id, date, status, check_in) VALUES (?,?, 'present', '2026-01-01 09:00:00') ON CONFLICT(user_id,date) DO UPDATE SET status='present'").run(ann.id, from);
  const r2 = await ac('POST', '/api/leaves', { kind: 'sick', date_from: from, date_to: addDays(from, 1) });
  await sc('POST', `/api/leaves/${r2.data.id}/decision`, { status: 'approved' });
  assert.equal(app.db.prepare('SELECT status FROM attendance WHERE user_id=? AND date=?').get(ann.id, from).status, 'present');
  // без содержания не делает дни оплачиваемыми
  const r3 = await ac('POST', '/api/leaves', { kind: 'unpaid', date_from: addDays(from, 7), date_to: addDays(from, 8) });
  await sc('POST', `/api/leaves/${r3.data.id}/decision`, { status: 'approved' });
  assert.equal(app.db.prepare("SELECT COUNT(*) c FROM attendance WHERE user_id=? AND date IN (?,?)").get(ann.id, addDays(from, 7), addDays(from, 8)).c, 0);
  // чужие заявки сотрудник не видит
  await mk('teacher', 'eve'); const ec = await login('eve');
  assert.equal((await ec('GET', '/api/leaves')).data.length, 0);
  assert.equal((await ec('POST', `/api/leaves/${r3.data.id}/cancel`)).status, 403);
});

test('замены уроков: подбор без конфликтов, назначение, публичный список', async (t) => {
  const { app, dir, mk, login } = await boot(); t.after(app.close);
  const absent = await mk('teacher', 'absent', { subject: 'Математика' });
  const same = await mk('teacher', 'same', { subject: 'Математика' });
  const busy = await mk('teacher', 'busy', { subject: 'Физика' });
  const vac = await mk('teacher', 'vac', { subject: 'Математика' });
  const free = await mk('teacher', 'free', { subject: 'Химия' });
  const day = nextWeekday(app, 2, 1); // вторник
  const les = async (teacher, num, st, en, cls = '5-A', subj = 'Математика') => (await dir('POST', '/api/lessons', { teacher_id: teacher.id, weekday: 2, number: num, class_name: cls, subject: subj, room: '12', start_time: st, end_time: en })).data;
  const L1 = await les(absent, 2, '09:00', '09:45');
  await les(absent, 3, '10:00', '10:45', '6-Б');
  await les(busy, 2, '08:30', '09:15', '7-A', 'Физика'); // пересекается с L1, но не с L2
  await dir('POST', '/api/students', { full_name: 'Аня', class_name: '5-A' });
  // отпуск «vac» на этот день
  const vc = await login('vac'); const vr = await vc('POST', '/api/leaves', { kind: 'vacation', date_from: day, date_to: day });
  await dir('POST', `/api/leaves/${vr.data.id}/decision`, { status: 'approved' });
  const sug = (await dir('GET', `/api/substitutions/suggest?teacher_id=${absent.id}&date=${day}`)).data;
  assert.equal(sug.lessons.length, 2);
  const names = sug.lessons[0].candidates.map((c) => c.full_name);
  assert.deepEqual(names.slice(0, 2), ['same', 'free']); // тот же предмет — первым
  assert.ok(!names.includes('busy') && !names.includes('vac') && !names.includes('absent'));
  assert.ok(sug.lessons[1].candidates.some((c) => c.full_name === 'busy')); // на втором уроке busy свободен
  // назначение
  assert.equal((await dir('POST', '/api/substitutions', { date: day, lesson_id: L1.id, sub_user_id: busy.id })).status, 409);
  assert.equal((await dir('POST', '/api/substitutions', { date: addDays(day, 1), lesson_id: L1.id, sub_user_id: same.id })).status, 400); // не тот день недели
  assert.equal((await dir('POST', '/api/substitutions', { date: day, lesson_id: L1.id, sub_user_id: same.id, note: 'Тема: дроби' })).status, 200);
  // тот же учитель теперь занят на пересекающемся уроке
  const L3 = await les(free, 4, '09:10', '09:50', '8-A', 'Химия');
  assert.equal((await dir('POST', '/api/substitutions', { date: day, lesson_id: L3.id, sub_user_id: same.id })).status, 409);
  const sc = await login('same');
  assert.ok(app.db.prepare("SELECT 1 x FROM notices WHERE user_id=? AND text LIKE '%замена%'").get(same.id));
  assert.equal((await sc('GET', `/api/substitutions?date=${day}`)).data.length, 1);
  assert.equal((await sc('POST', '/api/substitutions', { date: day, lesson_id: L1.id, sub_user_id: same.id })).status, 403);
  // родителям класса ушло сообщение
  assert.ok(app.db.prepare("SELECT 1 x FROM parent_messages WHERE text LIKE '%Замена урока%'").get());
  // публично видны только сегодня/завтра и без имени отсутствующего
  const pubNow = (await app.client()('GET', '/api/public/substitutions')).data;
  assert.ok(Array.isArray(pubNow));
  app.db.prepare('UPDATE substitutions SET date=? WHERE lesson_id=?').run(todayStr(), L1.id);
  const pub = (await app.client()('GET', '/api/public/substitutions')).data;
  assert.equal(pub.length, 1); assert.equal(pub[0].sub_name, 'same'); assert.ok(!('absent_name' in pub[0]));
  assert.equal((await dir('DELETE', `/api/substitutions/${(await dir('GET', `/api/substitutions?date=${todayStr()}`)).data[0].id}`)).status, 200);
});

test('расчётный листок: премии, удержания, права доступа', async (t) => {
  const { app, dir, mk, login } = await boot(); t.after(app.close);
  const ann = await mk('teacher', 'ann', { monthly_salary: 2_600_000 });
  const eve = await mk('teacher', 'eve', { monthly_salary: 1_000_000 });
  const asst = await mk('assistant', 'asst', { monthly_salary: 4_000_000 });
  const m = todayStr().slice(0, 7);
  const dates = []; for (let i = 0; i < 28 && dates.length < 2; i++) { const d = addDays(todayStr(), -i); if (d.startsWith(m) && wd(d) <= 5 && d <= todayStr()) dates.push(d); }
  for (const d of dates) app.db.prepare("INSERT INTO attendance (user_id, date, status, check_in) VALUES (?,?, 'present', ?)").run(ann.id, d, `${d} 09:00:00`);
  const base = (await dir('GET', `/api/payslip?month=${m}&user_id=${ann.id}`)).data;
  assert.equal(base.net, base.earned); assert.ok(base.earned > 0 || dates.length === 0);
  assert.equal((await dir('POST', '/api/payroll/items', { user_id: ann.id, month: m, kind: 'bonus', title: 'Олимпиада', amount: 200000 })).status, 200);
  const d1 = await dir('POST', '/api/payroll/items', { user_id: ann.id, month: m, kind: 'deduction', title: 'Аванс', amount: 50000 });
  assert.equal(d1.status, 200);
  assert.equal((await dir('POST', '/api/payroll/items', { user_id: ann.id, month: m, kind: 'bonus', title: 'x', amount: 0 })).status, 400);
  assert.equal((await dir('POST', '/api/payroll/items', { user_id: ann.id, month: '2026-13', kind: 'bonus', title: 'x', amount: 5 })).status, 400);
  const ac = await login('ann');
  const mine = (await ac('GET', `/api/payslip?month=${m}`)).data;
  assert.equal(mine.bonus, 200000); assert.equal(mine.deduction, 50000); assert.equal(mine.net, mine.earned + 150000);
  assert.equal(mine.items.length, 2);
  assert.equal((await ac('GET', `/api/payslip?month=${m}&user_id=${eve.id}`)).status, 403);
  assert.equal((await ac('POST', '/api/payroll/items', { user_id: ann.id, month: m, kind: 'bonus', title: 'x', amount: 5 })).status, 403);
  // помощник: чужую ведомость видит, но директорскую — нет; свои начисления себе не вносит
  const sc = await login('asst');
  assert.equal((await sc('GET', `/api/payslip?month=${m}&user_id=${ann.id}`)).status, 200);
  assert.equal((await sc('POST', '/api/payroll/items', { user_id: asst.id, month: m, kind: 'bonus', title: 'x', amount: 5 })).status, 403);
  assert.equal((await dir('POST', '/api/payroll/items', { user_id: asst.id, month: m, kind: 'bonus', title: 'За работу', amount: 100000 })).status, 200);
  const sheet = (await dir('GET', `/api/payslips?month=${m}`)).data;
  assert.equal(sheet.rows.length, 4); assert.equal(sheet.total, sheet.rows.reduce((s, r) => s + r.net, 0));
  assert.ok(!(await sc('GET', `/api/payslips?month=${m}`)).data.rows.some((r) => r.role === 'director'));
  // удержание больше начисленного не уводит в минус
  await dir('POST', '/api/payroll/items', { user_id: eve.id, month: m, kind: 'deduction', title: 'Штраф', amount: 9_999_999 });
  assert.equal((await dir('GET', `/api/payslip?month=${m}&user_id=${eve.id}`)).data.net, 0);
  assert.equal((await dir('DELETE', `/api/payroll/items/${d1.data.id}`)).status, 200);
  assert.equal((await ac('GET', `/api/payslip?month=${m}`)).data.deduction, 0);
});

test('информация для сайта: меню, звонки, подвоз, документы', async (t) => {
  const { app, dir, mk, login } = await boot(); t.after(app.close);
  const pub = app.client();
  const day = nextWeekday(app, 3, 0);
  assert.equal((await dir('PUT', `/api/menu/${day}`, { breakfast: 'Каша манная, чай', lunch: 'Плов, компот', snack: 'Яблоко' })).status, 200);
  const w = (await pub('GET', `/api/public/menu?date=${day}`)).data;
  assert.equal(w.days.length, 7); assert.equal(w.days[0].date.slice(0, 4).length, 4);
  assert.equal(w.days.find((d) => d.date === day).lunch, 'Плов, компот');
  assert.equal((await dir('POST', '/api/menu/copy-week', { date: day })).data.copied, 1);
  assert.equal((await pub('GET', `/api/public/menu?date=${addDays(day, 7)}`)).data.days.find((d) => d.date === addDays(day, 7)).snack, 'Яблоко');
  await dir('PUT', `/api/menu/${day}`, { breakfast: '', lunch: '', snack: '' });
  assert.equal((await pub('GET', `/api/public/menu?date=${day}`)).data.days.find((d) => d.date === day).lunch, '');
  const tc = await (async () => { await mk('teacher', 'ann'); return login('ann'); })();
  assert.equal((await tc('PUT', `/api/menu/${day}`, { lunch: 'x' })).status, 403);
  assert.equal((await pub('PUT', `/api/menu/${day}`, { lunch: 'x' })).status, 401);

  // звонки
  assert.equal((await dir('PUT', '/api/bells', { bells: [{ shift: 1, number: 1, start_time: '08:00', end_time: '08:45' }, { shift: 1, number: 2, start_time: '08:55', end_time: '09:40' }] })).status, 200);
  assert.equal((await dir('PUT', '/api/bells', { bells: [{ shift: 1, number: 1, start_time: '09:00', end_time: '08:00' }] })).status, 400);
  assert.equal((await pub('GET', '/api/public/bells')).data.bells.length, 2); // неудачная замена ничего не стёрла
  const tr = await dir('POST', '/api/transport', { title: 'Маршрут №1', description: 'Центр → школа', times: '07:20, 07:40' });
  assert.equal((await pub('GET', '/api/public/bells')).data.transport[0].times, '07:20, 07:40');
  await dir('DELETE', `/api/transport/${tr.data.id}`);

  // документы: загрузка файла → запись → скачивание как вложение → удаление
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
  const up = await fetch(`${app.base}/api/upload-raw?ext=pdf`, { method: 'POST', headers: { Cookie: (await (async () => { const r = await fetch(`${app.base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'dir', password: PASS }) }); return r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; '); })()) }, body: pdf });
  assert.equal(up.status, 200);
  const { file } = await up.json();
  assert.match(file, /^[a-f0-9]{32}\.pdf$/);
  const bad = await fetch(`${app.base}/api/upload-raw?ext=pdf`, { method: 'POST', headers: { Cookie: '' }, body: pdf });
  assert.equal(bad.status, 401);
  assert.equal((await dir('POST', '/api/documents', { title: 'Устав школы', category: 'Основные', file: '../../etc/passwd' })).status, 400);
  assert.equal((await dir('POST', '/api/documents', { title: 'Нет файла', file: 'a'.repeat(32) + '.pdf' })).status, 400);
  const doc = await dir('POST', '/api/documents', { title: 'Устав школы', category: 'Основные', file, original_name: 'ustav.pdf' });
  assert.equal(doc.status, 200);
  const list = (await pub('GET', '/api/public/documents')).data;
  assert.equal(list[0].title, 'Устав школы'); assert.equal(list[0].size, pdf.length);
  const dl = await fetch(`${app.base}/uploads/${file}`);
  assert.equal(dl.status, 200); assert.equal(dl.headers.get('content-type'), 'application/pdf');
  assert.equal(dl.headers.get('content-disposition'), 'attachment');
  const fake = await fetch(`${app.base}/api/upload-raw?ext=pdf`, { method: 'POST', body: Buffer.from('MZ not a pdf') });
  assert.ok(fake.status === 401 || fake.status === 400);
  assert.equal((await dir('DELETE', `/api/documents/${doc.data.id}`)).status, 200);
  assert.equal((await fetch(`${app.base}/uploads/${file}`)).status, 404);
});

test('безопасность: журнал входов, вход директора по коду из Telegram', async (t) => {
  const { app, sent, dir, mk } = await boot(); t.after(app.close);
  const c = app.client();
  assert.equal((await c('POST', '/api/auth/login', { username: 'dir', password: 'wrong-pass' })).status, 401);
  assert.equal((await c('POST', '/api/auth/login', { username: 'nobody', password: 'x' })).status, 401);
  const log = (await dir('GET', '/api/security/log?ok=0')).data;
  assert.equal(log.rows.length, 2); assert.equal(log.failed_24h, 2);
  assert.ok(log.rows.some((r) => r.username === 'nobody'));
  await mk('teacher', 'ann');
  const tc = app.client(); await tc('POST', '/api/auth/login', { username: 'ann', password: PASS });
  assert.equal((await tc('GET', '/api/security/log')).status, 403);

  // без привязанного Telegram включить защиту нельзя
  assert.equal((await dir('POST', '/api/security/2fa/start')).status, 400);
  app.db.prepare("UPDATE users SET telegram_id='555' WHERE username='dir'").run();
  const st = await dir('POST', '/api/security/2fa/start');
  assert.equal(st.status, 200);
  const code = /: (\d{6})/.exec(sent.at(-1).text)[1];
  assert.equal(sent.at(-1).chat, '555');
  assert.equal((await dir('POST', '/api/security/2fa', { enabled: true, token: st.data.token, code: '000000' })).status, 401);
  assert.equal((await dir('POST', '/api/security/2fa', { enabled: true, token: st.data.token, code })).status, 200);
  assert.equal((await dir('GET', '/api/security/status')).data.director_2fa, true);

  // вход: пароль → код
  const d2 = app.client();
  const l1 = await d2('POST', '/api/auth/login', { username: 'dir', password: PASS });
  assert.equal(l1.status, 200); assert.equal(l1.data.need_code, true);
  assert.equal((await d2('GET', '/api/auth/me')).status, 401); // сессии ещё нет
  assert.equal((await d2('POST', '/api/auth/verify', { token: l1.data.token, code: '123456' })).status, 401);
  const code2 = /: (\d{6})/.exec(sent.at(-1).text)[1];
  const v = await d2('POST', '/api/auth/verify', { token: l1.data.token, code: code2 });
  assert.equal(v.status, 200); assert.equal(v.data.role, 'director');
  assert.equal((await d2('GET', '/api/auth/me')).status, 200);
  assert.equal((await d2('POST', '/api/auth/verify', { token: l1.data.token, code: code2 })).status, 401); // код одноразовый
  // 5 неверных попыток сжигают код
  const l2 = await app.client()('POST', '/api/auth/login', { username: 'dir', password: PASS });
  const d3 = app.client();
  for (let i = 0; i < 5; i++) await d3('POST', '/api/auth/verify', { token: l2.data.token, code: '000001' });
  const code3 = /: (\d{6})/.exec(sent.at(-1).text)[1];
  assert.equal((await d3('POST', '/api/auth/verify', { token: l2.data.token, code: code3 })).status, 401);
  // учителя защита не касается
  assert.equal((await app.client()('POST', '/api/auth/login', { username: 'ann', password: PASS })).data.need_code, undefined);
  // если Telegram не отвечает — вход не выдаётся (и не «зависает»)
  app.notifier.setTransport(() => Promise.reject(new Error('down')));
  assert.equal((await app.client()('POST', '/api/auth/login', { username: 'dir', password: PASS })).status, 503);
  // аварийное отключение переменной окружения
  process.env.DISABLE_2FA = '1';
  try { assert.equal((await app.client()('POST', '/api/auth/login', { username: 'dir', password: PASS })).data.need_code, undefined); } finally { delete process.env.DISABLE_2FA; }
  // выключение защиты
  await dir('POST', '/api/security/2fa', { enabled: false });
  assert.equal((await app.client()('POST', '/api/auth/login', { username: 'dir', password: PASS })).data.need_code, undefined);
});

test('резервные копии: ручная, по расписанию, хранение N, скачивание только директором', async (t) => {
  const { app, sent, dir, mk, login, } = await boot(); t.after(app.close);
  const b = await dir('POST', '/api/backups');
  assert.equal(b.status, 200); assert.match(b.data.name, /^school-\d{8}-\d{6}\.sqlite$/);
  const files = (await dir('GET', '/api/backups')).data.files;
  assert.equal(files.length, 1);
  const dl = await fetch(`${app.base}/api/backups/${b.data.name}`, { headers: { Cookie: (await (async () => { const r = await fetch(`${app.base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'dir', password: PASS }) }); return r.headers.getSetCookie().map((x) => x.split(';')[0]).join('; '); })()) } });
  assert.equal(dl.status, 200);
  const buf = Buffer.from(await dl.arrayBuffer());
  assert.equal(buf.subarray(0, 15).toString(), 'SQLite format 3'); // настоящая база
  assert.equal((await fetch(`${app.base}/api/backups/${b.data.name}`)).status, 403);
  assert.equal((await fetch(`${app.base}/api/backups/..%2F..%2Fetc%2Fpasswd`)).status, 404);
  await mk('teacher', 'ann'); const tc = await login('ann');
  assert.equal((await tc('POST', '/api/backups')).status, 403);
  // расписание: не чаще backup_hours, хранится не больше backup_keep
  await dir('PUT', '/api/backup-settings', { backup_keep: 2, backup_hours: 1, backup_telegram: true });
  app.db.prepare("UPDATE users SET telegram_id='777' WHERE username='dir'").run();
  const docs = []; app.notifier.setDocTransport(async (chat, file, cap) => { docs.push({ chat, file, cap }); });
  assert.equal(await runBackupIfDue(app.db, app.dataDir, app.notifier, new Date(Date.now() + 30 * 60_000)), null); // ещё рано
  const r1 = await runBackupIfDue(app.db, app.dataDir, app.notifier, new Date(Date.now() + 2 * 3600_000));
  assert.ok(r1); assert.equal(docs.length, 1); assert.equal(docs[0].chat, '777');
  const r2 = await runBackupIfDue(app.db, app.dataDir, app.notifier, new Date(Date.now() + 4 * 3600_000));
  assert.ok(r2); assert.equal(listBackups(app.dataDir).length, 2); // старая удалена
  await dir('PUT', '/api/backup-settings', { backup_enabled: false });
  assert.equal(await runBackupIfDue(app.db, app.dataDir, app.notifier, new Date(Date.now() + 99 * 3600_000)), null);
  assert.equal((await dir('PUT', '/api/backup-settings', { backup_hours: 0 })).status, 400);
});
