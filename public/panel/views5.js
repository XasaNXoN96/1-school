// Кадры (отпуск, замены, расчётные листки), информация для родителей (меню, звонки, документы), безопасность.
import { T, h, api, icon, state, isManager, pill, msg, guard, table, tabs, modal, formPanel, crud, fmtD, fmtMoney, today, thisMonth, iconBtn, WEEKDAYS } from './ui.js';
import { views } from './views.js';
import { printSheet } from './views4.js';

const box = (title, ...c) => h('section', { class: 'panel' }, title ? h('h2', {}, T(title)) : null, ...c);
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const opts = (list, cur) => list.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return h('option', { value: v, selected: String(v) === String(cur) }, l); });
const fmtDT = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2})/.exec(String(s || '')); return m ? `${m[3]}.${m[2]}.${m[1]} ${m[4]}` : ''; };
const LK = () => ({ vacation: T('Отпуск'), sick: T('Больничный'), unpaid: T('Без содержания') });
const LST = () => ({ pending: [T('на рассмотрении'), 'warn'], approved: [T('одобрена'), 'ok'], rejected: [T('отклонена'), 'bad'], cancelled: [T('отменена'), ''] });
const period = (r) => (r.date_from === r.date_to ? fmtD(r.date_from) : `${fmtD(r.date_from)} — ${fmtD(r.date_to)}`);
const sizeText = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const monthTitle = (m) => { const [y, mo] = m.split('-'); return `${['', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'].map((x) => (x ? T(x) : x))[Number(mo)]} ${y}`; };

// ---------- расчётный листок ----------
export function payslipNode(p) {
  const r = p.report, row = (label, val, cls = '') => h('tr', { class: cls }, h('td', {}, T(label)), h('td', { class: 'num' }, val));
  return h('div', { class: 'payslip' }, h('div', { class: 'cert-head' }, h('b', {}, p.school), h('div', {}, p.city)),
    h('h2', {}, `${T('Расчётный листок')} — ${monthTitle(p.month)}`),
    h('p', {}, h('b', {}, p.employee.full_name), p.employee.subject ? ` · ${p.employee.subject}` : ''),
    h('table', {}, h('tbody', {}, row('Оклад за месяц', fmtMoney(r.base)), row('Рабочих дней по графику', String(r.scheduled)), row('Пришёл', `${r.present} ${T('дн.')}`),
      row('Уважительная причина / отпуск (оплачивается)', `${r.excused} ${T('дн.')}`), row('Не пришёл (не оплачивается)', `${r.absent} ${T('дн.')}`), row('Опозданий', `${r.late_count}${r.late_minutes ? ` (${r.late_minutes} ${T('мин')})` : ''}`),
      row('Стоимость одного дня', fmtMoney(r.per_day)), row('Начислено за отработанные дни', fmtMoney(p.earned), 'strong'),
      ...p.items.filter((i) => i.kind === 'bonus').map((i) => row(`+ ${i.title}`, fmtMoney(i.amount))), ...p.items.filter((i) => i.kind === 'deduction').map((i) => row(`− ${i.title}`, `−${fmtMoney(i.amount)}`)),
      row('К выплате', fmtMoney(p.net), 'total'))),
    p.leaves.length ? h('p', { class: 'muted' }, `${T('Отпуска и больничные в этом месяце')}: ${p.leaves.map((l) => `${LK()[l.kind]} ${period(l)}`).join('; ')}`) : null,
    r.month > today().slice(0, 7) || r.month === today().slice(0, 7) ? h('p', { class: 'muted' }, T('Месяц ещё не закончился: сумма считается на сегодняшний день.')) : null,
    h('div', { class: 'muted' }, `${T('Сформировано')}: ${fmtD(p.generated)}`));
}
const printBtn = (getNode) => h('button', { onclick: () => printSheet(getNode()) }, icon('printer', 16), T('Печать / PDF'));

