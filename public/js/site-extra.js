// Разделы для родителей: кабинет по коду, запись на приём, обращения, меню, звонки, документы, замены.
import { h, api, imgUrl } from './common.js';
import { lang, fmtDate } from './i18n.js';
import { icon } from './icons.js';

const D = {
  uz: {
    nav: "Ota-onalar uchun", cabinet: 'Ota-ona kabineti', appt: 'Qabulga yozilish', fb: "Murojaat va takliflar", menu: 'Ovqatlanish menyusi', bells: "Qo'ng'iroqlar va transport", docs: 'Hujjatlar',
    hubLead: "Ota-onalar uchun asosiy xizmatlar bir joyda.",
    cabSub: "Baholar, davomat, uy vazifasi va xabarlar", apptSub: "Direktor yoki ustoz qabuliga oldindan yoziling", fbSub: "Shikoyat, taklif yoki minnatdorchilik — anonim ham mumkin", menuSub: 'Haftalik menyu', bellsSub: "Dars vaqtlari va qatnov", docsSub: "Nizom, litsenziya, buyruqlar",
    code: 'Ota-ona kodi', codeHint: "Kodni sinf rahbaridan oling (8 ta belgi). Bir kod bilan bir nechta farzandni qo'shish mumkin.", enter: 'Kirish', logout: 'Chiqish', addChild: "Yana farzand qo'shish",
    avg: "O'rtacha ball", noGrades: "Baholar hali yo'q", subject: 'Fan', grades: 'Baholar', att: 'Davomat', hw: 'Uy vazifasi', sched: 'Dars jadvali', msgs: 'Xabarlar', certs: 'Ma\'lumotnoma',
    present: 'Keldi', absent: 'Kelmadi', late: 'Kechikdi', excused: 'Sababli', last30: "Oxirgi 30 kun", noHw: "Uy vazifasi yo'q", noMsgs: "Xabarlar yo'q", due: 'muddati',
    tg: 'Telegramda xabarnoma olish', tgText: "Botga o'tib, shu kodni yuboring — baho va davomat haqida xabar keladi.", tgDone: 'Telegram ulangan',
    certReq: "Ma'lumotnoma so'rash", certStudy: "O'qishi haqida", certGrades: "Baholar bilan", purpose: "Qayerga kerak (ixtiyoriy)", send: 'Yuborish', sent: "So'rov yuborildi", status: { new: 'ko\'rib chiqilmoqda', ready: 'tayyor', rejected: 'rad etildi', done: 'berildi' },
    pick: 'Kim bilan', date: 'Sana', time: 'Vaqt', yourName: 'Ismingiz', phone: 'Telefon', topic: 'Mavzu (ixtiyoriy)', tema: 'Mavzu', freeSlots: "Bo'sh vaqtlar", noSlots: "Bu kunga bo'sh vaqt yo'q", book: 'Yozilish', booked: 'Siz yozildingiz', bookedAt: 'sana va vaqt', wait: "Tasdiqlash haqida qo'ng'iroq qilamiz.",
    fbTopic: { question: 'Savol', complaint: 'Shikoyat', suggestion: 'Taklif', thanks: 'Minnatdorchilik' }, message: 'Xabar', contact: "Aloqa (ixtiyoriy — anonim qoldirish mumkin)", fbSent: 'Murojaat qabul qilindi', fbCode: 'Kuzatish kodi', fbKeep: "Kodni saqlang: u orqali javobni shu yerda ko'rasiz.", lookup: "Javobni tekshirish", noAnswer: "Javob hali yo'q", answer: 'Javob', notFound: 'Topilmadi',
    breakfast: 'Nonushta', lunch: 'Tushlik', snack: 'Poldnik', noMenu: 'Menyu kiritilmagan', today: 'Bugun',
    shift: 'smena', lessonNo: 'Dars', transport: 'Maktab transporti', noBells: "Jadval kiritilmagan", noTransport: "Marshrutlar yo'q",
    noDocs: "Hujjatlar yo'q", download: 'Yuklab olish', other: 'Boshqa',
    subs: "Bugun va ertaga almashtirishlar", subsNone: "Almashtirishlar yo'q", subsBy: 'o\'rniga', tomorrow: 'Ertaga',
    err: 'Xatolik', wd: ['Du', 'Se', 'Chor', 'Pay', 'Ju', 'Sha', 'Yak'],
  },
  ru: {
    nav: 'Для родителей', cabinet: 'Кабинет родителя', appt: 'Запись на приём', fb: 'Обращения и предложения', menu: 'Меню столовой', bells: 'Звонки и подвоз', docs: 'Документы',
    hubLead: 'Основные сервисы для родителей в одном месте.',
    cabSub: 'Оценки, посещаемость, домашние задания и сообщения', apptSub: 'Запишитесь к директору или учителю заранее', fbSub: 'Жалоба, предложение или благодарность — можно анонимно', menuSub: 'Меню на неделю', bellsSub: 'Время уроков и маршруты', docsSub: 'Устав, лицензия, приказы',
    code: 'Код родителя', codeHint: 'Код выдаёт классный руководитель (8 символов). По одному коду можно добавить несколько детей.', enter: 'Войти', logout: 'Выйти', addChild: 'Добавить ещё ребёнка',
    avg: 'Средний балл', noGrades: 'Оценок пока нет', subject: 'Предмет', grades: 'Оценки', att: 'Посещаемость', hw: 'Домашние задания', sched: 'Расписание', msgs: 'Сообщения', certs: 'Справки',
    present: 'Был', absent: 'Не был', late: 'Опоздал', excused: 'По причине', last30: 'За последние 30 дней', noHw: 'Домашних заданий нет', noMsgs: 'Сообщений нет', due: 'срок',
    tg: 'Уведомления в Telegram', tgText: 'Откройте бота и отправьте ему этот же код — оценки и пропуски придут в Telegram.', tgDone: 'Telegram подключён',
    certReq: 'Заказать справку', certStudy: 'Об обучении', certGrades: 'С оценками', purpose: 'Куда нужна (необязательно)', send: 'Отправить', sent: 'Заявка отправлена', status: { new: 'на рассмотрении', ready: 'готова', rejected: 'отклонена', done: 'выдана' },
    pick: 'К кому', date: 'Дата', time: 'Время', yourName: 'Ваше имя', phone: 'Телефон', topic: 'Тема (необязательно)', tema: 'Тема', freeSlots: 'Свободное время', noSlots: 'На эту дату свободного времени нет', book: 'Записаться', booked: 'Вы записаны', bookedAt: 'дата и время', wait: 'Мы позвоним для подтверждения.',
    fbTopic: { question: 'Вопрос', complaint: 'Жалоба', suggestion: 'Предложение', thanks: 'Благодарность' }, message: 'Сообщение', contact: 'Контакт (необязательно — можно анонимно)', fbSent: 'Обращение принято', fbCode: 'Код для отслеживания', fbKeep: 'Сохраните код: по нему вы увидите ответ школы здесь же.', lookup: 'Проверить ответ', noAnswer: 'Ответа пока нет', answer: 'Ответ', notFound: 'Не найдено',
    breakfast: 'Завтрак', lunch: 'Обед', snack: 'Полдник', noMenu: 'Меню не заполнено', today: 'Сегодня',
    shift: 'смена', lessonNo: 'Урок', transport: 'Школьный подвоз', noBells: 'Расписание не заполнено', noTransport: 'Маршрутов нет',
    noDocs: 'Документов нет', download: 'Скачать', other: 'Прочее',
    subs: 'Замены на сегодня и завтра', subsNone: 'Замен нет', subsBy: 'вместо', tomorrow: 'Завтра',
    err: 'Ошибка', wd: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
  },
  en: {
    nav: 'For parents', cabinet: 'Parent cabinet', appt: 'Book an appointment', fb: 'Feedback & suggestions', menu: 'Cafeteria menu', bells: 'Bells & transport', docs: 'Documents',
    hubLead: 'Key services for parents in one place.',
    cabSub: 'Grades, attendance, homework and messages', apptSub: 'Book a visit with the director or a teacher', fbSub: 'Complaint, suggestion or thanks — anonymous is fine', menuSub: 'Weekly menu', bellsSub: 'Lesson times and routes', docsSub: 'Charter, licence, orders',
    code: 'Parent code', codeHint: 'Ask the class teacher for the 8-character code. One code can hold several children.', enter: 'Sign in', logout: 'Sign out', addChild: 'Add another child',
    avg: 'Average', noGrades: 'No grades yet', subject: 'Subject', grades: 'Grades', att: 'Attendance', hw: 'Homework', sched: 'Timetable', msgs: 'Messages', certs: 'Certificates',
    present: 'Present', absent: 'Absent', late: 'Late', excused: 'Excused', last30: 'Last 30 days', noHw: 'No homework', noMsgs: 'No messages', due: 'due',
    tg: 'Telegram notifications', tgText: 'Open the bot and send it this same code to get grades and absences in Telegram.', tgDone: 'Telegram connected',
    certReq: 'Request a certificate', certStudy: 'Enrolment', certGrades: 'With grades', purpose: 'Purpose (optional)', send: 'Send', sent: 'Request sent', status: { new: 'pending', ready: 'ready', rejected: 'rejected', done: 'issued' },
    pick: 'With', date: 'Date', time: 'Time', yourName: 'Your name', phone: 'Phone', topic: 'Topic (optional)', tema: 'Topic', freeSlots: 'Available times', noSlots: 'No free times on this date', book: 'Book', booked: 'You are booked', bookedAt: 'date and time', wait: 'We will call to confirm.',
    fbTopic: { question: 'Question', complaint: 'Complaint', suggestion: 'Suggestion', thanks: 'Thanks' }, message: 'Message', contact: 'Contact (optional — can be anonymous)', fbSent: 'Message received', fbCode: 'Tracking code', fbKeep: 'Keep this code: you can see the school’s reply here with it.', lookup: 'Check reply', noAnswer: 'No reply yet', answer: 'Reply', notFound: 'Not found',
    breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snack', noMenu: 'Menu not published', today: 'Today',
    shift: 'shift', lessonNo: 'Lesson', transport: 'School transport', noBells: 'Schedule not published', noTransport: 'No routes',
    noDocs: 'No documents', download: 'Download', other: 'Other',
    subs: 'Substitutions today and tomorrow', subsNone: 'No substitutions', subsBy: 'instead of', tomorrow: 'Tomorrow',
    err: 'Error', wd: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  },
};
const X = () => D[lang()] || D.uz;
const fd = (s) => fmtDate(s);
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const todayStr = () => new Date().toISOString().slice(0, 10);
const head = (title, ico) => h('div', { class: 'sec-head' }, h('h2', {}, icon(ico, 26), title));
const page = (title, ico, ...body) => h('div', { class: 'container' }, h('section', { class: 'page-block pad0' }, head(title, ico), ...body));
const card = (...c) => h('div', { class: 'panel-card' }, ...c);
const field = (label, input, cls = '') => h('label', { class: cls }, h('span', {}, label), input);
const note = () => h('div', { class: 'form-msg', role: 'status' });
const say = (el, text, ok) => { el.className = `form-msg ${ok ? 'ok' : 'bad'}`; el.textContent = text; };
const errText = (e) => e.message || X().err;

