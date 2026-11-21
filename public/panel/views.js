import { T, h, api, icon, imgUrl, state, isManager, ROLE, fmtMoney, today, thisMonth, fmtD, WEEKDAYS, tag, pill, msg, guard, modal, field, readForm,
  formPanel, table, tabs, iconBtn, crud } from './ui.js';
import { lang } from '/js/i18n.js';

export const views = {};
const MONTHS = () => ({ uz: ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'],
  ru: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] }[lang()]);
const go = (hash) => { location.hash = hash; };

const statCard = (ico, value, label, tone) => h('div', { class: `stat-card ${tone}` }, icon(ico, 30), h('div', {}, h('b', {}, String(value)), h('span', {}, T(label))));
const quick = (ico, label, hash) => h('a', { class: 'quick', href: `#/${hash}` }, icon(ico, 26), h('span', {}, T(label)));
const box = (title, ...children) => h('section', { class: 'panel' }, title ? h('h2', {}, T(title)) : null, ...children);

// ---------- превью ----------
export function previewNews(n) {
  return h('article', { class: 'preview' }, n.cover ? h('img', { src: imgUrl(n.cover), alt: '' }) : null, h('h2', {}, n.title), h('div', { class: 'muted' }, fmtD(n.created_at)),
    n.summary ? h('p', {}, h('i', {}, n.summary)) : null, String(n.body || '').split(/\n{2,}/).filter(Boolean).map((p) => h('p', {}, p)));
}
export function previewAchievement(a) {
  const who = a.kind === 'student' ? `${a.student_name || ''} ${a.class_name || ''}` : a.teacher_name;
  return h('article', { class: 'preview' }, a.photo ? h('img', { src: imgUrl(a.photo), alt: '' }) : h('div', { class: 'muted' }, T('Фото не загружено')),
    h('h2', {}, a.title), h('div', {}, pill(a.kind === 'student' ? T('Ученик') : T('Сотрудник')), ' ', who), h('div', { class: 'muted' }, fmtD(a.date)), h('p', {}, a.description));
}

// ---------- календарь «Мои планы» ----------
function calendar({ month, plans, selected, onSelect, onMonth }) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)), lead = (first.getUTCDay() + 6) % 7, days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const has = new Set(plans.map((p) => p.date)), cells = [];
  for (let i = 0; i < lead; i++) cells.push(h('i'));
  for (let d = 1; d <= days; d++) {
    const date = `${month}-${String(d).padStart(2, '0')}`;
    cells.push(h('button', { type: 'button', class: `day${date === today() ? ' today' : ''}${date === selected ? ' sel' : ''}${has.has(date) ? ' has' : ''}`, onclick: () => onSelect(date) }, String(d)));
  }
  const shift = (k) => { const d = new Date(Date.UTC(y, m - 1 + k, 1)); onMonth(d.toISOString().slice(0, 7)); };
  return h('div', { class: 'cal' }, h('div', { class: 'cal-head' }, h('button', { class: 'small', onclick: () => shift(-1), 'aria-label': '<' }, icon('left', 16)), h('b', {}, `${MONTHS()[m - 1]} ${y}`), h('button', { class: 'small', onclick: () => shift(1), 'aria-label': '>' }, icon('right', 16))),
    h('div', { class: 'cal-grid' }, WEEKDAYS().map((d) => h('small', {}, d)), cells));
}

views.plans = async ({ compact } = {}) => {
  let month = thisMonth(), selected = today(), plans = [];
  const root = h('div'), msgBox = h('div'), calBox = h('div'), listBox = h('div');
  const load = async () => { plans = await api('GET', `/api/plans?month=${month}`); draw(); };
  const draw = () => {
    calBox.replaceChildren(calendar({ month, plans, selected, onSelect: (d) => { if (compact) return go('#/plans'); selected = d; draw(); }, onMonth: (mo) => { month = mo; selected = `${mo}-01`; load(); } }));
    if (compact) return;
    const day = plans.filter((p) => p.date === selected);
    listBox.replaceChildren(box(`${T('Планы на')} ${fmtD(selected)}`,
      day.length ? day.map((p) => h('div', { class: 'plan-row' }, h('input', { type: 'checkbox', checked: !!p.done, onchange: () => guard(msgBox, async () => { await api('POST', `/api/plans/${p.id}/toggle`); await load(); }) }),
        h('span', { class: p.done ? 'done' : '' }, h('b', {}, p.time), ' ', p.title), h('span', { class: 'spacer' }), iconBtn('trash', 'Удалить', () => guard(msgBox, async () => { await api('DELETE', `/api/plans/${p.id}`); await load(); }), 'danger')))
        : h('div', { class: 'muted' }, T('На этот день планов нет')),
      formPanel({ title: null, submitLabel: 'Добавить', fields: [{ name: 'title', label: 'Что нужно сделать', required: true, wide: true }, { name: 'time', label: 'Время напоминания', type: 'time', default: '09:00' }],
        onSubmit: async (d) => { await api('POST', '/api/plans', { ...d, date: selected }); await load(); } }),
      h('p', { class: 'muted' }, T('Напоминание придёт в Telegram-бот и в уведомления панели.'))));
  };
  if (compact) { await load(); return box('Мой план', calBox); }
  root.append(h('h1', {}, T('Мои планы')), msgBox, h('div', { class: 'two' }, box(null, calBox), listBox));
  await load();
  return root;
};