// ---------- форма заявки на отпуск ----------
function leaveForm(onDone) {
  const box0 = h('div');
  return formPanel({ title: 'Заявка на отпуск или больничный', fields: [
    { name: 'kind', label: 'Вид', type: 'select', options: Object.entries(LK()), default: 'vacation' },
    { name: 'date_from', label: 'С даты', type: 'date', required: true, default: addDays(today(), 1) }, { name: 'date_to', label: 'По дату (включительно)', type: 'date', required: true, default: addDays(today(), 1) },
    { name: 'reason', label: 'Причина (необязательно)', wide: true }], onSubmit: async (d) => { await api('POST', '/api/leaves', d); await onDone(); }, extra: box0 });
}
function leaveTable(rows, { manager, act }) {
  return h('div', { class: 'panel' }, table([...(manager ? [{ label: 'Сотрудник', key: 'full_name' }] : []), { label: 'Вид', render: (r) => LK()[r.kind] }, { label: 'Период', render: (r) => period(r) }, { label: 'Причина', key: 'reason' },
    { label: 'Статус', render: (r) => h('span', {}, pill(...LST()[r.status]), r.note ? h('small', { class: 'muted' }, ` ${r.note}`) : null) },
    { label: '', render: (r) => h('div', { class: 'row acts', style: 'margin:0;flex-wrap:wrap' },
      manager && r.status === 'pending' && r.user_id !== state.me.id ? iconBtn('check', 'Одобрить', () => act(() => api('POST', `/api/leaves/${r.id}/decision`, { status: 'approved' }))) : null,
      manager && r.status === 'pending' && r.user_id !== state.me.id ? iconBtn('close', 'Отклонить', () => { const note = prompt(T('Причина отказа (увидит сотрудник)')); if (note !== null) act(() => api('POST', `/api/leaves/${r.id}/decision`, { status: 'rejected', note })); }, 'danger') : null,
      (r.status === 'pending' && r.user_id === state.me.id) || (manager && r.status === 'approved') ? iconBtn('trash', 'Отменить', () => { if (confirm(T('Отменить заявку?'))) act(() => api('POST', `/api/leaves/${r.id}/cancel`)); }, 'danger') : null) }], rows, 'Заявок пока нет'));
}

views.leave = async () => {
  const root = h('div'), msgBox = h('div'), list = h('div');
  const draw = async () => { list.replaceChildren(leaveTable(await api('GET', '/api/leaves'), { manager: false, act: (fn) => guard(msgBox, async () => { await fn(); await draw(); }) })); };
  root.append(h('h1', {}, T('Отпуск и больничный')), h('p', { class: 'muted' }, T('Отпуск и больничный оплачиваются как рабочие дни. «Без содержания» — дни не оплачиваются. Заявку рассматривает администрация, вы получите уведомление.')), msgBox, leaveForm(async () => { msg(msgBox, T('Заявка отправлена'), true); await draw(); }), list);
  await draw();
  return root;
};

views.payslip = async () => {
  const root = h('div'), body = h('div'), msgBox = h('div');
  let month = thisMonth();
  const mIn = h('input', { type: 'month', value: month, onchange: (e) => { month = e.target.value || thisMonth(); draw(); } });
  async function draw() { try { const p = await api('GET', `/api/payslip?month=${month}`); body.replaceChildren(box('', payslipNode(p), h('div', { class: 'row' }, printBtn(() => payslipNode(p))))); } catch (e) { msg(msgBox, e.message); } }
  root.append(h('h1', {}, T('Расчётный листок')), h('label', { class: 'f' }, T('Месяц'), mIn), msgBox, body);
  await draw();
  return root;
};

const subTable = (rows) => table([{ label: 'Урок', render: (r) => `${r.number}. ${r.start_time}–${r.end_time}` }, { label: 'Класс', key: 'class_name' }, { label: 'Предмет', key: 'subject' }, { label: 'Каб.', key: 'room' }, { label: 'Заменяет', render: (r) => h('b', {}, r.sub_name) }, { label: 'Вместо', key: 'absent_name' }, { label: 'Примечание', key: 'note' }], rows, 'Замен на эту дату нет');
views.subs = async () => {
  const root = h('div'), body = h('div');
  let date = today();
  const dIn = h('input', { type: 'date', value: date, onchange: (e) => { date = e.target.value || today(); draw(); } });
  async function draw() { body.replaceChildren(h('div', { class: 'panel' }, subTable(await api('GET', `/api/substitutions?date=${date}`)))); }
  root.append(h('h1', {}, T('Замены уроков')), h('label', { class: 'f' }, T('Дата'), dIn), body);
  await draw();
  return root;
};

