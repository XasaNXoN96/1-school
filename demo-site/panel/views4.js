// Журнал учителя (оценки, посещаемость, домашние задания), родители и рассылки, обращения (приём, справки, жалобы).
import { T, h, api, icon, state, isManager, pill, msg, guard, table, tabs, modal, formPanel, fmtD, today, iconBtn } from './ui.js';
import { views } from './views.js';
import { lang } from '../js/i18n.js';

const box = (title, ...c) => h('section', { class: 'panel' }, title ? h('h2', {}, T(title)) : null, ...c);
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const opts = (list, cur) => list.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return h('option', { value: v, selected: String(v) === String(cur) }, l); });
const KIND = () => ({ lesson: T('урок'), quiz: T('самостоятельная'), exam: T('контрольная'), quarter: T('четвертная'), homework: T('домашнее задание') });
const ATT = () => [['present', T('Был'), 'ok'], ['late', T('Опоздал'), 'warn'], ['absent', T('Нет'), 'bad'], ['excused', T('Уваж.'), 'info']];
const scoreCls = (s) => (s >= 5 ? 'ok' : s === 4 ? 'info' : s === 3 ? 'warn' : 'bad');
const fmtDT = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2})/.exec(String(s || '')); return m ? `${m[3]}.${m[2]}.${m[1]} ${m[4]}` : ''; };

// Печать: временно показываем только лист и вызываем системную печать (там же можно «Сохранить как PDF»).
export function printSheet(node) {
  const sheet = h('div', { class: 'print-sheet' }, node);
  document.body.append(sheet);
  document.body.classList.add('printing');
  const done = () => { sheet.remove(); document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => window.print(), 50);
  setTimeout(() => { if (document.body.classList.contains('printing')) done(); }, 60000);
}

// ---------- карточка ученика (учитель/админ) ----------
async function studentModal(id) {
  const o = await api('GET', `/api/journal/student/${id}`);
  const c = o.attendance.counts;
  const body = h('div', {},
    h('p', {}, `${o.student.class_name || '—'} · ${T('Средний балл')}: `, h('b', {}, o.average ?? '—')),
    h('div', { class: 'row' }, pill(`${T('Был')}: ${c.present}`, 'ok'), pill(`${T('Опоздал')}: ${c.late}`, 'warn'), pill(`${T('Нет')}: ${c.absent}`, 'bad'), pill(`${T('Уваж.')}: ${c.excused}`, 'info'), h('small', { class: 'muted' }, T('за 30 дней'))),
    o.subjects.length ? table([{ label: 'Предмет', key: 'subject' }, { label: 'Средний', render: (r) => pill(String(r.avg), scoreCls(Math.round(r.avg))) },
      { label: 'Оценки', render: (r) => h('span', {}, r.items.slice(0, 12).map((g) => h('span', { class: `tag ${scoreCls(g.score)}`, title: `${fmtD(g.date)} · ${KIND()[g.kind] || ''}${g.comment ? ' · ' + g.comment : ''}`, style: 'margin-right:4px' }, String(g.score)))) }], o.subjects) : h('div', { class: 'empty' }, T('Оценок пока нет')));
  modal(o.student.full_name, body);
}

