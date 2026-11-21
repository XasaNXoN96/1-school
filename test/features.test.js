'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp } = require('./helpers');
const { runReminders } = require('../server/reminders');
const { handleRawUpload } = require('../server/rawupload');

async function bootstrap(t) {
  const app = await startTestApp();
  t.after(app.close);
  const director = app.client(), teacher = app.client(), other = app.client();
  await director('POST', '/api/setup', { username: 'dir', password: 'password123', full_name: 'Директор' });
  const tch = (await director('POST', '/api/users', { username: 'teach', password: 'password123', full_name: 'Учитель', role: 'teacher' })).data;
  const oth = (await director('POST', '/api/users', { username: 'other', password: 'password123', full_name: 'Другой', role: 'teacher' })).data;
  await teacher('POST', '/api/auth/login', { username: 'teach', password: 'password123' });
  await other('POST', '/api/auth/login', { username: 'other', password: 'password123' });
  return { app, director, teacher, other, tch, oth };
}

test('заморозка блокирует вход и сессию, разморозка возвращает', async (t) => {
  const { director, teacher, tch } = await bootstrap(t);
  assert.equal((await director('POST', `/api/users/${tch.id}/freeze`, { frozen: true })).status, 200);
  assert.equal((await teacher('GET', '/api/auth/me')).status, 401);
  const again = await teacher('POST', '/api/auth/login', { username: 'teach', password: 'password123' });
  assert.equal(again.status, 403); assert.match(again.data.error, /заморожен/);
  await director('POST', `/api/users/${tch.id}/freeze`, { frozen: false });
  assert.equal((await teacher('POST', '/api/auth/login', { username: 'teach', password: 'password123' })).status, 200);
  assert.equal((await director('POST', '/api/users/1/freeze', { frozen: true })).status, 400); // директора нельзя
});

test('расписание: учитель видит свои уроки на сегодня; чужие не видит', async (t) => {
  const { director, teacher, other, tch, app } = await bootstrap(t);
  const { localNow } = require('../server/attendance');
  const wd = localNow(new Date(), 'Asia/Tashkent').weekday;
  assert.equal((await director('POST', '/api/lessons', { teacher_id: tch.id, weekday: wd, number: 1, class_name: '8-A', subject: 'Informatika', start_time: '08:00', end_time: '08:45' })).status, 200);
  assert.equal((await director('POST', '/api/lessons', { teacher_id: tch.id, weekday: wd, start_time: '09:00', end_time: '08:00' })).status, 400);
  assert.equal((await teacher('POST', '/api/lessons', { teacher_id: tch.id, weekday: 1, start_time: '08:00', end_time: '09:00' })).status, 403);
  const dash = (await teacher('GET', '/api/panel/dashboard')).data;
  assert.equal(dash.lessons_today.length, 1); assert.equal(dash.counts.lessons_week, 1);
  assert.equal((await other('GET', '/api/lessons')).data.length, 0);
  assert.ok(app);
});

test('мои планы: напоминание приходит один раз, чужие планы недоступны', async (t) => {
  const { app, teacher, other, tch } = await bootstrap(t);
  const p = (await teacher('POST', '/api/plans', { title: 'Родительское собрание', date: '2026-11-21', time: '10:00' })).data;
  assert.equal((await other('POST', `/api/plans/${p.id}/toggle`)).status, 404);
  const sent = []; app.notifier.setTransport(async (tg, text) => sent.push(text));
  app.db.prepare('UPDATE users SET telegram_id = ? WHERE id = ?').run('777', tch.id);
  const before = new Date(Date.UTC(2026, 10, 21, 4, 0)); // 09:00 Ташкент — рано
  assert.equal(runReminders(app.db, app.notifier, before), 0);
  const after = new Date(Date.UTC(2026, 10, 21, 5, 1)); // 10:01
  assert.equal(runReminders(app.db, app.notifier, after), 1);
  assert.equal(runReminders(app.db, app.notifier, after), 0);
  assert.ok(sent.some((x) => x.includes('Родительское собрание')));
  assert.equal((await teacher('GET', '/api/plans?month=2026-11')).data.length, 1);
});

test('внутренние объявления: всем или выбранным; публичные не затронуты', async (t) => {
  const { director, teacher, other, oth } = await bootstrap(t);
  await director('POST', '/api/announcements', { title: 'Только для Другого', body: 'x', to_all: false, user_ids: [oth.id] });
  await director('POST', '/api/announcements', { title: 'Для всех', body: 'y', to_all: true });
  assert.equal((await director('POST', '/api/announcements', { title: 'Никому', to_all: false, user_ids: [] })).status, 400);
  assert.deepEqual((await teacher('GET', '/api/announcements')).data.map((a) => a.title), ['Для всех']);
  assert.equal((await other('GET', '/api/announcements')).data.length, 2);
  assert.equal((await teacher('POST', '/api/announcements', { title: 'x', to_all: true })).status, 403);
  assert.ok((await other('GET', '/api/panel/dashboard')).data.notices.some((n) => n.text.includes('Только для Другого')));
});

