'use strict';
// Заполняет БАЗУ ДЕМО-ДАННЫМИ для просмотра сайта. Только для локальной проверки!
// Запуск:  node --disable-warning=ExperimentalWarning scripts/seed-demo.js --yes
const path = require('node:path');
const fs = require('node:fs');
const { openDb, setSetting } = require('../server/db');
const { hashPassword } = require('../server/auth');

if (!process.argv.includes('--yes')) {
  console.log('Скрипт создаёт демо-пользователей с известными паролями. Не запускайте его на боевом сервере.\nДобавьте --yes, чтобы продолжить.');
  process.exit(1);
}
const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
const db = openDb(path.join(dataDir, 'school.db'));
if (db.prepare('SELECT 1 x FROM users').get()) { console.log('В базе уже есть пользователи — демо-данные не добавлены.'); process.exit(0); }

const PASSWORD = 'Demo-2026-School';
const addUser = (username, full_name, role, extra = {}) => db.prepare(
  `INSERT INTO users (username, password_hash, full_name, role, subject, monthly_salary, shift_start, shift_end, show_public, is_best, best_note)
   VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(username, hashPassword(PASSWORD), full_name, role, extra.subject || '', extra.salary || 0,
  '09:00', '14:00', role === 'director' ? 0 : 1, extra.best ? 1 : 0, extra.note || '');

addUser('director', 'Директор (демо)', 'director');
addUser('assistant', 'Ассистент (демо)', 'assistant', { salary: 2500000 });
addUser('teacher1', 'Ustoz Birinchi', 'teacher', { subject: 'Matematika', salary: 3000000, best: true, note: 'Yilning eng yaxshi ustozi' });
addUser('teacher2', 'Ustoz Ikkinchi', 'teacher', { subject: 'Informatika', salary: 3000000 });
addUser('teacher3', 'Ustoz Uchinchi', 'teacher', { subject: 'Ingliz tili', salary: 3000000 });

const addStudent = db.prepare('INSERT INTO students (full_name, class_name, is_best, best_note) VALUES (?,?,?,?)');
const s1 = addStudent.run("O'quvchi Birinchi", '9-A', 1, "A'lochi o'quvchi").lastInsertRowid;
const s2 = addStudent.run("O'quvchi Ikkinchi", '8-B', 0, '').lastInsertRowid;
const s3 = addStudent.run("O'quvchi Uchinchi", '10-A', 0, '').lastInsertRowid;
for (const [c, n] of [['5-A', 'A'], ['6-B', 'B'], ['7-A', 'C'], ['11-A', 'D']]) addStudent.run(`O'quvchi ${n}`, c, 0, '');

const ach = db.prepare("INSERT INTO achievements (kind, student_id, title, date, status) VALUES ('student',?,?,?, 'published')");
ach.run(s1, "Informatika olimpiadasi – 1-o'rin", '2026-10-12');
ach.run(s2, "Matematika olimpiadasi – 2-o'rin", '2026-10-08');
ach.run(s3, "Ingliz tili olimpiadasi – 3-o'rin", '2026-10-03');
db.prepare("INSERT INTO achievements (kind, user_id, title, date, status) VALUES ('teacher',3,?,?, 'published')").run("Respublika tanlovi g'olibi", '2026-09-20');

const news = db.prepare('INSERT INTO news (title, summary, body, kind, created_at) VALUES (?,?,?,?,?)');
news.run("O'quvchilarimiz viloyat olimpiadasida g'olib bo'lishdi", 'Maktabimiz o‘quvchilari yuqori natijalarga erishdi.', "Namuna matn.\n\nBu demo yangilik.", 'news', '2026-10-15 10:00:00');
news.run('Maktabda “IT haftaligi” o‘tkazildi', '', 'Namuna matn.', 'news', '2026-10-10 10:00:00');
news.run('Yangi kompyuter sinfi foydalanishga topshirildi', '', 'Namuna matn.', 'news', '2026-10-05 10:00:00');
news.run('“Ustoz va murabbiylar kuni” tadbiridan lavhalar', '', 'Namuna matn.', 'news', '2026-10-01 10:00:00');
news.run("Ochiq eshiklar kuni", '', 'Namuna matn.', 'announcement', '2026-11-25 10:00:00');
news.run("Ota-onalar yig'ilishi", '', 'Namuna matn.', 'announcement', '2026-11-28 10:00:00');

setSetting(db, 'clubs_count', '15+');
setSetting(db, 'address', 'Gagarin shahri, 1-sonli umumiy o‘rta ta’lim maktabi');
setSetting(db, 'phone', '+998 00 000-00-00');
setSetting(db, 'email', 'school1@example.uz');
console.log(`Готово. Демо-вход: director / ${PASSWORD}`);

// Демо-фотографии (скопировать в uploads и привязать)
const upDir = path.join(dataDir, 'uploads'); fs.mkdirSync(upDir, { recursive: true });
const PH = (n) => { const f = n + '.jpg'; fs.copyFileSync(path.join(__dirname, 'demo-photos', f), path.join(upDir, f)); return f; };
db.prepare("UPDATE users SET photo=? WHERE username='teacher1'").run(PH('ba60910c6731b3ad442a3d988d8880ce'));
db.prepare("UPDATE users SET photo=? WHERE username='teacher2'").run(PH('aa2f6802217bc482b913ec7b86aa7fbd'));
const setS = db.prepare('UPDATE students SET photo=? WHERE id=?');
setS.run(PH('5e5545d38a68148a2d5bd5ec9a89e327'), s1);
setS.run(PH('213ee683360d88249109c2f92789dbc3'), s2);
setS.run(PH('8e4947690532bc44a8e41e9fb365b76a'), s3);
setS.run(PH('166a50c910e390d922db4696e4c7747b'), 4);
db.prepare("UPDATE users SET show_public=0 WHERE username='teacher3'").run(); // на сайте у третьего учителя нет фото