// ================= КАДРЫ (администрация) =================
views.hr = async () => {
  const root = h('div'), msgBox = h('div'), body = h('div');
  let tab = 'leaves';
  const act = (fn) => guard(msgBox, async () => { msgBox.replaceChildren(); await fn(); await draw(); });
  const teachers = (await api('GET', '/api/users')).filter((u) => u.role === 'teacher');

  async function drawLeaves() {
    body.replaceChildren(leaveForm(async () => { msg(msgBox, T('Заявка отправлена'), true); await draw(); }), leaveTable(await api('GET', '/api/leaves'), { manager: true, act }));
  }

  async function drawSubs() {
    const st = { teacher: teachers[0]?.id, date: addDays(today(), 1) };
    const res = h('div');
    const list = h('div');
    const find = () => guard(msgBox, async () => {
      msgBox.replaceChildren();
      const s = await api('GET', `/api/substitutions/suggest?teacher_id=${st.teacher}&date=${st.date}`);
      res.replaceChildren(...[
        s.on_leave ? h('div', { class: 'ok-msg' }, T('У учителя одобрена заявка на эти даты.')) : h('div', { class: 'muted' }, T('Подбор учитывает: свободное время, рабочие дни, отпуска и уже назначенные замены. Учителя того же предмета — первыми.')),
        ...(s.lessons.length ? s.lessons.map((l) => {
          const sel = h('select', {}, opts(l.candidates.map((c) => [c.id, `${c.same_subject ? '★ ' : ''}${c.full_name}${c.subject ? ` (${c.subject})` : ''} · ${T('уроков в день')}: ${c.load}`]), l.substitution?.sub_user_id)), note = h('input', { placeholder: T('Примечание'), maxlength: 200, value: l.substitution?.note || '' });
          return h('div', { class: 'panel' }, h('b', {}, `${l.number}. ${l.start_time}–${l.end_time} · ${l.class_name || '—'} · ${l.subject}${l.room ? ` · ${T('каб.')} ${l.room}` : ''}`),
            l.substitution ? h('div', {}, pill(`${T('Заменяет')}: ${l.substitution.sub_name}`, 'ok'), ' ', iconBtn('trash', 'Снять замену', () => guard(msgBox, async () => { await api('DELETE', `/api/substitutions/${l.substitution.id}`); await find(); await showList(); }), 'danger')) : null,
            l.candidates.length ? h('div', { class: 'row' }, sel, note, h('button', { class: 'primary', onclick: () => guard(msgBox, async () => { await api('POST', '/api/substitutions', { date: st.date, lesson_id: l.id, sub_user_id: Number(sel.value), note: note.value }); msg(msgBox, T('Замена назначена: учитель и родители класса уведомлены'), true); await find(); await showList(); }) }, T(l.substitution ? 'Заменить' : 'Назначить'))) : h('div', { class: 'err' }, T('Свободных учителей на это время нет')));
        }) : [h('div', { class: 'empty' }, T('В этот день у учителя нет уроков по расписанию'))])]);
    });
    const showList = async () => { list.replaceChildren(box('Замены на выбранную дату', subTable(await api('GET', `/api/substitutions?date=${st.date}`)))); };
    body.replaceChildren(box('Подбор замены', h('div', { class: 'row' }, h('label', { class: 'f' }, T('Кто отсутствует'), h('select', { onchange: (e) => { st.teacher = Number(e.target.value); } }, opts(teachers.map((u) => [u.id, u.full_name]), st.teacher))),
      h('label', { class: 'f' }, T('Дата'), h('input', { type: 'date', value: st.date, min: today(), onchange: (e) => { st.date = e.target.value; showList().catch(() => {}); } })), h('button', { class: 'primary', onclick: find }, T('Подобрать')))), res, list);
    await showList();
  }

  async function drawPay() {
    let month = thisMonth();
    const out = h('div');
    const load = async () => {
      const d = await api('GET', `/api/payslips?month=${month}`);
      const open = async (r) => { const p = await api('GET', `/api/payslip?month=${month}&user_id=${r.id}`); modal(r.full_name, h('div', {}, payslipNode(p), h('div', { class: 'row' }, printBtn(() => payslipNode(p))))); };
      const items = async (r) => {
        const all = (await api('GET', `/api/payroll/items?month=${month}`)).filter((i) => i.user_id === r.id);
        const kind = h('select', {}, opts([['bonus', T('Премия')], ['deduction', T('Удержание')]])), title = h('input', { placeholder: T('Основание'), maxlength: 120 }), amount = h('input', { type: 'number', min: 1, placeholder: T('Сумма, сум') });
        const listBox = h('div', {}, all.length ? table([{ label: 'Вид', render: (i) => pill(i.kind === 'bonus' ? T('премия') : T('удержание'), i.kind === 'bonus' ? 'ok' : 'bad') }, { label: 'Основание', key: 'title' }, { label: 'Сумма', render: (i) => fmtMoney(i.amount) },
          { label: '', render: (i) => iconBtn('trash', 'Удалить', () => guard(msgBox, async () => { await api('DELETE', `/api/payroll/items/${i.id}`); close(); await load(); }), 'danger') }], all) : h('div', { class: 'empty' }, T('Начислений пока нет')));
        const close = modal(`${r.full_name} — ${monthTitle(month)}`, h('div', {}, listBox, h('div', { class: 'row' }, kind, title, amount)),
          [{ label: T('Добавить'), cls: 'primary', run: async () => { try { await api('POST', '/api/payroll/items', { user_id: r.id, month, kind: kind.value, title: title.value, amount: amount.value }); await load(); } catch (e) { msg(msgBox, e.message); return false; } } }]);
      };
      out.replaceChildren(table([{ label: 'Сотрудник', key: 'full_name' }, { label: 'Оклад', render: (r) => fmtMoney(r.base) }, { label: 'Дней', render: (r) => `${r.present + r.excused}/${r.scheduled}` }, { label: 'Начислено за дни', render: (r) => fmtMoney(r.earned) },
        { label: 'Премии', render: (r) => (r.bonus ? `+${fmtMoney(r.bonus)}` : '—') }, { label: 'Удержания', render: (r) => (r.deduction ? `−${fmtMoney(r.deduction)}` : '—') }, { label: 'К выплате', render: (r) => h('b', {}, fmtMoney(r.net)) },
        { label: '', render: (r) => h('div', { class: 'row acts', style: 'margin:0;flex-wrap:wrap' }, iconBtn('doc', 'Листок', () => guard(msgBox, () => open(r))), iconBtn('plus', 'Премия / удержание', () => guard(msgBox, () => items(r)))) }], d.rows),
      h('p', {}, `${T('Итого к выплате')}: `, h('b', {}, fmtMoney(d.total))));
    };
    body.replaceChildren(box('Ведомость', h('div', { class: 'row' }, h('label', { class: 'f' }, T('Месяц'), h('input', { type: 'month', value: month, onchange: (e) => { month = e.target.value || thisMonth(); load().catch((er) => msg(msgBox, er.message)); } })),
      h('small', { class: 'muted' }, T('Начислено за дни считается по отметкам прихода; премии и удержания вносятся вручную. Листок можно распечатать или сохранить в PDF.'))), out));
    await load();
  }
  async function draw() { try { await ({ leaves: drawLeaves, subs: drawSubs, pay: drawPay }[tab])(); } catch (e) { msg(msgBox, e.message); } }
  root.append(h('h1', {}, T('Кадры и зарплата')), msgBox, tabs([['leaves', 'Отпуска и больничные'], ['subs', 'Замены уроков'], ['pay', 'Расчётные листки']], (k) => { tab = k; msgBox.replaceChildren(); draw(); }), body);
  await draw();
  return root;
};

