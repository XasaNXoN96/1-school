'use strict';
// Журнал (оценки, посещаемость учеников, домашние задания), кабинет родителя, коды родителей, рассылки.
const { HttpError } = require('./http');
const { getSettings } = require('./db');
const { localNow } = require('./attendance');
const A = require('./auth');
const V = require('./validate');
const P = require('./parent-auth');

const KINDS = ['lesson', 'quiz', 'exam', 'quarter', 'homework'];
const STATUSES = ['present', 'absent', 'late', 'excused'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const natural = (a, b) => String(a).localeCompare(String(b), 'ru', { numeric: true });
const sameClass = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

function journalRoutes({ db, notifier }) {
  const { routes, get, post, put, del } = V.makeRouter();
  const one = (sql, ...p) => db.prepare(sql).get(...p);
  const all = (sql, ...p) => db.prepare(sql).all(...p);
  const run = (sql, ...p) => db.prepare(sql).run(...p);
  const today = () => localNow(new Date(), getSettings(db).timezone).date;
  const teaching = (u) => { if (!(u.role === 'teacher' || A.isManager(u))) throw new HttpError(403, 'Журнал доступен учителям и администрации'); };
  const studentRow = (id) => V.must(one('SELECT * FROM students WHERE id=? AND active=1', V.int(id, 0, 1)), 'Ученик не найден');

  // ---- уведомление родителей: в кабинет (всегда) и в Telegram (если привязан) ----
  function notifyParents(studentId, text, kind = 'info') {
    const st = one('SELECT id, parent_telegram_id FROM students WHERE id=?', studentId);
    if (!st) return;
    run('INSERT INTO parent_messages (student_id, kind, text) VALUES (?,?,?)', st.id, kind, text);
    if (st.parent_telegram_id && notifier.hasTransport()) {
      notifier.sendTelegram(st.parent_telegram_id, text).catch((e) => console.error('[telegram] родителю:', e.message));
    }
  }
  function notifyClass(className, text, kind) {
    const kids = all("SELECT id, parent_telegram_id FROM students WHERE active=1 AND lower(trim(class_name))=lower(trim(?))", className);
    const sent = new Set();
    for (const k of kids) {
      run('INSERT INTO parent_messages (student_id, kind, text) VALUES (?,?,?)', k.id, kind, text);
      if (k.parent_telegram_id && !sent.has(k.parent_telegram_id) && notifier.hasTransport()) {
        sent.add(k.parent_telegram_id);
        notifier.sendTelegram(k.parent_telegram_id, text).catch((e) => console.error('[telegram] родителю:', e.message));
      }
    }
    return kids.length;
  }

  // ---- сводка по ребёнку (кабинет родителя и просмотр учителем) ----
  function overview(st) {
    const t = today();
    const since = V.addDays(t, -120);
    const grades = all('SELECT g.id, g.subject, g.date, g.score, g.kind, g.comment, u.full_name AS teacher FROM grades g LEFT JOIN users u ON u.id=g.teacher_id WHERE g.student_id=? AND g.date>=? ORDER BY g.date DESC, g.id DESC', st.id, since);
    const map = new Map();
    for (const g of grades) {
      if (!map.has(g.subject)) map.set(g.subject, { subject: g.subject, items: [], sum: 0 });
      const e = map.get(g.subject); e.items.push(g); e.sum += g.score;
    }
    const subjects = [...map.values()].map((e) => ({ subject: e.subject, avg: Math.round((e.sum / e.items.length) * 100) / 100, items: e.items })).sort((a, b) => natural(a.subject, b.subject));
    const all5 = grades.length ? Math.round((grades.reduce((s, g) => s + g.score, 0) / grades.length) * 100) / 100 : null;
    const att = all('SELECT date, status, note FROM student_attendance WHERE student_id=? AND date>=? ORDER BY date DESC', st.id, V.addDays(t, -30));
    const counts = { present: 0, absent: 0, late: 0, excused: 0 };
    for (const a of att) counts[a.status]++;
    const homework = all('SELECT id, subject, text, due_date FROM homework WHERE lower(trim(class_name))=lower(trim(?)) AND due_date>=? AND due_date<=? ORDER BY due_date, id', st.class_name, V.addDays(t, -1), V.addDays(t, 14));
    const schedule = all(`SELECT l.weekday, l.number, l.subject, l.room, l.start_time, l.end_time, u.full_name AS teacher FROM lessons l JOIN users u ON u.id=l.teacher_id
      WHERE lower(trim(l.class_name))=lower(trim(?)) ORDER BY l.weekday, l.start_time`, st.class_name);
    const messages = all('SELECT id, kind, text, created_at FROM parent_messages WHERE student_id=? ORDER BY id DESC LIMIT 40', st.id);
    const certs = all('SELECT id, kind, purpose, status, note, created_at FROM cert_requests WHERE student_id=? ORDER BY id DESC LIMIT 20', st.id);
    return { student: { id: st.id, full_name: st.full_name, class_name: st.class_name, photo: st.photo, telegram_linked: !!st.parent_telegram_id },
      average: all5, subjects, attendance: { counts, days: att }, homework, schedule, messages, certs, today: t };
  }

  // ================= КАБИНЕТ РОДИТЕЛЯ (вход по коду, без паролей) =================
  post('/api/parent/login', 'public', ({ body, setCookie, cookies }) => {
    const r = P.parentLogin(db, cookies, V.str(body.code, 30, true, 'код'));
    setCookie(P.COOKIE, r.token, { days: P.DAYS });
    return { ok: true, student_id: r.student.id };
  });
  post('/api/parent/logout', 'public', ({ cookies, clearCookie }) => { P.parentLogout(db, cookies); clearCookie(P.COOKIE); return { ok: true }; });
  get('/api/parent/children', 'public', ({ cookies }) => {
    const kids = P.parentChildren(db, cookies);
    if (!kids.length) throw new HttpError(401, 'Войдите по коду родителя');
    return kids.map((k) => ({ id: k.id, full_name: k.full_name, class_name: k.class_name, photo: k.photo }));
  });
  get('/api/parent/overview', 'public', ({ cookies, query }) => overview(P.requireChild(db, cookies, query.student_id)));
  post('/api/parent/certs', 'public', ({ cookies, body }) => {
    const kid = P.requireChild(db, cookies, body.student_id);
    const kind = V.oneOf(body.kind || 'study', ['study', 'grades'], 'вид справки');
    const open = one("SELECT COUNT(*) c FROM cert_requests WHERE student_id=? AND status='new'", kid.id).c;
    if (open >= 3) throw new HttpError(429, 'Уже есть 3 необработанные заявки. Дождитесь ответа школы.');
    const purpose = V.str(body.purpose, 200);
    const r = run('INSERT INTO cert_requests (student_id, kind, purpose) VALUES (?,?,?)', kid.id, kind, purpose);
    notifier.notifyManagers(`📄 Заявка на справку: ${kid.full_name} (${kid.class_name || '—'})${purpose ? ', ' + purpose : ''}`);
    return { ok: true, id: Number(r.lastInsertRowid) };
  });

  // ================= ЖУРНАЛ УЧИТЕЛЯ =================
  get('/api/journal/meta', 'auth', ({ user }) => {
    teaching(user);
    const classes = all("SELECT DISTINCT class_name FROM students WHERE active=1 AND class_name != ''").map((r) => r.class_name).sort(natural);
    const subj = new Set([...all("SELECT DISTINCT subject FROM lessons WHERE subject != ''").map((r) => r.subject),
      ...all("SELECT DISTINCT subject FROM users WHERE active=1 AND subject != ''").map((r) => r.subject)]);
    const mine = all("SELECT DISTINCT class_name, subject FROM lessons WHERE teacher_id=? AND class_name != ''", user.id);
    return { classes, subjects: [...subj].sort(natural), mine, kinds: KINDS, today: today() };
  });

  get('/api/journal', 'auth', ({ user, query }) => {
    teaching(user);
    const cls = V.str(query.class_name, 20, true, 'класс');
    const d = V.date(query.date || today());
    const students = all("SELECT id, full_name, class_name FROM students WHERE active=1 AND lower(trim(class_name))=lower(trim(?)) ORDER BY full_name", cls);
    const att = new Map(all('SELECT student_id, status FROM student_attendance WHERE date=?', d).map((r) => [r.student_id, r.status]));
    const subject = V.str(query.subject, 60);
    const grades = all(`SELECT g.id, g.student_id, g.subject, g.score, g.kind, g.comment, g.teacher_id FROM grades g JOIN students s ON s.id=g.student_id
      WHERE g.date=? AND lower(trim(s.class_name))=lower(trim(?)) ${subject ? 'AND g.subject=?' : ''} ORDER BY g.id`, ...(subject ? [d, cls, subject] : [d, cls]));
    return { date: d, class_name: cls, students: students.map((s) => ({ ...s, status: att.get(s.id) || null, grades: grades.filter((g) => g.student_id === s.id) })) };
  });

  post('/api/journal/attendance', 'auth', ({ user, body }) => {
    teaching(user);
    const st = studentRow(body.student_id), d = V.date(body.date);
    if (d > V.addDays(today(), 0)) throw new HttpError(400, 'Нельзя отмечать будущие даты');
    const status = body.status === '' || body.status == null ? '' : V.oneOf(body.status, STATUSES, 'статус');
    const prev = one('SELECT status FROM student_attendance WHERE student_id=? AND date=?', st.id, d)?.status || '';
    if (!status) run('DELETE FROM student_attendance WHERE student_id=? AND date=?', st.id, d);
    else run('INSERT INTO student_attendance (student_id, date, status, note, marked_by) VALUES (?,?,?,?,?) ON CONFLICT(student_id, date) DO UPDATE SET status=excluded.status, note=excluded.note, marked_by=excluded.marked_by', st.id, d, status, V.str(body.note, 200), user.id);
    if (status !== prev && (status === 'absent' || status === 'late')) {
      notifyParents(st.id, status === 'absent' ? `⚠️ ${st.full_name} сегодня (${d}) отсутствует на уроках.` : `⏰ ${st.full_name} сегодня (${d}) опоздал(а) на урок.`, 'absence');
    }
    return { ok: true };
  });

  post('/api/journal/attendance-all', 'auth', ({ user, body }) => {
    teaching(user);
    const cls = V.str(body.class_name, 20, true, 'класс'), d = V.date(body.date);
    if (d > today()) throw new HttpError(400, 'Нельзя отмечать будущие даты');
    let n = 0;
    for (const s of all("SELECT id FROM students WHERE active=1 AND lower(trim(class_name))=lower(trim(?))", cls)) {
      n += Number(run("INSERT OR IGNORE INTO student_attendance (student_id, date, status, marked_by) VALUES (?,?, 'present', ?)", s.id, d, user.id).changes);
    }
    return { ok: true, marked: n };
  });

  post('/api/journal/grade', 'auth', ({ user, body }) => {
    teaching(user);
    const st = studentRow(body.student_id);
    const subject = V.str(body.subject, 60, true, 'предмет'), d = V.date(body.date || today());
    if (d > V.addDays(today(), 0)) throw new HttpError(400, 'Нельзя ставить оценки на будущую дату');
    if (d < V.addDays(today(), -120)) throw new HttpError(400, 'Оценку можно поставить не старше 120 дней');
    const score = V.int(body.score, 0, 1, 5), kind = V.oneOf(body.kind || 'lesson', KINDS, 'вид оценки');
    const comment = V.str(body.comment, 200);
    const r = run('INSERT INTO grades (student_id, teacher_id, subject, date, score, kind, comment) VALUES (?,?,?,?,?,?,?)', st.id, user.id, subject, d, score, kind, comment);
    notifyParents(st.id, `📚 ${st.full_name}: ${subject} — ${score}${kind !== 'lesson' ? ` (${{ quiz: 'самостоятельная', exam: 'контрольная', quarter: 'четвертная', homework: 'домашнее задание' }[kind]})` : ''}${comment ? `. ${comment}` : ''}`, 'grade');
    return { ok: true, id: Number(r.lastInsertRowid) };
  });
  del('/api/journal/grade/:id', 'auth', ({ user, params }) => {
    teaching(user);
    const g = V.must(one('SELECT * FROM grades WHERE id=?', params.id));
    if (!A.isManager(user) && g.teacher_id !== user.id) throw new HttpError(403, 'Удалить оценку может её автор или администрация');
    run('DELETE FROM grades WHERE id=?', g.id);
    return { ok: true };
  });
  get('/api/journal/student/:id', 'auth', ({ user, params }) => { teaching(user); return overview(studentRow(params.id)); });

  // Домашние задания
  get('/api/homework', 'auth', ({ user, query }) => {
    teaching(user);
    const cls = V.str(query.class_name, 20);
    return all(`SELECT h.*, u.full_name AS teacher FROM homework h LEFT JOIN users u ON u.id=h.teacher_id ${cls ? 'WHERE lower(trim(h.class_name))=lower(trim(?))' : ''} ORDER BY h.due_date DESC, h.id DESC LIMIT 100`, ...(cls ? [cls] : []));
  });
  post('/api/homework', 'auth', ({ user, body }) => {
    teaching(user);
    const cls = V.str(body.class_name, 20, true, 'класс'), subject = V.str(body.subject, 60, true, 'предмет');
    const text = V.str(body.text, 1000, true, 'задание'), due = V.date(body.due_date);
    if (!one("SELECT 1 x FROM students WHERE active=1 AND lower(trim(class_name))=lower(trim(?))", cls)) throw new HttpError(400, 'В этом классе нет учеников');
    const r = run('INSERT INTO homework (class_name, subject, text, due_date, teacher_id) VALUES (?,?,?,?,?)', cls, subject, text, due, user.id);
    notifyClass(cls, `📝 Домашнее задание (${cls}, ${subject}) до ${due}: ${text}`, 'homework');
    return { ok: true, id: Number(r.lastInsertRowid) };
  });
  del('/api/homework/:id', 'auth', ({ user, params }) => {
    teaching(user);
    const h = V.must(one('SELECT * FROM homework WHERE id=?', params.id));
    if (!A.isManager(user) && h.teacher_id !== user.id) throw new HttpError(403, 'Удалить может автор или администрация');
    run('DELETE FROM homework WHERE id=?', h.id);
    return { ok: true };
  });

  // ================= РОДИТЕЛИ: коды и привязка (администрация) =================
  get('/api/parents', 'manager', ({ query }) => {
    const cls = V.str(query.class_name, 20);
    const rows = all(`SELECT id, full_name, class_name, parent_name, parent_phone, parent_code, parent_telegram_id FROM students WHERE active=1 ${cls ? 'AND lower(trim(class_name))=lower(trim(?))' : ''} ORDER BY class_name, full_name`, ...(cls ? [cls] : []));
    return { bot_username: getSettings(db).bot_username, students: rows.map(({ parent_telegram_id, ...r }) => ({ ...r, telegram_linked: !!parent_telegram_id })) };
  });
  put('/api/students/:id/parent', 'manager', ({ params, body }) => {
    const st = studentRow(params.id);
    run('UPDATE students SET parent_name=?, parent_phone=? WHERE id=?', V.str(body.parent_name, 100), V.str(body.parent_phone, 40), st.id);
    return { ok: true };
  });
  post('/api/students/:id/parent-code', 'manager', ({ params }) => {
    const st = studentRow(params.id);
    const code = P.uniqueParentCode(db);
    run("UPDATE students SET parent_code=?, parent_telegram_id='' WHERE id=?", code, st.id);
    run('DELETE FROM parent_sessions WHERE student_id=?', st.id); // старый код и все входы по нему перестают работать
    return { code };
  });
  post('/api/parents/generate-codes', 'manager', () => {
    let n = 0;
    for (const s of all("SELECT id FROM students WHERE active=1 AND parent_code=''")) { run('UPDATE students SET parent_code=? WHERE id=?', P.uniqueParentCode(db), s.id); n++; }
    return { created: n };
  });
  post('/api/students/:id/parent-unlink', 'manager', ({ params }) => { run("UPDATE students SET parent_telegram_id='' WHERE id=?", studentRow(params.id).id); return { ok: true }; });

  // ================= РАССЫЛКИ =================
  get('/api/broadcasts', 'manager', () => all('SELECT b.*, u.full_name AS author FROM broadcasts b LEFT JOIN users u ON u.id=b.created_by ORDER BY b.id DESC LIMIT 50'));
  post('/api/broadcasts', 'manager', ({ user, body }) => {
    const text = V.str(body.text, 3000, true, 'текст');
    const audience = V.str(body.audience || 'parents', 40);
    let kind = 'parents', cls = '';
    if (audience === 'staff') kind = 'staff';
    else if (audience.startsWith('class:')) { kind = 'parents'; cls = audience.slice(6).trim(); if (!cls) throw new HttpError(400, 'Укажите класс'); }
    else if (audience !== 'parents') throw new HttpError(400, 'Недопустимая аудитория');
    const r = run('INSERT INTO broadcasts (text, audience, created_by) VALUES (?,?,?)', text, audience, user.id);
    const id = Number(r.lastInsertRowid);
    // Отправляем в фоне с небольшой паузой (лимиты Telegram): ответ приходит сразу, прогресс виден в списке.
    setImmediate(async () => {
      let total = 0, sent = 0, failed = 0, cabinet = 0;
      try {
        if (kind === 'staff') {
          const staff = all("SELECT id, telegram_id FROM users WHERE active=1 AND frozen=0 AND role IN ('teacher','staff','assistant','director')");
          total = staff.length;
          for (const u of staff) {
            run('INSERT INTO notices (user_id, text) VALUES (?,?)', u.id, `📢 ${text}`); cabinet++;
            if (u.telegram_id && notifier.hasTransport()) {
              try { await notifier.sendTelegram(u.telegram_id, `📢 ${text}`); sent++; } catch { failed++; }
              await sleep(35);
            }
          }
        } else {
          const kids = all(`SELECT id, parent_telegram_id FROM students WHERE active=1 ${cls ? 'AND lower(trim(class_name))=lower(trim(?))' : ''}`, ...(cls ? [cls] : []));
          total = kids.length;
          const chats = new Set();
          for (const k of kids) {
            run('INSERT INTO parent_messages (student_id, kind, text) VALUES (?,?,?)', k.id, 'broadcast', text); cabinet++;
            if (k.parent_telegram_id && !chats.has(k.parent_telegram_id) && notifier.hasTransport()) {
              chats.add(k.parent_telegram_id);
              try { await notifier.sendTelegram(k.parent_telegram_id, `📢 ${text}`); sent++; } catch { failed++; }
              await sleep(35);
            }
          }
        }
      } catch (e) { console.error('[broadcast]', e.message); }
      run("UPDATE broadcasts SET total=?, sent=?, failed=?, in_cabinet=?, status='done' WHERE id=?", total, sent, failed, cabinet, id);
    });
    return { ok: true, id };
  });

  return { routes, notifyParents, notifyClass, overview };
}

module.exports = { journalRoutes, sameClass };