// ---------- главная ----------
views.dashboard = async () => {
  const d = await api('GET', '/api/panel/dashboard');
  const me = state.me;
  if (isManager()) {
    const c = d.counts;
    return h('div', {},
      h('div', { class: 'stats' }, statCard('users', c.students, 'Всего учеников', 'blue'), statCard('cap', c.teachers, 'Учителя', 'green'), statCard('users', c.staff, 'Сотрудники', 'orange'),
        statCard('news', c.news, 'Новости', 'violet'), statCard('trophy', c.achievements, 'Достижения', 'amber')),
      d.tasks_overdue ? h('a', { class: 'alert', href: '#/reports' }, icon('clipboard', 18), `${T('Поручений не выполнено в срок')}: ${d.tasks_overdue}`) : null,
      d.pending_achievements ? h('a', { class: 'alert', href: '#/achievements' }, icon('trophy', 18), `${T('Достижений ждут подтверждения')}: ${d.pending_achievements}`) : null,
      h('div', { class: 'two' },
        box('Последние новости', d.recent_news.length ? d.recent_news.map((n) => h('a', { class: 'news-mini', href: '#/news' },
          n.cover ? h('img', { src: imgUrl(n.cover), alt: '' }) : h('span', { class: 'ph' }, icon('news', 20)), h('span', {}, h('b', {}, n.title), h('small', {}, fmtD(n.created_at), ' ', n.published ? '' : pill(T('черновик'), 'warn'))))) : h('div', { class: 'empty' }, T('Новостей пока нет'))),
        box('Быстрые действия', h('div', { class: 'quicks' }, quick('news', 'Добавить новость', 'news'), quick('megaphone', 'Разместить объявление', 'announcements'), quick('image', 'Загрузить фото', 'media'),
          quick('user', 'Добавить сотрудника', 'users'), quick('edit', 'Редактировать страницы', 'pages'), quick('chart', 'Посмотреть отчёты', 'reports')))),
      box(d.holiday != null ? `${T('Сегодня праздник')}: ${d.holiday || '—'}` : 'Кто сегодня на работе',
        table([{ label: 'Сотрудник', key: 'full_name' }, { label: 'Смена', render: (r) => `${r.shift_start}–${r.shift_end}` }, { label: 'Статус', render: (r) => tag(r.status) }, { label: 'Приход', key: 'check_in' }, { label: 'Уход', key: 'check_out' },
          { label: 'Опоздание', render: (r) => (r.late_minutes ? `${r.late_minutes} ${T('мин')}` : '') }], d.today, 'Сегодня нет сотрудников по графику')));
  }
  const m = d.my_today, c = d.counts;
  return h('div', {},
    h('div', { class: 'stats' }, statCard('book', c.lessons_week, 'Мои уроки (в неделю)', 'blue'), statCard('users', c.students, 'Ученики', 'green'), statCard('clipboard', d.open_tasks, 'Поручения', 'orange'), statCard('calendar', d.lessons_today.length, 'Уроки сегодня', 'violet')),
    h('div', { class: 'two' },
      box('Уроки сегодня', d.lessons_today.length ? d.lessons_today.map((l) => h('div', { class: 'lesson' }, h('span', { class: 'chip-n' }, `${l.number}-${T('урок')}`), h('b', {}, `${l.class_name} — ${l.subject}`), h('span', { class: 'spacer' }), h('span', { class: 'muted' }, `${l.start_time}–${l.end_time}`)))
        : h('div', { class: 'empty' }, T('Сегодня уроков нет')),
      h('p', { class: 'muted' }, m ? `${T('Приход')}: ${m.check_in || '—'}, ${T('уход')}: ${m.check_out || '—'}${m.late_minutes ? `, ${T('опоздание')} ${m.late_minutes} ${T('мин')}` : ''}` : T('Приход и уход отмечаются в Telegram-боте по геолокации.'))),
      box('Быстрые действия', h('div', { class: 'quicks' }, quick('calendar', 'Расписание', 'lessons'), quick('clipboard', 'Поручения', 'tasks'), quick('trophy', 'Добавить достижение', 'achievements'), quick('clock', 'Добавить план', 'plans')))),
    h('div', { class: 'two' },
      box('Последние сообщения', d.notices.length ? d.notices.slice(0, 5).map((n) => h('div', { class: `notice${n.read ? '' : ' unread'}` }, n.text, h('small', { class: 'muted' }, ' ', n.created_at.slice(0, 16)))) : h('div', { class: 'empty' }, T('Нет уведомлений'))),
      await views.plans({ compact: true })));
};

// ---------- посещаемость и зарплата ----------
views.attendance = async () => {
  const root = h('div'), msgBox = h('div'), body = h('div');
  let userId = state.me.id, month = thisMonth(), people = [];
  if (isManager()) { people = (await api('GET', '/api/users')).filter((u) => u.role !== 'director'); people.sort((a, b) => (b.role === 'teacher') - (a.role === 'teacher')); if (people.length) userId = people[0].id; }
  const draw = () => guard(msgBox, async () => {
    const r = await api('GET', `/api/attendance?month=${month}&user_id=${userId}`);
    body.replaceChildren(
      box(null, h('div', { class: 'stat-line' }, h('div', {}, h('b', {}, r.present), T('пришёл')), h('div', {}, h('b', {}, r.excused), T('уважительно')), h('div', {}, h('b', {}, r.absent), T('не пришёл')),
        h('div', {}, h('b', {}, r.late_count), `${T('опозданий')} (${r.late_minutes} ${T('мин')})`), h('div', {}, h('b', {}, r.scheduled), T('рабочих дней')))),
      box(null, table([{ label: 'Дата', render: (d) => fmtD(d.date) }, { label: 'Статус', render: (d) => tag(d.status) }, { label: 'Приход', key: 'check_in' }, { label: 'Уход', key: 'check_out' },
        { label: 'Опоздание', render: (d) => (d.late_minutes ? `${d.late_minutes} ${T('мин')}` : '') }, { label: 'Ранний уход', render: (d) => (d.early_minutes ? `${d.early_minutes} ${T('мин')}` : '') }, { label: 'Заметка', key: 'note' }],
      r.days.filter((d) => d.status !== 'off' || d.holiday), '—')));
  });
  root.append(h('div', { class: 'row' }, isManager() && h('select', { style: 'width:auto', onchange: (e) => { userId = e.target.value; draw(); } }, people.map((u) => h('option', { value: u.id }, `${u.full_name} (${ROLE()[u.role]})`))),
    h('input', { type: 'month', value: month, style: 'width:auto', onchange: (e) => { month = e.target.value; draw(); } })), msgBox, body);
  if (isManager() && people.length) {
    root.append(formPanel({ title: 'Ручная отметка (болезнь, командировка, сбой бота)', submitLabel: 'Отметить',
      fields: [{ name: 'date', label: 'Дата', type: 'date', required: true, default: today() }, { name: 'status', label: 'Статус', type: 'select', options: [['excused', T('Уважительная причина (оплачивается)')], ['present', T('Пришёл')], ['absent', T('Не пришёл')]] }, { name: 'note', label: 'Заметка', wide: true }],
      onSubmit: async (d) => { await api('POST', '/api/attendance/mark', { ...d, user_id: userId }); await draw(); } }));
  }
  await draw();
  return root;
};