// ================= ИНФОРМАЦИЯ ДЛЯ РОДИТЕЛЕЙ =================
const mondayOf = (d) => { const w = new Date(`${d}T00:00:00Z`).getUTCDay() || 7; return addDays(d, 1 - w); };
views.info = async () => {
  const root = h('div'), msgBox = h('div'), body = h('div');
  let tab = 'menu', weekDate = today();

  async function drawMenu() {
    const w = await api('GET', `/api/menu?date=${weekDate}`);
    const wdn = WEEKDAYS();
    const rows = w.days.map((d, i) => {
      const f = { breakfast: h('textarea', { rows: 2, maxlength: 600, value: d.breakfast }), lunch: h('textarea', { rows: 2, maxlength: 600, value: d.lunch }), snack: h('textarea', { rows: 2, maxlength: 600, value: d.snack }) };
      return h('tr', {}, h('td', { 'data-label': T('День') }, h('b', {}, wdn[i]), h('br'), fmtD(d.date)), ...['breakfast', 'lunch', 'snack'].map((k) => h('td', { 'data-label': T({ breakfast: 'Завтрак', lunch: 'Обед', snack: 'Полдник' }[k]) }, f[k])),
        h('td', {}, h('button', { class: 'small', onclick: () => guard(msgBox, async () => { await api('PUT', `/api/menu/${d.date}`, { breakfast: f.breakfast.value, lunch: f.lunch.value, snack: f.snack.value }); msg(msgBox, `${wdn[i]}: ${T('сохранено')}`, true); }) }, T('Сохранить'))));
    });
    body.replaceChildren(box('Меню столовой', h('div', { class: 'row' }, h('button', { onclick: () => { weekDate = addDays(w.week_start, -7); draw(); } }, icon('left', 16)), h('b', {}, `${fmtD(w.week_start)} — ${fmtD(addDays(w.week_start, 6))}`), h('button', { onclick: () => { weekDate = addDays(w.week_start, 7); draw(); } }, icon('right', 16)),
      h('button', { onclick: () => guard(msgBox, async () => { const r = await api('POST', '/api/menu/copy-week', { date: w.week_start }); weekDate = r.week_start; msg(msgBox, `${T('Меню скопировано на следующую неделю')}: ${r.copied} ${T('дн.')}`, true); await draw(); }) }, T('Скопировать на следующую неделю'))),
    h('div', { class: 'scroll' }, h('table', { class: 'menu-edit' }, h('thead', {}, h('tr', {}, ['День', 'Завтрак', 'Обед', 'Полдник', ''].map((x) => h('th', {}, T(x))))), h('tbody', {}, rows)))));
  }

  async function drawBells() {
    const data = await api('GET', '/api/bells');
    const rows = data.bells.map((b) => ({ ...b }));
    const tb = h('div');
    const redraw = () => tb.replaceChildren(table([{ label: 'Смена', render: (r) => h('select', { onchange: (e) => { r.shift = Number(e.target.value); } }, opts([[1, '1'], [2, '2']], r.shift)) }, { label: '№ урока', render: (r) => h('input', { type: 'number', min: 1, max: 12, value: r.number, style: 'width:70px', onchange: (e) => { r.number = Number(e.target.value); } }) },
      { label: 'Начало', render: (r) => h('input', { type: 'time', value: r.start_time, onchange: (e) => { r.start_time = e.target.value; } }) }, { label: 'Конец', render: (r) => h('input', { type: 'time', value: r.end_time, onchange: (e) => { r.end_time = e.target.value; } }) },
      { label: '', render: (r) => iconBtn('trash', 'Удалить', () => { rows.splice(rows.indexOf(r), 1); redraw(); }, 'danger') }], rows, 'Звонков пока нет'));
    redraw();
    const typical = () => { rows.length = 0; let m = 8 * 60; const f = (x) => `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; for (let i = 1; i <= 6; i++) { rows.push({ shift: 1, number: i, start_time: f(m), end_time: f(m + 45) }); m += 55; } redraw(); };
    const transport = await crud({ title: 'Подвоз учеников', hideTitle: true, load: async () => (await api('GET', '/api/bells')).transport, columns: [{ label: 'Маршрут', key: 'title' }, { label: 'Описание', key: 'description' }, { label: 'Время', key: 'times' }],
      fields: () => [{ name: 'title', label: 'Маршрут', required: true }, { name: 'description', label: 'Описание (откуда — куда)', wide: true }, { name: 'times', label: 'Время отправления (через запятую)', wide: true }, { name: 'sort', label: 'Порядок', type: 'number', min: 0, default: 0 }],
      create: (d) => api('POST', '/api/transport', d), update: (r, d) => api('PUT', `/api/transport/${r.id}`, d), remove: (r) => api('DELETE', `/api/transport/${r.id}`), addLabel: '+ Маршрут' });
    body.replaceChildren(box('Расписание звонков', tb, h('div', { class: 'row' }, h('button', { onclick: () => { rows.push({ shift: 1, number: rows.length + 1, start_time: '08:00', end_time: '08:45' }); redraw(); } }, icon('plus', 16), T('Добавить урок')), h('button', { onclick: typical }, T('Типовое: 6 уроков по 45 минут')),
      h('button', { class: 'primary', onclick: () => guard(msgBox, async () => { await api('PUT', '/api/bells', { bells: rows }); msg(msgBox, T('Звонки сохранены'), true); }) }, T('Сохранить звонки')))), box('Подвоз учеников', transport));
  }

  async function drawDocs() {
    const list = await api('GET', '/api/documents');
    const file = h('input', { type: 'file', accept: '.pdf,.doc,.docx,.xls,.xlsx' }), title = h('input', { maxlength: 150, placeholder: T('Например: Устав школы') }), cat = h('input', { maxlength: 60, list: 'doccats', placeholder: T('Раздел, например: Основные') }), desc = h('input', { maxlength: 300, placeholder: T('Описание (необязательно)') });
    const cats = [...new Set(list.map((d) => d.category).filter(Boolean))];
    const status = h('small', { class: 'muted' });
    const upload = () => guard(msgBox, async () => {
      const f = file.files[0]; if (!f) throw new Error(T('Выберите файл')); if (!title.value.trim()) throw new Error(T('Укажите название'));
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      status.textContent = T('Загрузка…');
      const res = await fetch(`/api/upload-raw?ext=${encodeURIComponent(ext)}`, { method: 'POST', credentials: 'same-origin', body: f });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Ошибка ${res.status}`);
      await api('POST', '/api/documents', { title: title.value, category: cat.value, description: desc.value, file: data.file, original_name: f.name });
      msg(msgBox, T('Документ добавлен'), true); await draw();
    });
    body.replaceChildren(box('Добавить документ', h('datalist', { id: 'doccats' }, cats.map((c) => h('option', { value: c }))), h('div', { class: 'row' }, h('label', { class: 'f' }, T('Файл (PDF, Word, Excel)'), file), h('label', { class: 'f' }, T('Название'), title), h('label', { class: 'f' }, T('Раздел'), cat), h('label', { class: 'f grow' }, T('Описание'), desc), h('button', { class: 'primary', onclick: upload }, icon('upload', 16), T('Загрузить'))), status),
      box('Документы на сайте', table([{ label: 'Название', render: (d) => h('a', { href: `/uploads/${d.file}`, download: d.original_name || '' }, d.title) }, { label: 'Раздел', key: 'category' }, { label: 'Размер', render: (d) => sizeText(d.size) }, { label: 'Добавлен', render: (d) => fmtD(d.created_at) },
        { label: '', render: (d) => iconBtn('trash', 'Удалить', () => { if (confirm(T('Удалить документ?'))) guard(msgBox, async () => { await api('DELETE', `/api/documents/${d.id}`); await draw(); }); }, 'danger') }], list, 'Документов пока нет')));
  }
  async function draw() { try { await ({ menu: drawMenu, bells: drawBells, docs: drawDocs }[tab])(); } catch (e) { msg(msgBox, e.message); } }
  root.append(h('h1', {}, T('Информация для родителей')), h('p', { class: 'muted' }, T('Всё, что здесь заполнено, показывается на публичном сайте: меню столовой, звонки, подвоз и документы.')), msgBox, tabs([['menu', 'Меню столовой'], ['bells', 'Звонки и подвоз'], ['docs', 'Документы']], (k) => { tab = k; msgBox.replaceChildren(); draw(); }), body);
  await draw();
  return root;
};

