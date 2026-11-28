// Расписание: учитель собирает недельную сетку («+» в ячейке), отправляет на проверку; администрация одобряет.
import { T, h, api, icon, isManager, pill, msg, guard, modal, WEEKDAYS } from './ui.js';
import { views } from './views.js';

const ST = () => ({ draft: [T('черновик'), 'warn'], pending: [T('на проверке'), 'info'], published: [T('опубликовано'), 'ok'] });

function lessonForm(init, onChange) {
  const subj = h('input', { name: 'subject', list: 'tt-subjects', maxlength: 100, required: true, value: init.subject || '', placeholder: T('Например: Информатика') });
  const cls = h('input', { name: 'class_name', maxlength: 20, required: true, value: init.class_name || '', placeholder: T('Класс или группа, например 10-А') });
  const room = h('input', { name: 'room', maxlength: 20, required: true, value: init.room || '', placeholder: T('Кабинет') });
  const info = h('div', { class: 'tt-info' });
  const check = async () => {
    try {
      const c = await api('GET', `/api/timetable/check?weekday=${init.weekday}&number=${init.number}&class_name=${encodeURIComponent(cls.value)}&room=${encodeURIComponent(room.value)}&exclude_id=${init.id || 0}`);
      info.replaceChildren(h('div', { class: 'muted' }, `${T('Время')}: ${c.start_time}–${c.end_time}`),
        ...c.errors.map((e) => h('div', { class: 'err' }, e)), ...c.warnings.map((e) => h('div', { class: 'alert' }, e)),
        c.same_slot.length ? h('div', {}, h('b', {}, T('В это время в школе уже стоят уроки:')), h('ul', {}, c.same_slot.map((l) => h('li', {}, `${l.class_name} — ${l.subject}, ${T('каб.')} ${l.room}, ${l.teacher_name}${l.mine ? '' : ''}`)))) : h('div', { class: 'ok-msg' }, T('В это время ничего не стоит — можно добавлять')));
    } catch { /* без подсказки */ }
  };
  for (const e of [cls, room]) e.addEventListener('input', () => { clearTimeout(check.t); check.t = setTimeout(check, 250); });
  check();
  const f = h('div', {}, h('label', { class: 'f' }, T('Предмет'), subj), h('label', { class: 'f' }, T('Класс / группа'), cls), h('label', { class: 'f' }, T('Кабинет'), room), info);
  f.values = () => ({ weekday: init.weekday, number: init.number, subject: subj.value, class_name: cls.value, room: room.value });
  return f;
}