views.salary = async () => {
  const root = h('div'), msgBox = h('div'), body = h('div');
  let month = thisMonth();
  const draw = () => guard(msgBox, async () => {
    const rows = await api('GET', `/api/salary?month=${month}`);
    body.replaceChildren(box(null, table([{ label: 'Сотрудник', key: 'full_name' }, { label: 'Оклад', render: (r) => fmtMoney(r.base) }, { label: 'Раб. дней', key: 'scheduled' }, { label: 'Пришёл', key: 'present' }, { label: 'Уваж.', key: 'excused' },
      { label: 'Не пришёл', key: 'absent' }, { label: 'Опозданий', key: 'late_count' }, { label: 'За день', render: (r) => fmtMoney(r.per_day) }, { label: 'К выплате', render: (r) => h('b', {}, fmtMoney(r.earned)) }], rows),
    isManager() ? h('p', {}, `${T('Итого к выплате')}: `, h('b', {}, fmtMoney(rows.reduce((a, r) => a + r.earned, 0)))) : null,
    h('p', { class: 'muted' }, T('Расчёт: оклад ÷ рабочие дни месяца × дни «пришёл» и «уважительно». Для текущего месяца — сумма на сегодня.'))));
  });
  root.append(h('div', { class: 'row' }, h('input', { type: 'month', value: month, style: 'width:auto', onchange: (e) => { month = e.target.value; draw(); } })), msgBox, body);
  await draw();
  return root;
};

views.reports = async () => {
  const root = h('div'), body = h('div');
  const pick = async (k) => body.replaceChildren(await views[k]());
  root.append(h('h1', {}, T('Отчёты')), tabs([['attendance', 'Посещаемость'], ['salary', 'Зарплата'], ['taskstats', 'Поручения']], pick), body);
  await pick('attendance');
  return root;
};

// ---------- поручения ----------
const OUTCOME = { on_time: ['В срок', 'ok'], late: ['С опозданием', 'warn'], overdue: ['Не выполнено', 'bad'], open: ['В работе', 'info'] };
const outcomePill = (o) => pill(T(OUTCOME[o]?.[0] || o), OUTCOME[o]?.[1] || '');
const sumStats = (rows) => rows.reduce((a, r) => ({ total: a.total + r.total, on_time: a.on_time + r.on_time, late: a.late + r.late, overdue: a.overdue + r.overdue, open: a.open + r.open }), { total: 0, on_time: 0, late: 0, overdue: 0, open: 0 });
const statRow = (t) => h('div', { class: 'stats five' }, statCard('clipboard', t.total, 'Всего поручений', 'blue'), statCard('check', t.on_time, 'Выполнено в срок', 'green'),
  statCard('clock', t.late, 'Выполнено с опозданием', 'orange'), statCard('close', t.overdue, 'Не выполнено', 'red'), statCard('list', t.open, 'В работе', 'violet'));
const rateBar = (r) => h('div', { class: 'ratebar', title: r.rate == null ? '' : `${r.rate}%` }, r.total ? [['on_time', 'ok'], ['late', 'warn'], ['overdue', 'bad'], ['open', 'info']].map(([k, c]) => (r[k] ? h('i', { class: c, style: `flex:${r[k]}` }) : null)) : null);

views.tasks = async () => {
  const users = isManager() ? await api('GET', '/api/users') : [];
  const wrap = h('div');
  const sumBox = h('div');
  const refreshStats = async () => sumBox.replaceChildren(statRow(sumStats(await api('GET', '/api/tasks/stats'))));
  await refreshStats();
  const list = await crud({ title: 'Поручения', load: () => api('GET', '/api/tasks'), canAdd: isManager(),
    columns: [{ label: 'Поручение', render: (t) => h('div', {}, h('b', {}, t.title), t.description ? h('div', { class: 'muted' }, t.description) : null) }, { label: 'Исполнитель', key: 'assignee_name' }, { label: 'Срок', render: (t) => fmtD(t.due_date) },
      { label: 'Статус', render: (t) => outcomePill(t.outcome) }],
    fields: () => [{ name: 'assignee_id', label: 'Исполнитель', type: 'select', options: users.map((u) => [u.id, `${u.full_name} (${ROLE()[u.role]})`]) }, { name: 'title', label: 'Поручение', required: true, wide: true },
      { name: 'description', label: 'Описание', type: 'textarea', wide: true }, { name: 'due_date', label: 'Срок', type: 'date' }],
    create: async (d) => { const r = await api('POST', '/api/tasks', d); refreshStats(); return r; }, remove: isManager() ? async (t) => { const r = await api('DELETE', `/api/tasks/${t.id}`); refreshStats(); return r; } : null,
    actions: (t, refresh, m) => t.status === 'open' && iconBtn('check', 'Выполнено', () => guard(m, async () => { await api('POST', `/api/tasks/${t.id}/done`); await refresh(); refreshStats(); }), 'primary') });
  // сводка над списком
  const hd = list.querySelector('h1'); if (hd) (hd.closest('.head') || hd).after(sumBox); else list.prepend(sumBox);
  wrap.append(list);
  return wrap;
};

// ---------- отчёт по поручениям ----------
views.taskstats = async () => {
  const rows = await api('GET', '/api/tasks/stats');
  return h('div', {}, statRow(sumStats(rows)), box(null, table([
    { label: 'Сотрудник', render: (r) => h('div', {}, h('b', {}, r.full_name), r.subject ? h('div', { class: 'muted' }, r.subject) : null) },
    { label: 'Всего поручений', key: 'total' }, { label: 'Выполнено в срок', render: (r) => pill(String(r.on_time), 'ok') }, { label: 'Выполнено с опозданием', render: (r) => pill(String(r.late), 'warn') },
    { label: 'Не выполнено', render: (r) => pill(String(r.overdue), r.overdue ? 'bad' : '') }, { label: 'В работе', key: 'open' },
    { label: 'В срок, %', render: (r) => (r.rate == null ? '—' : h('b', {}, `${r.rate}%`)) }, { label: '', render: rateBar }], rows, 'Пока пусто')));
};