// ================= БЕЗОПАСНОСТЬ (директор) =================
views.security = async () => {
  const root = h('div'), msgBox = h('div'), body = h('div');
  let tab = 'log', onlyFail = false;

  async function drawLog() {
    const d = await api('GET', `/api/security/log${onlyFail ? '?ok=0' : ''}`);
    const dev = (ua) => (/Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iOS' : /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : '—') + (/Telegram/i.test(ua) ? ' · Telegram' : /Edg/i.test(ua) ? ' · Edge' : /Chrome/i.test(ua) ? ' · Chrome' : /Firefox/i.test(ua) ? ' · Firefox' : /Safari/i.test(ua) ? ' · Safari' : '');
    body.replaceChildren(d.failed_24h ? h('div', { class: d.failed_24h >= 10 ? 'err' : 'alert' }, `${T('Неудачных попыток входа за 24 часа')}: ${d.failed_24h}`) : h('div', { class: 'ok-msg' }, T('За последние 24 часа неудачных попыток входа не было')),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: onlyFail, onchange: (e) => { onlyFail = e.target.checked; draw(); } }), T('Только неудачные')),
      h('div', { class: 'panel' }, table([{ label: 'Когда', render: (r) => fmtDT(r.created_at) }, { label: 'Логин', key: 'username' }, { label: 'Результат', render: (r) => pill(r.ok ? T('вход') : T('отказ'), r.ok ? 'ok' : 'bad') }, { label: 'Подробности', key: 'reason' }, { label: 'IP', key: 'ip' }, { label: 'Устройство', render: (r) => dev(r.ua) }], d.rows, 'Записей пока нет')));
  }

  async function drawProtect() {
    const s = await api('GET', '/api/security/status');
    const code = h('input', { inputmode: 'numeric', maxlength: 6, placeholder: '123456', style: 'width:140px' });
    let token = '';
    const start = () => guard(msgBox, async () => { const r = await api('POST', '/api/security/2fa/start'); token = r.token; msg(msgBox, T('Код отправлен в ваш Telegram. Введите его ниже.'), true); code.focus(); });
    const enable = () => guard(msgBox, async () => { await api('POST', '/api/security/2fa', { enabled: true, token, code: code.value }); msg(msgBox, T('Защита включена'), true); await draw(); });
    const disable = () => guard(msgBox, async () => { if (!confirm(T('Отключить вход по коду?'))) return; await api('POST', '/api/security/2fa', { enabled: false }); msg(msgBox, T('Защита отключена'), true); await draw(); });
    body.replaceChildren(box('Вход по одноразовому коду', h('p', {}, T('После пароля директору приходит 6-значный код в Telegram. Без кода войти нельзя — даже если пароль украдут. Код действует 5 минут и одноразовый.')),
      s.director_2fa ? h('div', {}, pill(T('Защита включена'), 'ok'), h('div', { class: 'row' }, h('button', { class: 'danger', onclick: disable }, T('Отключить')))) :
        !s.telegram_linked ? h('div', { class: 'err' }, T('Сначала привяжите Telegram к своему аккаунту: «Профиль» → привязка Telegram.')) : !s.bot_ready ? h('div', { class: 'err' }, T('Telegram-бот не запущен на сервере (не задан TELEGRAM_BOT_TOKEN).')) :
          h('div', {}, h('p', { class: 'muted' }, T('Чтобы не заблокировать себя, сначала проверим, что код доходит: нажмите «Отправить код» и введите его.')), h('div', { class: 'row' }, h('button', { onclick: start }, icon('send', 16), T('Отправить код')), code, h('button', { class: 'primary', onclick: enable }, T('Включить'))))),
    box('Если код не приходит', h('p', { class: 'muted' }, T('Аварийный вход: на сервере временно задайте переменную DISABLE_2FA=1 и перезапустите сайт — вход по коду отключится. После входа уберите переменную.'))));
  }

  async function drawBackups() {
    const [files, st] = await Promise.all([api('GET', '/api/backups'), api('GET', '/api/security/status')]);
    const b = st.backup;
    body.replaceChildren(
      formPanel({ title: 'Автоматические копии', fields: [{ name: 'backup_enabled', label: 'Делать копии автоматически', type: 'checkbox', default: b.enabled ? 1 : 0 }, { name: 'backup_hours', label: 'Как часто, часов', type: 'number', min: 1, default: b.hours }, { name: 'backup_keep', label: 'Сколько копий хранить', type: 'number', min: 1, default: b.keep },
        { name: 'backup_telegram', label: 'Присылать копию директору в Telegram', type: 'checkbox', default: b.telegram ? 1 : 0, help: 'В базе есть хэши паролей и данные лиц сотрудников: включайте, только если доверяете своему Telegram.' }],
      onSubmit: async (d) => { await api('PUT', '/api/backup-settings', { backup_enabled: d.backup_enabled, backup_hours: Number(d.backup_hours), backup_keep: Number(d.backup_keep), backup_telegram: d.backup_telegram }); msg(msgBox, T('Сохранено'), true); await draw(); } }),
      box('Копии базы', h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => guard(msgBox, async () => { const r = await api('POST', '/api/backups'); msg(msgBox, `${T('Копия создана')}: ${r.name}`, true); await draw(); }) }, icon('database', 16), T('Сделать копию сейчас')), h('small', { class: 'muted' }, `${T('Последняя автоматическая')}: ${b.last ? fmtDT(b.last.replace('T', ' ')) : '—'}`)),
        table([{ label: 'Файл', key: 'name' }, { label: 'Создана', render: (f) => fmtDT(f.created_at.replace('T', ' ')) }, { label: 'Размер', render: (f) => sizeText(f.size) }, { label: '', render: (f) => h('a', { class: 'btn small', href: `/api/backups/${f.name}` }, icon('download', 14), T('Скачать')) }], files.files, 'Копий пока нет')),
      box('', h('p', { class: 'muted' }, T('В копию входит база данных (сотрудники, оценки, заявки, настройки). Загруженные фотографии и документы лежат в папке uploads — копируйте её отдельно. Восстановление: остановить сайт, заменить файл school.db на файл копии (переименовав в school.db), запустить сайт.'))));
  }
  async function draw() { try { await ({ log: drawLog, protect: drawProtect, backups: drawBackups }[tab])(); } catch (e) { msg(msgBox, e.message); } }
  root.append(h('h1', {}, T('Безопасность')), msgBox, tabs([['log', 'Журнал входов'], ['protect', 'Защита входа'], ['backups', 'Резервные копии']], (k) => { tab = k; msgBox.replaceChildren(); draw(); }), body);
  await draw();
  return root;
};

// ---------- «Требует внимания» на главной ----------
const prevDash = views.dashboard;
views.dashboard = async () => {
  const el = await prevDash();
  if (isManager()) {
    const d = await api('GET', '/api/panel/dashboard').catch(() => ({}));
    const a = d.attention || {};
    const links = [['leaves', 'Заявок на отпуск', '#/hr'], ['timetable', 'Расписаний на проверке', '#/lessons'], ['appointments', 'Записей на приём', '#/requests'], ['certs', 'Заявок на справки', '#/requests'], ['feedback', 'Новых обращений', '#/requests']].filter(([k]) => a[k]);
    if (links.length) el.prepend(h('div', { class: 'alert' }, icon('bell', 18), h('b', {}, `${T('Требует внимания')}: `), links.map(([k, label, href], i) => h('span', {}, i ? ' · ' : '', h('a', { href }, `${T(label)}: ${a[k]}`)))));
  }
  return el;
};
void modal;