export const parentNavLabel = () => X().nav;
export const parentLinks = () => [['#/cabinet', X().cabinet], ['#/appointment', X().appt], ['#/feedback', X().fb], ['#/menu', X().menu], ['#/bells', X().bells], ['#/documents', X().docs]];
export const parentNavMatch = (h0) => /^#\/(parents|cabinet|appointment|feedback|menu|bells|documents)/.test(h0);

const TILES = () => [['cabinet', 'key', 'cabinet', 'cabSub'], ['appointment', 'calendar', 'appt', 'apptSub'], ['menu', 'utensils', 'menu', 'menuSub'], ['bells', 'bus', 'bells', 'bellsSub'], ['feedback', 'message', 'fb', 'fbSub'], ['documents', 'doc', 'docs', 'docsSub']];

// плитки на главной + замены
export async function homeParentBlock() {
  const x = X();
  const tiles = h('div', { class: 'ptiles' }, TILES().map(([href, ico, t, s]) => h('a', { class: 'ptile', href: `#/${href}` }, icon(ico, 30), h('b', {}, x[t]), h('small', {}, x[s]))));
  let subs = [];
  try { subs = await api('GET', '/api/public/substitutions'); } catch { /* не критично */ }
  const t0 = todayStr();
  const subBox = subs.length ? h('div', { class: 'psubs' }, h('h3', {}, icon('repeat', 20), x.subs),
    h('ul', {}, subs.map((s) => h('li', {}, h('b', {}, `${s.date === t0 ? x.today : x.tomorrow}, ${s.start_time} · ${s.class_name || ''}`), ` ${s.subject}${s.room ? ` (${s.room})` : ''} — ${s.sub_name}`)))) : null;
  return h('div', { class: 'container' }, h('section', { class: 'box parents-box' }, h('div', { class: 'sec-head' }, h('h2', {}, icon('users', 26), x.nav)), tiles, subBox));
}

