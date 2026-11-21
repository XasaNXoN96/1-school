'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('director','assistant','teacher','staff')),
  subject TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  photo TEXT NOT NULL DEFAULT '',
  is_best INTEGER NOT NULL DEFAULT 0,
  best_note TEXT NOT NULL DEFAULT '',
  show_public INTEGER NOT NULL DEFAULT 1,
  monthly_salary INTEGER NOT NULL DEFAULT 0,
  shift_start TEXT NOT NULL DEFAULT '09:00',
  shift_end TEXT NOT NULL DEFAULT '14:00',
  work_days TEXT NOT NULL DEFAULT '1,2,3,4,5,6',
  telegram_id TEXT UNIQUE,
  link_code TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  class_name TEXT NOT NULL DEFAULT '',
  photo TEXT NOT NULL DEFAULT '',
  is_best INTEGER NOT NULL DEFAULT 0,
  best_note TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS achievements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('teacher','student')),
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  student_id INTEGER REFERENCES students(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL,
  photo TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','published')),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS news (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  cover TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'news',
  published INTEGER NOT NULL DEFAULT 1,
  author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL DEFAULT '',
  caption TEXT NOT NULL DEFAULT '',
  file TEXT NOT NULL,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pages (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present','excused','absent')),
  check_in TEXT,
  check_out TEXT,
  late_minutes INTEGER NOT NULL DEFAULT 0,
  early_minutes INTEGER NOT NULL DEFAULT 0,
  in_distance INTEGER,
  out_distance INTEGER,
  note TEXT NOT NULL DEFAULT '',
  UNIQUE (user_id, date)
);

CREATE TABLE IF NOT EXISTS holidays (date TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '');

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  assignee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  done_at TEXT
);

CREATE TABLE IF NOT EXISTS notices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  number INTEGER NOT NULL DEFAULT 1,
  class_name TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  room TEXT NOT NULL DEFAULT '',
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL DEFAULT '09:00',
  done INTEGER NOT NULL DEFAULT 0,
  notified INTEGER NOT NULL DEFAULT 0
);

-- Внутренние объявления для сотрудников (всем или выбранным)
CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  to_all INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS announcement_targets (
  announcement_id INTEGER NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (announcement_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_lessons_teacher ON lessons(teacher_id, weekday);
CREATE INDEX IF NOT EXISTS idx_plans_user ON plans(user_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_notices_user ON notices(user_id, read);
`;

// school_lat / school_lon пустые, пока директор не укажет координаты школы в настройках.
const DEFAULT_SETTINGS = {
  school_name: '№1-Maktab',
  city: 'Gagarin shahri',
  motto: "Sifatli ta'lim – bilimli avlod – muvaffaqiyatli kelajak!",
  address: '',
  phone: '',
  email: '',
  // Внешний вид главной страницы
  hero_image: '',      // фон шапки (загружается в панели или кладётся в public/img/hero.jpg)
  about_image: '',
  video_url: '',       // ссылка на видео для кнопки «Videoni ko'rish»
  clubs_count: '',     // например «15+»
  telegram_url: '', youtube_url: '', instagram_url: '', facebook_url: '',
  // Геозона для отметки прихода
  school_lat: '',
  school_lon: '',
  radius_m: '150',
  grace_minutes: '10',
  timezone: 'Asia/Tashkent',
};

const DEFAULT_PAGES = [
  ['about', "Maktab haqida", "Maktabimiz – zamonaviy ta'lim, malakali ustozlar va har tomonlama rivojlangan o'quvchilar maskani. Bu matnni boshqaruv panelida o'zgartiring.", 1],
  ['programs', "Ta'lim dasturlari", "Maktabda o'qitiladigan fanlar, to'garaklar va dasturlar ro'yxatini shu yerga yozing.", 2],
  ['contacts', 'Kontakt', "Manzil, telefon raqamlari va qabul vaqtlarini shu yerga yozing.", 3],
  ['schedule', 'Dars jadvali', "Dars jadvali shu yerda e'lon qilinadi.", 4],
  ['clubs', "To'garaklar", "Maktab to'garaklari ro'yxati.", 5],
  ['olympiads', 'Olimpiadalar', "Olimpiadalar va tanlovlar haqida ma'lumot.", 6],
  ['resources', 'Foydali resurslar', "Foydali havolalar va o'quv resurslari.", 7],
];

function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  // Миграции для баз, созданных по более ранней схеме
  const addColumn = (table, col, def) => {
    if (!db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  };
  addColumn('news', 'kind', "TEXT NOT NULL DEFAULT 'news'");
  addColumn('users', 'frozen', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('media', 'kind', "TEXT NOT NULL DEFAULT 'photo'");
  for (const c of ['image', 'video', 'audio', 'video_url']) addColumn('pages', c, "TEXT NOT NULL DEFAULT ''");
  const ins = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) ins.run(k, v);
  const insPage = db.prepare('INSERT OR IGNORE INTO pages (slug, title, body, sort) VALUES (?,?,?,?)');
  for (const p of DEFAULT_PAGES) insPage.run(...p);
  return db;
}

function getSettings(db) {
  const s = {};
  for (const r of db.prepare('SELECT key, value FROM settings').all()) s[r.key] = r.value;
  return s;
}

function setSetting(db, key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, String(value));
}

module.exports = { openDb, getSettings, setSetting, DEFAULT_SETTINGS };
