'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { HttpError } = require('./http');
const { getSettings, setSetting } = require('./db');
const A = require('./auth');
const { manualMark, localNow, toMinutes } = require('./attendance');
const { monthReport, currentMonth } = require('./salary');

// ---------- валидация ----------
const str = (v, max = 200, required = false, name = 'поле') => {
  const s = v == null ? '' : String(v).trim();
  if (required && !s) throw new HttpError(400, `Заполните: ${name}`);
  if (s.length > max) throw new HttpError(400, `Слишком длинное значение: ${name}`);
  return s;
};
const int = (v, def = 0, min = 0, max = 1e9) => {
  const n = Number(v ?? def);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, 'Некорректное число');
  return n;
};
const bool = (v) => (v ? 1 : 0);
const mediaKind = (f) => (/\.(mp4|webm)$/.test(f) ? 'video' : /\.(mp3|ogg|wav|m4a)$/.test(f) ? 'audio' : 'photo');
const newsKind = (v) => (v === 'announcement' ? 'announcement' : 'news');
const date = (v, required = true) => {
  const s = str(v, 10);
  if (!s && !required) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) throw new HttpError(400, 'Некорректная дата (ГГГГ-ММ-ДД)');
  return s;
};
const month = (v) => {
  const s = str(v, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) throw new HttpError(400, 'Некорректный месяц (ГГГГ-ММ)');
  return s;
};
const hhmm = (v, def) => {
  const s = str(v ?? def, 5);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) throw new HttpError(400, 'Некорректное время (ЧЧ:ММ)');
  return s;
};
const workDays = (v) => {
  const arr = (Array.isArray(v) ? v : String(v ?? '1,2,3,4,5,6').split(','))
    .map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 7);
  return [...new Set(arr)].sort().join(',');
};
const file = (v) => {
  const s = str(v, 100);
  if (s && !/^[a-f0-9]{32}\.(jpg|png|gif|webp|mp4|webm|mp3|ogg|wav|m4a)$/.test(s)) throw new HttpError(400, 'Некорректный файл');
  return s;
};

const publicUser = (u) => ({
  id: u.id, full_name: u.full_name, subject: u.subject, bio: u.bio, photo: u.photo,
  is_best: !!u.is_best, best_note: u.best_note,
});
const selfUser = (u) => {
  const { password_hash, link_code, ...rest } = u; // eslint-disable-line no-unused-vars
  return { ...rest, telegram_linked: !!u.telegram_id, telegram_id: undefined };
};

function sniffImage(buf) {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 6 && buf.subarray(0, 4).toString() === 'GIF8') return 'gif';
  if (buf.length > 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'webp';
  return null;
}

function newLinkCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.randomBytes(6), (b) => alphabet[b % alphabet.length]).join('');
}