export const extraViews = {
  async parents() { const x = X(); return page(x.nav, 'users', h('p', { class: 'lead' }, x.hubLead), h('div', { class: 'ptiles' }, TILES().map(([href, ico, t, s]) => h('a', { class: 'ptile', href: `#/${href}` }, icon(ico, 30), h('b', {}, x[t]), h('small', {}, x[s]))))); },

  // ---------- кабинет ----------
  async cabinet() {
    const x = X(), root = h('div'), draw = async (sel) => {
      let kids = [];
      try { kids = await api('GET', '/api/parent/children'); } catch { kids = []; }
      if (!kids.length) { root.replaceChildren(loginCard(draw)); return; }
      const id = sel && kids.find((k) => k.id === sel) ? sel : kids[0].id;
      let o; try { o = await api('GET', `/api/parent/overview?student_id=${id}`); } catch (e) { root.replaceChildren(loginCard(draw, errText(e))); return; }
      root.replaceChildren(await cabinetBody(kids, o, id, draw));
    };
    root.append(h('div', { class: 'empty' }, '…'));
    await draw();
    return page(x.cabinet, 'key', root);
  },

  // ---------- запись на приём ----------
  async appointment() {
    const x = X(), data = await api('GET', '/api/public/appointments/people'), msg = note(), slotsBox = h('div', { class: 'slots' });
    const st = { user: data.people[0]?.id, date: addDays(todayStr(), 1), time: '' };
    const who = h('select', { onchange: (e) => { st.user = Number(e.target.value); load(); } }, data.people.map((p) => h('option', { value: p.id }, `${p.full_name}${p.subject ? ` — ${p.subject}` : ''}`)));
    const dt = h('input', { type: 'date', value: st.date, min: todayStr(), max: addDays(todayStr(), 30), onchange: (e) => { st.date = e.target.value; load(); } });
    const form = h('form', { class: 'apply-form', onsubmit: async (e) => {
      e.preventDefault(); if (!st.time) { say(msg, x.noSlots, false); return; }
      const d = Object.fromEntries(new FormData(form));
      try { const r = await api('POST', '/api/public/appointments', { ...d, user_id: st.user, date: st.date, time: st.time }); form.reset(); st.time = ''; say(msg, `${x.booked}: ${r.with}, ${fd(r.date)} ${r.time}. ${x.wait}`, true); await load(true); } catch (er) { say(msg, errText(er), false); await load(true); }
    } },
    field(x.yourName, h('input', { name: 'name', required: true, maxlength: 100, autocomplete: 'name' })), field(x.phone, h('input', { name: 'phone', type: 'tel', required: true, maxlength: 40, autocomplete: 'tel' })),
    field(x.topic, h('input', { name: 'topic', maxlength: 300 }), 'wide'), h('div', { style: 'position:absolute;left:-9999px', 'aria-hidden': 'true' }, h('input', { name: 'website', tabindex: '-1', autocomplete: 'off' })),
    h('button', { class: 'btn amber', type: 'submit' }, icon('check', 18), x.book));
    async function load(keepMsg) {
      if (!keepMsg) msg.textContent = '';
      if (!st.user) { slotsBox.replaceChildren(h('div', { class: 'empty' }, x.noSlots)); return; }
      try {
        const r = await api('GET', `/api/public/appointments/slots?user_id=${st.user}&date=${st.date}`);
        slotsBox.replaceChildren(r.slots.length ? h('div', { class: 'slot-list' }, r.slots.map((s) => h('button', { type: 'button', class: `slot${st.time === s ? ' on' : ''}`, onclick: () => { st.time = s; slotsBox.querySelectorAll('.slot').forEach((b) => b.classList.toggle('on', b.textContent === s)); } }, s))) : h('div', { class: 'empty' }, x.noSlots));
      } catch (e) { slotsBox.replaceChildren(h('div', { class: 'empty' }, errText(e))); }
    }
    await load();
    return page(x.appt, 'calendar', card(h('div', { class: 'apply-form' }, field(x.pick, who), field(x.date, dt)), h('h3', {}, x.freeSlots), slotsBox, form, msg));
  },

  // ---------- обращения ----------
  async feedback() {
    const x = X(), msg = note(), result = h('div');
    const topic = h('select', { name: 'topic' }, Object.entries(x.fbTopic).map(([k, v]) => h('option', { value: k }, v)));
    const form = h('form', { class: 'apply-form', onsubmit: async (e) => {
      e.preventDefault(); const d = Object.fromEntries(new FormData(form));
      try { const r = await api('POST', '/api/public/feedback', d); form.reset(); msg.textContent = ''; result.replaceChildren(h('div', { class: 'form-msg ok' }, h('b', {}, x.fbSent), h('div', {}, `${x.fbCode}: `, h('span', { class: 'fbcode' }, r.code)), h('small', {}, x.fbKeep))); } catch (er) { say(msg, errText(er), false); }
    } }, field(x.tema, topic), field(x.contact, h('input', { name: 'contact', maxlength: 120 })),
    field(x.message, h('textarea', { name: 'message', rows: 5, required: true, minlength: 5, maxlength: 3000 }), 'wide'), h('div', { style: 'position:absolute;left:-9999px', 'aria-hidden': 'true' }, h('input', { name: 'website', tabindex: '-1', autocomplete: 'off' })),
    h('button', { class: 'btn amber', type: 'submit' }, icon('send', 18), x.send));
    const code = h('input', { maxlength: 12, placeholder: 'F12345678', style: 'text-transform:uppercase' }), look = h('div');
    const check = async () => {
      try { const r = await api('GET', `/api/public/feedback/${encodeURIComponent(code.value.trim())}`); look.replaceChildren(h('div', { class: 'panel-card' }, h('small', {}, `${x.fbTopic[r.topic] || ''} · ${fd(r.created_at)}`), r.answer ? h('div', {}, h('b', {}, `${x.answer}:`), h('p', {}, r.answer)) : h('p', {}, x.noAnswer))); } catch (e) { look.replaceChildren(h('div', { class: 'form-msg bad' }, e.status === 404 ? x.notFound : errText(e))); }
    };
    return page(x.fb, 'message', card(form, msg, result), h('div', { class: 'gap' }), card(h('h3', {}, x.lookup), h('div', { class: 'row-inline' }, code, h('button', { class: 'btn outline', type: 'button', onclick: check }, x.lookup)), look));
  },

  // ---------- меню ----------
  async menu() {
    const x = X(), root = h('div');
    const draw = async (date) => {
      const w = await api('GET', `/api/public/menu${date ? `?date=${date}` : ''}`);
      root.replaceChildren(h('div', { class: 'week-nav' }, h('button', { class: 'btn outline', type: 'button', 'aria-label': '←', onclick: () => draw(addDays(w.week_start, -7)) }, icon('left', 18)), h('b', {}, `${fd(w.week_start)} — ${fd(addDays(w.week_start, 6))}`), h('button', { class: 'btn outline', type: 'button', 'aria-label': '→', onclick: () => draw(addDays(w.week_start, 7)) }, icon('right', 18))),
        w.days.every((d) => !d.breakfast && !d.lunch && !d.snack) ? h('div', { class: 'empty' }, x.noMenu) : h('div', { class: 'menu-grid' }, w.days.map((d, i) => h('div', { class: `panel-card menu-day${d.date === w.today ? ' today' : ''}` }, h('h3', {}, `${x.wd[i]} · ${fd(d.date)}`),
          [['breakfast', d.breakfast], ['lunch', d.lunch], ['snack', d.snack]].map(([k, v]) => v ? h('p', {}, h('b', {}, `${x[k]}: `), v) : null)))));
    };
    await draw();
    return page(x.menu, 'utensils', root);
  },

  // ---------- звонки и подвоз ----------
  async bells() {
    const x = X(), d = await api('GET', '/api/public/bells');
    const shifts = [...new Set(d.bells.map((b) => b.shift))];
    return page(x.bells, 'bus', d.bells.length ? h('div', { class: 'duo-grid' }, shifts.map((s) => card(h('h3', {}, `${s}-${x.shift}`), h('table', { class: 'ptable' }, h('tbody', {}, d.bells.filter((b) => b.shift === s).map((b) => h('tr', {}, h('td', {}, `${b.number}. ${x.lessonNo}`), h('td', {}, `${b.start_time} – ${b.end_time}`)))))))) : h('div', { class: 'empty' }, x.noBells),
      h('div', { class: 'gap' }), h('h3', {}, x.transport), d.transport.length ? h('div', { class: 'duo-grid' }, d.transport.map((r) => card(h('b', {}, r.title), r.description ? h('p', {}, r.description) : null, r.times ? h('p', {}, icon('clock', 16), ` ${r.times}`) : null))) : h('div', { class: 'empty' }, x.noTransport));
  },

  // ---------- документы ----------
  async documents() {
    const x = X(), list = await api('GET', '/api/public/documents'), by = new Map();
    for (const d of list) { const k = d.category || x.other; if (!by.has(k)) by.set(k, []); by.get(k).push(d); }
    const size = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
    return page(x.docs, 'doc', list.length ? [...by.entries()].map(([cat, items]) => card(h('h3', {}, cat), h('ul', { class: 'doc-list' }, items.map((d) => h('li', {}, icon('doc', 22), h('span', {}, h('b', {}, d.title), d.description ? h('small', {}, d.description) : null), h('a', { class: 'btn outline', href: imgUrl(d.file), download: d.original_name || '' }, icon('download', 16), `${x.download} · ${size(d.size)}`)))))) : h('div', { class: 'empty' }, x.noDocs));
  },
};

