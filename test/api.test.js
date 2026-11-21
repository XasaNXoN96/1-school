'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp } = require('./helpers');

// 1×1 PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test('полный сценарий: установка, роли, контент, гость', async (t) => {
  const app = await startTestApp();
  t.after(app.close);
  const director = app.client(), guest = app.client(), teacher = app.client(), assistant = app.client();

  assert.equal((await guest('GET', '/api/setup/status')).data.needsSetup, true);
  assert.equal((await guest('GET', '/api/panel/dashboard')).status, 401);
  assert.equal((await director('POST', '/api/setup', { username: 'dir', password: 'short', full_name: 'Директор' })).status, 400);
  assert.equal((await director('POST', '/api/setup', { username: 'dir', password: 'password123', full_name: 'Директор' })).status, 200);
  assert.equal((await guest('POST', '/api/setup', { username: 'x', password: 'password123', full_name: 'X' })).status, 403);
  const me = (await director('GET', '/api/auth/me')).data;
  assert.equal(me.role, 'director'); assert.equal(me.password_hash, undefined);

  // директор создаёт ассистента и учителя
  const a = (await director('POST', '/api/users', { username: 'asst', password: 'password123', full_name: 'Ассистент', role: 'assistant' })).data;
  const tch = (await director('POST', '/api/users', { username: 'teach', password: 'password123', full_name: 'Учитель Иванов', role: 'teacher', subject: 'Математика', monthly_salary: 3000000 })).data;
  assert.ok(a.id && tch.id);
  assert.equal((await director('POST', '/api/users', { username: 'dir2', password: 'password123', full_name: 'Ещё', role: 'director' })).status, 400);

  assert.equal((await assistant('POST', '/api/auth/login', { username: 'asst', password: 'password123' })).status, 200);
  assert.equal((await teacher('POST', '/api/auth/login', { username: 'teach', password: 'wrong' })).status, 401);
  assert.equal((await teacher('POST', '/api/auth/login', { username: 'teach', password: 'password123' })).status, 200);

  // ассистент не может создавать ассистентов и менять директора; учитель — ничего управленческого
  assert.equal((await assistant('POST', '/api/users', { username: 'a2', password: 'password123', full_name: 'A2', role: 'assistant' })).status, 403);
  assert.equal((await assistant('PUT', `/api/users/${me.id}`, { full_name: 'Взлом' })).status, 403);
  assert.equal((await teacher('GET', '/api/users')).status, 403);
  assert.equal((await teacher('POST', '/api/news', { title: 'x' })).status, 403);
  // но ассистент работает с учителями и новостями
  assert.equal((await assistant('POST', '/api/news', { title: 'Первое сентября', summary: 'Линейка', body: 'Текст' })).status, 200);

  // загрузка фото: только настоящие картинки
  assert.equal((await director('POST', '/api/upload', { data: 'data:text/html;base64,' + Buffer.from('<script>1</script>').toString('base64') })).status, 400);
  const up = (await director('POST', '/api/upload', { data: PNG })).data;
  assert.match(up.file, /^[a-f0-9]{32}\.png$/);
  const img = await fetch(app.base + '/uploads/' + up.file);
  assert.equal(img.status, 200); assert.equal(img.headers.get('content-type'), 'image/png');
  assert.equal((await fetch(app.base + '/uploads/..%2f..%2fetc%2fpasswd')).status, 404);
  assert.equal((await director('POST', '/api/media', { title: 'Линейка', file: up.file })).status, 200);

  // достижения: учитель → на модерации, гость не видит, после одобрения видит
  const st = (await director('POST', '/api/students', { full_name: 'Алиев Али', class_name: '9-А' })).data;
  const ach = (await teacher('POST', '/api/achievements', { kind: 'student', student_id: st.id, title: 'Победа на олимпиаде', date: '2026-11-10' })).data;
  assert.equal(ach.status, 'pending');
  assert.equal((await guest('GET', '/api/public/achievements')).data.length, 0);
  assert.equal((await teacher('PUT', `/api/achievements/${ach.id}`, { status: 'published' })).status, 403);
  assert.equal((await assistant('PUT', `/api/achievements/${ach.id}`, { status: 'published' })).status, 200);
  const pub = (await guest('GET', '/api/public/achievements?kind=student')).data;
  assert.equal(pub.length, 1); assert.equal(pub[0].student_name, 'Алиев Али');

  // лучший учитель / ученик
  await director('PUT', `/api/users/${tch.id}`, { ...tch, is_best: true, best_note: 'Лучший в 2026' });
  await director('PUT', `/api/students/${st.id}`, { ...st, is_best: true, best_note: 'Отличник' });
  const spot = (await guest('GET', '/api/public/spotlight')).data;
  assert.equal(spot.teacher.full_name, 'Учитель Иванов'); assert.equal(spot.student.full_name, 'Алиев Али');
  assert.equal(JSON.stringify(spot).includes('salary'), false);

  // гостевые данные не раскрывают приватное
  const teachers = (await guest('GET', '/api/public/teachers')).data;
  assert.equal(teachers.length, 1); assert.equal(teachers[0].monthly_salary, undefined); assert.equal(teachers[0].username, undefined);
  assert.equal((await guest('GET', '/api/public/news')).data.length, 1);
  assert.equal((await guest('GET', '/api/settings')).status, 401);

  // поручение + уведомление
  const task = (await director('POST', '/api/tasks', { title: 'Подготовить отчёт', assignee_id: tch.id, due_date: '2026-12-01' })).data;
  assert.equal((await teacher('GET', '/api/tasks')).data.length, 1);
  assert.equal((await teacher('POST', `/api/tasks/${task.id}/done`)).status, 200);
  const dash = (await teacher('GET', '/api/panel/dashboard')).data;
  assert.ok(dash.notices.some((n) => n.text.includes('Новое поручение')));

  // зарплата: учитель видит только свою, директор — всех
  assert.equal((await teacher('GET', '/api/salary?month=2026-11')).data.length, 1);
  assert.ok((await director('GET', '/api/salary?month=2026-11')).data.length === 2);
  assert.equal((await director('GET', '/api/salary?month=bad')).status, 400);

  // настройки геозоны
  assert.equal((await director('PUT', '/api/settings', { school_lat: '999' })).status, 400);
  assert.equal((await director('PUT', '/api/settings', { school_lat: '40.5', school_lon: '68', radius_m: '200' })).status, 200);

  // защита от CSRF
  const r = await fetch(app.base + '/api/auth/logout', { method: 'POST', headers: { Origin: 'http://evil.example', 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(r.status, 403);

  // выход
  await teacher('POST', '/api/auth/logout');
  assert.equal((await teacher('GET', '/api/auth/me')).status, 401);
});

test('ограничение попыток входа', async (t) => {
  const app = await startTestApp();
  t.after(app.close);
  const c = app.client();
  await c('POST', '/api/setup', { username: 'dir', password: 'password123', full_name: 'Д' });
  const g = app.client();
  let last;
  for (let i = 0; i < 11; i++) last = await g('POST', '/api/auth/login', { username: 'dir', password: 'nope' });
  assert.equal(last.status, 429);
});