function buildRoutes({ db, notifier, uploadsDir }) {
  const routes = [];
  const add = (method, pattern, guard, handler) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    routes.push({ method, re, keys, guard, handler });
  };
  const get = (p, g, h) => add('GET', p, g, h);
  const post = (p, g, h) => add('POST', p, g, h);
  const put = (p, g, h) => add('PUT', p, g, h);
  const del = (p, g, h) => add('DELETE', p, g, h);

  const one = (sql, ...p) => db.prepare(sql).get(...p);
  const all = (sql, ...p) => db.prepare(sql).all(...p);
  const run = (sql, ...p) => db.prepare(sql).run(...p);
  const must = (row, msg = 'Не найдено') => { if (!row) throw new HttpError(404, msg); return row; };
  const today = () => localNow(new Date(), getSettings(db).timezone);

  // ================= ГОСТЕВОЙ РЕЖИМ =================
  get('/api/public/site', 'public', () => {
    const s = getSettings(db);
    const pick = ['work_hours', 'school_name', 'city', 'motto', 'address', 'phone', 'email', 'hero_image', 'about_image', 'video_url',
      'clubs_count', 'telegram_url', 'youtube_url', 'instagram_url', 'facebook_url', 'school_lat', 'school_lon'];
    return {
      ...Object.fromEntries(pick.map((k) => [k, s[k]])),
      pages: all('SELECT slug, title FROM pages ORDER BY sort, slug'),
      stats: {
        teachers: one("SELECT COUNT(*) c FROM users WHERE active=1 AND role='teacher' AND show_public=1").c,
        students: one('SELECT COUNT(*) c FROM students WHERE active=1').c,
        classes: one("SELECT COUNT(DISTINCT class_name) c FROM students WHERE active=1 AND class_name != ''").c,
        achievements: one("SELECT COUNT(*) c FROM achievements WHERE status='published'").c,
        clubs: s.clubs_count,
      },
    };
  });

  get('/api/public/pages/:slug', 'public', ({ params }) =>
    must(one('SELECT slug, title, body, image, video, audio, video_url FROM pages WHERE slug = ?', params.slug)));

  get('/api/public/news', 'public', ({ query }) => {
    const limit = Math.min(int(query.limit, 20, 1, 50), 50), offset = int(query.offset, 0, 0, 1e6);
    const kind = query.kind === 'announcement' || query.kind === 'news' ? query.kind : null;
    return all('SELECT id, title, summary, cover, kind, created_at FROM news WHERE published=1 AND (? IS NULL OR kind=?) ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?', kind, kind, limit, offset);
  });
  get('/api/public/news/:id', 'public', ({ params }) =>
    must(one('SELECT id, title, summary, body, cover, kind, created_at FROM news WHERE id=? AND published=1', params.id)));

  get('/api/public/media', 'public', () =>
    all('SELECT id, title, caption, file, kind, created_at FROM media ORDER BY created_at DESC, id DESC LIMIT 200'));

  get('/api/public/achievements', 'public', ({ query }) => {
    const kind = query.kind === 'teacher' || query.kind === 'student' ? query.kind : null;
    return all(
      `SELECT a.id, a.kind, a.title, a.description, a.date, a.photo,
              u.full_name AS teacher_name, u.photo AS teacher_photo, s.full_name AS student_name, s.photo AS student_photo, s.class_name
       FROM achievements a
       LEFT JOIN users u ON u.id = a.user_id AND u.show_public = 1
       LEFT JOIN students s ON s.id = a.student_id
       WHERE a.status='published' AND (? IS NULL OR a.kind = ?)
       ORDER BY a.date DESC, a.id DESC LIMIT 200`, kind, kind);
  });

  get('/api/public/teachers', 'public', () =>
    all("SELECT * FROM users WHERE active=1 AND role='teacher' AND show_public=1 ORDER BY is_best DESC, full_name").map(publicUser));

  get('/api/public/spotlight', 'public', () => {
    const t = one("SELECT * FROM users WHERE active=1 AND is_best=1 AND role='teacher' AND show_public=1 LIMIT 1");
    const s = one('SELECT * FROM students WHERE active=1 AND is_best=1 LIMIT 1');
    return {
      teacher: t ? publicUser(t) : null,
      student: s ? { id: s.id, full_name: s.full_name, class_name: s.class_name, photo: s.photo, best_note: s.best_note } : null,
    };
  });

  // ================= ВХОД =================
  get('/api/setup/status', 'public', () => ({ needsSetup: one("SELECT 1 x FROM users WHERE role='director'") == null }));

  post('/api/setup', 'public', ({ body, setSession }) => {
    if (one("SELECT 1 x FROM users WHERE role='director'")) throw new HttpError(403, 'Директор уже создан');
    const password = str(body.password, 200, true, 'пароль');
    if (password.length < 8) throw new HttpError(400, 'Пароль — минимум 8 символов');
    const r = run(
      "INSERT INTO users (username, password_hash, full_name, role, show_public) VALUES (?,?,?, 'director', 0)",
      str(body.username, 40, true, 'логин'), A.hashPassword(password), str(body.full_name, 100, true, 'ФИО'));
    setSession(Number(r.lastInsertRowid));
    return { ok: true };
  });

  post('/api/auth/login', 'public', ({ body, setSession }) => {
    const u = one('SELECT * FROM users WHERE username = ? AND active = 1', str(body.username, 40));
    if (!u || !A.verifyPassword(String(body.password || ''), u.password_hash)) {
      throw new HttpError(401, 'Неверный логин или пароль');
    }
    if (u.frozen) throw new HttpError(403, 'Аккаунт заморожен. Обратитесь к администратору.');
    setSession(u.id, body.remember !== false);
    return selfUser(u);
  });

  post('/api/auth/logout', 'public', ({ clearSession }) => { clearSession(); return { ok: true }; });
  get('/api/auth/me', 'auth', ({ user }) => selfUser(user));
  get('/api/ping', 'auth', () => ({ ok: true }));

  post('/api/auth/password', 'auth', ({ user, body }) => {
    if (!A.verifyPassword(String(body.current || ''), user.password_hash)) throw new HttpError(400, 'Текущий пароль неверен');
    const pw = str(body.password, 200, true, 'новый пароль');
    if (pw.length < 8) throw new HttpError(400, 'Пароль — минимум 8 символов');
    run('UPDATE users SET password_hash=? WHERE id=?', A.hashPassword(pw), user.id);
    return { ok: true };
  });

  put('/api/auth/account', 'auth', ({ user, body }) => {
    if (!A.verifyPassword(String(body.current || ''), user.password_hash)) throw new HttpError(400, 'Текущий пароль неверен');
    if (body.username != null && String(body.username).trim() !== user.username) {
      const name = str(body.username, 40, true, 'логин');
      if (!/^[A-Za-z0-9_.-]{3,40}$/.test(name)) throw new HttpError(400, 'Логин: 3–40 символов (латиница, цифры, _ . -)');
      if (one('SELECT 1 x FROM users WHERE username = ? AND id != ?', name, user.id)) throw new HttpError(409, 'Такой логин уже занят');
      run('UPDATE users SET username=? WHERE id=?', name, user.id);
    }
    if (body.password) {
      const pw = str(body.password, 200);
      if (pw.length < 8) throw new HttpError(400, 'Пароль — минимум 8 символов');
      run('UPDATE users SET password_hash=? WHERE id=?', A.hashPassword(pw), user.id);
    }
    return selfUser(one('SELECT * FROM users WHERE id=?', user.id));
  });

  // ================= ПАНЕЛЬ: ОБЗОР =================
  get('/api/panel/dashboard', 'auth', ({ user }) => {
    const t = today();
    const out = {
      date: t.date,
      notices: all('SELECT id, text, read, created_at FROM notices WHERE user_id=? ORDER BY id DESC LIMIT 30', user.id),
      unread: one('SELECT COUNT(*) c FROM notices WHERE user_id=? AND read=0', user.id).c,
      open_tasks: one("SELECT COUNT(*) c FROM tasks WHERE assignee_id=? AND status='open'", user.id).c,
    };
    if (A.isManager(user)) {
      const holiday = one('SELECT title FROM holidays WHERE date=?', t.date);
      const people = holiday ? [] : all("SELECT * FROM users WHERE active=1 AND frozen=0 AND role IN ('teacher','staff') ORDER BY full_name")
        .filter((u) => u.work_days.split(',').map(Number).includes(t.weekday));
      out.holiday = holiday?.title ?? null;
      out.today = people.map((u) => {
        const r = one('SELECT * FROM attendance WHERE user_id=? AND date=?', u.id, t.date);
        return {
          user_id: u.id, full_name: u.full_name, shift_start: u.shift_start, shift_end: u.shift_end,
          status: r?.status ?? (t.minutes > toMinutes(u.shift_start) ? 'not_arrived' : 'upcoming'),
          check_in: r?.check_in?.slice(11, 16) ?? null, check_out: r?.check_out?.slice(11, 16) ?? null,
          late_minutes: r?.late_minutes ?? 0,
        };
      });
      out.new_applications = one("SELECT COUNT(*) c FROM applications WHERE status='new'").c;
      out.pending_achievements = one("SELECT COUNT(*) c FROM achievements WHERE status='pending'").c;
      out.tasks_overdue = one("SELECT COUNT(*) c FROM tasks WHERE status='open' AND due_date IS NOT NULL AND due_date < ?", t.date).c;
      out.counts = {
        students: one('SELECT COUNT(*) c FROM students WHERE active=1').c,
        teachers: one("SELECT COUNT(*) c FROM users WHERE active=1 AND role='teacher'").c,
        staff: one("SELECT COUNT(*) c FROM users WHERE active=1 AND role IN ('staff','assistant')").c,
        news: one("SELECT COUNT(*) c FROM news WHERE kind='news'").c,
        achievements: one("SELECT COUNT(*) c FROM achievements WHERE status='published'").c,
      };
      out.recent_news = all('SELECT id, title, cover, published, created_at FROM news ORDER BY created_at DESC, id DESC LIMIT 4');
    } else {
      const r = one('SELECT * FROM attendance WHERE user_id=? AND date=?', user.id, t.date);
      out.my_today = r ? { status: r.status, check_in: r.check_in?.slice(11, 16) ?? null, check_out: r.check_out?.slice(11, 16) ?? null, late_minutes: r.late_minutes } : null;
      out.lessons_today = all('SELECT * FROM lessons WHERE teacher_id=? AND weekday=? ORDER BY start_time', user.id, t.weekday);
      out.counts = {
        lessons_week: one('SELECT COUNT(*) c FROM lessons WHERE teacher_id=?', user.id).c,
        students: one('SELECT COUNT(*) c FROM students WHERE active=1').c,
        achievements: one("SELECT COUNT(*) c FROM achievements WHERE created_by=? OR user_id=?", user.id, user.id).c,
      };
      out.plans_today = all('SELECT * FROM plans WHERE user_id=? AND date=? ORDER BY time', user.id, t.date);
    }
    return out;
  });

  post('/api/notices/read', 'auth', ({ user }) => { run('UPDATE notices SET read=1 WHERE user_id=?', user.id); return { ok: true }; });

  // ================= СОТРУДНИКИ =================
  const userFields = (b, actor, existing) => {
    const f = {
      full_name: str(b.full_name, 100, true, 'ФИО'),
      subject: str(b.subject, 100), phone: str(b.phone, 40), bio: str(b.bio, 2000), photo: file(b.photo),
      show_public: bool(b.show_public ?? 1),
      monthly_salary: int(b.monthly_salary, 0, 0, 1e10),
      shift_start: hhmm(b.shift_start, '09:00'), shift_end: hhmm(b.shift_end, '14:00'),
      work_days: workDays(b.work_days),
      best_note: str(b.best_note, 300),
      birthday: /^\d{4}-\d{2}-\d{2}$|^$/.test(str(b.birthday, 10)) ? str(b.birthday, 10) : (() => { throw new HttpError(400, 'Некорректная дата рождения'); })(),
    };
    if (!f.work_days) throw new HttpError(400, 'Укажите хотя бы один рабочий день');
    if (toMin(f.shift_end) <= toMin(f.shift_start)) throw new HttpError(400, 'Конец смены должен быть позже начала');
    return f;
  };
  const toMin = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));

  get('/api/users', 'manager', () =>
    all('SELECT * FROM users WHERE active=1 ORDER BY CASE role WHEN \'director\' THEN 0 WHEN \'assistant\' THEN 1 ELSE 2 END, full_name').map(selfUser));

  post('/api/users', 'manager', ({ user, body }) => {
    const role = str(body.role, 20, true, 'роль');
    if (!['assistant', 'teacher', 'staff'].includes(role)) throw new HttpError(400, 'Недопустимая роль');
    if (role === 'assistant' && user.role !== 'director') throw new HttpError(403, 'Помощника назначает только директор');
    const password = str(body.password, 200, true, 'пароль');
    if (password.length < 8) throw new HttpError(400, 'Пароль — минимум 8 символов');
    const f = userFields(body, user);
    const username = str(body.username, 40, true, 'логин');
    if (one('SELECT 1 x FROM users WHERE username=?', username)) throw new HttpError(409, 'Такой логин уже занят');
    const r = run(
      `INSERT INTO users (username, password_hash, role, full_name, subject, phone, bio, photo, show_public,
         monthly_salary, shift_start, shift_end, work_days, link_code)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      username, A.hashPassword(password), role, f.full_name, f.subject, f.phone, f.bio, f.photo, f.show_public,
      f.monthly_salary, f.shift_start, f.shift_end, f.work_days, newLinkCode());
    run('UPDATE users SET birthday=? WHERE id=?', f.birthday, r.lastInsertRowid);
    return selfUser(one('SELECT * FROM users WHERE id=?', r.lastInsertRowid));
  });

  put('/api/users/:id', 'manager', ({ user, params, body }) => {
    const target = must(one('SELECT * FROM users WHERE id=? AND active=1', params.id));
    if (!A.canManageUser(user, target) && target.id !== user.id) throw new HttpError(403, 'Недостаточно прав');
    const f = userFields(body, user, target);
    // Свою зарплату и график менеджер не меняет, если он не директор.
    if (user.role !== 'director' && target.id === user.id) {
      f.monthly_salary = target.monthly_salary; f.shift_start = target.shift_start;
      f.shift_end = target.shift_end; f.work_days = target.work_days;
    }
    const isBest = target.role === 'teacher' ? bool(body.is_best) : 0;
    if (isBest) run('UPDATE users SET is_best=0 WHERE is_best=1');
    run(`UPDATE users SET full_name=?, subject=?, phone=?, bio=?, photo=?, show_public=?, monthly_salary=?,
           shift_start=?, shift_end=?, work_days=?, best_note=?, is_best=? WHERE id=?`,
      f.full_name, f.subject, f.phone, f.bio, f.photo, f.show_public, f.monthly_salary,
      f.shift_start, f.shift_end, f.work_days, f.best_note, isBest, target.id);
    run('UPDATE users SET birthday=? WHERE id=?', f.birthday, target.id);
    return selfUser(one('SELECT * FROM users WHERE id=?', target.id));
  });

  del('/api/users/:id', 'manager', ({ user, params }) => {
    const target = must(one('SELECT * FROM users WHERE id=? AND active=1', params.id));
    if (target.id === user.id || target.role === 'director') throw new HttpError(400, 'Нельзя удалить этого пользователя');
    if (!A.canManageUser(user, target)) throw new HttpError(403, 'Недостаточно прав');
    run("UPDATE users SET active=0, telegram_id=NULL, link_code=NULL, is_best=0 WHERE id=?", target.id);
    run('DELETE FROM sessions WHERE user_id=?', target.id);
    return { ok: true };
  });

  post('/api/users/:id/reset-password', 'manager', ({ user, params, body }) => {
    const target = must(one('SELECT * FROM users WHERE id=? AND active=1', params.id));
    if (!A.canManageUser(user, target)) throw new HttpError(403, 'Недостаточно прав');
    const pw = str(body.password, 200, true, 'пароль');
    if (pw.length < 8) throw new HttpError(400, 'Пароль — минимум 8 символов');
    run('UPDATE users SET password_hash=? WHERE id=?', A.hashPassword(pw), target.id);
    run('DELETE FROM sessions WHERE user_id=?', target.id);
    return { ok: true };
  });

  // Одноразовый код для привязки Telegram: пользователь отправляет боту /start КОД.
  post('/api/users/:id/link-code', 'auth', ({ user, params }) => {
    const target = must(one('SELECT * FROM users WHERE id=? AND active=1', params.id));
    if (target.id !== user.id && !A.canManageUser(user, target)) throw new HttpError(403, 'Недостаточно прав');
    const code = newLinkCode();
    run('UPDATE users SET link_code=? WHERE id=?', code, target.id);
    return { code };
  });
  post('/api/users/:id/unlink-telegram', 'auth', ({ user, params }) => {
    const target = must(one('SELECT * FROM users WHERE id=? AND active=1', params.id));
    if (target.id !== user.id && !A.canManageUser(user, target)) throw new HttpError(403, 'Недостаточно прав');
    run('UPDATE users SET telegram_id=NULL WHERE id=?', target.id);
    return { ok: true };
  });

  // ================= УЧЕНИКИ =================
  const studentFields = (b) => ({
    full_name: str(b.full_name, 100, true, 'ФИО'), class_name: str(b.class_name, 20),
    photo: file(b.photo), best_note: str(b.best_note, 300),
  });
  get('/api/students', 'auth', () => all('SELECT * FROM students WHERE active=1 ORDER BY class_name, full_name'));
  post('/api/students', 'manager', ({ body }) => {
    const f = studentFields(body);
    const r = run('INSERT INTO students (full_name, class_name, photo) VALUES (?,?,?)', f.full_name, f.class_name, f.photo);
    return one('SELECT * FROM students WHERE id=?', r.lastInsertRowid);
  });
  put('/api/students/:id', 'manager', ({ params, body }) => {
    const s = must(one('SELECT * FROM students WHERE id=? AND active=1', params.id));
    const f = studentFields(body);
    const best = bool(body.is_best);
    if (best) run('UPDATE students SET is_best=0 WHERE is_best=1');
    run('UPDATE students SET full_name=?, class_name=?, photo=?, best_note=?, is_best=? WHERE id=?',
      f.full_name, f.class_name, f.photo, f.best_note, best, s.id);
    return one('SELECT * FROM students WHERE id=?', s.id);
  });
  del('/api/students/:id', 'manager', ({ params }) => {
    must(one('SELECT 1 x FROM students WHERE id=? AND active=1', params.id));
    run('UPDATE students SET active=0, is_best=0 WHERE id=?', params.id);
    return { ok: true };
  });

  // ================= ДОСТИЖЕНИЯ =================
  const ACH_SQL = `SELECT a.*, u.full_name AS teacher_name, s.full_name AS student_name, s.class_name,
      c.full_name AS author_name FROM achievements a
      LEFT JOIN users u ON u.id=a.user_id LEFT JOIN students s ON s.id=a.student_id
      LEFT JOIN users c ON c.id=a.created_by`;
  get('/api/achievements', 'auth', ({ user }) =>
    A.isManager(user)
      ? all(`${ACH_SQL} ORDER BY (a.status='pending') DESC, a.date DESC, a.id DESC LIMIT 300`)
      : all(`${ACH_SQL} WHERE a.created_by=? ORDER BY a.date DESC, a.id DESC LIMIT 300`, user.id));

  post('/api/achievements', 'auth', ({ user, body }) => {
    const kind = str(body.kind, 10, true, 'тип');
    if (!['teacher', 'student'].includes(kind)) throw new HttpError(400, 'Недопустимый тип');
    let userId = null, studentId = null;
    if (kind === 'teacher') {
      userId = A.isManager(user) && body.user_id ? int(body.user_id, 0, 1) : user.id;
      must(one("SELECT 1 x FROM users WHERE id=? AND active=1 AND role IN ('teacher','staff')", userId), 'Учитель не найден');
    } else {
      studentId = int(body.student_id, 0, 1);
      must(one('SELECT 1 x FROM students WHERE id=? AND active=1', studentId), 'Ученик не найден');
    }
    const status = 'pending'; // любое достижение сначала черновик: предпросмотр → «Подтвердить»
    const r = run(
      `INSERT INTO achievements (kind, user_id, student_id, title, description, date, photo, status, created_by)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      kind, userId, studentId, str(body.title, 200, true, 'название'), str(body.description, 2000),
      date(body.date), file(body.photo), status, user.id);
    if (!A.isManager(user)) notifier.notifyManagers(`🏆 Новое достижение на проверку: «${str(body.title, 80)}» (${user.full_name}).`);
    return one(`${ACH_SQL} WHERE a.id=?`, r.lastInsertRowid);
  });

  put('/api/achievements/:id', 'manager', ({ params, body }) => {
    const a = must(one('SELECT * FROM achievements WHERE id=?', params.id));
    const status = body.status === 'published' ? 'published' : body.status === 'pending' ? 'pending' : a.status;
    run('UPDATE achievements SET title=?, description=?, date=?, photo=?, status=? WHERE id=?',
      str(body.title ?? a.title, 200, true, 'название'), str(body.description ?? a.description, 2000),
      date(body.date ?? a.date), file(body.photo ?? a.photo), status, a.id);
    return one(`${ACH_SQL} WHERE a.id=?`, a.id);
  });
  del('/api/achievements/:id', 'auth', ({ user, params }) => {
    const a = must(one('SELECT * FROM achievements WHERE id=?', params.id));
    if (!A.isManager(user) && !(a.created_by === user.id && a.status === 'pending')) throw new HttpError(403, 'Недостаточно прав');
    run('DELETE FROM achievements WHERE id=?', a.id);
    return { ok: true };
  });

  // ================= НОВОСТИ, МЕДИА, СТРАНИЦЫ =================
  get('/api/news', 'manager', () => all('SELECT * FROM news ORDER BY created_at DESC, id DESC LIMIT 200'));
  post('/api/news', 'manager', ({ user, body }) => {
    const r = run('INSERT INTO news (title, summary, body, cover, kind, published, author_id) VALUES (?,?,?,?,?,?,?)',
      str(body.title, 200, true, 'заголовок'), str(body.summary, 400), str(body.body, 20000),
      file(body.cover), newsKind(body.kind), bool(body.published ?? 1), user.id);
    return one('SELECT * FROM news WHERE id=?', r.lastInsertRowid);
  });
  put('/api/news/:id', 'manager', ({ params, body }) => {
    const n = must(one('SELECT * FROM news WHERE id=?', params.id));
    run('UPDATE news SET title=?, summary=?, body=?, cover=?, kind=?, published=? WHERE id=?',
      str(body.title, 200, true, 'заголовок'), str(body.summary, 400), str(body.body, 20000),
      file(body.cover), newsKind(body.kind), bool(body.published), n.id);
    return one('SELECT * FROM news WHERE id=?', n.id);
  });
  del('/api/news/:id', 'manager', ({ params }) => { run('DELETE FROM news WHERE id=?', params.id); return { ok: true }; });

  get('/api/media', 'manager', () => all('SELECT * FROM media ORDER BY created_at DESC, id DESC LIMIT 200'));
  post('/api/media', 'manager', ({ user, body }) => {
    const f = file(body.file);
    if (!f) throw new HttpError(400, 'Загрузите фото');
    const r = run('INSERT INTO media (title, caption, file, kind, uploaded_by, tour) VALUES (?,?,?,?,?,?)',
      str(body.title, 200), str(body.caption, 500), f, mediaKind(f), user.id, str(body.tour, 60));
    return one('SELECT * FROM media WHERE id=?', r.lastInsertRowid);
  });
  del('/api/media/:id', 'manager', ({ params }) => { run('DELETE FROM media WHERE id=?', params.id); return { ok: true }; });

  get('/api/pages', 'manager', () => all('SELECT * FROM pages ORDER BY sort, slug'));
  put('/api/pages/:slug', 'manager', ({ params, body }) => {
    const p = must(one('SELECT * FROM pages WHERE slug=?', params.slug));
    const vurl = str(body.video_url, 300);
    if (vurl && !/^https?:\/\//i.test(vurl)) throw new HttpError(400, 'Ссылка на видео должна начинаться с http:// или https://');
    run('UPDATE pages SET title=?, body=?, image=?, video=?, audio=?, video_url=? WHERE slug=?', str(body.title, 100, true, 'заголовок'), str(body.body, 20000),
      file(body.image), file(body.video), file(body.audio), vurl, p.slug);
    return one('SELECT * FROM pages WHERE slug=?', p.slug);
  });

  // Загрузка изображения: JSON { data: "data:image/jpeg;base64,..." }
  post('/api/upload', 'auth', ({ body }) => {
    const b64 = String(body.data || '').replace(/^data:[^,]*,/, '');
    const buf = Buffer.from(b64, 'base64');
    if (!buf.length || buf.length > 6_000_000) throw new HttpError(400, 'Файл пустой или больше 6 МБ');
    const ext = sniffImage(buf);
    if (!ext) throw new HttpError(400, 'Допустимы только JPG, PNG, GIF и WEBP');
    const name = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
    fs.mkdirSync(uploadsDir, { recursive: true });
    fs.writeFileSync(path.join(uploadsDir, name), buf);
    return { file: name };
  });

  // ================= ПОСЕЩАЕМОСТЬ И ЗАРПЛАТА =================
  const reportTarget = (user, q) => {
    const id = A.isManager(user) && q.user_id ? int(q.user_id, 0, 1) : user.id;
    return must(one('SELECT * FROM users WHERE id=? AND active=1', id));
  };
  get('/api/attendance', 'auth', ({ user, query }) =>
    monthReport(db, reportTarget(user, query), month(query.month || currentMonth(db))));

  post('/api/attendance/mark', 'manager', ({ user, body }) => {
    const target = must(one('SELECT * FROM users WHERE id=? AND active=1', int(body.user_id, 0, 1)));
    if (!A.canManageUser(user, target)) throw new HttpError(403, 'Недостаточно прав');
    const status = str(body.status, 10, true, 'статус');
    if (!['present', 'excused', 'absent'].includes(status)) throw new HttpError(400, 'Недопустимый статус');
    manualMark(db, target.id, date(body.date), status, str(body.note, 300));
    return { ok: true };
  });

  get('/api/salary', 'auth', ({ user, query }) => {
    const m = month(query.month || currentMonth(db));
    if (!A.isManager(user)) return [monthReport(db, user, m)];
    return all("SELECT * FROM users WHERE active=1 AND role IN ('teacher','staff','assistant') ORDER BY full_name")
      .map((u) => { const { days, ...rest } = monthReport(db, u, m); return rest; }); // eslint-disable-line no-unused-vars
  });

  get('/api/holidays', 'manager', () => all('SELECT * FROM holidays ORDER BY date DESC LIMIT 200'));
  post('/api/holidays', 'manager', ({ body }) => {
    run('INSERT INTO holidays (date, title) VALUES (?,?) ON CONFLICT(date) DO UPDATE SET title=excluded.title',
      date(body.date), str(body.title, 100));
    return { ok: true };
  });
  del('/api/holidays/:date', 'manager', ({ params }) => { run('DELETE FROM holidays WHERE date=?', params.date); return { ok: true }; });

  // ================= ПОРУЧЕНИЯ =================
  const TASK_SQL = `SELECT t.*, a.full_name AS assignee_name FROM tasks t JOIN users a ON a.id=t.assignee_id`;
  // Итог по поручению: on_time — выполнено в срок, late — выполнено с опозданием,
  // overdue — срок прошёл, а не выполнено, open — ещё в работе.
  const taskOutcome = (t, todayDate) => {
    if (t.status === 'done') {
      if (!t.due_date || !t.done_at) return 'on_time';
      // done_at хранится в UTC — переводим в дату по часовому поясу школы
      const doneDay = localNow(new Date(String(t.done_at).replace(' ', 'T') + 'Z'), getSettings(db).timezone).date;
      return doneDay <= t.due_date ? 'on_time' : 'late';
    }
    return t.due_date && t.due_date < todayDate ? 'overdue' : 'open';
  };
  const withOutcome = (rows) => { const td = today().date; return rows.map((t) => ({ ...t, outcome: taskOutcome(t, td) })); };
  get('/api/tasks', 'auth', ({ user }) =>
    withOutcome(A.isManager(user)
      ? all(`${TASK_SQL} ORDER BY (t.status='open') DESC, t.due_date IS NULL, t.due_date, t.id DESC LIMIT 300`)
      : all(`${TASK_SQL} WHERE t.assignee_id=? ORDER BY (t.status='open') DESC, t.due_date IS NULL, t.due_date, t.id DESC`, user.id)));
  // Сводка по исполнителям: сколько поручений выполнено вовремя, с опозданием, не выполнено.
  get('/api/tasks/stats', 'auth', ({ user }) => {
    const td = today().date;
    const people = A.isManager(user)
      ? all("SELECT id, full_name, subject FROM users WHERE active=1 AND role IN ('teacher','staff','assistant') ORDER BY full_name")
      : [{ id: user.id, full_name: user.full_name, subject: user.subject }];
    return people.map((u) => {
      const st = { on_time: 0, late: 0, overdue: 0, open: 0 };
      for (const t of all('SELECT status, due_date, done_at FROM tasks WHERE assignee_id=?', u.id)) st[taskOutcome(t, td)]++;
      const total = st.on_time + st.late + st.overdue + st.open;
      const closed = st.on_time + st.late + st.overdue;
      return { user_id: u.id, full_name: u.full_name, subject: u.subject, total, ...st, rate: closed ? Math.round((st.on_time / closed) * 100) : null };
    });
  });
  post('/api/tasks', 'manager', ({ user, body }) => {
    const assignee = must(one('SELECT * FROM users WHERE id=? AND active=1', int(body.assignee_id, 0, 1)), 'Исполнитель не найден');
    const r = run('INSERT INTO tasks (title, description, assignee_id, created_by, due_date) VALUES (?,?,?,?,?)',
      str(body.title, 200, true, 'поручение'), str(body.description, 2000), assignee.id, user.id, date(body.due_date, false));
    const due = body.due_date ? ` Срок: ${date(body.due_date)}.` : '';
    notifier.notify([assignee.id], `📋 Новое поручение от ${user.full_name}: «${str(body.title, 120)}».${due}`);
    return one(`${TASK_SQL} WHERE t.id=?`, r.lastInsertRowid);
  });
  post('/api/tasks/:id/done', 'auth', ({ user, params }) => {
    const t = must(one('SELECT * FROM tasks WHERE id=?', params.id));
    if (t.assignee_id !== user.id && !A.isManager(user)) throw new HttpError(403, 'Недостаточно прав');
    run("UPDATE tasks SET status='done', done_at=datetime('now') WHERE id=?", t.id);
    if (t.assignee_id === user.id && t.created_by) notifier.notify([t.created_by], `✅ ${user.full_name} выполнил(а) поручение: «${t.title}».`);
    return { ok: true };
  });
  del('/api/tasks/:id', 'manager', ({ params }) => { run('DELETE FROM tasks WHERE id=?', params.id); return { ok: true }; });

  // ================= СТАТИСТИКА (только руководство) =================
  get('/api/stats', 'manager', () => ({
    school: all('SELECT * FROM stats_school ORDER BY date'),
    mastery: all('SELECT * FROM stats_mastery ORDER BY subject, date'),
    current: {
      students: one('SELECT COUNT(*) c FROM students WHERE active=1').c,
      teachers: one("SELECT COUNT(*) c FROM users WHERE active=1 AND role='teacher'").c,
    },
  }));
  post('/api/stats/school', 'manager', ({ body }) => {
    run(`INSERT INTO stats_school (date, students, teachers, staff) VALUES (?,?,?,?)
         ON CONFLICT(date) DO UPDATE SET students=excluded.students, teachers=excluded.teachers, staff=excluded.staff`,
      date(body.date), int(body.students, 0, 0, 100000), int(body.teachers, 0, 0, 10000), int(body.staff, 0, 0, 10000));
    return { ok: true };
  });
  del('/api/stats/school/:date', 'manager', ({ params }) => { run('DELETE FROM stats_school WHERE date=?', params.date); return { ok: true }; });
  post('/api/stats/mastery', 'manager', ({ body }) => {
    run(`INSERT INTO stats_mastery (date, subject, percent) VALUES (?,?,?)
         ON CONFLICT(date, subject) DO UPDATE SET percent=excluded.percent`,
      date(body.date), str(body.subject, 60, true, 'предмет'), int(body.percent, 0, 0, 100));
    return { ok: true };
  });
  del('/api/stats/mastery/:id', 'manager', ({ params }) => { run('DELETE FROM stats_mastery WHERE id=?', params.id); return { ok: true }; });

  // ================= НАСТРОЙКИ =================
  const SETTING_KEYS = ['school_name', 'city', 'motto', 'address', 'phone', 'email', 'hero_image', 'about_image', 'video_url', 'clubs_count', 'telegram_url', 'youtube_url', 'instagram_url', 'facebook_url', 'school_lat', 'school_lon', 'radius_m', 'grace_minutes', 'timezone'];
  get('/api/settings', 'manager', () => getSettings(db));
  put('/api/settings', 'manager', ({ body }) => {
    const clean = {};
    for (const k of SETTING_KEYS) {
      if (!(k in body)) continue;
      let v = str(body[k], 200);
      if (k === 'school_lat' && v !== '' && !(Math.abs(parseFloat(v)) <= 90)) throw new HttpError(400, 'Широта: от -90 до 90');
      if (k === 'school_lon' && v !== '' && !(Math.abs(parseFloat(v)) <= 180)) throw new HttpError(400, 'Долгота: от -180 до 180');
      if (k === 'radius_m') v = String(int(v, 150, 10, 5000));
      if (k === 'grace_minutes') v = String(int(v, 10, 0, 240));
      if (k === 'timezone') { try { new Intl.DateTimeFormat('en', { timeZone: v }); } catch { throw new HttpError(400, 'Неизвестный часовой пояс'); } }
      if ((k === 'hero_image' || k === 'about_image') && v) v = file(v);
      if (k.endsWith('_url') && v && !/^https?:\/\//i.test(v)) throw new HttpError(400, 'Ссылка должна начинаться с http:// или https://');
      if (k === 'school_name' && !v) throw new HttpError(400, 'Название школы обязательно');
      clean[k] = v;
    }
    for (const [k, v] of Object.entries(clean)) setSetting(db, k, v);
    return getSettings(db);
  });


  post('/api/users/:id/freeze', 'manager', ({ user, params, body }) => {
    const target = must(one('SELECT * FROM users WHERE id=? AND active=1', params.id));
    if (target.id === user.id || target.role === 'director') throw new HttpError(400, 'Нельзя заморозить этого пользователя');
    if (!A.canManageUser(user, target)) throw new HttpError(403, 'Недостаточно прав');
    const frozen = bool(body.frozen);
    run('UPDATE users SET frozen=? WHERE id=?', frozen, target.id);
    if (frozen) run('DELETE FROM sessions WHERE user_id=?', target.id);
    return { ok: true, frozen: !!frozen };
  });

  // ================= РАСПИСАНИЕ УРОКОВ =================
  const lessonFields = (b) => {
    const f = { weekday: int(b.weekday, 1, 1, 7), number: int(b.number, 1, 1, 15), class_name: str(b.class_name, 20), subject: str(b.subject, 100),
      room: str(b.room, 20), start_time: hhmm(b.start_time, '08:00'), end_time: hhmm(b.end_time, '08:45') };
    if (toMinutes(f.end_time) <= toMinutes(f.start_time)) throw new HttpError(400, 'Конец урока должен быть позже начала');
    return f;
  };
  const LESSON_SQL = 'SELECT l.*, u.full_name AS teacher_name FROM lessons l JOIN users u ON u.id = l.teacher_id';
  get('/api/lessons', 'auth', ({ user, query }) => {
    if (A.isManager(user)) return query.teacher_id ? all(`${LESSON_SQL} WHERE l.teacher_id=? ORDER BY l.weekday, l.start_time`, int(query.teacher_id, 0, 1))
      : all(`${LESSON_SQL} ORDER BY u.full_name, l.weekday, l.start_time`);
    return all(`${LESSON_SQL} WHERE l.teacher_id=? ORDER BY l.weekday, l.start_time`, user.id);
  });
  post('/api/lessons', 'manager', ({ body }) => {
    const t = must(one("SELECT id FROM users WHERE id=? AND active=1 AND role IN ('teacher','staff','assistant')", int(body.teacher_id, 0, 1)), 'Учитель не найден');
    const f = lessonFields(body);
    const r = run('INSERT INTO lessons (teacher_id, weekday, number, class_name, subject, room, start_time, end_time) VALUES (?,?,?,?,?,?,?,?)',
      t.id, f.weekday, f.number, f.class_name, f.subject, f.room, f.start_time, f.end_time);
    return one(`${LESSON_SQL} WHERE l.id=?`, r.lastInsertRowid);
  });
  put('/api/lessons/:id', 'manager', ({ params, body }) => {
    const l = must(one('SELECT * FROM lessons WHERE id=?', params.id));
    const f = lessonFields(body);
    run('UPDATE lessons SET weekday=?, number=?, class_name=?, subject=?, room=?, start_time=?, end_time=? WHERE id=?',
      f.weekday, f.number, f.class_name, f.subject, f.room, f.start_time, f.end_time, l.id);
    return one(`${LESSON_SQL} WHERE l.id=?`, l.id);
  });
  del('/api/lessons/:id', 'manager', ({ params }) => { run('DELETE FROM lessons WHERE id=?', params.id); return { ok: true }; });

  // ================= МОИ ПЛАНЫ (напоминания приходят в Telegram-бот) =================
  get('/api/plans', 'auth', ({ user, query }) => {
    const m = month(query.month || currentMonth(db));
    return all('SELECT * FROM plans WHERE user_id=? AND date LIKE ? ORDER BY date, time', user.id, `${m}-%`);
  });
  post('/api/plans', 'auth', ({ user, body }) => {
    const r = run('INSERT INTO plans (user_id, title, date, time) VALUES (?,?,?,?)', user.id, str(body.title, 200, true, 'название'), date(body.date), hhmm(body.time, '09:00'));
    return one('SELECT * FROM plans WHERE id=?', r.lastInsertRowid);
  });
  post('/api/plans/:id/toggle', 'auth', ({ user, params }) => {
    const p = must(one('SELECT * FROM plans WHERE id=? AND user_id=?', params.id, user.id));
    run('UPDATE plans SET done=? WHERE id=?', p.done ? 0 : 1, p.id);
    return { ok: true };
  });
  del('/api/plans/:id', 'auth', ({ user, params }) => { run('DELETE FROM plans WHERE id=? AND user_id=?', params.id, user.id); return { ok: true }; });

  // ================= ОБЪЯВЛЕНИЯ ДЛЯ СОТРУДНИКОВ (всем или выбранным) =================
  const annRow = (a) => ({ ...a, to_all: !!a.to_all,
    targets: a.to_all ? [] : all('SELECT u.id, u.full_name FROM announcement_targets t JOIN users u ON u.id=t.user_id WHERE t.announcement_id=?', a.id) });
  get('/api/announcements', 'auth', ({ user }) => (A.isManager(user)
    ? all('SELECT a.*, u.full_name AS author_name FROM announcements a LEFT JOIN users u ON u.id=a.created_by ORDER BY a.id DESC LIMIT 100')
    : all(`SELECT a.*, u.full_name AS author_name FROM announcements a LEFT JOIN users u ON u.id=a.created_by
           WHERE a.to_all=1 OR a.id IN (SELECT announcement_id FROM announcement_targets WHERE user_id=?) ORDER BY a.id DESC LIMIT 100`, user.id)).map(annRow));
  post('/api/announcements', 'manager', ({ user, body }) => {
    const toAll = !!body.to_all;
    const ids = toAll ? [] : [...new Set((Array.isArray(body.user_ids) ? body.user_ids : []).map(Number))]
      .filter((id) => one('SELECT 1 x FROM users WHERE id=? AND active=1', id));
    if (!toAll && !ids.length) throw new HttpError(400, 'Выберите получателей или «Всем»');
    const title = str(body.title, 200, true, 'заголовок');
    const r = run('INSERT INTO announcements (title, body, to_all, created_by) VALUES (?,?,?,?)', title, str(body.body, 5000), bool(toAll), user.id);
    for (const id of ids) run('INSERT INTO announcement_targets (announcement_id, user_id) VALUES (?,?)', r.lastInsertRowid, id);
    const recipients = toAll ? all("SELECT id FROM users WHERE active=1 AND frozen=0 AND id != ?", user.id).map((x) => x.id) : ids;
    notifier.notify(recipients, `📢 Объявление: ${title}`);
    return annRow(one('SELECT * FROM announcements WHERE id=?', r.lastInsertRowid));
  });
  del('/api/announcements/:id', 'manager', ({ params }) => { run('DELETE FROM announcements WHERE id=?', params.id); return { ok: true }; });

  // ================= КАЛЕНДАРЬ, ЗАЯВКИ, FAQ, ЖУРНАЛ, РЕЙТИНГ =================
  const EVENT_KINDS = ['event', 'meeting', 'competition', 'subbotnik', 'holiday', 'exam', 'other'];
  const evRow = (b) => ({
    title: str(b.title, 200, true, 'название'), description: str(b.description, 2000), date: date(b.date),
    time: b.time ? hhmm(b.time) : '', place: str(b.place, 200),
    kind: EVENT_KINDS.includes(b.kind) ? b.kind : 'event', audience: b.audience === 'staff' ? 'staff' : 'public',
  });
  // публично — только открытые события
  get('/api/public/events', 'public', ({ query }) => {
    const from = query.from ? date(query.from) : '0000-01-01', to = query.to ? date(query.to) : '9999-12-31';
    return all("SELECT id, title, description, date, time, place, kind FROM events WHERE audience='public' AND date BETWEEN ? AND ? ORDER BY date, time, id LIMIT 300", from, to);
  });
  get('/api/public/faq', 'public', () => all('SELECT id, question, answer FROM faq ORDER BY sort, id'));
  get('/api/public/tour', 'public', () => all("SELECT id, title, caption, file, tour FROM media WHERE kind='photo' AND tour != '' ORDER BY tour, id"));

  // Заявки с сайта: не чаще 5 в час с одного адреса; поле website — «ловушка» для роботов.
  const applyHits = new Map();
  post('/api/public/apply', 'public', ({ req, body }) => {
    if (body.website) return { ok: true }; // робот: молча «принимаем»
    const ip = req.socket.remoteAddress || '', now = Date.now();
    const hits = (applyHits.get(ip) || []).filter((t0) => now - t0 < 3600_000);
    if (hits.length >= 5) throw new HttpError(429, 'Слишком много обращений. Попробуйте позже.');
    applyHits.set(ip, [...hits, now]);
    const kind = body.kind === 'contact' ? 'contact' : 'admission';
    const name = str(body.name, 100, true, 'имя');
    const phone = str(body.phone, 40), email = str(body.email, 120);
    if (!phone && !email) throw new HttpError(400, 'Укажите телефон или e-mail');
    if (kind === 'contact' && !str(body.message, 3000)) throw new HttpError(400, 'Напишите сообщение');
    run('INSERT INTO applications (kind, name, phone, email, child_name, grade, message) VALUES (?,?,?,?,?,?,?)',
      kind, name, phone, email, str(body.child_name, 100), str(body.grade, 20), str(body.message, 3000));
    notifier.notify(all("SELECT id FROM users WHERE role IN ('director','assistant') AND active=1").map((u) => u.id),
      `${kind === 'admission' ? '🎓 Новая заявка на поступление' : '✉️ Новое обращение с сайта'}: ${name}${phone ? ', ' + phone : ''}`);
    return { ok: true };
  });
  get('/api/applications', 'manager', () => all('SELECT * FROM applications ORDER BY (status=\'new\') DESC, id DESC LIMIT 300'));
  post('/api/applications/:id/done', 'manager', ({ params, body }) => {
    must(one('SELECT 1 x FROM applications WHERE id=?', params.id));
    run('UPDATE applications SET status=? WHERE id=?', body.reopen ? 'new' : 'done', params.id);
    return { ok: true };
  });
  del('/api/applications/:id', 'manager', ({ params }) => { run('DELETE FROM applications WHERE id=?', params.id); return { ok: true }; });

  // Календарь для панели: события (в т.ч. «для сотрудников») + дни рождения сотрудников
  get('/api/events', 'auth', ({ query }) => {
    const from = query.from ? date(query.from) : '0000-01-01', to = query.to ? date(query.to) : '9999-12-31';
    return {
      events: all('SELECT * FROM events WHERE date BETWEEN ? AND ? ORDER BY date, time, id LIMIT 500', from, to),
      birthdays: all("SELECT id, full_name, birthday FROM users WHERE active=1 AND birthday != '' ORDER BY full_name")
        .map((u) => ({ id: u.id, full_name: u.full_name, md: u.birthday.slice(5) })),
    };
  });
  post('/api/events', 'manager', ({ user, body }) => {
    const e = evRow(body);
    const r = run('INSERT INTO events (title, description, date, time, place, kind, audience, created_by) VALUES (?,?,?,?,?,?,?,?)',
      e.title, e.description, e.date, e.time, e.place, e.kind, e.audience, user.id);
    if (e.audience === 'staff') notifier.notify(all("SELECT id FROM users WHERE active=1 AND frozen=0 AND id != ?", user.id).map((u) => u.id), `📅 ${e.title} — ${e.date}${e.time ? ' ' + e.time : ''}`);
    return one('SELECT * FROM events WHERE id=?', r.lastInsertRowid);
  });
  put('/api/events/:id', 'manager', ({ params, body }) => {
    must(one('SELECT 1 x FROM events WHERE id=?', params.id));
    const e = evRow(body);
    run('UPDATE events SET title=?, description=?, date=?, time=?, place=?, kind=?, audience=? WHERE id=?', e.title, e.description, e.date, e.time, e.place, e.kind, e.audience, params.id);
    return one('SELECT * FROM events WHERE id=?', params.id);
  });
  del('/api/events/:id', 'manager', ({ params }) => { run('DELETE FROM events WHERE id=?', params.id); return { ok: true }; });

  get('/api/faq', 'manager', () => all('SELECT * FROM faq ORDER BY sort, id'));
  post('/api/faq', 'manager', ({ body }) => {
    const r = run('INSERT INTO faq (question, answer, sort) VALUES (?,?,?)', str(body.question, 300, true, 'вопрос'), str(body.answer, 3000), int(body.sort, 0, 0, 9999));
    return one('SELECT * FROM faq WHERE id=?', r.lastInsertRowid);
  });
  put('/api/faq/:id', 'manager', ({ params, body }) => {
    must(one('SELECT 1 x FROM faq WHERE id=?', params.id));
    run('UPDATE faq SET question=?, answer=?, sort=? WHERE id=?', str(body.question, 300, true, 'вопрос'), str(body.answer, 3000), int(body.sort, 0, 0, 9999), params.id);
    return one('SELECT * FROM faq WHERE id=?', params.id);
  });
  del('/api/faq/:id', 'manager', ({ params }) => { run('DELETE FROM faq WHERE id=?', params.id); return { ok: true }; });

  // Журнал действий: только директор и помощник
  get('/api/audit', 'manager', ({ query }) =>
    all('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?', Math.min(int(query.limit, 100, 1, 500), 500)));

  // Отметка «прочитано» для объявлений сотрудникам
  post('/api/announcements/:id/read', 'auth', ({ user, params }) => {
    must(one('SELECT 1 x FROM announcements WHERE id=?', params.id));
    run('INSERT OR IGNORE INTO announcement_reads (announcement_id, user_id) VALUES (?,?)', params.id, user.id);
    return { ok: true };
  });
  get('/api/announcements/reads', 'auth', ({ user }) => {
    if (!A.isManager(user)) return { mine: all('SELECT announcement_id FROM announcement_reads WHERE user_id=?', user.id).map((r) => r.announcement_id), readers: {} };
    const readers = {};
    for (const r of all('SELECT r.announcement_id id, u.full_name FROM announcement_reads r JOIN users u ON u.id=r.user_id ORDER BY r.read_at')) (readers[r.id] ||= []).push(r.full_name);
    return { mine: all('SELECT announcement_id FROM announcement_reads WHERE user_id=?', user.id).map((r) => r.announcement_id), readers };
  });

  // Рейтинг сотрудников месяца: 50% дисциплина (приходы без опозданий) + 50% поручения в срок
  get('/api/rating', 'manager', ({ query }) => {
    const m = query.month ? month(query.month) : currentMonth(db);
    const td = today().date;
    return all("SELECT id, full_name, subject, photo FROM users WHERE active=1 AND frozen=0 AND role IN ('teacher','staff')").map((u) => {
      const att = all("SELECT status, late_minutes FROM attendance WHERE user_id=? AND substr(date,1,7)=? AND status IN ('present','absent')", u.id, m);
      const present = att.filter((a) => a.status === 'present'), onTimeDays = present.filter((a) => !a.late_minutes).length;
      const discipline = att.length ? Math.round((onTimeDays / att.length) * 100) : null;
      const st = { on_time: 0, late: 0, overdue: 0 };
      for (const t of all('SELECT status, due_date, done_at FROM tasks WHERE assignee_id=? AND due_date IS NOT NULL AND substr(due_date,1,7)=?', u.id, m)) { const o = taskOutcome(t, td); if (o in st) st[o]++; }
      const closed = st.on_time + st.late + st.overdue, tasks = closed ? Math.round((st.on_time / closed) * 100) : null;
      const parts = [discipline, tasks].filter((x) => x != null);
      return { user_id: u.id, full_name: u.full_name, subject: u.subject, photo: u.photo, discipline, tasks, days: att.length, late_days: present.length - onTimeDays,
        score: parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : null };
    }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  });

  return routes;
}

module.exports = { buildRoutes, sniffImage };
