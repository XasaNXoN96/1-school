'use strict';
// Лёгкая версия сайта без JavaScript — для кнопочных телефонов, старых браузеров (Opera Mini и т. п.)
// и очень медленного интернета. Вся разметка собирается на сервере, весь текст экранируется.
const { getSettings } = require('./db');

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const L = {
  uz: { home: 'Bosh sahifa', news: 'Yangiliklar', events: 'Tadbirlar', about: 'Maktab haqida', contacts: 'Kontakt', full: "To'liq sayt", back: 'Orqaga',
    call: "Qo'ng'iroq qilish", addr: 'Manzil', phone: 'Telefon', hours: 'Ish vaqti', empty: "Hozircha ma'lumot yo'q", admission: 'Qabul', admissionText: "Birinchi sinfga qabul uchun maktabga qo'ng'iroq qiling yoki keling.", upcoming: 'Yaqin tadbirlar' },
  ru: { home: 'Главная', news: 'Новости', events: 'События', about: 'О школе', contacts: 'Контакты', full: 'Полная версия', back: 'Назад',
    call: 'Позвонить', addr: 'Адрес', phone: 'Телефон', hours: 'Время работы', empty: 'Пока нет данных', admission: 'Поступление', admissionText: 'Для поступления в 1-й класс позвоните в школу или приходите лично.', upcoming: 'Ближайшие события' },
  en: { home: 'Home', news: 'News', events: 'Events', about: 'About', contacts: 'Contacts', full: 'Full site', back: 'Back',
    call: 'Call', addr: 'Address', phone: 'Phone', hours: 'Opening hours', empty: 'Nothing yet', admission: 'Admission', admissionText: 'To enrol in grade 1, call the school or visit us.', upcoming: 'Upcoming events' },
};

function renderLite(db, pathname, langParam) {
  const lang = L[langParam] ? langParam : 'uz', t = L[lang], q = lang === 'uz' ? '' : `?lang=${lang}`;
  const s = getSettings(db), all = (sql, ...p) => db.prepare(sql).all(...p), one = (sql, ...p) => db.prepare(sql).get(...p);
  const parts = pathname.replace(/^\/lite\/?/, '').split('/').filter(Boolean);
  const link = (href, label) => `<a href="/lite${href}${q}">${esc(label)}</a>`;
  const para = (txt) => String(txt || '').split(/\n{1,}/).filter(Boolean).map((x) => `<p>${esc(x)}</p>`).join('');
  let title = s.school_name, body = '';
  const day = (d) => esc(String(d).slice(0, 10));

  if (!parts.length) {
    const news = all("SELECT id, title, created_at FROM news WHERE published=1 AND kind='news' ORDER BY created_at DESC, id DESC LIMIT 5");
    const ev = all("SELECT title, date, time FROM events WHERE audience='public' AND date >= date('now') ORDER BY date, time LIMIT 4");
    body = `<p>${esc(s.motto)}</p><h2>${esc(t.news)}</h2>${news.length ? `<ul>${news.map((n) => `<li>${link(`/news/${n.id}`, n.title)} <small>${day(n.created_at)}</small></li>`).join('')}</ul>` : `<p>${esc(t.empty)}</p>`}`
      + `<h2>${esc(t.upcoming)}</h2>${ev.length ? `<ul>${ev.map((e) => `<li><b>${day(e.date)}${e.time ? ' ' + esc(e.time) : ''}</b> — ${esc(e.title)}</li>`).join('')}</ul>` : `<p>${esc(t.empty)}</p>`}`
      + `<h2>${esc(t.admission)}</h2><p>${esc(t.admissionText)}</p>${s.phone ? `<p><a href="tel:${esc(s.phone.replace(/[^+\d]/g, ''))}">${esc(t.call)}: ${esc(s.phone)}</a></p>` : ''}`;
  } else if (parts[0] === 'news' && parts[1]) {
    const n = one('SELECT title, body, created_at FROM news WHERE id=? AND published=1', parts[1]);
    if (!n) return null;
    title = n.title; body = `<p><small>${day(n.created_at)}</small></p>${para(n.body)}<p>${link('/news', t.back)}</p>`;
  } else if (parts[0] === 'news') {
    const news = all("SELECT id, title, created_at FROM news WHERE published=1 ORDER BY created_at DESC, id DESC LIMIT 30");
    title = t.news; body = news.length ? `<ul>${news.map((n) => `<li>${link(`/news/${n.id}`, n.title)} <small>${day(n.created_at)}</small></li>`).join('')}</ul>` : `<p>${esc(t.empty)}</p>`;
  } else if (parts[0] === 'events') {
    const ev = all("SELECT title, description, date, time, place FROM events WHERE audience='public' AND date >= date('now','-7 day') ORDER BY date, time LIMIT 60");
    title = t.events; body = ev.length ? `<ul>${ev.map((e) => `<li><b>${day(e.date)}${e.time ? ' ' + esc(e.time) : ''}</b> — ${esc(e.title)}${e.place ? `, ${esc(e.place)}` : ''}</li>`).join('')}</ul>` : `<p>${esc(t.empty)}</p>`;
  } else if (parts[0] === 'about') {
    const p = one("SELECT title, body FROM pages WHERE slug='about'");
    title = t.about; body = para(p?.body);
  } else if (parts[0] === 'contacts') {
    title = t.contacts;
    body = `${s.address ? `<p><b>${esc(t.addr)}:</b> ${esc(s.address)}</p>` : ''}${s.phone ? `<p><b>${esc(t.phone)}:</b> <a href="tel:${esc(s.phone.replace(/[^+\d]/g, ''))}">${esc(s.phone)}</a></p>` : ''}${s.work_hours ? `<p><b>${esc(t.hours)}:</b> ${esc(s.work_hours)}</p>` : ''}${s.email ? `<p><a href="mailto:${esc(s.email)}">${esc(s.email)}</a></p>` : ''}`;
  } else return null;

  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)} — ${esc(s.school_name)}</title>
<style>body{font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:1.5;margin:0;color:#111;background:#fff}header,main,footer{max-width:42em;margin:0 auto;padding:12px 14px}header{background:#0a2c75;color:#fff}header a{color:#fff}h1{font-size:1.4em;margin:.2em 0}h2{font-size:1.2em;color:#0a2c75}nav a{display:inline-block;margin:6px 10px 6px 0;padding:6px 10px;background:#fff;color:#0a2c75;text-decoration:none;font-weight:bold}li{margin:8px 0}a{color:#0a2c75}small{color:#555}footer{border-top:1px solid #ccc;font-size:.9em}</style></head>
<body><header><h1>${esc(s.school_name)}</h1><nav>${link('', t.home)}${link('/news', t.news)}${link('/events', t.events)}${link('/about', t.about)}${link('/contacts', t.contacts)}</nav></header>
<main><h2>${esc(title)}</h2>${body}</main><footer><a href="/">${esc(t.full)}</a> · <a href="/lite">UZ</a> <a href="/lite?lang=ru">RU</a> <a href="/lite?lang=en">EN</a></footer></body></html>`;
}

module.exports = { renderLite };