// ================= ЖУРНАЛ =================
views.journal = async () => {
  const meta = await api('GET', '/api/journal/meta');
  const root = h('div'), msgBox = h('div'), ctl = h('div', { class: 'panel' }), body = h('div');
  const st = { cls: meta.mine[0]?.class_name || meta.classes[0] || '', date: meta.today, subject: meta.mine[0]?.subject || state.me.subject || '', kind: 'lesson', comment: '', tab: 'journal' };
  if (!meta.classes.length) return h('div', {}, h('h1', {}, T('Журнал')), h('div', { class: 'empty' }, T('Нет учеников. Добавьте учеников в разделе «Ученики» и укажите класс.')));

  const classSel = h('select', { onchange: (e) => { st.cls = e.target.value; draw(); } }, opts(meta.classes, st.cls));
  const dateIn = h('input', { type: 'date', value: st.date, max: meta.today, onchange: (e) => { st.date = e.target.value || meta.today; draw(); } });
  const subjIn = h('input', { list: 'subjects', value: st.subject, placeholder: T('Предмет'), oninput: (e) => { st.subject = e.target.value.trim(); } });
  const kindSel = h('select', { onchange: (e) => { st.kind = e.target.value; } }, opts(Object.entries(meta.kinds.reduce((a, k) => ({ ...a, [k]: KIND()[k] }), {})), st.kind));
  const comment = h('input', { placeholder: T('Комментарий (необязательно)'), maxlength: 200, oninput: (e) => { st.comment = e.target.value; } });
  ctl.append(h('datalist', { id: 'subjects' }, meta.subjects.map((s) => h('option', { value: s }))),
    h('div', { class: 'row' }, h('label', { class: 'f' }, T('Класс'), classSel), h('label', { class: 'f' }, T('Дата'), dateIn), h('label', { class: 'f' }, T('Предмет'), subjIn), h('label', { class: 'f' }, T('Вид оценки'), kindSel), h('label', { class: 'f grow' }, T('Комментарий'), comment)));

  const tabBar = tabs([['journal', 'Журнал'], ['homework', 'Домашние задания']], (k) => { st.tab = k; draw(); });
  const act = (fn) => guard(msgBox, async () => { msgBox.replaceChildren(); await fn(); await draw(); });

  async function drawJournal() {
    const j = await api('GET', `/api/journal?class_name=${encodeURIComponent(st.cls)}&date=${st.date}`);
    const cols = [
      { label: '№', render: (r) => String(j.students.indexOf(r) + 1) },
      { label: 'Ученик', render: (r) => h('a', { href: '#', onclick: (e) => { e.preventDefault(); studentModal(r.id).catch((er) => msg(msgBox, er.message)); } }, r.full_name) },
      { label: 'Посещаемость', render: (r) => h('div', { class: 'row', style: 'margin:0;gap:4px;flex-wrap:nowrap' }, ATT().map(([k, l, c]) => h('button', { class: `small${r.status === k ? ` seg-on ${c}` : ''}`, type: 'button', onclick: () => act(() => api('POST', '/api/journal/attendance', { student_id: r.id, date: st.date, status: r.status === k ? '' : k })) }, l))) },
      { label: 'Оценки за день', render: (r) => h('span', {}, r.grades.map((g) => h('button', { class: `tag ${scoreCls(g.score)} chip-btn`, type: 'button', title: `${g.subject}${g.comment ? ' · ' + g.comment : ''} — ${T('нажмите, чтобы удалить')}`, onclick: () => { if (confirm(T('Удалить оценку?'))) act(() => api('DELETE', `/api/journal/grade/${g.id}`)); } }, `${g.subject.slice(0, 10)}: ${g.score}`))) },
      { label: 'Поставить', render: (r) => h('div', { class: 'row', style: 'margin:0;gap:4px;flex-wrap:nowrap' }, [5, 4, 3, 2, 1].map((n) => h('button', { class: `small score s${n}`, type: 'button', onclick: () => { if (!st.subject) { msg(msgBox, T('Укажите предмет')); return; } act(() => api('POST', '/api/journal/grade', { student_id: r.id, subject: st.subject, date: st.date, score: n, kind: st.kind, comment: st.comment })); } }, String(n)))) },
    ];
    body.replaceChildren(h('div', { class: 'row' }, h('button', { onclick: () => act(async () => { const r = await api('POST', '/api/journal/attendance-all', { class_name: st.cls, date: st.date }); msg(msgBox, `${T('Отмечено присутствующими')}: ${r.marked}`, true); }) }, icon('check', 16), T('Все присутствуют')), h('small', { class: 'muted' }, T('Родители получают уведомление об оценках, опозданиях и пропусках.'))),
      h('div', { class: 'panel' }, table(cols, j.students, 'В этом классе нет учеников')));
  }
  async function drawHomework() {
    const list = await api('GET', `/api/homework?class_name=${encodeURIComponent(st.cls)}`);
    const text = h('textarea', { rows: 3, maxlength: 1000, placeholder: T('Что задано') }), due = h('input', { type: 'date', value: addDays(meta.today, 1) });
    const add = () => { if (!st.subject || !text.value.trim()) { msg(msgBox, T('Укажите предмет и задание')); return; } act(async () => { await api('POST', '/api/homework', { class_name: st.cls, subject: st.subject, text: text.value, due_date: due.value }); msg(msgBox, T('Задание отправлено родителям класса'), true); }); };
    body.replaceChildren(box('Новое задание', h('p', { class: 'muted' }, `${T('Класс')}: ${st.cls} · ${T('Предмет')}: ${st.subject || '—'} (${T('меняется выше')})`), h('div', { class: 'row' }, h('label', { class: 'f grow' }, T('Задание'), text), h('label', { class: 'f' }, T('Срок сдачи'), due), h('button', { class: 'primary', onclick: add }, icon('plus', 16), T('Задать'))), h('small', { class: 'muted' }, T('Сообщение получат родители всех учеников класса (в кабинет и в Telegram).'))),
      box('Задания класса', table([{ label: 'Срок', render: (r) => fmtD(r.due_date) }, { label: 'Предмет', key: 'subject' }, { label: 'Задание', render: (r) => h('span', { style: 'white-space:pre-wrap' }, r.text) }, { label: 'Учитель', key: 'teacher' },
        { label: '', render: (r) => iconBtn('trash', 'Удалить', () => { if (confirm(T('Удалить?'))) act(() => api('DELETE', `/api/homework/${r.id}`)); }, 'danger') }], list, 'Заданий пока нет')));
  }
  async function draw() { try { await (st.tab === 'journal' ? drawJournal() : drawHomework()); } catch (e) { msg(msgBox, e.message); } }
  root.append(h('h1', {}, T('Журнал')), msgBox, ctl, tabBar, body);
  await draw();
  return root;
};

