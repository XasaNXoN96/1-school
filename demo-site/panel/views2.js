// Дополнительные разделы панели: календарь, заявки, вопросы и ответы, журнал, рейтинг, светофор, экспорт.
import { T, h, api, icon, imgUrl, state, isManager, ROLE, today, thisMonth, fmtD, pill, msg, guard, formPanel, table, tabs, iconBtn, crud } from './ui.js';
import { lang } from '../js/i18n.js';
import { views } from './views.js';

const box = (title, ...c) => h('section', { class: 'panel' }, title ? h('h2', {}, T(title)) : null, ...c);
const MONTHS = () => ({ uz: ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'],
  ru: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] }[lang()]);
const pad = (n) => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;

// ---------- экспорт таблиц: Excel (CSV с BOM) и PDF (печать) ----------
export function exportBar(getRoot, name) {
  const toCsv = () => {
    const tbl = getRoot().querySelector('table'); if (!tbl) return;
    const esc = (v) => `"${String(v).replace(/\s+/g, ' ').trim().replace(/"/g, '""')}"`;
    const rows = [...tbl.querySelectorAll('tr')].map((tr) => [...tr.children].map((c) => esc(c.textContent)).join(';'));
    const a = h('a', { href: URL.createObjectURL(new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' })), download: `${name}-${today()}.csv` });
    document.body.append(a); a.click(); a.remove();
  };
  return h('div', { class: 'row export-bar' }, h('button', { type: 'button', onclick: toCsv }, icon('download', 16), T('Excel (CSV)')),
    h('button', { type: 'button', onclick: () => window.print() }, icon('printer', 16), T('PDF / печать')));
}

// ---------- отчёты: + рейтинг месяца и экспорт ----------
views.rating = async () => {
  const root = h('div'), body = h('div'); let month = thisMonth();
  const draw = async () => {
    const rows = await api('GET', `/api/rating?month=${month}`);
    const medal = ['gold', 'silver', 'bronze'];
    const top = rows.filter((r) => r.score != null).slice(0, 3);
    body.replaceChildren(
      top.length ? h('div', { class: 'podium' }, top.map((r, i) => h('div', { class: `pod p${i + 1}` }, h('span', { class: `medal ${medal[i]}` }, String(i + 1)),
        r.photo ? h('img', { src: imgUrl(r.photo), alt: '' }) : h('span', { class: 'ph' }, icon('user', 28)), h('b', {}, r.full_name), h('small', { class: 'muted' }, r.subject || ''), h('span', { class: 'score' }, `${r.score}%`)))) : null,
      box(null, table([{ label: '№', render: (r) => String(rows.indexOf(r) + 1) }, { label: 'Сотрудник', render: (r) => h('div', {}, h('b', {}, r.full_name), r.subject ? h('div', { class: 'muted' }, r.subject) : null) },
        { label: 'Дисциплина', render: (r) => (r.discipline == null ? '—' : `${r.discipline}%`) }, { label: 'Поручения в срок', render: (r) => (r.tasks == null ? '—' : `${r.tasks}%`) },
        { label: 'Опозданий (дней)', key: 'late_days' }, { label: 'Итог', render: (r) => (r.score == null ? '—' : h('b', {}, `${r.score}%`)) },
        { label: '', render: (r) => (r.score == null ? '' : h('div', { class: 'scorebar' }, h('i', { style: `width:${r.score}%` }))) }], rows, 'Пока пусто')),
      h('p', { class: 'muted' }, T('Итог = 50% дисциплина (приходы без опозданий) + 50% поручения, выполненные в срок.')));
  };
  root.append(h('div', { class: 'row' }, h('input', { type: 'month', value: month, style: 'width:auto', onchange: (e) => { month = e.target.value; draw(); } })), body);
  await draw();
  return root;
};
const baseReports = views.reports;
views.reports = async () => {
  const root = h('div'), body = h('div');
  const pick = async (k) => body.replaceChildren(await views[k]());
  root.append(h('h1', {}, T('Отчёты')), tabs([['attendance', 'Посещаемость'], ['salary', 'Зарплата'], ['taskstats', 'Поручения'], ['rating', 'Рейтинг месяца']], pick),
    exportBar(() => body, 'report'), body);
  await pick('attendance');
  return root;
};
void baseReports;

// ---------- календарь (события, дни рождения, сроки поручений) ----------
const KINDS = ['event', 'meeting', 'competition', 'subbotnik', 'holiday', 'exam', 'other'];
const KIND_RU = { event: 'Мероприятие', meeting: 'Собрание', competition: 'Соревнование', subbotnik: 'Субботник', holiday: 'Праздник', exam: 'Экзамен', other: 'Другое' };
views.calendar = async () => {
  const now = new Date(); let y = now.getFullYear(), m = now.getMonth(), sel = ymd(y, m, now.getDate());
  const root = h('div'), grid = h('div'), dayBox = h('div'), formBox = h('div'), msgBox = h('div');
  let data = { events: [], birthdays: [] }, tasks = [];
  const load = async () => {
    const last = new Date(y, m + 1, 0).getDate();
    [data, tasks] = await Promise.all([api('GET', `/api/events?from=${ymd(y, m, 1)}&to=${ymd(y, m, last)}`), api('GET', '/api/tasks').catch(() => [])]);
  };
  const itemsOf = (date) => [
    ...data.events.filter((e) => e.date === date).map((e) => ({ t: 'ev', kind: e.kind, title: e.title, time: e.time, place: e.place, staff: e.audience === 'staff', ev: e })),
    ...data.birthdays.filter((b) => b.md === date.slice(5)).map((b) => ({ t: 'bd', kind: 'bd', title: `🎂 ${b.full_name}` })),
    ...tasks.filter((k) => k.due_date === date && k.status === 'open').map((k) => ({ t: 'task', kind: 'task', title: `📋 ${k.title}`, place: state.me && isManager() ? k.assignee_name : '' })),
  ];
  const showForm = (ev) => {
    formBox.replaceChildren(formPanel({ title: ev ? 'Редактирование' : 'Новое событие', values: ev || { date: sel, kind: 'event', audience: 'public' },
      fields: [{ name: 'title', label: 'Название', required: true, wide: true }, { name: 'date', label: 'Дата', type: 'date', required: true }, { name: 'time', label: 'Время', type: 'time' },
        { name: 'place', label: 'Место' }, { name: 'kind', label: 'Тип', type: 'select', options: KINDS.map((k) => [k, T(KIND_RU[k])]) },
        { name: 'audience', label: 'Кому показывать', type: 'select', options: [['public', T('Всем (виден на сайте)')], ['staff', T('Только сотрудникам')]] }, { name: 'description', label: 'Описание', type: 'textarea', wide: true }],
      onSubmit: async (d) => { await (ev ? api('PUT', `/api/events/${ev.id}`, d) : api('POST', '/api/events', d)); formBox.replaceChildren(); await draw(); msg(msgBox, T('Сохранено'), true); },
      onCancel: () => formBox.replaceChildren() }));
    formBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  const drawDay = () => {
    const items = itemsOf(sel);
    dayBox.replaceChildren(box(`${fmtD(sel)}`, items.length ? h('ul', { class: 'ev-items' }, items.map((i) => h('li', { class: `k-${i.kind}` }, h('span', { class: 'dot' }),
      h('div', {}, h('b', {}, i.title), h('div', { class: 'muted' }, [i.time, i.place, i.staff ? T('для сотрудников') : ''].filter(Boolean).join(' · '))),
      i.ev && isManager() ? h('span', { class: 'row acts', style: 'margin:0 0 0 auto;flex-wrap:nowrap' }, iconBtn('edit', 'Изменить', () => showForm(i.ev)),
        iconBtn('trash', 'Удалить', () => guard(msgBox, async () => { if (confirm(T('Удалить?'))) { await api('DELETE', `/api/events/${i.ev.id}`); await draw(); } }), 'danger')) : null)))
      : h('div', { class: 'empty' }, T('В этот день ничего нет')), isManager() ? h('button', { class: 'primary', onclick: () => showForm(null) }, icon('plus', 16), T('Добавить событие')) : null));
  };
  const draw = async () => {
    await load();
    const last = new Date(y, m + 1, 0).getDate(), first = (new Date(y, m, 1).getDay() + 6) % 7, cells = [];
    for (let i = 0; i < first; i++) cells.push(h('div', { class: 'cal-c empty' }));
    for (let d = 1; d <= last; d++) {
      const date = ymd(y, m, d), its = itemsOf(date);
      cells.push(h('button', { type: 'button', class: `cal-c${date === sel ? ' sel' : ''}${date === today() ? ' today' : ''}`, onclick: () => { sel = date; draw(); } }, h('span', { class: 'n' }, String(d)),
        its.length ? h('span', { class: 'dots' }, its.slice(0, 4).map((i) => h('i', { class: `k-${i.kind}` }))) : null));
    }
    grid.replaceChildren(h('div', { class: 'cal-top' }, h('button', { type: 'button', 'aria-label': T('Назад'), onclick: () => { m--; if (m < 0) { m = 11; y--; } sel = ymd(y, m, 1); draw(); } }, icon('left', 18)),
      h('h2', {}, `${MONTHS()[m]} ${y}`), h('button', { type: 'button', 'aria-label': T('Вперёд'), onclick: () => { m++; if (m > 11) { m = 0; y++; } sel = ymd(y, m, 1); draw(); } }, icon('right', 18))),
    h('div', { class: 'cal-g' }, [T('Пн'), T('Вт'), T('Ср'), T('Чт'), T('Пт'), T('Сб'), T('Вс')].map((w) => h('div', { class: 'wd' }, w)), cells),
    h('div', { class: 'legend' }, [['event', 'Мероприятие'], ['meeting', 'Собрание'], ['competition', 'Соревнование'], ['subbotnik', 'Субботник'], ['bd', 'День рождения'], ['task', 'Срок поручения']].map(([k, l]) => h('span', { class: `k-${k}` }, h('i'), T(l)))));
    drawDay();
  };
  root.append(h('h1', {}, T('Календарь')), msgBox, h('div', { class: 'cal-wrap' }, h('div', { class: 'panel' }, grid), dayBox), formBox);
  await draw();
  return root;
};

// ---------- заявки с сайта ----------
views.applications = async () => crud({ title: 'Заявки с сайта', canAdd: false, iconOnly: true, load: () => api('GET', '/api/applications'),
  columns: [{ label: 'Кто', render: (a) => h('div', {}, h('b', {}, a.name), h('div', { class: 'muted' }, [a.phone, a.email].filter(Boolean).join(' · '))) },
    { label: 'Тип', render: (a) => pill(T(a.kind === 'admission' ? 'Поступление' : 'Обращение'), a.kind === 'admission' ? 'info' : 'warn') },
    { label: 'Подробности', render: (a) => (a.kind === 'admission' ? `${a.child_name || ''}${a.grade ? `, ${a.grade} ${T('класс')}` : ''}` : h('span', { class: 'clip' }, a.message)) },
    { label: 'Когда', render: (a) => h('span', { class: 'nowrap' }, `${fmtD(a.created_at)} ${String(a.created_at).slice(11, 16)}`) },
    { label: 'Статус', render: (a) => pill(T(a.status === 'new' ? 'Новая' : 'Обработана'), a.status === 'new' ? 'bad' : 'ok') }],
  remove: (a) => api('DELETE', `/api/applications/${a.id}`),
  actions: (a, refresh, m) => [
    a.phone && h('a', { class: 'small btn-link', href: `tel:${a.phone.replace(/[^+\d]/g, '')}`, title: T('Позвонить') }, icon('phone', 14)),
    iconBtn('check', a.status === 'new' ? 'Обработано' : 'Вернуть в новые', () => guard(m, async () => { await api('POST', `/api/applications/${a.id}/done`, { reopen: a.status !== 'new' }); await refresh(); }), a.status === 'new' ? 'primary' : '')] });

// ---------- вопросы и ответы (FAQ на сайте) ----------
views.faq = async () => crud({ title: 'Вопросы и ответы', load: () => api('GET', '/api/faq'),
  columns: [{ label: 'Вопрос', render: (f) => h('div', {}, h('b', {}, f.question), h('div', { class: 'muted' }, String(f.answer).slice(0, 140))) }, { label: '№', key: 'sort' }],
  fields: () => [{ name: 'question', label: 'Вопрос', required: true, wide: true }, { name: 'answer', label: 'Ответ', type: 'textarea', wide: true }, { name: 'sort', label: 'Порядок (0 — первым)', type: 'number', min: 0 }],
  create: (d) => api('POST', '/api/faq', d), update: (f, d) => api('PUT', `/api/faq/${f.id}`, d), remove: (f) => api('DELETE', `/api/faq/${f.id}`) });

// ---------- журнал действий и резервная копия ----------
views.audit = async () => {
  const rows = await api('GET', '/api/audit?limit=200');
  const backup = state.me.role === 'director' ? box('Резервная копия', h('p', { class: 'muted' }, T('Скачайте копию всей базы (сотрудники, новости, посещаемость и т. д.). Храните файл в надёжном месте.')),
    h('a', { class: 'primary-link', href: '/api/backup', download: '' }, icon('database', 16), T('Скачать резервную копию'))) : null;
  return h('div', {}, h('h1', {}, T('Журнал действий')), backup, box(null, table([{ label: 'Когда', render: (r) => h('span', { class: 'nowrap' }, `${fmtD(r.created_at)} ${String(r.created_at).slice(11, 16)}`) },
    { label: 'Кто', key: 'user_name' }, { label: 'Действие', render: (r) => `${T(r.action)}` }, { label: 'Раздел', render: (r) => T(r.target) }], rows, 'Пока пусто')));
};

// ---------- главная: светофор, дни рождения, заявки ----------
const baseDash = views.dashboard;
views.dashboard = async () => {
  const el = await baseDash();
  const [d, ev] = await Promise.all([api('GET', '/api/panel/dashboard'), api('GET', '/api/events').catch(() => ({ birthdays: [] }))]);
  const extra = [];
  if (isManager()) {
    const list = d.today || [];
    const c = { ok: 0, late: 0, bad: 0, wait: 0 };
    for (const r of list) { if (r.status === 'present' && !r.late_minutes) c.ok++; else if (r.status === 'present') c.late++; else if (r.status === 'not_arrived' || r.status === 'absent') c.bad++; else c.wait++; }
    if (list.length) extra.push(h('section', { class: 'panel lights-box' }, h('h2', {}, T('Светофор дня')), h('div', { class: 'lights' },
      [['ok', c.ok, 'Пришли вовремя'], ['late', c.late, 'Опоздали'], ['bad', c.bad, 'Не пришли'], ['wait', c.wait, 'Ещё не начало смены']].map(([k, n, l]) => h('div', { class: `light ${k}` }, h('i'), h('b', {}, String(n)), h('span', {}, T(l)))))));
    if (d.new_applications) extra.push(h('a', { class: 'alert', href: '#/applications' }, icon('mail', 18), `${T('Новых заявок с сайта')}: ${d.new_applications}`));
  }
  const t = new Date(), within = (md) => { const [mo, da] = md.split('-').map(Number); let dt = new Date(t.getFullYear(), mo - 1, da); if (dt < new Date(t.getFullYear(), t.getMonth(), t.getDate())) dt = new Date(t.getFullYear() + 1, mo - 1, da); return Math.round((dt - new Date(t.getFullYear(), t.getMonth(), t.getDate())) / 86400000); };
  const bds = (ev.birthdays || []).map((b) => ({ ...b, in: within(b.md) })).filter((b) => b.in <= 14).sort((a, b) => a.in - b.in);
  if (bds.length) extra.push(h('section', { class: 'panel bd-box' }, h('h2', {}, icon('cake', 20), T('Дни рождения')), h('div', { class: 'bd-list' },
    bds.map((b) => h('span', { class: `bd${b.in === 0 ? ' now' : ''}` }, `🎂 ${b.full_name}`, h('small', {}, b.in === 0 ? T('сегодня!') : b.in === 1 ? T('завтра') : `${T('через')} ${b.in} ${T('дн')}`))))));
  if (extra.length) el.prepend(...extra);
  return el;
};

// ---------- объявления для сотрудников: «прочитано» ----------
const baseAnn = views.announcements;
views.announcements = async () => {
  if (isManager()) return baseAnn();
  const [list, reads] = await Promise.all([api('GET', '/api/announcements'), api('GET', '/api/announcements/reads')]);
  const mine = new Set(reads.mine);
  const root = h('div', {}, h('h1', {}, T('Объявления')));
  if (!list.length) root.append(h('div', { class: 'empty' }, T('Объявлений пока нет')));
  for (const a of list) {
    const card = box(null), draw = () => card.replaceChildren(h('h3', { style: 'margin:0 0 6px' }, a.title, mine.has(a.id) ? null : pill(T('новое'), 'bad')), h('div', { class: 'muted' }, `${fmtD(a.created_at)} · ${a.author_name || ''}`), h('p', {}, a.body),
      mine.has(a.id) ? h('span', { class: 'tag ok' }, icon('check', 14), T('Прочитано')) : h('button', { class: 'primary small', onclick: async () => { await api('POST', `/api/announcements/${a.id}/read`); mine.add(a.id); draw(); } }, icon('check', 14), T('Отметить прочитанным')));
    draw(); root.append(card);
  }
  return root;
};