test('достижения директора — тоже черновик до подтверждения; смена логина и пароля', async (t) => {
  const { director } = await bootstrap(t);
  const st = (await director('POST', '/api/students', { full_name: 'Али', class_name: '9-A' })).data;
  const a = (await director('POST', '/api/achievements', { kind: 'student', student_id: st.id, title: 'Олимпиада', date: '2026-11-01' })).data;
  assert.equal(a.status, 'pending');
  const guest = (await startTestApp());
  t.after(guest.close);
  assert.equal((await director('PUT', `/api/achievements/${a.id}`, { status: 'published' })).data.status, 'published');
  assert.equal((await director('PUT', '/api/auth/account', { current: 'wrong', username: 'boss' })).status, 400);
  assert.equal((await director('PUT', '/api/auth/account', { current: 'password123', username: 'boss', password: 'new-password-1' })).data.username, 'boss');
  const c = guest.client();
  assert.equal((await c('POST', '/api/auth/login', { username: 'dir', password: 'password123' })).status, 401);
});

test('страница «О школе» с фото/видео/аудио и медиа-тип в галерее', async (t) => {
  const { director, app } = await bootstrap(t);
  const guest = app.client();
  assert.equal((await director('PUT', '/api/pages/about', { title: 'О школе', body: 'Текст', video_url: 'javascript:alert(1)' })).status, 400);
  assert.equal((await director('PUT', '/api/pages/about', { title: 'О школе', body: 'Текст', video_url: 'https://youtu.be/x', audio: 'bad.mp3' })).status, 400);
  const ok = (await director('PUT', '/api/pages/about', { title: 'О школе', body: 'Текст', video_url: 'https://youtu.be/x', video: 'a'.repeat(32) + '.mp4' })).data;
  assert.equal(ok.video, 'a'.repeat(32) + '.mp4');
  assert.equal((await guest('GET', '/api/public/pages/about')).data.video_url, 'https://youtu.be/x');
  await director('POST', '/api/media', { title: 'Ролик', file: 'b'.repeat(32) + '.mp4' });
  assert.equal((await guest('GET', '/api/public/media')).data[0].kind, 'video');
});

test('загрузка видео: проверка формата, Range, чужие запросы', async (t) => {
  const { app, director } = await bootstrap(t);
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  void director;
  const cookieRes = await fetch(app.base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'dir', password: 'password123' }) });
  const cookie = cookieRes.headers.getSetCookie()[0].split(';')[0];
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(2000, 7)]);
  assert.equal((await fetch(app.base + '/api/upload-raw?ext=mp4', { method: 'POST', headers: { Cookie: cookie }, body: Buffer.from('<html>fake</html>') })).status, 400);
  assert.equal((await fetch(app.base + '/api/upload-raw?ext=exe', { method: 'POST', headers: { Cookie: cookie }, body: mp4 })).status, 400);
  assert.equal((await fetch(app.base + '/api/upload-raw?ext=mp4', { method: 'POST', body: mp4 })).status, 401);
  const up = await (await fetch(app.base + '/api/upload-raw?ext=mp4', { method: 'POST', headers: { Cookie: cookie }, body: mp4 })).json();
  assert.match(up.file, /^[a-f0-9]{32}\.mp4$/);
  const part = await fetch(app.base + '/uploads/' + up.file, { headers: { Range: 'bytes=0-9' } });
  assert.equal(part.status, 206); assert.equal(part.headers.get('content-range'), `bytes 0-9/${mp4.length}`);
  assert.equal((await part.arrayBuffer()).byteLength, 10);
  void fs; void os; void path; void handleRawUpload;
});

test('поручения: итог «в срок / с опозданием / не выполнено» и сводка по сотрудникам', async (t) => {
  const { app, director, teacher, other, tch } = await bootstrap(t);
  const iso = (add) => new Date(Date.now() + add * 86400000).toISOString().slice(0, 10);
  const mk = async (title, due) => (await director('POST', '/api/tasks', { assignee_id: tch.id, title, due_date: due })).data.id;
  const onTime = await mk('вовремя', iso(3)), late = await mk('поздно', iso(-2)), overdue = await mk('не сделано', iso(-1)), open = await mk('в работе', iso(5));
  assert.equal((await teacher('POST', `/api/tasks/${onTime}/done`)).status, 200);
  assert.equal((await teacher('POST', `/api/tasks/${late}/done`)).status, 200);
  const list = (await teacher('GET', '/api/tasks')).data;
  const by = (id) => list.find((x) => x.id === id).outcome;
  assert.equal(by(onTime), 'on_time'); assert.equal(by(late), 'late'); assert.equal(by(overdue), 'overdue'); assert.equal(by(open), 'open');
  const stats = (await director('GET', '/api/tasks/stats')).data.find((r) => r.user_id === tch.id);
  assert.deepEqual([stats.on_time, stats.late, stats.overdue, stats.open, stats.total], [1, 1, 1, 1, 4]);
  assert.equal(stats.rate, 33);
  // учитель видит только свою сводку
  const mine = (await teacher('GET', '/api/tasks/stats')).data;
  assert.equal(mine.length, 1); assert.equal(mine[0].user_id, tch.id);
  assert.equal((await other('GET', '/api/tasks/stats')).data[0].total, 0);
});

