'use strict';
// Расписание: учитель собирает свою сетку (черновик) → отправляет на проверку → администрация одобряет → видят ученики и родители.
const { HttpError } = require('./http');
const V = require('./validate');

const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const STATUS_LABEL = { draft: 'черновик', pending: 'на проверке', published: 'опубликовано' };

function timetableRoutes({ db, notifier }) {
  const { routes, get, post, put, del } = V.makeRouter();
  const one = (sql, ...p) => db.prepare(sql).get(...p);
  const all = (sql, ...p) => db.prepare(sql).all(...p);
  const run = (sql, ...p) => db.prepare(sql).run(...p);
  const mine = (user) => { if (!['teacher', 'staff', 'assistant'].includes(user.role)) throw new HttpError(403, 'Доступно сотрудникам, ведущим уроки'); };

  // Время урока по его номеру берём из расписания звонков (1-я смена, затем 2-я), иначе — типовое.
  function slotTimes(n) {
    const b1 = all('SELECT * FROM bells WHERE shift=1 ORDER BY number'), b2 = all('SELECT * FROM bells WHERE shift=2 ORDER BY number');
    const x = b1.find((b) => b.number === n) || (b2.length ? b2.find((b) => b.number === n - b1.length) : null);
    if (x) return { start_time: x.start_time, end_time: x.end_time };
    const s = 8 * 60 + (n - 1) * 55; return { start_time: fmt(s), end_time: fmt(s + 45) };
  }
  const read = (src) => {
    const wd = V.int(src.weekday, 1, 1, 7), number = V.int(src.number, 1, 1, 12);
    const subject = V.str(src.subject, 100), class_name = V.str(src.class_name, 20), room = V.str(src.room, 20);
    if (!subject) throw new HttpError(400, 'Укажите предмет'); if (!class_name) throw new HttpError(400, 'Укажите класс'); if (!room) throw new HttpError(400, 'Укажите кабинет');
    return { weekday: wd, number, subject, class_name, room, ...slotTimes(number) };
  };
  const SQL = 'SELECT l.*, u.full_name AS teacher_name FROM lessons l JOIN users u ON u.id=l.teacher_id';
  const norm = (s) => String(s || '').trim().toLowerCase();

  // Что уже стоит в это время: свои уроки (ошибка), занятый кабинет (ошибка), тот же класс (предупреждение)
  function analyse(uid, f, excludeId = 0) {
    const same = all(`${SQL} WHERE l.weekday=? AND l.id!=? AND (l.status!='draft' OR l.teacher_id=?) ORDER BY l.start_time`, f.weekday, excludeId, uid)
      .filter((l) => toMin(l.start_time) < toMin(f.end_time) && toMin(f.start_time) < toMin(l.end_time));
    const errors = [], warnings = [];
    for (const l of same) {
      const where = `${l.start_time}–${l.end_time}, ${l.class_name} — ${l.subject}, каб. ${l.room}, ${l.teacher_name}`;
      if (l.teacher_id === uid) errors.push(`У вас уже есть урок в это время: ${where}`);
      else if (f.room && norm(l.room) === norm(f.room)) errors.push(`Кабинет ${l.room} занят: ${where}`);
      else if (f.class_name && norm(l.class_name) === norm(f.class_name)) warnings.push(`У класса ${l.class_name} в это время уже идёт урок: ${where}`);
    }
    return { same_slot: same.map((l) => ({ id: l.id, class_name: l.class_name, subject: l.subject, room: l.room, teacher_name: l.teacher_name, start_time: l.start_time, end_time: l.end_time, status: l.status, mine: l.teacher_id === uid })), errors, warnings };
  }

  get('/api/timetable', 'auth', ({ user }) => {
    mine(user);
    return { lessons: all(`${SQL} WHERE l.teacher_id=? ORDER BY l.weekday, l.number`, user.id), bells: all('SELECT * FROM bells ORDER BY shift, number') };
  });
  get('/api/timetable/check', 'auth', ({ user, query }) => {
    mine(user);
    const f = { weekday: V.int(query.weekday, 1, 1, 7), number: V.int(query.number, 1, 1, 12), class_name: V.str(query.class_name, 20), room: V.str(query.room, 20), ...slotTimes(V.int(query.number, 1, 1, 12)) };
    return { ...analyse(user.id, f, Number(query.exclude_id) || 0), start_time: f.start_time, end_time: f.end_time };
  });
  post('/api/timetable', 'auth', ({ user, body }) => {
    mine(user); const f = read(body), a = analyse(user.id, f);
    if (a.errors.length) throw new HttpError(409, a.errors[0]);
    const r = run("INSERT INTO lessons (teacher_id, weekday, number, class_name, subject, room, start_time, end_time, status) VALUES (?,?,?,?,?,?,?,?, 'draft')", user.id, f.weekday, f.number, f.class_name, f.subject, f.room, f.start_time, f.end_time);
    return { lesson: one(`${SQL} WHERE l.id=?`, r.lastInsertRowid), warnings: a.warnings };
  });
  put('/api/timetable/:id', 'auth', ({ user, params, body }) => {
    mine(user); const l = V.must(one('SELECT * FROM lessons WHERE id=? AND teacher_id=?', params.id, user.id), 'Урок не найден');
    if (l.status === 'published') throw new HttpError(400, 'Опубликованный урок нельзя изменить: удалите его (запрос на удаление) и добавьте новый');
    const f = read(body), a = analyse(user.id, f, l.id);
    if (a.errors.length) throw new HttpError(409, a.errors[0]);
    run("UPDATE lessons SET weekday=?, number=?, class_name=?, subject=?, room=?, start_time=?, end_time=?, status='draft', note='' WHERE id=?", f.weekday, f.number, f.class_name, f.subject, f.room, f.start_time, f.end_time, l.id);
    return { lesson: one(`${SQL} WHERE l.id=?`, l.id), warnings: a.warnings };
  });
  del('/api/timetable/:id', 'auth', ({ user, params }) => {
    mine(user); const l = V.must(one('SELECT * FROM lessons WHERE id=? AND teacher_id=?', params.id, user.id), 'Урок не найден');
    if (l.status === 'published') { run('UPDATE lessons SET del_req=? WHERE id=?', l.del_req ? 0 : 1, l.id); return { ok: true, del_req: l.del_req ? 0 : 1 }; }
    run('DELETE FROM lessons WHERE id=?', l.id); return { ok: true, removed: true };
  });
  post('/api/timetable/submit', 'auth', ({ user }) => {
    mine(user);
    const drafts = one("SELECT COUNT(*) c FROM lessons WHERE teacher_id=? AND status='draft'", user.id).c, dels = one('SELECT COUNT(*) c FROM lessons WHERE teacher_id=? AND del_req=1', user.id).c;
    if (!drafts && !dels) throw new HttpError(400, 'Нет изменений для отправки');
    run("UPDATE lessons SET status='pending', note='' WHERE teacher_id=? AND status='draft'", user.id);
    notifier.notify(notifier.managerIds().filter((id) => id !== user.id), `🗓 ${user.full_name} отправил(а) расписание на проверку (новых уроков: ${drafts}${dels ? `, на удаление: ${dels}` : ''})`);
    return { ok: true, submitted: drafts, deletions: dels };
  });

  // ---- проверка администрацией ----
  get('/api/timetable/review', 'manager', () => {
    const rows = all(`${SQL} WHERE l.status='pending' OR l.del_req=1 ORDER BY u.full_name, l.weekday, l.number`), by = new Map();
    for (const l of rows) { if (!by.has(l.teacher_id)) by.set(l.teacher_id, { teacher_id: l.teacher_id, teacher_name: l.teacher_name, add: [], remove: [] }); (l.del_req ? by.get(l.teacher_id).remove : by.get(l.teacher_id).add).push(l); }
    return [...by.values()].map((g) => ({ ...g, conflicts: g.add.map((l) => ({ id: l.id, ...analyse(l.teacher_id, l, l.id) })).filter((c) => c.errors.length || c.warnings.length).map((c) => ({ id: c.id, errors: c.errors, warnings: c.warnings })) }));
  });
  post('/api/timetable/decision', 'manager', ({ user, body }) => {
    const tid = V.int(body.teacher_id, 0, 1), approve = body.approve === true || body.approve === 1, note = V.str(body.note, 300);
    const t = V.must(one('SELECT id, full_name FROM users WHERE id=?', tid), 'Сотрудник не найден');
    if (!one("SELECT 1 x FROM lessons WHERE teacher_id=? AND (status='pending' OR del_req=1)", tid)) throw new HttpError(400, 'Нечего проверять');
    if (approve) {
      const bad = all("SELECT * FROM lessons WHERE teacher_id=? AND status='pending'", tid).map((l) => analyse(tid, l, l.id)).find((a) => a.errors.length);
      if (bad) throw new HttpError(409, `Нельзя одобрить: ${bad.errors[0]}`);
      run("UPDATE lessons SET status='published', note='' WHERE teacher_id=? AND status='pending'", tid);
      const removed = run('DELETE FROM lessons WHERE teacher_id=? AND del_req=1', tid).changes;
      notifier.notify([tid], `✅ Ваше расписание одобрено и опубликовано${removed ? ` (удалено уроков: ${removed})` : ''}. Теперь его видят ученики и родители.`);
    } else {
      run("UPDATE lessons SET status='draft', note=? WHERE teacher_id=? AND status='pending'", note, tid);
      run('UPDATE lessons SET del_req=0 WHERE teacher_id=?', tid);
      notifier.notify([tid], `❌ Расписание возвращено на доработку${note ? `: ${note}` : ''}`);
    }
    return { ok: true };
  });
  return { routes };
}
module.exports = { timetableRoutes, STATUS_LABEL };