// ---------- статистика (только руководство) ----------
const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, ...kids) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); for (const c of kids) e.append(c.nodeType ? c : document.createTextNode(String(c))); return e; };
const monthLabel = (d) => `${String(d).slice(5, 7)}.${String(d).slice(2, 4)}`;
function lineChart(pts, { color = '#1d55c8', unit = '', min, max, w = 520, hgt = 220 } = {}) {
  const padL = 52, padR = 22, padT = 28, padB = 34, iw = w - padL - padR, ih = hgt - padT - padB;
  const vals = pts.map((p) => p.value); let lo = min ?? Math.min(...vals), hi = max ?? Math.max(...vals);
  if (min == null) { const span = hi - lo || Math.max(1, hi * 0.2); lo = Math.max(0, lo - span * 0.5); hi += span * 0.35; if (unit === '%') hi = Math.min(100, hi); }
  const x = (i) => padL + (pts.length === 1 ? iw / 2 : (i * iw) / (pts.length - 1)), y = (v) => padT + ((hi - v) * ih) / (hi - lo || 1);
  const root = svg('svg', { viewBox: `0 0 ${w} ${hgt}`, class: 'chart', role: 'img', 'aria-hidden': 'true' });
  for (let g = 0; g <= 3; g++) {
    const v = lo + ((hi - lo) * g) / 3, yy = y(v);
    root.append(svg('line', { x1: padL, x2: w - padR, y1: yy, y2: yy, stroke: '#e3e9f4', 'stroke-width': 1 }), svg('text', { x: padL - 8, y: yy + 4, 'text-anchor': 'end', 'font-size': 11, fill: '#8a97ad' }, Math.round(v)));
  }
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  root.append(svg('path', { d: `${line} L${x(pts.length - 1).toFixed(1)} ${hgt - padB} L${x(0).toFixed(1)} ${hgt - padB} Z`, fill: color, opacity: 0.1 }), svg('path', { d: line, fill: 'none', stroke: color, 'stroke-width': 3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  pts.forEach((p, i) => root.append(svg('circle', { cx: x(i), cy: y(p.value), r: 4.5, fill: '#fff', stroke: color, 'stroke-width': 3 }),
    svg('text', { x: x(i), y: y(p.value) - 11, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700, fill: '#10274f' }, `${p.value}${unit}`),
    svg('text', { x: x(i), y: hgt - 10, 'text-anchor': 'middle', 'font-size': 11, fill: '#8a97ad' }, p.label)));
  return root;
}
const deltaPill = (a, b, unit = '') => { const d = b - a; return pill(`${d > 0 ? '▲ +' : d < 0 ? '▼ ' : '● '}${d}${unit}`, d > 0 ? 'ok' : d < 0 ? 'bad' : ''); };
const growthPct = (a, b) => (a ? Math.round(((b - a) / a) * 100) : 0);

views.stats = async () => {
  const root = h('div'), body = h('div');
  const pick = async (k) => body.replaceChildren(await statsViews[k]());
  root.append(h('h1', {}, T('Статистика')), tabs([['overview', 'Обзор'], ['school', 'Ученики и учителя (данные)'], ['mastery', 'Усвоение предметов (данные)']], pick), body);
  await pick('overview');
  return root;
};

const statsViews = {
  async overview() {
    const st = await api('GET', '/api/stats');
    const sc = st.school, first = sc[0], last = sc[sc.length - 1];
    const bySubj = {}; for (const m of st.mastery) (bySubj[m.subject] ||= []).push(m);
    const dates = [...new Set(st.mastery.map((m) => m.date))].sort();
    const avg = dates.map((dt) => { const v = st.mastery.filter((m) => m.date === dt).map((m) => m.percent); return { label: monthLabel(dt), value: Math.round(v.reduce((a, b) => a + b, 0) / v.length) }; });
    const cards = last ? h('div', { class: 'stats' },
      statCard('users', last.students, 'Учеников сейчас', 'blue'), statCard('trend', `${growthPct(first.students, last.students) >= 0 ? '+' : ''}${growthPct(first.students, last.students)}%`, 'Рост числа учеников', 'green'),
      statCard('cap', last.teachers, 'Учителей сейчас', 'violet'), statCard('user', `${last.teachers - first.teachers >= 0 ? '+' : ''}${last.teachers - first.teachers}`, 'Новых учителей', 'orange'), statCard('book', avg.length ? `${avg[avg.length - 1].value}%` : '—', 'Среднее усвоение', 'amber')) : null;
    const trendBox = (title, key, color) => box(title, sc.length ? h('div', {}, h('div', { class: 'chart-head' }, h('b', {}, `${first[key]} → ${last[key]}`), deltaPill(first[key], last[key])),
      lineChart(sc.map((r) => ({ label: monthLabel(r.date), value: r[key] })), { color })) : h('div', { class: 'empty' }, T('Пока пусто')));
    const subjCards = Object.entries(bySubj).map(([name, arr]) => {
      const a = arr[0].percent, b = arr[arr.length - 1].percent, color = b >= a ? '#2e9e62' : '#d6473d';
      return h('section', { class: 'panel subj' }, h('div', { class: 'chart-head' }, h('b', {}, name), h('span', {}, `${a}% → ${b}%`), deltaPill(a, b, '%')),
        lineChart(arr.map((m) => ({ label: monthLabel(m.date), value: m.percent })), { color, unit: '%', w: 360, hgt: 180 }));
    });
    return h('div', {}, cards,
      h('div', { class: 'two' }, trendBox('Динамика числа учеников', 'students', '#1d55c8'), trendBox('Динамика числа учителей', 'teachers', '#6a4fd8')),
      avg.length ? box('Среднее усвоение по всем предметам', lineChart(avg, { color: '#d9801a', unit: '%', w: 760, hgt: 220 })) : null,
      h('h2', { class: 'sec' }, T('Усвоение по предметам')), subjCards.length ? h('div', { class: 'subj-grid' }, subjCards) : h('div', { class: 'empty' }, T('Пока пусто')));
  },
  school: async () => crud({ title: 'Ученики и учителя', hideTitle: true, load: () => api('GET', '/api/stats').then((s) => [...s.school].reverse()),
    columns: [{ label: 'Дата', render: (r) => fmtD(r.date) }, { label: 'Учеников', key: 'students' }, { label: 'Учителей', key: 'teachers' }, { label: 'Сотрудники', key: 'staff' }],
    fields: () => [{ name: 'date', label: 'Дата', type: 'date', required: true, default: today() }, { name: 'students', label: 'Учеников', type: 'number', min: 0, required: true }, { name: 'teachers', label: 'Учителей', type: 'number', min: 0, required: true }, { name: 'staff', label: 'Сотрудники', type: 'number', min: 0 }],
    create: (d) => api('POST', '/api/stats/school', d), remove: (r) => api('DELETE', `/api/stats/school/${r.date}`) }),
  mastery: async () => crud({ title: 'Усвоение предметов', hideTitle: true, load: () => api('GET', '/api/stats').then((s) => [...s.mastery].sort((a, b) => b.date.localeCompare(a.date) || a.subject.localeCompare(b.subject))),
    columns: [{ label: 'Дата', render: (r) => fmtD(r.date) }, { label: 'Предмет', key: 'subject' }, { label: 'Усвоение, %', render: (r) => `${r.percent}%` }],
    fields: () => [{ name: 'date', label: 'Дата', type: 'date', required: true, default: today() }, { name: 'subject', label: 'Предмет', required: true }, { name: 'percent', label: 'Усвоение, %', type: 'number', min: 0, required: true }],
    create: (d) => api('POST', '/api/stats/mastery', d), remove: (r) => api('DELETE', `/api/stats/mastery/${r.id}`) }),
};

// ---------- сотрудники ----------
views.users = async () => crud({ title: 'Пользователи', load: () => api('GET', '/api/users'),
  columns: [{ label: 'ФИО', render: (u) => h('div', {}, h('b', {}, u.full_name), h('div', { class: 'muted' }, `${ROLE()[u.role]}${u.subject ? ' · ' + u.subject : ''}`)) }, { label: 'Логин', key: 'username' },
    { label: 'Смена', render: (u) => `${u.shift_start}–${u.shift_end}` }, { label: 'Оклад', render: (u) => (u.monthly_salary ? fmtMoney(u.monthly_salary) : '—') },
    { label: 'Статус', render: (u) => h('div', {}, u.frozen ? pill(T('заморожен'), 'bad') : pill(T('активен'), 'ok'), ' ', pill(u.telegram_linked ? 'Telegram ✓' : 'Telegram —', u.telegram_linked ? 'info' : 'warn')) }],
  fields: (ex) => [
    ...(ex ? [] : [{ name: 'username', label: 'Логин', required: true }, { name: 'password', label: 'Пароль (мин. 8 символов)', type: 'password', required: true },
      { name: 'role', label: 'Роль', type: 'select', options: [['teacher', T('Учитель')], ['staff', T('Сотрудник')], ...(state.me.role === 'director' ? [['assistant', T('Ассистент директора')]] : [])] }]),
    { name: 'full_name', label: 'ФИО', required: true }, { name: 'subject', label: 'Предмет / должность' }, { name: 'phone', label: 'Телефон' },
    { name: 'monthly_salary', label: 'Оклад за месяц, сум', type: 'number', min: 0 }, { name: 'shift_start', label: 'Начало смены', type: 'time', default: '09:00' }, { name: 'shift_end', label: 'Конец смены', type: 'time', default: '14:00' },
    { name: 'work_days', label: 'Рабочие дни', type: 'days' }, { name: 'photo', label: 'Фото', type: 'image' }, { name: 'bio', label: 'О себе (виден на сайте)', type: 'textarea', wide: true },
    { name: 'show_public', label: 'Показывать на сайте в списке учителей', type: 'checkbox', default: 1 },
    ...(ex && ex.role === 'teacher' ? [{ name: 'is_best', label: 'Лучший учитель (показывается на главной)', type: 'checkbox' }, { name: 'best_note', label: 'Подпись к «Лучшему учителю»', wide: true }] : [])],
  create: (d) => api('POST', '/api/users', d), update: (u, d) => api('PUT', `/api/users/${u.id}`, d),
  remove: (u) => (u.role === 'director' || u.id === state.me.id ? Promise.reject(new Error(T('Нельзя удалить этого пользователя'))) : api('DELETE', `/api/users/${u.id}`)),
  actions: (u, refresh, m) => [
    h('button', { class: 'small', onclick: () => guard(m, async () => { const r = await api('POST', `/api/users/${u.id}/link-code`); msg(m, `${T('Код привязки Telegram для')} «${u.full_name}»: ${r.code} — ${T('отправить боту')}: /start ${r.code}`, true); }) }, 'Telegram'),
    u.id !== state.me.id && u.role !== 'director' && iconBtn('snow', u.frozen ? 'Разморозить' : 'Заморозить', () => guard(m, async () => { await api('POST', `/api/users/${u.id}/freeze`, { frozen: !u.frozen }); await refresh(); })),
    u.id !== state.me.id && u.role !== 'director' && iconBtn('lock', 'Пароль', () => guard(m, async () => { const pw = prompt(T('Новый пароль (минимум 8 символов):')); if (pw) { await api('POST', `/api/users/${u.id}/reset-password`, { password: pw }); msg(m, T('Пароль изменён'), true); } }))] });

// ---------- расписание ----------
views.lessons = async () => {
  if (!isManager()) {
    const rows = await api('GET', '/api/lessons');
    return h('div', {}, h('h1', {}, T('Мои уроки')), WEEKDAYS().map((name, i) => {
      const day = rows.filter((l) => l.weekday === i + 1);
      return day.length ? box(name, day.map((l) => h('div', { class: 'lesson' }, h('span', { class: 'chip-n' }, `${l.number}-${T('урок')}`), h('b', {}, `${l.class_name} — ${l.subject}`), l.room ? h('small', { class: 'muted' }, ` ${T('каб.')} ${l.room}`) : null, h('span', { class: 'spacer' }), h('span', { class: 'muted' }, `${l.start_time}–${l.end_time}`)))) : null;
    }), rows.length ? null : h('div', { class: 'empty' }, T('Расписание пока не заполнено')));
  }
  const users = (await api('GET', '/api/users')).filter((u) => u.role !== 'director');
  return crud({ title: 'Расписание уроков', load: () => api('GET', '/api/lessons'),
    columns: [{ label: 'Учитель', key: 'teacher_name' }, { label: 'День', render: (l) => WEEKDAYS()[l.weekday - 1] }, { label: '№', key: 'number' }, { label: 'Класс', key: 'class_name' }, { label: 'Предмет', key: 'subject' }, { label: 'Кабинет', key: 'room' }, { label: 'Время', render: (l) => `${l.start_time}–${l.end_time}` }],
    fields: () => [{ name: 'teacher_id', label: 'Учитель', type: 'select', options: users.map((u) => [u.id, u.full_name]) }, { name: 'weekday', label: 'День недели', type: 'select', options: WEEKDAYS().map((d, i) => [i + 1, d]) },
      { name: 'number', label: 'Номер урока', type: 'number', min: 1, default: 1 }, { name: 'class_name', label: 'Класс (например 8-А)' }, { name: 'subject', label: 'Предмет' }, { name: 'room', label: 'Кабинет' },
      { name: 'start_time', label: 'Начало', type: 'time', default: '08:00' }, { name: 'end_time', label: 'Конец', type: 'time', default: '08:45' }],
    create: (d) => api('POST', '/api/lessons', d), update: (l, d) => api('PUT', `/api/lessons/${l.id}`, d), remove: (l) => api('DELETE', `/api/lessons/${l.id}`) });
};

// ---------- ученики ----------
views.students = async () => {
  if (!isManager()) {
    const list = await api('GET', '/api/students');
    return h('div', {}, h('h1', {}, T('Ученики')), box(null, table([{ label: 'ФИО', key: 'full_name' }, { label: 'Класс', key: 'class_name' }], list)));
  }
  return crud({ title: 'Ученики', load: () => api('GET', '/api/students'),
    columns: [{ label: 'ФИО', key: 'full_name' }, { label: 'Класс', key: 'class_name' }, { label: 'Лучший', render: (s) => (s.is_best ? pill(T('на главной'), 'ok') : '') }],
    fields: () => [{ name: 'full_name', label: 'ФИО', required: true }, { name: 'class_name', label: 'Класс (например 9-А)' }, { name: 'photo', label: 'Фото', type: 'image' },
      { name: 'is_best', label: 'Лучший ученик (показывается на главной)', type: 'checkbox' }, { name: 'best_note', label: 'Подпись к «Лучшему ученику»', wide: true }],
    create: (d) => api('POST', '/api/students', d), update: (s, d) => api('PUT', `/api/students/${s.id}`, d), remove: (s) => api('DELETE', `/api/students/${s.id}`) });
};

// ---------- достижения (черновик → предпросмотр → подтверждение) ----------
views.achievements = async () => {
  const [students, users] = await Promise.all([api('GET', '/api/students'), isManager() ? api('GET', '/api/users') : Promise.resolve([])]);
  const toggle = (e) => {
    const f = e.target.form, st = e.target.value === 'student';
    f.querySelector('[data-for=student_id]').style.display = st ? '' : 'none';
    const u = f.querySelector('[data-for=user_id]'); if (u) u.style.display = st ? 'none' : '';
  };
  return crud({ title: isManager() ? 'Достижения' : 'Мои достижения', load: () => api('GET', '/api/achievements'),
    columns: [{ label: 'Достижение', render: (a) => h('div', {}, h('b', {}, a.title), a.description ? h('div', { class: 'muted' }, a.description.slice(0, 120)) : null) }, { label: 'Кто', render: (a) => (a.kind === 'student' ? `${a.student_name || ''} ${a.class_name || ''}` : a.teacher_name) },
      { label: 'Дата', render: (a) => fmtD(a.date) }, { label: 'Статус', render: (a) => pill(a.status === 'published' ? T('на сайте') : T('черновик'), a.status === 'published' ? 'ok' : 'warn') }],
    fields: (ex) => [{ name: 'kind', label: 'Чьё достижение', type: 'select', options: [['student', T('Ученика')], ['teacher', isManager() ? T('Сотрудника') : T('Моё')]], onchange: toggle },
      ...(ex ? [] : [{ name: 'student_id', label: 'Ученик', type: 'select', options: students.map((s) => [s.id, `${s.full_name} ${s.class_name}`]) }]),
      ...(isManager() && !ex ? [{ name: 'user_id', label: 'Сотрудник', type: 'select', hidden: true, options: users.filter((u) => u.role !== 'director').map((u) => [u.id, u.full_name]) }] : []),
      { name: 'title', label: 'Тема', required: true, wide: true }, { name: 'description', label: 'Текст', type: 'textarea', wide: true }, { name: 'date', label: 'Дата', type: 'date', required: true, default: today() },
      { name: 'photo', label: 'Фото (рекомендуется загрузить)', type: 'image' }],
    create: (d) => api('POST', '/api/achievements', { ...d, student_id: d.kind === 'student' ? d.student_id : undefined, user_id: d.kind === 'teacher' ? d.user_id : undefined }),
    update: isManager() ? (a, d) => api('PUT', `/api/achievements/${a.id}`, { ...a, title: d.title, description: d.description, date: d.date, photo: d.photo }) : null,
    remove: (a) => api('DELETE', `/api/achievements/${a.id}`),
    actions: (a, refresh, m) => iconBtn('eye', isManager() ? 'Предпросмотр' : 'Просмотр', () => modal(T('Так это увидят гости сайта'), previewAchievement(a),
      isManager() ? [a.status === 'published' ? { label: T('Скрыть с сайта'), run: async () => { await api('PUT', `/api/achievements/${a.id}`, { ...a, status: 'pending' }); await refresh(); } }
        : { label: T('Подтвердить и опубликовать'), cls: 'primary', run: async () => { await api('PUT', `/api/achievements/${a.id}`, { ...a, status: 'published' }); await refresh(); msg(m, T('Опубликовано на сайте'), true); } }] : [])) });
};

// ---------- новости / объявления для сайта ----------
function newsView(kind, title) {
  return crud({ title, hideTitle: kind === 'announcement', load: async () => (await api('GET', '/api/news')).filter((n) => n.kind === kind),
    columns: [{ label: 'Заголовок', key: 'title' }, { label: 'Дата', render: (n) => fmtD(n.created_at) }, { label: 'Статус', render: (n) => pill(n.published ? T('на сайте') : T('черновик'), n.published ? 'ok' : 'warn') }],
    fields: () => [{ name: 'title', label: 'Заголовок', required: true, wide: true }, { name: 'summary', label: 'Краткое описание', wide: true }, { name: 'body', label: 'Текст (пустая строка — новый абзац)', type: 'textarea', rows: 8, wide: true },
      { name: 'cover', label: 'Обложка (фото)', type: 'image' }],
    create: (d) => api('POST', '/api/news', { ...d, kind, published: 0 }), // всегда черновик
    update: (n, d) => api('PUT', `/api/news/${n.id}`, { ...n, ...d, kind }), remove: (n) => api('DELETE', `/api/news/${n.id}`),
    actions: (n, refresh, m) => iconBtn('eye', 'Предпросмотр', () => modal(T('Так это увидят гости сайта'), previewNews(n),
      [n.published ? { label: T('Снять с публикации'), run: async () => { await api('PUT', `/api/news/${n.id}`, { ...n, published: 0 }); await refresh(); } }
        : { label: T('Подтвердить и опубликовать'), cls: 'primary', run: async () => { await api('PUT', `/api/news/${n.id}`, { ...n, published: 1 }); await refresh(); msg(m, T('Опубликовано на сайте'), true); } }])) });
}
views.news = () => newsView('news', 'Новости');

views.announcements = async () => {
  if (!isManager()) {
    const list = await api('GET', '/api/announcements');
    return h('div', {}, h('h1', {}, T('Объявления')), list.length ? list.map((a) => box(null, h('h3', { style: 'margin:0 0 6px' }, a.title), h('div', { class: 'muted' }, `${fmtD(a.created_at)} · ${a.author_name || ''}`), h('p', {}, a.body))) : h('div', { class: 'empty' }, T('Объявлений пока нет')));
  }
  const root = h('div'), body = h('div');
  const users = (await api('GET', '/api/users')).filter((u) => u.id !== state.me.id);
  const staffView = () => crud({ title: 'Объявления', hideTitle: true, addLabel: '+ Новое объявление', load: () => api('GET', '/api/announcements'),
    columns: [{ label: 'Заголовок', render: (a) => h('div', {}, h('b', {}, a.title), a.body ? h('div', { class: 'muted' }, a.body.slice(0, 120)) : null) }, { label: 'Кому', render: (a) => (a.to_all ? pill(T('Всем'), 'info') : a.targets.map((t) => t.full_name).join(', ')) }, { label: 'Дата', render: (a) => fmtD(a.created_at) }],
    fields: () => [{ name: 'title', label: 'Заголовок', required: true, wide: true }, { name: 'body', label: 'Текст', type: 'textarea', wide: true }, { name: 'to_all', label: 'Отправить всем сотрудникам', type: 'checkbox', default: 1 },
      { name: 'user_ids', label: 'Или выберите получателей', type: 'users', options: users.map((u) => [u.id, u.full_name]) }],
    create: (d) => api('POST', '/api/announcements', d), remove: (a) => api('DELETE', `/api/announcements/${a.id}`) });
  const pick = async (k) => body.replaceChildren(k === 'site' ? await newsView('announcement', 'Объявления') : await staffView());
  root.append(h('h1', {}, T('Объявления')), tabs([['site', 'Для гостей сайта'], ['staff', 'Для сотрудников']], pick), body);
  await pick('site');
  return root;
};

// ---------- медиа ----------
views.media = async () => {
  const root = h('div'), msgBox = h('div'), list = h('div'), form = h('div');
  const refresh = async () => {
    const items = await api('GET', '/api/media');
    list.replaceChildren(box(null, items.length ? h('div', { class: 'media-grid' }, items.map((m) => h('div', { class: 'media-item' },
      m.kind === 'video' ? h('video', { src: imgUrl(m.file), controls: true, preload: 'metadata' }) : m.kind === 'audio' ? h('audio', { src: imgUrl(m.file), controls: true }) : h('img', { src: imgUrl(m.file), alt: '' }),
      h('div', { class: 'muted' }, `${m.kind === 'video' ? '🎬' : m.kind === 'audio' ? '🎵' : '🖼'} ${m.title || ''}`),
      iconBtn('trash', 'Удалить', () => guard(msgBox, async () => { if (confirm(T('Удалить?'))) { await api('DELETE', `/api/media/${m.id}`); await refresh(); } }), 'danger')))) : h('div', { class: 'empty' }, T('Файлов пока нет'))));
  };
  const toggle = (e) => { const f = e.target.form; for (const k of ['image', 'video', 'audio']) f.querySelector(`[data-for=file_${k}]`).style.display = e.target.value === k ? '' : 'none'; };
  form.append(formPanel({ title: 'Загрузить фото, видео или аудио', submitLabel: 'Загрузить',
    fields: [{ name: 'kind', label: 'Тип', type: 'select', options: [['image', T('Фото')], ['video', T('Видео')], ['audio', T('Аудио')]], onchange: toggle },
      { name: 'file_image', label: 'Фото', type: 'image' }, { name: 'file_video', label: 'Видео (mp4, webm — до 150 МБ)', type: 'video', hidden: true }, { name: 'file_audio', label: 'Аудио (mp3, ogg, wav, m4a)', type: 'audio', hidden: true },
      { name: 'title', label: 'Название' }, { name: 'caption', label: 'Подпись', wide: true }],
    onSubmit: async (d) => { const f = d[`file_${d.kind}`]; if (!f) throw new Error(T('Сначала выберите файл')); await api('POST', '/api/media', { file: f, title: d.title, caption: d.caption }); await refresh(); msg(msgBox, T('Загружено'), true); } }));
  root.append(h('h1', {}, T('Медиа (фото, видео, аудио)')), msgBox, form, list);
  await refresh();
  return root;
};

// ---------- «Maktab haqida» (страницы сайта) ----------
views.pages = async () => crud({ title: 'О школе (страницы сайта)', load: () => api('GET', '/api/pages'),
  columns: [{ label: 'Страница', key: 'title' }, { label: 'Адрес', render: (p) => h('a', { href: `/#/page/${p.slug}`, target: '_blank' }, `#/page/${p.slug}`) },
    { label: 'Вложения', render: (p) => [p.image && '🖼', p.video && '🎬', p.video_url && '▶', p.audio && '🎵'].filter(Boolean).join(' ') }],
  fields: () => [{ name: 'title', label: 'Заголовок', required: true, wide: true }, { name: 'body', label: 'Текст (пустая строка — новый абзац)', type: 'textarea', rows: 10, wide: true },
    { name: 'image', label: 'Фото', type: 'image' }, { name: 'video', label: 'Видео-файл (mp4, webm)', type: 'video' }, { name: 'video_url', label: 'Или ссылка на видео (https://…)' }, { name: 'audio', label: 'Аудио', type: 'audio' }],
  update: (p, d) => api('PUT', `/api/pages/${p.slug}`, d), canAdd: false });

// ---------- аккаунт ----------
function accountForm() {
  return formPanel({ title: 'Логин и пароль', submitLabel: 'Сохранить', values: { username: state.me.username },
    fields: [{ name: 'username', label: 'Новый логин' }, { name: 'password', label: 'Новый пароль (оставьте пустым, чтобы не менять)', type: 'password' }, { name: 'current', label: 'Текущий пароль', type: 'password', required: true }],
    onSubmit: async (d, m) => { state.me = { ...state.me, ...(await api('PUT', '/api/auth/account', { current: d.current, username: d.username, password: d.password || undefined })) }; msg(m, T('Сохранено'), true); } });
}
function telegramBox() {
  const out = h('div');
  return box('Telegram-бот', h('p', {}, state.me.telegram_linked ? T('✅ Telegram привязан. Приход, уход, уроки и планы — в боте.') : T('Telegram не привязан.')),
    h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => guard(out, async () => { const r = await api('POST', `/api/users/${state.me.id}/link-code`); out.replaceChildren(h('p', {}, `${T('Отправьте боту')}: `, h('span', { class: 'code' }, `/start ${r.code}`))); }) }, T('Получить код привязки')),
      state.me.telegram_linked && h('button', { onclick: () => guard(out, async () => { await api('POST', `/api/users/${state.me.id}/unlink-telegram`); state.me.telegram_linked = false; state.route(); }) }, T('Отвязать'))), out);
}
views.profile = async () => h('div', {}, h('h1', {}, T('Профиль')), box(null, h('p', {}, h('b', {}, state.me.full_name), ` · ${ROLE()[state.me.role]} · ${T('логин')}: ${state.me.username}`)), telegramBox(), accountForm());