async function teacherGrid() {
  const root = h('div'), msgBox = h('div'), box = h('div');
  const days = WEEKDAYS().slice(0, 6);
  const draw = async () => {
    const d = await api('GET', '/api/timetable'), L = d.lessons;
    const rows = Math.max(8, ...L.map((l) => l.number));
    const drafts = L.filter((l) => l.status === 'draft').length, dels = L.filter((l) => l.del_req).length, pend = L.filter((l) => l.status === 'pending').length;
    const subjects = [...new Set(L.map((l) => l.subject))];
    const reasons = [...new Set(L.filter((l) => l.status === 'draft' && l.note).map((l) => l.note))];
    const cell = (wd, n) => {
      const l = L.find((x) => x.weekday === wd && x.number === n);
      if (!l) return h('td', {}, h('button', { class: 'tt-add', 'aria-label': T('Добавить урок'), onclick: () => openForm({ weekday: wd, number: n }) }, icon('plus', 18)));
      const [lab, cls] = ST()[l.status];
      return h('td', {}, h('button', { class: `tt-lesson ${l.status}${l.del_req ? ' del' : ''}`, onclick: () => openLesson(l) }, h('b', {}, l.class_name), h('span', {}, `${l.subject}`), h('small', {}, `${T('каб.')} ${l.room} · ${l.start_time}`), h('i', { class: `dot ${cls}`, title: lab })));
    };
    const openForm = (init) => {
      const f = lessonForm(init);
      const save = async () => { try { const r = await api(init.id ? 'PUT' : 'POST', init.id ? `/api/timetable/${init.id}` : '/api/timetable', f.values()); if (r.warnings?.length) msg(msgBox, r.warnings.join(' '), true); await draw(); } catch (e) { msg(msgBox, e.message); return false; } };
      modal(init.id ? T('Изменить урок') : T('Добавить урок'), h('div', {}, h('div', { class: 'muted' }, `${days[init.weekday - 1]}, ${init.number}-${T('урок')}`), h('datalist', { id: 'tt-subjects' }, subjects.map((s) => h('option', { value: s }))), f), [{ label: T('Сохранить'), cls: 'primary', run: save }]);
    };
    const openLesson = (l) => {
      const acts = [];
      if (l.status !== 'published') acts.push({ label: T('Изменить'), run: (close) => { close(); openForm(l); return false; } });
      acts.push({ label: l.status === 'published' ? (l.del_req ? T('Отменить удаление') : T('Удалить (на проверку)')) : T('Удалить'), cls: 'danger', run: async () => { try { await api('DELETE', `/api/timetable/${l.id}`); await draw(); } catch (e) { msg(msgBox, e.message); return false; } } });
      modal(`${l.class_name} — ${l.subject}`, h('div', {}, h('p', {}, `${days[l.weekday - 1]}, ${l.number}-${T('урок')}, ${l.start_time}–${l.end_time}, ${T('каб.')} ${l.room}`), h('p', {}, pill(...ST()[l.status]), l.del_req ? ' ' : '', l.del_req ? pill(T('запрошено удаление'), 'bad') : ''),
        l.status === 'published' ? h('p', { class: 'muted' }, T('Опубликованный урок не меняют напрямую: удалите его (администратор подтвердит) и добавьте новый.')) : null, l.note ? h('div', { class: 'err' }, `${T('Комментарий администратора')}: ${l.note}`) : null), acts);
    };
    box.replaceChildren(
      reasons.length ? h('div', { class: 'err' }, `${T('Расписание возвращено на доработку')}: ${reasons.join('; ')}`) : '',
      h('div', { class: 'row' }, h('span', { class: 'muted' }, `${T('Черновиков')}: ${drafts} · ${T('на проверке')}: ${pend}${dels ? ` · ${T('на удаление')}: ${dels}` : ''}`), h('span', { class: 'spacer' }),
        h('button', { class: 'primary', disabled: !drafts && !dels, onclick: () => guard(msgBox, async () => { if (!confirm(T('Отправить расписание администрации на проверку?'))) return; await api('POST', '/api/timetable/submit'); msg(msgBox, T('Отправлено на проверку. После одобрения расписание увидят ученики и родители.'), true); await draw(); }) }, icon('send', 16), T('Отправить на проверку'))),
      h('div', { class: 'row tt-legend' }, [['draft', 'черновик (видите только вы)'], ['pending', 'на проверке'], ['published', 'опубликовано — видят ученики']].map(([k, t]) => h('span', {}, h('i', { class: `dot ${ST()[k][1]}` }), ` ${T(t)}`))),
      h('div', { class: 'scroll' }, h('table', { class: 'tt-grid' }, h('thead', {}, h('tr', {}, h('th', {}, T('Урок')), days.map((n) => h('th', {}, n)))),
        h('tbody', {}, Array.from({ length: rows }, (_, i) => { const n = i + 1, b = d.bells.find((x) => x.number === n && x.shift === 1); return h('tr', {}, h('th', {}, String(n), b ? h('small', {}, b.start_time) : null), ...days.map((_x, wd) => cell(wd + 1, n))); })))));
  };
  root.append(h('h1', {}, T('Моё расписание')), h('p', { class: 'muted' }, T('Нажмите «+» в нужной ячейке: укажите предмет, класс и кабинет. Система покажет, что уже стоит в это время. Когда всё готово — отправьте на проверку: после одобрения администратора расписание увидят ученики и родители.')), msgBox, box);
  await draw();
  return root;
}

async function reviewPanel() {
  const out = h('div'), msgBox = h('div');
  const draw = async () => {
    const list = await api('GET', '/api/timetable/review'); const days = WEEKDAYS();
    out.replaceChildren(list.length ? h('section', { class: 'panel' }, h('h2', {}, T('Расписание на проверке')), msgBox, ...list.map((g) => {
      const bad = new Map(g.conflicts.map((c) => [c.id, c]));
      const decide = (approve) => guard(msgBox, async () => { let note = ''; if (!approve) { note = prompt(T('Что исправить? (увидит учитель)')) ?? null; if (note === null) return; } await api('POST', '/api/timetable/decision', { teacher_id: g.teacher_id, approve, note }); await draw(); });
      return h('div', { class: 'panel' }, h('b', {}, g.teacher_name),
        g.add.length ? h('div', {}, h('div', { class: 'muted' }, T('Новые уроки')), h('ul', {}, g.add.map((l) => h('li', {}, `${days[l.weekday - 1]}, ${l.number}-${T('урок')} (${l.start_time}) · ${l.class_name} — ${l.subject}, ${T('каб.')} ${l.room}`, ...(bad.get(l.id)?.errors || []).map((e) => h('div', { class: 'err' }, e)), ...(bad.get(l.id)?.warnings || []).map((e) => h('div', { class: 'alert' }, e)))))) : null,
        g.remove.length ? h('div', {}, h('div', { class: 'muted' }, T('Просит удалить')), h('ul', {}, g.remove.map((l) => h('li', {}, `${days[l.weekday - 1]}, ${l.number}-${T('урок')} · ${l.class_name} — ${l.subject}`)))) : null,
        h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => decide(true) }, icon('check', 16), T('Одобрить и опубликовать')), h('button', { class: 'danger', onclick: () => decide(false) }, T('Вернуть на доработку'))));
    })) : null);
  };
  await draw();
  return out;
}

const prev = views.lessons;
views.lessons = async () => {
  if (!isManager()) return teacherGrid();
  const [review, base] = await Promise.all([reviewPanel(), prev()]);
  const root = h('div'); root.append(review, base); return root;
};