function loginCard(redraw, err) {
  const x = X(), msg = note(), code = h('input', { name: 'code', required: true, maxlength: 12, autocomplete: 'off', autocapitalize: 'characters', style: 'text-transform:uppercase;letter-spacing:4px;font-size:1.3rem' });
  if (err) say(msg, err, false);
  const f = h('form', { class: 'apply-form', onsubmit: async (e) => { e.preventDefault(); try { await api('POST', '/api/parent/login', { code: code.value }); await redraw(); } catch (er) { say(msg, errText(er), false); } } },
    field(x.code, code, 'wide'), h('p', { class: 'wide muted' }, x.codeHint), h('button', { class: 'btn amber', type: 'submit' }, icon('key', 18), x.enter));
  return card(f, msg);
}

async function cabinetBody(kids, o, id, redraw) {
  const x = X(), st = o.student, root = h('div'), body = h('div');
  let tab = 'grades';
  const stl = { present: ['ok', x.present], absent: ['bad', x.absent], late: ['warn', x.late], excused: ['info', x.excused] };
  const sc = (n) => (n >= 5 ? 'ok' : n === 4 ? 'info' : n === 3 ? 'warn' : 'bad');
  const tabs = [['grades', x.grades], ['att', x.att], ['hw', x.hw], ['sched', x.sched], ['msgs', x.msgs], ['certs', x.certs]];
  const draw = () => {
    tabBar.replaceChildren(...tabs.map(([k, l]) => h('button', { class: `tab${k === tab ? ' on' : ''}`, type: 'button', onclick: () => { tab = k; draw(); } }, l, k === 'msgs' && o.messages.length ? h('i', { class: 'cnt' }, String(o.messages.length)) : null)));
    body.replaceChildren(views[tab]());
  };
  const views = {
    grades: () => (o.subjects.length ? h('table', { class: 'ptable' }, h('thead', {}, h('tr', {}, h('th', {}, x.subject), h('th', {}, x.avg), h('th', {}, x.grades))),
      h('tbody', {}, o.subjects.map((s) => h('tr', {}, h('td', {}, s.subject), h('td', {}, h('span', { class: `sc ${sc(Math.round(s.avg))}` }, String(s.avg))), h('td', {}, s.items.slice(0, 14).map((g) => h('span', { class: `sc ${sc(g.score)}`, title: `${fd(g.date)}${g.comment ? ` · ${g.comment}` : ''}` }, String(g.score)))))))) : h('div', { class: 'empty' }, x.noGrades)),
    att: () => h('div', {}, h('p', { class: 'muted' }, x.last30), h('div', { class: 'att-sum' }, Object.entries(stl).map(([k, [c, l]]) => h('span', { class: `sc ${c}` }, `${l}: ${o.attendance.counts[k]}`))),
      h('div', { class: 'att-days' }, o.attendance.days.map((a) => h('span', { class: `sc ${stl[a.status][0]}`, title: a.note || '' }, `${fd(a.date).slice(0, 5)} ${stl[a.status][1]}`)))),
    hw: () => (o.homework.length ? h('ul', { class: 'plist' }, o.homework.map((w) => h('li', {}, h('b', {}, w.subject), ` — ${w.text}`, h('small', {}, ` (${x.due}: ${fd(w.due_date)})`)))) : h('div', { class: 'empty' }, x.noHw)),
    sched: () => h('div', { class: 'duo-grid' }, [1, 2, 3, 4, 5, 6].map((wd) => { const ls = o.schedule.filter((l) => l.weekday === wd); return ls.length ? card(h('h3', {}, x.wd[wd - 1]), h('table', { class: 'ptable' }, h('tbody', {}, ls.map((l) => h('tr', {}, h('td', {}, l.start_time), h('td', {}, l.subject), h('td', {}, l.room || ''))))))  : null; })),
    msgs: () => (o.messages.length ? h('ul', { class: 'plist' }, o.messages.map((m) => h('li', {}, h('small', {}, `${fd(m.created_at)} `), m.text))) : h('div', { class: 'empty' }, x.noMsgs)),
    certs: () => {
      const msg = note(), kind = h('select', { name: 'kind' }, h('option', { value: 'study' }, x.certStudy), h('option', { value: 'grades' }, x.certGrades)), purpose = h('input', { maxlength: 200 });
      return h('div', {}, h('div', { class: 'apply-form' }, field(x.certReq, kind), field(x.purpose, purpose), h('button', { class: 'btn amber', type: 'button', onclick: async () => { try { await api('POST', '/api/parent/certs', { student_id: id, kind: kind.value, purpose: purpose.value }); o.certs.unshift({ kind: kind.value, status: 'new', created_at: todayStr(), purpose: purpose.value }); draw(); } catch (e) { say(msg, errText(e), false); } } }, icon('send', 18), x.send)), msg,
        o.certs.length ? h('ul', { class: 'plist' }, o.certs.map((c) => h('li', {}, `${fd(c.created_at)} · ${c.kind === 'grades' ? x.certGrades : x.certStudy} — `, h('b', {}, x.status[c.status] || c.status), c.note ? ` (${c.note})` : ''))) : null);
    },
  };
  const tabBar = h('div', { class: 'ptabs' });
  const kidsBar = h('div', { class: 'kids' }, kids.map((k) => h('button', { class: `kid${k.id === id ? ' on' : ''}`, type: 'button', onclick: () => redraw(k.id) }, `${k.full_name}${k.class_name ? ` · ${k.class_name}` : ''}`)));
  const tg = o.student.telegram_linked ? h('div', { class: 'form-msg ok' }, icon('send', 16), ` ${x.tgDone}`) : h('div', { class: 'tg-hint' }, h('b', {}, x.tg), h('p', {}, x.tgText), h('a', { class: 'btn outline', href: '#', onclick: async (e) => { e.preventDefault(); const s = await api('GET', '/api/public/site'); if (s.bot_username) window.open(`https://t.me/${s.bot_username}`, '_blank', 'noopener'); } }, icon('send', 16), 'Telegram'));
  root.append(kidsBar, card(h('div', { class: 'cab-head' }, h('h3', {}, st.full_name, st.class_name ? ` · ${st.class_name}` : ''), o.average != null ? h('span', { class: `sc big ${sc(Math.round(o.average))}` }, `${x.avg}: ${o.average}`) : null), tg, tabBar, body),
    h('div', { class: 'row-inline' }, h('button', { class: 'btn outline', type: 'button', onclick: async () => { await api('POST', '/api/parent/logout'); await redraw(); } }, icon('login', 16), x.logout)));
  draw();
  return root;
}
