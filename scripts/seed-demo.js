'use strict';
// Заполняет БАЗУ ДЕМО-ДАННЫМИ (вымышленные люди, фото сгенерированы) для просмотра сайта. Только для локальной проверки!
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

// Фотографии: файлы лежат в scripts/demo-photos, копируются в uploads
const upDir = path.join(dataDir, 'uploads'); fs.mkdirSync(upDir, { recursive: true });
const PHOTO = {
  "building": "be9668a69501b3fd8b397abadb87582e",
  "it_class": "d1cc98fc41eed1327650125d989b3397",
  "computers": "cea9fa3fdea6d497d817a4c1fafd3ad8",
  "olympiad": "75a820bbec505f77a728e045a0910112",
  "sept1": "bf3cc83b60977e76eb82a04b703e7eca",
  "staff": "31c9a16dd79cd093f30de07e8af798b7",
  "football": "0b90292d27255eef4fa7dcdd83ce2945",
  "library": "707ad495ef4789dad6c505fabd2dc547",
  "dance": "c5b537fb65508cd406a31c2843aec07a",
  "t1": "cf616e6c66d75bbc9028c59c6f5629fd",
  "t2": "452a9f433a889941e81641ff57f68e09",
  "t3": "c111f01d4c0a89085f31c1b55618fe1c",
  "t4": "5f32ee767c528ef167e9be0bd58ec392",
  "t5": "4695a265d7f7dabdf4ebcb7e45dce41a",
  "s1": "a79cc941c538c823b501d6e0e3b89f2b",
  "s2": "e3736eb2a7b88ec78b1ee476c079e6f7",
  "s3": "8803ac7b46855f6de0cc5430e1f6cdfd",
  "s4": "4f6ad9ebaf78e011f555a6b15f95919e",
  "s5": "7e206fbd77fd7ce07b42b6b84533d880",
  "o_tM": "ba60910c6731b3ad442a3d988d8880ce",
  "o_tF": "aa2f6802217bc482b913ec7b86aa7fbd",
  "o_s1": "5e5545d38a68148a2d5bd5ec9a89e327",
  "o_s2": "213ee683360d88249109c2f92789dbc3",
  "o_s3": "8e4947690532bc44a8e41e9fb365b76a",
  "o_s4": "166a50c910e390d922db4696e4c7747b"
};
const PH = (key) => { const f = PHOTO[key] + '.jpg'; fs.copyFileSync(path.join(__dirname, 'demo-photos', f), path.join(upDir, f)); return f; };