// ================= РОДИТЕЛИ И РАССЫЛКИ =================
views.parents = async () => {
  const meta = await api('GET', '/api/journal/meta');
  const root = h('div'), msgBox = h('div'), body = h('div');
  let tab = 'codes', cls = '';
  const bar = tabs([['codes', 'Коды родителей'], ['cast', 'Рассылки']], (k) => { tab = k; draw(); });
  const origin = location.origin;

  const editParent = (r, refresh) => {
    const name = h('input', { value: r.parent_name, maxlength: 100 }), phone = h('input', { value: r.parent_phone, maxlength: 40, inputmode: 'tel' });
    modal(`${T('Родитель')}: ${r.full_name}`, h('div', { class: 'grid' }, h('label', { class: 'f' }, T('ФИО родителя'), name), h('label', { class: 'f' }, T('Телефон'), phone)),
      [{ label: T('Сохранить'), cls: 'primary', run: async () => { try { await api('PUT', `/api/students/${r.id}/parent`, { parent_name: name.value, parent_phone: phone.value }); await refresh(); } catch (e) { msg(msgBox, e.message); return false; } } }]);
  };

  async function drawCodes() {
    const data = await api('GET', `/api/parents${cls ? `?class_name=${encodeURIComponent(cls)}` : ''}`);
    const refresh = () => draw();
    const botIn = h('input', { value: data.bot_username, placeholder: 'school_bot', maxlength: 40 });
    const sheet = () => {
      const rows = data.students.filter((s) => s.parent_code);
      if (!rows.length) { msg(msgBox, T('Сначала создайте коды')); return; }
      printSheet(h('div', { class: 'code-cards' }, rows.map((s) => h('div', { class: 'code-card' }, h('b', {}, T('Кабинет родителя')), h('div', { class: 'cc-name' }, s.full_name), h('div', { class: 'muted' }, s.class_name),
        h('div', { class: 'cc-code' }, s.parent_code), h('ol', {}, h('li', {}, `${T('Откройте сайт')}: ${origin}/#/parent`), h('li', {}, T('Введите код — увидите оценки, посещаемость и задания')), data.bot_username ? h('li', {}, `${T('Telegram: бот')} @${data.bot_username} → ${T('отправьте этот код')}`) : null)))));
    };
    body.replaceChildren(
      box('Доступ родителей', h('p', { class: 'muted' }, T('Каждому ученику выдаётся личный код. Родитель вводит его на сайте («Для родителей → Кабинет») и видит оценки, посещаемость, задания и объявления. Тот же код можно отправить боту — тогда всё приходит в Telegram.')),
        h('div', { class: 'row' }, h('label', { class: 'f' }, T('Класс'), h('select', { onchange: (e) => { cls = e.target.value; draw(); } }, opts([['', T('Все')], ...meta.classes.map((c) => [c, c])], cls))),
          h('label', { class: 'f' }, T('Имя Telegram-бота (без @)'), botIn), h('button', { onclick: () => guard(msgBox, async () => { await api('PUT', '/api/school-settings', { bot_username: botIn.value }); msg(msgBox, T('Сохранено'), true); }) }, T('Сохранить')),
          h('button', { class: 'primary', onclick: () => guard(msgBox, async () => { const r = await api('POST', '/api/parents/generate-codes'); msg(msgBox, `${T('Создано кодов')}: ${r.created}`, true); await refresh(); }) }, T('Создать недостающие коды')),
          h('button', { onclick: sheet }, icon('doc', 16), T('Печать листков с кодами')))),
      h('div', { class: 'panel' }, table([{ label: 'Ученик', key: 'full_name' }, { label: 'Класс', key: 'class_name' },
        { label: 'Родитель', render: (r) => h('span', {}, r.parent_name || '—', r.parent_phone ? h('small', { class: 'muted' }, ` · ${r.parent_phone}`) : null) },
        { label: 'Код', render: (r) => r.parent_code ? h('code', { class: 'pcode' }, r.parent_code) : h('span', { class: 'muted' }, '—') },
        { label: 'Telegram', render: (r) => pill(r.telegram_linked ? T('подключён') : T('нет'), r.telegram_linked ? 'ok' : '') },
        { label: '', render: (r) => h('div', { class: 'row acts', style: 'margin:0;flex-wrap:nowrap' }, iconBtn('edit', 'Изменить', () => editParent(r, refresh)),
          iconBtn('key', r.parent_code ? 'Новый код' : 'Создать код', () => guard(msgBox, async () => { if (!r.parent_code || confirm(T('Старый код и все входы по нему перестанут работать. Продолжить?'))) { await api('POST', `/api/students/${r.id}/parent-code`); await refresh(); } })),
          r.telegram_linked ? iconBtn('close', 'Отвязать', () => guard(msgBox, async () => { await api('POST', `/api/students/${r.id}/parent-unlink`); await refresh(); })) : null) }], data.students, 'Нет учеников')));
  }

  async function drawCast() {
    const text = h('textarea', { rows: 4, maxlength: 3000, placeholder: T('Текст сообщения') });
    const aud = h('select', {}, opts([['parents', T('Все родители')], ...meta.classes.map((c) => [`class:${c}`, `${T('Родители класса')} ${c}`]), ['staff', T('Сотрудники')]], 'parents'));
    const hist = h('div');
    const load = async () => {
      const rows = await api('GET', '/api/broadcasts');
      hist.replaceChildren(table([{ label: 'Когда', render: (r) => fmtDT(r.created_at) }, { label: 'Кому', render: (r) => r.audience === 'staff' ? T('Сотрудники') : r.audience.startsWith('class:') ? `${T('Класс')} ${r.audience.slice(6)}` : T('Все родители') },
        { label: 'Текст', render: (r) => h('span', { style: 'white-space:pre-wrap' }, r.text.length > 140 ? `${r.text.slice(0, 140)}…` : r.text) }, { label: 'В кабинет', render: (r) => String(r.in_cabinet) },
        { label: 'В Telegram', render: (r) => `${r.sent}${r.failed ? ` (${T('ошибок')}: ${r.failed})` : ''}` }, { label: 'Статус', render: (r) => pill(r.status === 'done' ? T('отправлено') : T('идёт отправка…'), r.status === 'done' ? 'ok' : 'warn') }], rows, 'Рассылок пока не было'));
      if (rows.some((r) => r.status !== 'done') && root.isConnected && tab === 'cast') setTimeout(() => load().catch(() => {}), 1500);
    };
    body.replaceChildren(box('Новая рассылка', h('div', { class: 'row' }, h('label', { class: 'f' }, T('Кому'), aud)), h('label', { class: 'f' }, T('Сообщение'), text),
      h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => guard(msgBox, async () => { if (!text.value.trim()) throw new Error(T('Напишите текст')); if (!confirm(T('Отправить сообщение?'))) return; await api('POST', '/api/broadcasts', { text: text.value, audience: aud.value }); text.value = ''; msg(msgBox, T('Рассылка запущена'), true); await load(); }) }, icon('send', 16), T('Отправить')),
        h('small', { class: 'muted' }, T('Сообщение появится в кабинете родителя; тем, у кого подключён Telegram, придёт и в бот.')))), box('История рассылок', hist));
    await load();
  }
  async function draw() { try { await (tab === 'codes' ? drawCodes() : drawCast()); } catch (e) { msg(msgBox, e.message); } }
  root.append(h('h1', {}, T('Родители')), msgBox, bar, body);
  await draw();
  return root;
};