test('статистика школы: только руководство, upsert по дате', async (t) => {
  const { director, teacher } = await bootstrap(t);
  assert.equal((await teacher('GET', '/api/stats')).status, 403);
  assert.equal((await director('POST', '/api/stats/school', { date: '2025-09-01', students: 400, teachers: 50 })).status, 200);
  assert.equal((await director('POST', '/api/stats/school', { date: '2025-09-01', students: 410, teachers: 50 })).status, 200);
  assert.equal((await director('POST', '/api/stats/school', { date: '2026-09-01', students: 600, teachers: 56 })).status, 200);
  assert.equal((await director('POST', '/api/stats/mastery', { date: '2025-10-31', subject: 'Matematika', percent: 60 })).status, 200);
  assert.equal((await director('POST', '/api/stats/mastery', { date: '2026-10-31', subject: 'Matematika', percent: 80 })).status, 200);
  assert.equal((await director('POST', '/api/stats/mastery', { date: '2026-10-31', subject: 'Matematika', percent: 150 })).status === 200, false);
  const st = (await director('GET', '/api/stats')).data;
  assert.deepEqual(st.school.map((r) => r.students), [410, 600]);
  assert.deepEqual(st.mastery.map((r) => r.percent), [60, 80]);
});

test('события: публично видны только открытые; сотрудникам — и «для сотрудников»; права', async (t) => {
  const { director, teacher, app } = await bootstrap(t);
  const guest = app.client();
  assert.equal((await teacher('POST', '/api/events', { title: 'X', date: '2026-12-01' })).status, 403);
  assert.equal((await director('POST', '/api/events', { title: 'Открытое', date: '2026-12-01', audience: 'public', kind: 'competition' })).status, 200);
  assert.equal((await director('POST', '/api/events', { title: 'Закрытое', date: '2026-12-02', audience: 'staff' })).status, 200);
  assert.equal((await director('POST', '/api/events', { title: 'Плохая дата', date: '12-2026' })).status, 400);
  assert.deepEqual((await guest('GET', '/api/public/events')).data.map((e) => e.title), ['Открытое']);
  assert.equal((await teacher('GET', '/api/events')).data.events.length, 2);
  assert.equal((await guest('GET', '/api/events')).status, 401);
});

test('заявки с сайта: валидация, ловушка для роботов, лимит; видит только руководство', async (t) => {
  const { director, teacher, app } = await bootstrap(t);
  const guest = app.client();
  assert.equal((await guest('POST', '/api/public/apply', { kind: 'admission', name: 'Мама' })).status, 400); // нет контактов
  assert.equal((await guest('POST', '/api/public/apply', { kind: 'contact', name: 'Мама', phone: '1' })).status, 400); // нет сообщения
  assert.equal((await guest('POST', '/api/public/apply', { kind: 'admission', name: 'Робот', phone: '1', website: 'spam.example' })).status, 200);
  assert.equal((await guest('POST', '/api/public/apply', { kind: 'admission', name: 'Мама', phone: '+998 90 000-00-00', child_name: 'Али', grade: '1' })).status, 200);
  const list = (await director('GET', '/api/applications')).data;
  assert.equal(list.length, 1); assert.equal(list[0].name, 'Мама'); // робот не сохранён
  assert.equal((await teacher('GET', '/api/applications')).status, 403);
  assert.equal((await director('GET', '/api/panel/dashboard')).data.new_applications, 1);
  await director('POST', `/api/applications/${list[0].id}/done`, {});
  assert.equal((await director('GET', '/api/applications')).data[0].status, 'done');
  for (let i = 0; i < 4; i++) await guest('POST', '/api/public/apply', { kind: 'admission', name: `N${i}`, phone: '1' });
  assert.equal((await guest('POST', '/api/public/apply', { kind: 'admission', name: 'ещё', phone: '1' })).status, 429);
});

test('журнал действий, рейтинг, «прочитано», резервная копия', async (t) => {
  const { director, teacher, app } = await bootstrap(t);
  await director('POST', '/api/faq', { question: 'Q?', answer: 'A' });
  const log = (await director('GET', '/api/audit')).data;
  assert.ok(log.some((r) => r.target === 'Вопросы и ответы'));
  assert.equal((await teacher('GET', '/api/audit')).status, 403);
  assert.equal((await director('GET', '/api/rating')).data.length >= 2, true);
  assert.equal((await teacher('GET', '/api/rating')).status, 403);
  const ann = (await director('POST', '/api/announcements', { title: 'Привет', to_all: true })).data;
  assert.equal((await teacher('POST', `/api/announcements/${ann.id}/read`)).status, 200);
  assert.deepEqual((await teacher('GET', '/api/announcements/reads')).data.mine, [ann.id]);
  assert.equal(Object.values((await director('GET', '/api/announcements/reads')).data.readers)[0].length, 1);
  assert.equal((await app.client()('GET', '/lite')).status, 200);
});