// ---------- сообщения ----------
views.messages = async () => {
  const d = await api('GET', '/api/panel/dashboard');
  return h('div', {}, h('div', { class: 'row' }, h('h1', {}, T('Сообщения')), h('span', { class: 'spacer' }), h('button', { onclick: async () => { await api('POST', '/api/notices/read'); state.route(); } }, T('Отметить прочитанными'))),
    box(null, d.notices.length ? d.notices.map((n) => h('div', { class: `notice${n.read ? '' : ' unread'}` }, n.text, h('small', { class: 'muted' }, ' ', n.created_at.slice(0, 16)))) : h('div', { class: 'empty' }, T('Нет уведомлений'))));
};

// ---------- настройки ----------
views.settings = async () => {
  const s = await api('GET', '/api/settings');
  const root = h('div'), body = h('div');
  const save = (d, m) => api('PUT', '/api/settings', d).then(() => msg(m, T('Сохранено'), true));
  const pages = {
    account: async () => h('div', {}, accountForm(), telegramBox()),
    site: async () => formPanel({ title: 'Сайт', values: s, fields: [{ name: 'school_name', label: 'Название школы', required: true }, { name: 'city', label: 'Город' }, { name: 'motto', label: 'Девиз (на главной)', wide: true }, { name: 'address', label: 'Адрес', wide: true },
      { name: 'phone', label: 'Телефон' }, { name: 'email', label: 'E-mail' }, { name: 'clubs_count', label: 'Кружков (например 15+)' }, { name: 'video_url', label: 'Ссылка на видео (кнопка на главной)' },
      { name: 'telegram_url', label: 'Telegram (ссылка)' }, { name: 'youtube_url', label: 'YouTube (ссылка)' }, { name: 'instagram_url', label: 'Instagram (ссылка)' }, { name: 'facebook_url', label: 'Facebook (ссылка)' },
      { name: 'hero_image', label: 'Фон главной (пусто — стандартное фото)', type: 'image' }, { name: 'about_image', label: 'Фото в блоке «О школе»', type: 'image' }], onSubmit: save }),
    geo: async () => {
      const panel = formPanel({ title: 'Геозона отметки прихода и ухода', values: s, fields: [{ name: 'school_lat', label: 'Широта школы' }, { name: 'school_lon', label: 'Долгота школы' }, { name: 'radius_m', label: 'Радиус (круг) отметки, м', type: 'number', min: 10 },
        { name: 'grace_minutes', label: 'Допустимое опоздание / ранний уход, мин', type: 'number', min: 0 }, { name: 'timezone', label: 'Часовой пояс (например Asia/Tashkent)' }], onSubmit: save });
      const geo = h('button', { type: 'button', onclick: () => navigator.geolocation?.getCurrentPosition((p) => { const f = panel.querySelector('form'); f.elements.school_lat.value = p.coords.latitude.toFixed(6); f.elements.school_lon.value = p.coords.longitude.toFixed(6); }, () => alert(T('Не удалось определить местоположение'))) }, '📍 ' + T('Взять мои текущие координаты (нажмите, находясь в школе)'));
      return h('div', {}, panel, box(null, geo, h('p', { class: 'muted' }, T('Сотрудники отмечают приход и уход в Telegram-боте: бот просит геолокацию и принимает отметку только внутри этого круга.'))));
    },
    holidays: () => crud({ title: 'Праздники и выходные', hideTitle: true, load: () => api('GET', '/api/holidays'), columns: [{ label: 'Дата', render: (r) => fmtD(r.date) }, { label: 'Название', key: 'title' }],
      fields: () => [{ name: 'date', label: 'Дата', type: 'date', required: true }, { name: 'title', label: 'Название' }], create: (d) => api('POST', '/api/holidays', d), remove: (r) => api('DELETE', `/api/holidays/${r.date}`) }),
  };
  const pick = async (k) => body.replaceChildren(await pages[k]());
  root.append(h('h1', {}, T('Настройки')), tabs([['account', 'Мой аккаунт'], ['site', 'Сайт'], ['geo', 'Геозона'], ['holidays', 'Праздники']], pick), body);
  await pick('account');
  return root;
};