const PASSWORD = 'Demo-2026-School';
const addUser = (username, full_name, role, extra = {}) => db.prepare(
  `INSERT INTO users (username, password_hash, full_name, role, subject, monthly_salary, shift_start, shift_end, show_public, is_best, best_note, photo)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(username, hashPassword(PASSWORD), full_name, role, extra.subject || '', extra.salary || 0,
  '09:00', '14:00', role === 'director' || role === 'assistant' ? 0 : 1, extra.best ? 1 : 0, extra.note || '', extra.photo ? PH(extra.photo) : '').lastInsertRowid;

addUser('director', 'Директор (демо)', 'director');
addUser('assistant', 'Ассистент (демо)', 'assistant', { salary: 2500000 });
const T = {};
T.t1 = addUser('teacher1', 'Rustam Karimov', 'teacher', { subject: 'Matematika', salary: 3000000, best: true, note: 'Yilning eng yaxshi ustozi', photo: 'o_tM' });
T.t2 = addUser('teacher2', 'Dilnoza Rahimova', 'teacher', { subject: 'Informatika', salary: 3000000, photo: 'o_tF' });
T.t3 = addUser('teacher3', 'Malika Yusupova', 'teacher', { subject: 'Ingliz tili', salary: 3000000, photo: 't4' });
T.t4 = addUser('teacher4', 'Bobur Tursunov', 'teacher', { subject: 'Fizika', salary: 3000000, photo: 't1' });
T.t5 = addUser('teacher5', 'Nigora Abdullayeva', 'teacher', { subject: 'Ona tili va adabiyot', salary: 3000000, photo: 't2' });
T.t6 = addUser('teacher6', 'Sardor Qodirov', 'teacher', { subject: 'Tarix', salary: 3000000, photo: 't3' });
T.t7 = addUser('teacher7', "Gulnora Ergasheva", "teacher", { subject: "Boshlang'ich sinflar", salary: 3000000, photo: 't5' });

const addStudent = db.prepare('INSERT INTO students (full_name, class_name, photo, is_best, best_note) VALUES (?,?,?,?,?)');
const S = (n, c, p, best = 0, note = '') => addStudent.run(n, c, PH(p), best, note).lastInsertRowid;
const s1 = S('Jasur Aliyev', '9-A', 'o_s1', 1, "A'lochi o'quvchi");
const s2 = S('Madina Karimova', '8-B', 'o_s2');
const s3 = S('Sevara Nazarova', '10-A', 'o_s3');
const s4 = S('Otabek Rahmonov', '5-A', 'o_s4');
const s5 = S('Diyor Mirzayev', '11-A', 's1');
const s6 = S('Zilola Sodiqova', '7-A', 's2');
const s7 = S('Abdulloh Hasanov', '6-B', 's3');
const s8 = S('Shahnoza Ismoilova', '9-B', 's4');
const s9 = S('Sardor Ergashev', '8-A', 's5');

const sa = db.prepare("INSERT INTO achievements (kind, student_id, title, description, date, photo, status) VALUES ('student',?,?,?,?,?, 'published')");
sa.run(s1, "Informatika olimpiadasi – 1-o'rin", "Viloyat bosqichida 120 nafar ishtirokchi orasida birinchi o'rinni egalladi va respublika bosqichiga yo'llanma oldi.", '2026-10-12', '');
sa.run(s2, "Matematika olimpiadasi – 2-o'rin", "Murakkab masalalarni original usulda yechgani uchun hakamlar hay'ati alohida e'tirof etdi.", '2026-10-08', '');
sa.run(s3, 'IELTS 7.5 sertifikati', "Umumiy natija 7.5 ball. Tayyorgarlik maktabdagi ingliz tili to'garagida o'tdi.", '2026-10-03', '');
sa.run(s5, 'SAT — 1480 ball', "Xalqaro imtihonda 1600 balldan 1480 ball to'pladi. Xorijdagi universitetlarga hujjat topshirmoqda.", '2026-09-27', '');
sa.run(s6, "Ingliz tili olimpiadasi – 3-o'rin", "Tuman bosqichida bronza medali sohibi bo'ldi.", '2026-09-18', '');
sa.run(s8, 'Respublika ilmiy loyihalar tanlovi – diplom', "«Quyosh energiyasi bilan ishlaydigan maktab bog'i» loyihasi uchun maxsus diplom bilan taqdirlandi.", '2026-09-10', '');
sa.run(s9, "Fizika olimpiadasi – 2-o'rin", "Eksperiment bosqichida eng yuqori ballni oldi.", '2026-09-05', '');
const ta = db.prepare("INSERT INTO achievements (kind, user_id, title, description, date, photo, status) VALUES ('teacher',?,?,?,?,?, 'published')");
ta.run(T.t1, "«Yilning eng yaxshi ustozi» tanlovi g'olibi", "Respublika bosqichida matematika fani ustozlari orasida birinchi o'rin.", '2026-09-20', '');
ta.run(T.t3, 'IELTS 8.5 sertifikati', "Xalqaro til imtihonini 8.5 ball bilan topshirdi; endi 11-sinf o'quvchilarini imtihonga tayyorlaydi.", '2026-10-14', '');
ta.run(T.t2, 'Google Certified Educator – Level 2', "Raqamli ta'lim vositalari bo'yicha xalqaro sertifikat oldi.", '2026-10-02', '');
ta.run(T.t4, 'Malaka oshirish kursi sertifikati', "«Fizikani laboratoriya orqali o'qitish» kursini muvaffaqiyatli yakunladi.", '2026-09-25', '');
ta.run(T.t5, "Metodik ishlanmalar ko'rik-tanlovi – 1-o'rin", "Ona tili darslari uchun interaktiv metodik qo'llanma yaratdi.", '2026-09-15', '');
ta.run(T.t6, "Faxriy yorliq", "Iqtidorli o'quvchilarni olimpiadalarga tayyorlagani uchun viloyat xalq ta'limi boshqarmasi tomonidan taqdirlandi.", '2026-09-08', '');

const news = db.prepare('INSERT INTO news (title, summary, body, cover, kind, created_at) VALUES (?,?,?,?,?,?)');
const N = (t, s, b, cover, kind, d) => news.run(t, s, b, cover ? PH(cover) : '', kind, d + ' 10:00:00');
N("Maktablararo futbol turnirida jamoamiz finalga chiqdi", "Maktab terma jamoasi shahar turnirida yarim finalda g'alaba qozondi.",
  "Shahar maktablari o'rtasida o'tkazilayotgan futbol turnirida 8–9-sinf o'quvchilaridan iborat jamoamiz yarim finalda 3:1 hisobida g'alaba qozondi.\n\nFinal o'yini kelgusi haftada shahar stadionida bo'ladi. Jismoniy tarbiya ustozlari jamoani qo'llab-quvvatlash uchun barcha o'quvchilar va ota-onalarni taklif qilishadi.", 'football', 'news', '2026-11-05');
N("Kitobxonlik haftaligi: eng faol o'quvchilar taqdirlandi", "Hafta davomida kutubxonada uchrashuvlar va tanlovlar o'tkazildi.",
  "Maktab kutubxonasida o'tgan kitobxonlik haftaligi davomida o'quvchilar eng sevimli asarlari haqida taqdimotlar qilishdi.\n\nHafta yakunida eng ko'p kitob o'qigan o'quvchilar diplom va sovg'alar bilan taqdirlandi. Kutubxonaga yangi kitoblar ham keltirildi.", 'library', 'news', '2026-10-22');
N("O'quvchilarimiz viloyat olimpiadasida g'olib bo'lishdi", "Maktabimiz o'quvchilari fan olimpiadasida yuqori natijalarga erishdi.",
  "Viloyat fan olimpiadasida maktabimiz o'quvchilari oltin, kumush va bronza medallarini qo'lga kiritdi.\n\nG'oliblar tantanali yig'ilishda diplom va esdalik sovg'alari bilan taqdirlandi. Ustozlarga tayyorgarlikdagi mehnati uchun minnatdorchilik bildirildi.", 'olympiad', 'news', '2026-10-15');
N("Maktabda “IT haftaligi” o‘tkazildi", "Dasturlash va robototexnika bo'yicha ochiq darslar bo'lib o'tdi.",
  "IT haftaligi davomida informatika ustozlari 5–9-sinf o'quvchilari uchun ochiq darslar va amaliy mashg'ulotlar tashkil etdi.\n\nO'quvchilar o'z loyihalarini taqdim etishdi, eng yaxshilari esa maktab sayti orqali e'lon qilinadi.", 'it_class', 'news', '2026-10-10');
N("Yangi kompyuter sinfi foydalanishga topshirildi", "Zamonaviy kompyuterlar bilan jihozlangan sinf o'quvchilar ixtiyorida.",
  "Maktabimizda zamonaviy kompyuterlar bilan jihozlangan yangi informatika xonasi ochildi. Endi sinfda bir vaqtning o'zida 25 nafar o'quvchi mashg'ulot o'tkazishi mumkin.\n\nXona kechki to'garaklar uchun ham foydalaniladi.", 'computers', 'news', '2026-10-05');
N("“Ustoz va murabbiylar kuni” tadbiridan lavhalar", "Pedagoglarimiz bayram bilan tabriklandi.",
  "1-oktabr — Ustoz va murabbiylar kuni munosabati bilan maktabda bayram tadbiri o'tkazildi. O'quvchilar ustozlarga gullar va tabrik so'zlarini yo'lladi.\n\nTadbirda faol pedagoglar mukofotlandi.", 'staff', 'news', '2026-10-01');
N("Yangi o'quv yili: maktabimiz eshiklari ochildi", "Ta'mirlangan hovli va yangilangan sinflar o'quvchilarni kutib oldi.",
  "Yangi o'quv yili arafasida maktab hovlisi obodonlashtirildi, gulzorlar yangilandi, sinf xonalari ta'mirlandi.\n\nBarcha o'quvchilarga yangi o'quv yilida omad tilaymiz!", 'building', 'news', '2026-09-02');
N("1-sentabr — Bilim kuni tantanali nishonlandi", "Birinchi sinf o'quvchilari maktabga qadam qo'ydi.",
  "Bilim kuni munosabati bilan maktab hovlisida tantanali yig'in bo'lib o'tdi. Birinchi sinf o'quvchilari gullar bilan kutib olindi.\n\nTadbir yakunida yuqori sinf o'quvchilari kichiklarga birinchi qo'ng'iroqni chaldirishdi.", 'sept1', 'news', '2026-09-01');
N("Mustaqillik bayramiga bag'ishlangan konsert", "O'quvchilar milliy raqs va qo'shiqlar bilan chiqish qildi.",
  "Mustaqillik bayrami arafasida maktab sahnasida konsert dasturi namoyish etildi. Milliy kiyimdagi o'quvchilar raqs va qo'shiqlar ijro etishdi.\n\nTomoshabinlar chiqishlarni qarsaklar bilan kutib olishdi.", 'dance', 'news', '2026-08-31');
N("Ochiq eshiklar kuni", '', "Ota-onalar va bo'lajak o'quvchilarni maktab bilan tanishish uchun taklif qilamiz.\n\nManzil: Gagarin shahri, 1-sonli maktab. Boshlanishi: 10:00.", '', 'announcement', '2026-11-25');
N("Ota-onalar yig'ilishi", '', "Choraklik natijalar bo'yicha ota-onalar yig'ilishi bo'lib o'tadi.\n\nBoshlanishi: 17:00, sinf rahbarlari xonalarida.", '', 'announcement', '2026-11-28');

// Галерея
const med = db.prepare("INSERT INTO media (title, caption, file, kind) VALUES (?,?,?, 'photo')");
for (const [k, t, c] of [['building', 'Maktab binosi', 'Yangi o\'quv yilida'], ['sept1', 'Bilim kuni', '1-sentabr'], ['dance', 'Konsert', 'Mustaqillik bayrami'],
  ['olympiad', "Olimpiada g'oliblari", 'Viloyat bosqichi'], ['it_class', 'IT haftaligi', 'Ochiq dars'], ['computers', 'Kompyuter sinfi', 'Yangi xona'],
  ['library', 'Kutubxona', 'Kitobxonlik haftaligi'], ['football', 'Futbol turniri', 'Maktablararo musobaqa'], ['staff', 'Pedagoglar jamoasi', 'Ustoz va murabbiylar kuni']]) med.run(t, c, PH(k));

// Расписание, поручения, планы (для проверки кабинета учителя)
const lesson = db.prepare('INSERT INTO lessons (teacher_id, weekday, number, class_name, subject, room, start_time, end_time) VALUES (?,?,?,?,?,?,?,?)');
const SLOT = [['09:00', '09:45'], ['09:55', '10:40'], ['10:50', '11:35'], ['11:45', '12:30']];
const PLAN = { [T.t1]: ['Matematika', ['9-A', '8-B', '10-A']], [T.t2]: ['Informatika', ['7-A', '9-B', '8-A']], [T.t3]: ['Ingliz tili', ['10-A', '11-A', '9-A']] };
for (const [tid, [subj, classes]] of Object.entries(PLAN)) for (let wd = 1; wd <= 6; wd++) classes.forEach((cl, i) => {
  const n = ((i + wd) % 4) + 1; lesson.run(tid, wd, n, cl, subj, String(100 + wd * 3 + i), SLOT[n - 1][0], SLOT[n - 1][1]);
});
const d = (add) => { const x = new Date(Date.now() + add * 86400000); return x.toISOString().slice(0, 10); };
// Поручения с разным исходом: в срок / с опозданием / не выполнено / в работе
const task = db.prepare('INSERT INTO tasks (title, description, assignee_id, created_by, due_date, status, done_at, created_at) VALUES (?,?,?,1,?,?,?,?)');
const at = (add, h = 10) => `${d(add)} ${String(h).padStart(2, '0')}:20:00`;
// [исполнитель, поручение, описание, срок(дни от сегодня), выполнено (дни от сегодня) | null]
const TASKS = [
  [T.t1, 'Choraklik hisobotini topshirish', "Sinflar bo'yicha o'zlashtirish hisoboti.", -12, -13], [T.t1, "Sinf jurnalini to'ldirish", 'Oktabr oyi bo‘yicha.', -9, -10],
  [T.t1, "Test savollarini tayyorlash", '9-sinf uchun nazorat ishi.', -6, -7], [T.t1, "Olimpiada ro'yxatini tayyorlash", "Respublika bosqichiga yo'llanma olganlar.", -5, -3],
  [T.t1, "Subbotnikda sinf hududini tozalash", 'Maktab hovlisidagi 9-A sinf hududi.', -2, null], [T.t1, "Ota-onalar yig'ilishi bayonnomasi", 'Yig‘ilishdan keyin 2 kun ichida.', 3, null],
  [T.t1, 'Dars rejalarini yangilash', 'Yangi chorak uchun.', 7, null],
  [T.t2, 'Kompyuter sinfi inventarizatsiyasi', "Yangi xonadagi jihozlar ro'yxati.", -14, -15], [T.t2, 'IT haftaligi ssenariysi', 'Tadbir rejasini topshirish.', -11, -12],
  [T.t2, "Raqamli jurnalga o'tkazish", '5–7-sinflar ma’lumotlari.', -8, -5], [T.t2, "Dasturlash to'garagi dasturi", 'Yangi yil uchun.', -7, -4], [T.t2, 'Antivirus yangilash', 'Barcha kompyuterlar.', -3, null],
  [T.t2, "Maktab saytiga materiallar", 'Oyning eng yaxshi suratlari.', 5, null],
  [T.t3, 'IELTS mashg‘ulot jadvali', '11-sinf uchun.', -10, -12], [T.t3, 'Ingliz tili olimpiadasi savollari', '', -8, -9], [T.t3, 'Chet tillar haftaligi rejasi', '', -4, -6], [T.t3, 'Lug‘at test natijalari', '', 4, null],
  [T.t4, 'Fizika laboratoriyasi hisoboti', '', -9, -10], [T.t4, 'Asboblar ro‘yxati', '', -6, null], [T.t4, 'Nazorat ishi natijalari', '', -2, null],
  [T.t5, 'Metodik ishlanma', '', -10, -11], [T.t5, 'Insho tanlovi', '', -7, -8], [T.t5, 'Kitobxonlik haftaligi hisoboti', '', -5, -3],
  [T.t6, 'Tarixiy sanalar taqdimoti', '', -8, -9], [T.t6, "Muzey ekskursiyasi rejasi", '', 6, null],
  [T.t7, "Boshlang'ich sinflar ko'rigi", '', -9, -10], [T.t7, 'Bayram matinesi', '', -6, -7], [T.t7, "Ota-onalar bilan uchrashuv", '', -3, -1],
];
for (const [who, title, descr, due, done] of TASKS) task.run(title, descr, who, d(due), done == null ? 'open' : 'done', done == null ? null : at(done, 9), at(Math.min(due, done ?? due) - 4));

// Посещаемость за прошлый и текущий месяц (для отчётов и зарплаты)
const att = db.prepare('INSERT OR IGNORE INTO attendance (user_id, date, status, check_in, check_out, late_minutes, early_minutes, note) VALUES (?,?,?,?,?,?,?,?)');
{
  const now = new Date(); const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  let seedN = 7; const rnd = () => (seedN = (seedN * 9301 + 49297) % 233280) / 233280;
  for (let day = new Date(first); day < new Date(now.getFullYear(), now.getMonth(), now.getDate()); day.setDate(day.getDate() + 1)) {
    if (day.getDay() === 0) continue;
    const ds = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    for (const id of [2, ...Object.values(T)]) {
      const r = rnd();
      if (r < 0.04) att.run(id, ds, 'absent', null, null, 0, 0, '');
      else if (r < 0.07) att.run(id, ds, 'excused', null, null, 0, 0, 'Kasallik');
      else if (r < 0.14) { const m = 12 + Math.floor(rnd() * 45); att.run(id, ds, 'present', `${ds} 09:${String(m % 60).padStart(2, '0')}:00`.replace('09:' + String(m % 60).padStart(2, '0'), m >= 60 ? '10:' + String(m % 60).padStart(2, '0') : '09:' + String(m).padStart(2, '0')), `${ds} 14:05:00`, m, 0, ''); }
      else att.run(id, ds, 'present', `${ds} 08:${String(40 + Math.floor(rnd() * 19))}:00`, `${ds} 14:0${Math.floor(rnd() * 9)}:00`, 0, 0, '');
    }
  }
}

  // Сегодняшний день: кто пришёл, кто опоздал, кто ещё не пришёл
  const tds = d(0); const L = (id, ci, co, late) => att.run(id, tds, 'present', `${tds} ${ci}:00`, co ? `${tds} ${co}:00` : null, late, 0, '');
  L(T.t1, '09:45', '14:03', 45); L(T.t2, '08:52', '14:01', 0); L(T.t3, '08:58', '14:00', 0); L(T.t5, '08:47', '14:06', 0); L(T.t6, '09:20', '14:02', 20); L(T.t7, '08:55', '14:00', 0);

// Внутренние объявления для сотрудников
const ann = db.prepare('INSERT INTO announcements (title, body, to_all, created_by, created_at) VALUES (?,?,?,1,?)');
const annT = db.prepare('INSERT INTO announcement_targets (announcement_id, user_id) VALUES (?,?)');
ann.run("Sport musobaqasi — shanba kuni", "Shanba kuni soat 10:00 da maktab stadionida o'qituvchilar o'rtasida mini-futbol va voleybol musobaqasi bo'ladi. Ishtirok etmoqchi bo'lganlar ro'yxatdan o'tsin.", 1, at(-1) );
ann.run("Pedagogik kengash — juma kuni 15:00", "Choraklik natijalar va kelgusi chorak rejasi muhokama qilinadi. Kelmaslik uchun oldindan ogohlantiring.", 1, at(-2));
ann.run('Umumiy subbotnik', "Dushanba kuni dars tugagach maktab hovlisini tozalash bo'yicha subbotnik o'tkaziladi. Sinf rahbarlari o'z sinflari bilan qatnashadi.", 1, at(-4));
const a4 = ann.run("Olimpiadaga tayyorgarlik — matematika va informatika ustozlariga", "Viloyat olimpiadasiga yo'llanma olgan o'quvchilar bilan qo'shimcha mashg'ulotlar jadvali ilova qilinadi.", 0, at(-3)).lastInsertRowid;
annT.run(a4, T.t1); annT.run(a4, T.t2);

// Уведомления в колокольчике
const note = db.prepare('INSERT INTO notices (user_id, text, read, created_at) VALUES (?,?,?,?)');
note.run(T.t1, '📋 Yangi topshiriq: «Subbotnikda sinf hududini tozalash». Muddat: ' + d(-2), 0, at(-5));
note.run(T.t1, '📢 Yangi e’lon: «Sport musobaqasi — shanba kuni»', 0, at(-1));
note.run(T.t1, '⏰ Eslatma: Olimpiada mashg‘uloti', 1, at(-3));
note.run(T.t2, '📋 Yangi topshiriq: «Maishiy antivirus yangilash»', 0, at(-4));
note.run(1, '⏰ Rustam Karimov 09:45 da keldi — 45 daqiqa kechikish.', 0, at(-6, 9));
note.run(1, '✅ Dilnoza Rahimova topshiriqni bajardi: «Raqamli jurnalga o‘tkazish».', 0, at(-5, 11));
note.run(1, '🏆 Yangi yutuq tasdiqlashni kutmoqda', 1, at(-8));
note.run(2, '⏰ Bobur Tursunov 09:20 da keldi — 20 daqiqa kechikish.', 0, at(-7, 9));

const plan = db.prepare('INSERT INTO plans (user_id, title, date, time) VALUES (?,?,?,?)');
plan.run(T.t1, "Ota-onalar yig'ilishiga tayyorgarlik", d(2), '15:00');
plan.run(T.t1, "Olimpiada mashg'uloti", d(4), '14:00');
plan.run(T.t1, "Nazorat ishi varaqlarini tekshirish", d(1), '16:30');


// Страницы «О школе» (вымышленная история — для демонстрации)
const page = db.prepare('UPDATE pages SET body=?, image=? WHERE slug=?');
page.run(`1-sonli umumiy o'rta ta'lim maktabi Gagarin shahrining eng qadimiy va nufuzli maktablaridan biri bo'lib, bugun bu yerda 900 dan ortiq o'quvchi 60 nafar malakali ustoz rahbarligida bilim oladi.

Tarix. Maktab 1967-yil 1-sentabrda shaharning birinchi umumta'lim maktabi sifatida ochilgan. Uning asoschisi va dastlabki direktori — xalq ta'limi a'lochisi Abdurahim Qodirov bo'lib, u dastlabki yillarda 320 nafar o'quvchi va 18 nafar ustoz bilan ish boshlagan. Bir qavatli kichik binoda boshlangan faoliyat qisqa vaqtda shahar ahli e'tiborini qozongan.

1985-yilda ikki qavatli yangi bino foydalanishga topshirildi, kutubxona va sport zali ochildi. 1998-yilda maktabda shaharda birinchi bo'lib kompyuter xonasi tashkil etildi. 2012-yilda bino to'liq ta'mirlanib, zamonaviy fizika va kimyo laboratoriyalari bilan jihozlandi.

So'nggi yillarda maktab aniq fanlar va xorijiy tillarni chuqur o'rgatish bo'yicha tajriba maktabi sifatida tanilgan. O'quvchilarimiz respublika olimpiadalarida, IELTS va SAT kabi xalqaro imtihonlarda yuqori natijalar ko'rsatmoqda.

Qadriyatlarimiz. Hurmat, mas'uliyat, mehnatsevarlik va bilimga intilish — maktabimiz hayotining asosi. Biz har bir o'quvchining iqtidorini ochishga va uni jamiyatga foydali shaxs qilib tarbiyalashga intilamiz.

(Eslatma: bu matn namuna sifatida yozilgan. Haqiqiy tarixni boshqaruv panelida «Maktab haqida» bo'limida tahrirlang.)`, PH('building'), 'about');
page.run(`Maktabda 1–11-sinflar uchun umumta'lim dasturi o'qitiladi: ona tili va adabiyot, matematika, informatika, fizika, kimyo, biologiya, tarix, geografiya, ingliz va rus tillari, jismoniy tarbiya.

Chuqurlashtirilgan yo'nalishlar: matematika va informatika, ingliz tili (IELTS tayyorgarligi).

To'garaklar: dasturlash va robototexnika, shaxmat, futbol, milliy raqs, rasm, kitobxonlik klubi.`, '', 'programs');
page.run(`Manzil: Gagarin shahri, 1-sonli umumiy o'rta ta'lim maktabi.

Telefon: +998 00 000-00-00.

Qabul vaqti: dushanba–shanba, 09:00–17:00. Direktor qabuli: payshanba kunlari 15:00–17:00.`, '', 'contacts');
setSetting(db, 'about_image', PH('staff'));

// Статистика школы (вымышленная динамика)
const ss = db.prepare('INSERT INTO stats_school (date, students, teachers, staff) VALUES (?,?,?,?)');
for (const r of [['2025-09-01', 400, 50, 18], ['2025-12-25', 440, 50, 18], ['2026-03-20', 500, 52, 19], ['2026-06-01', 540, 54, 19], ['2026-09-01', 600, 56, 21]]) ss.run(...r);
const sm = db.prepare('INSERT INTO stats_mastery (date, subject, percent) VALUES (?,?,?)');
const QD = ['2025-10-31', '2025-12-27', '2026-03-20', '2026-05-25', '2026-10-31'];
const MAST = { Matematika: [60, 64, 70, 75, 80], 'Ingliz tili': [55, 60, 66, 72, 78], Informatika: [70, 74, 77, 82, 86], Fizika: [80, 78, 74, 70, 66], 'Ona tili': [72, 73, 71, 74, 75], Tarix: [68, 66, 64, 67, 70] };
for (const [subj, arr] of Object.entries(MAST)) arr.forEach((p, i) => sm.run(QD[i], subj, p));

setSetting(db, 'clubs_count', '15+');
setSetting(db, 'address', 'Gagarin shahri, 1-sonli umumiy o‘rta ta’lim maktabi');
setSetting(db, 'phone', '+998 00 000-00-00');
setSetting(db, 'email', 'school1@example.uz');
console.log(`Готово. Демо-вход: director / ${PASSWORD}`);