// ================= ОБРАЩЕНИЯ: ПРИЁМ, СПРАВКИ, ЖАЛОБЫ =================
const TOPIC = () => ({ complaint: T('жалоба'), suggestion: T('предложение'), thanks: T('благодарность'), question: T('вопрос') });
const APPT = () => ({ new: [T('новая'), 'warn'], confirmed: [T('подтверждена'), 'ok'], declined: [T('отклонена'), 'bad'], done: [T('проведена'), 'info'] });

views.requests = async () => {
  const mgr = isManager();
  const root = h('div'), msgBox = h('div'), body = h('div');
  let tab = 'appt';
  const items = mgr ? [['appt', 'Запись на приём'], ['certs', 'Справки'], ['fb', 'Обращения']] : [['appt', 'Запись на приём']];
  const act = (fn) => guard(msgBox, async () => { msgBox.replaceChildren(); await fn(); await draw(); });

  async function drawAppt() {
    const rows = await api('GET', '/api/appointments');
    const [tbl] = [table([{ label: 'Дата и время', render: (r) => `${fmtD(r.date)} ${r.time}` }, { label: 'К кому', key: 'with_name' }, { label: 'Кто записался', render: (r) => h('span', {}, r.name, h('br'), h('a', { href: `tel:${r.phone.replace(/[^+\d]/g, '')}` }, r.phone)) },
      { label: 'Тема', key: 'topic' }, { label: 'Статус', render: (r) => pill(...APPT()[r.status]) },
      { label: '', render: (r) => h('div', { class: 'row acts', style: 'margin:0;flex-wrap:wrap' }, r.status === 'new' ? iconBtn('check', 'Подтвердить', () => act(() => api('POST', `/api/appointments/${r.id}/status`, { status: 'confirmed' }))) : null,
        r.status !== 'declined' && r.status !== 'done' ? iconBtn('close', 'Отклонить', () => act(() => api('POST', `/api/appointments/${r.id}/status`, { status: 'declined' })), 'danger') : null,
        r.status === 'confirmed' ? iconBtn('check', 'Проведена', () => act(() => api('POST', `/api/appointments/${r.id}/status`, { status: 'done' }))) : null) }], rows, 'Записей пока нет')];
    const parts = [h('div', { class: 'panel' }, tbl)];
    if (mgr) {
      const s = await api('GET', '/api/school-settings');
      parts.unshift(formPanel({ title: 'Часы приёма на сайте', fields: [{ name: 'appt_start', label: 'С', type: 'time', default: s.appt_start }, { name: 'appt_end', label: 'До', type: 'time', default: s.appt_end }, { name: 'appt_step', label: 'Длительность приёма, мин', type: 'number', min: 5, default: s.appt_step }, { name: 'appt_days', label: 'Дни приёма', type: 'days', default: s.appt_days }],
        values: s, onSubmit: async (d) => { await api('PUT', '/api/school-settings', { appt_start: d.appt_start, appt_end: d.appt_end, appt_step: d.appt_step, appt_days: d.appt_days }); msg(msgBox, T('Сохранено'), true); } }));
    }
    body.replaceChildren(...parts);
  }

  function certSheet(d, ov) {
    const c = d.cert, y = new Date(d.date).getFullYear(), mo = new Date(d.date).getMonth() + 1, ay = mo >= 9 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
    return h('div', { class: 'cert' }, h('div', { class: 'cert-head' }, h('b', {}, d.school.name), h('div', {}, [d.school.city, d.school.address].filter(Boolean).join(', ')), d.school.phone ? h('div', {}, d.school.phone) : null),
      h('h1', {}, `${T('СПРАВКА')} № ${c.id}/${y}`), h('p', {}, `${T('Дана')} `, h('b', {}, c.full_name), `, ${T('в том, что он(а) действительно является учеником(цей)')} ${c.class_name || '—'} ${T('класса')} ${d.school.name} ${T('в')} ${ay} ${T('учебном году')}.`),
      c.kind === 'grades' && ov ? h('div', {}, h('p', {}, `${T('Средний балл')}: `, h('b', {}, ov.average ?? '—'), '.'), table([{ label: 'Предмет', key: 'subject' }, { label: 'Средний балл', key: 'avg' }], ov.subjects)) : null,
      c.purpose ? h('p', {}, `${T('Справка выдана для предъявления')}: ${c.purpose}.`) : null,
      h('div', { class: 'cert-sign' }, h('div', {}, `${T('Дата выдачи')}: ${fmtD(d.date)}`), h('div', {}, `${T('Директор')}: ${d.director || ''} ______________`), h('div', { class: 'muted' }, T('М.П.'))));
  }
  async function drawCerts() {
    const rows = await api('GET', '/api/certs');
    const KINDS = () => ({ study: T('об обучении'), grades: T('об успеваемости') });
    const ST = () => ({ new: [T('новая'), 'warn'], ready: [T('готова'), 'ok'], rejected: [T('отказано'), 'bad'] });
    body.replaceChildren(h('div', { class: 'panel' }, table([{ label: 'Дата', render: (r) => fmtD(r.created_at) }, { label: 'Ученик', render: (r) => `${r.full_name} (${r.class_name || '—'})` }, { label: 'Вид', render: (r) => KINDS()[r.kind] || r.kind }, { label: 'Для чего', key: 'purpose' },
      { label: 'Статус', render: (r) => pill(...ST()[r.status]) },
      { label: '', render: (r) => h('div', { class: 'row acts', style: 'margin:0;flex-wrap:wrap' }, iconBtn('doc', 'Печать', () => guard(msgBox, async () => { const d = await api('GET', `/api/certs/${r.id}`); const ov = r.kind === 'grades' ? await api('GET', `/api/journal/student/${r.student_id}`) : null; printSheet(certSheet(d, ov)); })),
        r.status !== 'ready' ? iconBtn('check', 'Готово', () => act(() => api('POST', `/api/certs/${r.id}/status`, { status: 'ready' }))) : null,
        r.status === 'new' ? iconBtn('close', 'Отказать', () => { const note = prompt(T('Причина отказа (увидит родитель)')); if (note !== null) act(() => api('POST', `/api/certs/${r.id}/status`, { status: 'rejected', note })); }, 'danger') : null,
        iconBtn('trash', 'Удалить', () => { if (confirm(T('Удалить?'))) act(() => api('DELETE', `/api/certs/${r.id}`)); }, 'danger')) }], rows, 'Заявок на справки пока нет')));
  }
  async function drawFb() {
    const rows = await api('GET', '/api/feedback');
    const ST = () => ({ new: [T('новое'), 'warn'], seen: [T('прочитано'), 'info'], answered: [T('есть ответ'), 'ok'] });
    const answer = (r) => { const ta = h('textarea', { rows: 5, value: r.answer, maxlength: 3000 }); modal(T('Ответ на обращение'), h('div', {}, h('p', { style: 'white-space:pre-wrap' }, r.message), ta, h('small', { class: 'muted' }, T('Автор увидит ответ на сайте по своему коду обращения.'))),
      [{ label: T('Отправить ответ'), cls: 'primary', run: async () => { try { await api('POST', `/api/feedback/${r.id}/answer`, { answer: ta.value }); await draw(); } catch (e) { msg(msgBox, e.message); return false; } } }]); if (r.status === 'new') api('POST', `/api/feedback/${r.id}/seen`).catch(() => {}); };
    body.replaceChildren(h('div', { class: 'panel' }, table([{ label: 'Дата', render: (r) => fmtD(r.created_at) }, { label: 'Тема', render: (r) => TOPIC()[r.topic] || r.topic }, { label: 'Сообщение', render: (r) => h('span', { style: 'white-space:pre-wrap' }, r.message) },
      { label: 'Автор', render: (r) => r.contact || T('аноним') }, { label: 'Статус', render: (r) => pill(...ST()[r.status]) },
      { label: '', render: (r) => h('div', { class: 'row acts', style: 'margin:0;flex-wrap:wrap' }, iconBtn('mail', r.answer ? 'Изменить ответ' : 'Ответить', () => answer(r)), iconBtn('trash', 'Удалить', () => { if (confirm(T('Удалить?'))) act(() => api('DELETE', `/api/feedback/${r.id}`)); }, 'danger')) }], rows, 'Обращений пока нет')));
  }
  async function draw() { try { await ({ appt: drawAppt, certs: drawCerts, fb: drawFb }[tab])(); } catch (e) { msg(msgBox, e.message); } }
  root.append(h('h1', {}, T(mgr ? 'Обращения родителей' : 'Запись на приём')), msgBox, mgr ? tabs(items, (k) => { tab = k; draw(); }) : null, body);
  await draw();
  return root;
};
void lang; void today;
