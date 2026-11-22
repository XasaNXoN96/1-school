'use strict';
// Кадры: заявки на отпуск/больничный, замены уроков, премии/удержания и расчётный листок.
const { HttpError } = require('./http');
const { getSettings } = require('./db');
const { localNow } = require('./attendance');
const { monthReport, currentMonth } = require('./salary');
const A = require('./auth');
const V = require('./validate');

const LEAVE_KINDS = ['vacation', 'sick', 'unpaid'];
const PAID = new Set(['vacation', 'sick']);
const SALARY_ROLES = "('teacher','staff','assistant','director')";

function hrRoutes({ db, notifier, parentHelpers }) {
  const { routes, get, post, del } = V.makeRouter();
  const one = (sql, ...p) => db.prepare(sql).get(...p);
  const all = (sql, ...p) => db.prepare(sql).all(...p);
  const run = (sql, ...p) => db.prepare(sql).run(...p);
  const today = () => localNow(new Date(), getSettings(db).timezone).date;
  const person = (id) => V.must(one('SELECT * FROM users WHERE id=? AND active=1', id), 'Сотрудник не найден');
  const overlap = (a1, a2, b1, b2) => a1 < b2 && b1 < a2;

  // ================= ОТПУСК И БОЛЬНИЧНЫЙ =================
  const LEAVE_SQL = 'SELECT l.*, u.full_name, u.role AS user_role FROM leave_requests l JOIN users u ON u.id=l.user_id';

  post('/api/leaves', 'auth', ({ user, body }) => {
    const kind = V.oneOf(body.kind, LEAVE_KINDS, 'вид'), from = V.date(body.date_from), to = V.date(body.date_to);
    if (to < from) throw new HttpError(400, 'Дата окончания раньше даты начала');
    if (V.addDays(from, 90) < to) throw new HttpError(400, 'Заявка не может быть длиннее 90 дней');
    if (from < V.addDays(today(), -30)) throw new HttpError(400, 'Нельзя подать заявку на период старше 30 дней');
    if (kind === 'vacation' && from < today()) throw new HttpError(400, 'Отпуск нужно оформлять заранее (дата начала не в прошлом)');
    const clash = one("SELECT 1 x FROM leave_requests WHERE user_id=? AND status IN ('pending','approved') AND date_from<=? AND date_to>=?", user.id, to, from);
    if (clash) throw new HttpError(409, 'На эти даты уже есть заявка');
    const reason = V.str(body.reason, 500);
    const r = run('INSERT INTO leave_requests (user_id, kind, date_from, date_to, reason) VALUES (?,?,?,?,?)', user.id, kind, from, to, reason);
    const who = notifier.managerIds().filter((id) => id !== user.id);
    notifier.notify(who, `🏖 Заявка: ${user.full_name} — ${{ vacation: 'отпуск', sick: 'больничный', unpaid: 'без содержания' }[kind]} ${from} — ${to}${reason ? '. ' + reason : ''}`);
    return { ok: true, id: Number(r.lastInsertRowid) };
  });

  get('/api/leaves', 'auth', ({ user, query }) => {
    const status = query.status ? V.oneOf(query.status, ['pending', 'approved', 'rejected', 'cancelled'], 'статус') : '';
    const where = [A.isManager(user) ? '' : 'l.user_id=?', status && 'l.status=?'].filter(Boolean).join(' AND ');
    const params = [A.isManager(user) ? null : user.id, status || null].filter((x) => x !== null);
    return all(`${LEAVE_SQL} ${where ? 'WHERE ' + where : ''} ORDER BY (l.status='pending') DESC, l.date_from DESC, l.id DESC LIMIT 300`, ...params);
  });

  function applyLeave(l) {
    if (!PAID.has(l.kind)) return 0; // без содержания: дни остаются «не пришёл», зарплата за них не начисляется
    const u = one('SELECT work_days FROM users WHERE id=?', l.user_id);
    const wds = u.work_days.split(',').map(Number);
    const holidays = new Set(all('SELECT date FROM holidays WHERE date>=? AND date<=?', l.date_from, l.date_to).map((r) => r.date));
    let n = 0;
    for (let d = l.date_from; d <= l.date_to; d = V.addDays(d, 1)) {
      if (!wds.includes(V.weekdayOf(d)) || holidays.has(d)) continue;
      // отпуск не затирает фактический приход; помечаем строки, чтобы при отмене убрать только их
      run("INSERT INTO attendance (user_id, date, status, note) VALUES (?,?, 'excused', ?) ON CONFLICT(user_id, date) DO UPDATE SET status='excused', note=excluded.note WHERE attendance.status != 'present'", l.user_id, d, `leave:${l.id}`);
      n++;
    }
    return n;
  }
  const unapplyLeave = (l) => run("DELETE FROM attendance WHERE user_id=? AND note=? AND status='excused'", l.user_id, `leave:${l.id}`);

  post('/api/leaves/:id/decision', 'manager', ({ user, params, body }) => {
    const l = V.must(one('SELECT * FROM leave_requests WHERE id=?', params.id));
    const target = person(l.user_id);
    if (target.id === user.id) throw new HttpError(403, 'Свою заявку решает другой руководитель');
    if (!A.canManageUser(user, target)) throw new HttpError(403, 'Эту заявку может решить только директор');
    if (l.status !== 'pending') throw new HttpError(409, 'Заявка уже обработана');
    const approve = V.oneOf(body.status, ['approved', 'rejected'], 'решение') === 'approved';
    const note = V.str(body.note, 300);
    run("UPDATE leave_requests SET status=?, note=?, decided_by=?, decided_at=datetime('now') WHERE id=?", approve ? 'approved' : 'rejected', note, user.id, l.id);
    const days = approve ? applyLeave(l) : 0;
    notifier.notify([l.user_id], approve ? `✅ Заявка одобрена: ${l.date_from} — ${l.date_to}${PAID.has(l.kind) ? ` (оплачиваемых дней: ${days})` : ' (без содержания)'}${note ? '. ' + note : ''}` : `❌ Заявка отклонена: ${l.date_from} — ${l.date_to}${note ? '. ' + note : ''}`);
    return { ok: true, days };
  });

  post('/api/leaves/:id/cancel', 'auth', ({ user, params }) => {
    const l = V.must(one('SELECT * FROM leave_requests WHERE id=?', params.id));
    const own = l.user_id === user.id;
    if (!own && !(A.isManager(user) && A.canManageUser(user, person(l.user_id)))) throw new HttpError(403, 'Недостаточно прав');
    if (l.status === 'cancelled' || l.status === 'rejected') throw new HttpError(409, 'Заявка уже закрыта');
    if (own && l.status !== 'pending' && !A.isManager(user)) throw new HttpError(403, 'Одобренную заявку отменяет руководитель');
    if (l.status === 'approved') unapplyLeave(l);
    run("UPDATE leave_requests SET status='cancelled' WHERE id=?", l.id);
    if (!own) notifier.notify([l.user_id], `Заявка на ${l.date_from} — ${l.date_to} отменена руководителем`);
    return { ok: true };
  });

  // ================= ЗАМЕНЫ УРОКОВ =================
  const LESSON_SQL = 'SELECT l.*, u.full_name AS teacher_name FROM lessons l JOIN users u ON u.id=l.teacher_id';
  const SUB_SQL = `SELECT s.id, s.date, s.note, s.lesson_id, l.number, l.class_name, l.subject, l.room, l.start_time, l.end_time, l.teacher_id AS absent_id,
    a.full_name AS absent_name, s.sub_user_id, u.full_name AS sub_name FROM substitutions s JOIN lessons l ON l.id=s.lesson_id
    JOIN users a ON a.id=l.teacher_id JOIN users u ON u.id=s.sub_user_id`;

  function candidates(lesson, d) {
    const wd = V.weekdayOf(d);
    const teachers = all("SELECT id, full_name, subject, work_days FROM users WHERE active=1 AND frozen=0 AND role='teacher' AND id != ? ORDER BY full_name", lesson.teacher_id);
    const out = [];
    for (const t of teachers) {
      if (!t.work_days.split(',').map(Number).includes(wd)) continue;
      if (one("SELECT 1 x FROM leave_requests WHERE user_id=? AND status='approved' AND date_from<=? AND date_to>=?", t.id, d, d)) continue;
      const own = all('SELECT start_time, end_time FROM lessons WHERE teacher_id=? AND weekday=?', t.id, wd);
      if (own.some((o) => overlap(o.start_time, o.end_time, lesson.start_time, lesson.end_time))) continue;
      const subs = all('SELECT l.start_time, l.end_time FROM substitutions s JOIN lessons l ON l.id=s.lesson_id WHERE s.sub_user_id=? AND s.date=? AND s.lesson_id != ?', t.id, d, lesson.id);
      if (subs.some((o) => overlap(o.start_time, o.end_time, lesson.start_time, lesson.end_time))) continue;
      out.push({ id: t.id, full_name: t.full_name, subject: t.subject, same_subject: !!lesson.subject && t.subject.trim().toLowerCase() === lesson.subject.trim().toLowerCase(), load: own.length + subs.length });
    }
    return out.sort((a, b) => Number(b.same_subject) - Number(a.same_subject) || a.load - b.load || a.full_name.localeCompare(b.full_name, 'ru'));
  }

  get('/api/substitutions/suggest', 'manager', ({ query }) => {
    const t = person(V.int(query.teacher_id, 0, 1)), d = V.date(query.date);
    const lessons = all(`${LESSON_SQL} WHERE l.teacher_id=? AND l.weekday=? ORDER BY l.start_time`, t.id, V.weekdayOf(d));
    const onLeave = !!one("SELECT 1 x FROM leave_requests WHERE user_id=? AND status='approved' AND date_from<=? AND date_to>=?", t.id, d, d);
    return { teacher: t.full_name, date: d, on_leave: onLeave, lessons: lessons.map((l) => ({ ...l, substitution: one(`${SUB_SQL} WHERE s.date=? AND s.lesson_id=?`, d, l.id) || null, candidates: candidates(l, d) })) };
  });

  post('/api/substitutions', 'manager', ({ user, body }) => {
    const d = V.date(body.date), lesson = V.must(one(`${LESSON_SQL} WHERE l.id=?`, V.int(body.lesson_id, 0, 1)), 'Урок не найден');
    if (d < today()) throw new HttpError(400, 'Замену нельзя назначить на прошедшую дату');
    if (V.weekdayOf(d) !== lesson.weekday) throw new HttpError(400, 'Дата не совпадает с днём недели урока');
    const sub = person(V.int(body.sub_user_id, 0, 1));
    if (!candidates(lesson, d).some((c) => c.id === sub.id)) throw new HttpError(409, 'Этот учитель не может заменить: у него урок в это время, он в отпуске или не работает в этот день');
    const note = V.str(body.note, 200);
    run('INSERT INTO substitutions (date, lesson_id, sub_user_id, note, created_by) VALUES (?,?,?,?,?) ON CONFLICT(date, lesson_id) DO UPDATE SET sub_user_id=excluded.sub_user_id, note=excluded.note, created_by=excluded.created_by', d, lesson.id, sub.id, note, user.id);
    const text = `${d}, урок ${lesson.number} (${lesson.start_time}–${lesson.end_time}), ${lesson.class_name || 'класс не указан'}, ${lesson.subject}${lesson.room ? ', каб. ' + lesson.room : ''}`;
    notifier.notify([sub.id], `🔁 Вам назначена замена: ${text}${note ? '. ' + note : ''}`);
    if (lesson.class_name) parentHelpers.notifyClass(lesson.class_name, `🔁 Замена урока: ${text}. Урок проведёт ${sub.full_name}.`, 'info');
    return { ok: true };
  });
  del('/api/substitutions/:id', 'manager', ({ params }) => { run('DELETE FROM substitutions WHERE id=?', params.id); return { ok: true }; });
  get('/api/substitutions', 'auth', ({ user, query }) => {
    if (!(user.role === 'teacher' || A.isManager(user))) throw new HttpError(403, 'Недостаточно прав');
    const d = V.date(query.date || today());
    return all(`${SUB_SQL} WHERE s.date=? ORDER BY l.start_time`, d);
  });
  // Публично: только кто заменяет (без указания, почему учитель отсутствует)
  get('/api/public/substitutions', 'public', () => {
    const t = today(), tm = V.addDays(t, 1);
    return all(`${SUB_SQL} WHERE s.date IN (?,?) ORDER BY s.date, l.start_time`, t, tm)
      .map((s) => ({ date: s.date, number: s.number, class_name: s.class_name, subject: s.subject, room: s.room, start_time: s.start_time, end_time: s.end_time, sub_name: s.sub_name }));
  });

  // ================= ПРЕМИИ, УДЕРЖАНИЯ, РАСЧЁТНЫЙ ЛИСТОК =================
  get('/api/payroll/items', 'manager', ({ query }) => {
    const m = V.month(query.month || currentMonth(db));
    return all('SELECT p.*, u.full_name FROM payroll_items p JOIN users u ON u.id=p.user_id WHERE p.month=? ORDER BY u.full_name, p.id', m);
  });
  post('/api/payroll/items', 'manager', ({ user, body }) => {
    const target = person(V.int(body.user_id, 0, 1));
    if (!A.canManageUser(user, target) && target.id !== user.id) throw new HttpError(403, 'Недостаточно прав');
    if (target.id === user.id) throw new HttpError(403, 'Свои начисления вносит другой руководитель');
    const kind = V.oneOf(body.kind, ['bonus', 'deduction'], 'вид');
    const r = run('INSERT INTO payroll_items (user_id, month, kind, title, amount, created_by) VALUES (?,?,?,?,?,?)', target.id, V.month(body.month), kind, V.str(body.title, 120, true, 'основание'), V.int(body.amount, 0, 1, 1e9), user.id);
    return { ok: true, id: Number(r.lastInsertRowid) };
  });
  del('/api/payroll/items/:id', 'manager', ({ user, params }) => {
    const it = V.must(one('SELECT * FROM payroll_items WHERE id=?', params.id));
    if (it.user_id === user.id) throw new HttpError(403, 'Свои начисления меняет другой руководитель');
    if (!A.canManageUser(user, person(it.user_id))) throw new HttpError(403, 'Недостаточно прав');
    run('DELETE FROM payroll_items WHERE id=?', it.id);
    return { ok: true };
  });

  function payslip(u, m) {
    const rep = monthReport(db, u, m);
    const items = all('SELECT id, kind, title, amount FROM payroll_items WHERE user_id=? AND month=? ORDER BY id', u.id, m);
    const bonus = items.filter((i) => i.kind === 'bonus').reduce((s, i) => s + i.amount, 0);
    const deduction = items.filter((i) => i.kind === 'deduction').reduce((s, i) => s + i.amount, 0);
    const leaves = all("SELECT kind, date_from, date_to FROM leave_requests WHERE user_id=? AND status='approved' AND date_from<=? AND date_to>=?", u.id, `${m}-31`, `${m}-01`);
    const s = getSettings(db);
    return { month: m, employee: { id: u.id, full_name: u.full_name, role: u.role, subject: u.subject }, school: s.school_name, city: s.city,
      report: rep, items, bonus, deduction, earned: rep.earned, net: Math.max(0, rep.earned + bonus - deduction), leaves, generated: today() };
  }

  get('/api/payslip', 'auth', ({ user, query }) => {
    const m = V.month(query.month || currentMonth(db));
    let target = user;
    if (query.user_id && Number(query.user_id) !== user.id) {
      if (!A.isManager(user)) throw new HttpError(403, 'Можно смотреть только свой листок');
      target = person(V.int(query.user_id, 0, 1));
      if (target.role === 'director' && user.role !== 'director') throw new HttpError(403, 'Недостаточно прав');
    }
    return payslip(target, m);
  });

  get('/api/payslips', 'manager', ({ user, query }) => {
    const m = V.month(query.month || currentMonth(db));
    const list = all(`SELECT * FROM users WHERE active=1 AND role IN ${SALARY_ROLES} ORDER BY full_name`)
      .filter((u) => u.role !== 'director' || user.role === 'director')
      .map((u) => { const p = payslip(u, m); return { id: u.id, full_name: u.full_name, role: u.role, base: p.report.base, present: p.report.present, excused: p.report.excused, scheduled: p.report.scheduled, earned: p.earned, bonus: p.bonus, deduction: p.deduction, net: p.net }; });
    return { month: m, rows: list, total: list.reduce((s, r) => s + r.net, 0) };
  });

  return { routes };
}

module.exports = { hrRoutes };
