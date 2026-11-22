'use strict';
// Таблицы дополнительных модулей: родители и дневник, обращения, кадры, информация для сайта, безопасность.
const SCHOOL_SCHEMA = `
CREATE TABLE IF NOT EXISTS parent_sessions (
  token_hash TEXT NOT NULL,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (token_hash, student_id)
);
CREATE TABLE IF NOT EXISTS grades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  date TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  kind TEXT NOT NULL DEFAULT 'lesson',
  comment TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS grades_student ON grades (student_id, date);
CREATE TABLE IF NOT EXISTS student_attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present','absent','late','excused')),
  note TEXT NOT NULL DEFAULT '',
  marked_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (student_id, date)
);
CREATE TABLE IF NOT EXISTS homework (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_name TEXT NOT NULL,
  subject TEXT NOT NULL,
  text TEXT NOT NULL,
  due_date TEXT NOT NULL,
  teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS parent_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'info',
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS pm_student ON parent_messages (student_id, id);
CREATE TABLE IF NOT EXISTS broadcasts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  audience TEXT NOT NULL,
  total INTEGER NOT NULL DEFAULT 0,
  sent INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  in_cabinet INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'sending',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  with_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  topic TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','confirmed','declined','done')),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS appt_slot ON appointments (with_user_id, date, time) WHERE status IN ('new','confirmed');
CREATE TABLE IF NOT EXISTS cert_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'study',
  purpose TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','ready','rejected')),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at TEXT,
  decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  topic TEXT NOT NULL DEFAULT 'question',
  message TEXT NOT NULL,
  contact TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','seen','answered')),
  answer TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  answered_at TEXT
);
CREATE TABLE IF NOT EXISTS leave_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('vacation','sick','unpaid')),
  date_from TEXT NOT NULL,
  date_to TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decided_at TEXT,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS substitutions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  sub_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (date, lesson_id)
);
CREATE TABLE IF NOT EXISTS payroll_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('bonus','deduction')),
  title TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS menu_days (
  date TEXT PRIMARY KEY,
  breakfast TEXT NOT NULL DEFAULT '',
  lunch TEXT NOT NULL DEFAULT '',
  snack TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS bells (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shift INTEGER NOT NULL DEFAULT 1,
  number INTEGER NOT NULL DEFAULT 1,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS transport_routes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  times TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  file TEXT NOT NULL,
  original_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS login_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  username TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  ua TEXT NOT NULL DEFAULT '',
  ok INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS login_codes (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  tries INTEGER NOT NULL DEFAULT 0
);
`;

const SCHOOL_SETTINGS = {
  appt_start: '14:00', appt_end: '17:00', appt_step: '20', appt_days: '1,2,3,4,5',
  bot_username: '',
  director_2fa: '0',
  backup_enabled: '1', backup_hours: '24', backup_keep: '14', backup_telegram: '0', backup_last: '',
};

module.exports = { SCHOOL_SCHEMA, SCHOOL_SETTINGS };
