// Общие компоненты панели: локализация, формы, таблицы, модальные окна, CRUD.
import { h, api, imgUrl, uploadImage } from '/js/common.js';
import { icon } from '/js/icons.js';
import { DICT } from './dict.js';
import { lang } from '/js/i18n.js';

export const T = (ru) => { const l = lang(); if (l === 'ru') return ru; const e = DICT.get(ru); return (e && e[l === 'uz' ? 0 : 1]) || ru; };
export { h, api, icon, imgUrl, uploadImage };

export const state = { me: null, route: () => {} };
export const isManager = () => state.me && (state.me.role === 'director' || state.me.role === 'assistant');
export const ROLE = () => ({ director: T('Директор'), assistant: T('Ассистент'), teacher: T('Учитель'), staff: T('Сотрудник') });
export const fmtMoney = (n) => `${Math.round(n || 0).toLocaleString(lang() === 'en' ? 'en-US' : 'ru-RU')} ${T('сум')}`;
export const today = () => new Date().toISOString().slice(0, 10);
export const thisMonth = () => today().slice(0, 7);
export const fmtD = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? `${m[3]}.${m[2]}.${m[1]}` : ''; };
export const WEEKDAYS = () => [T('Пн'), T('Вт'), T('Ср'), T('Чт'), T('Пт'), T('Сб'), T('Вс')];

const STATUS = { present: ['Пришёл', 'ok'], excused: ['Уважительно', 'info'], absent: ['Не пришёл', 'bad'], upcoming: ['Ожидается', ''], not_arrived: ['Не пришёл', 'warn'], off: ['Выходной', ''] };
export const tag = (s) => { const [t, c] = STATUS[s] || [s, '']; return h('span', { class: `tag ${c}` }, T(t)); };
export const pill = (text, cls = '') => h('span', { class: `tag ${cls}` }, text);

export function msg(box, text, ok = false) { box.replaceChildren(h('div', { class: ok ? 'ok-msg' : 'err', role: 'alert' }, text)); }
export async function guard(box, fn) {
  try { await fn(); } catch (e) { if (e.status === 401) { location.reload(); return; } msg(box, e.message); }
}

export function modal(title, body, actions = []) {
  const close = () => { el.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const el = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', onclick: (e) => { if (e.target === el) close(); } },
    h('div', { class: 'modal-box' }, h('div', { class: 'row' }, h('h2', { style: 'margin:0' }, title), h('span', { class: 'spacer' }), h('button', { class: 'small', onclick: close, 'aria-label': T('Закрыть') }, icon('close', 16))),
      body, h('div', { class: 'row end', style: 'margin-top:16px' }, actions.map((a) => h('button', { class: a.cls || '', onclick: async () => { if (await a.run(close) !== false) close(); } }, a.label)), h('button', { onclick: close }, T('Закрыть')))));
  document.body.append(el);
  document.addEventListener('keydown', onKey);
  return close;
}

// ---------- формы ----------
export function field(f, value) {
  const v = value ?? f.default ?? '';
  const label = T(f.label);
  if (f.type === 'checkbox') return h('label', { class: 'f check wide' }, h('input', { type: 'checkbox', name: f.name, checked: !!Number(v) || v === true }), label);
  if (f.type === 'days') {
    const cur = String(v || '1,2,3,4,5,6').split(',');
    return h('div', { class: 'f wide', 'data-days': f.name }, label, h('div', { class: 'row' }, WEEKDAYS().map((d, i) => h('label', { class: 'f check' }, h('input', { type: 'checkbox', value: i + 1, checked: cur.includes(String(i + 1)) }), d))));
  }
  if (f.type === 'users') {
    return h('div', { class: 'f wide', 'data-users': f.name }, label, h('div', { class: 'row' }, f.options.map(([id, name]) => h('label', { class: 'f check' }, h('input', { type: 'checkbox', value: id }), name))));
  }
  if (f.type === 'image' || f.type === 'video' || f.type === 'audio') return mediaField(f, v, label);
  let input;
  if (f.type === 'textarea') input = h('textarea', { name: f.name, value: v, rows: f.rows || 5 });
  else if (f.type === 'select') input = h('select', { name: f.name, onchange: f.onchange }, f.options.map(([val, l]) => h('option', { value: val, selected: String(val) === String(v) }, l)));
  else input = h('input', { name: f.name, type: f.type || 'text', value: v, required: f.required, min: f.min, step: f.step, maxlength: f.maxlength, autocomplete: f.type === 'password' ? 'new-password' : 'off', placeholder: f.placeholder ? T(f.placeholder) : '' });
  return h('label', { class: `f${f.wide ? ' wide' : ''}`, 'data-for': f.name, style: f.hidden ? 'display:none' : null }, label, input, f.help ? h('small', { class: 'muted' }, T(f.help)) : null);
}

// Загрузка файла: фото — через JSON (уменьшаем в браузере), видео/аудио — потоком.
function mediaField(f, v, label) {
  const hidden = h('input', { type: 'hidden', name: f.name, value: v });
  const view = h('div', { class: 'media-prev' });
  const show = (name) => {
    if (!name) { view.replaceChildren(); return; }
    view.replaceChildren(f.type === 'image' ? h('img', { class: 'thumb', src: imgUrl(name), alt: '' })
      : f.type === 'video' ? h('video', { src: imgUrl(name), controls: true, preload: 'metadata', style: 'max-width:240px' }) : h('audio', { src: imgUrl(name), controls: true }),
    h('button', { type: 'button', class: 'small', onclick: () => { hidden.value = ''; show(''); } }, T('Убрать')));
  };
  show(v);
  const status = h('small', { class: 'muted' });
  const accept = f.type === 'image' ? 'image/*' : f.type === 'video' ? 'video/mp4,video/webm' : 'audio/mpeg,audio/ogg,audio/wav,audio/mp4,.m4a';
  const pick = h('input', { type: 'file', accept, onchange: async () => {
    const file = pick.files[0]; if (!file) return;
    status.textContent = T('Загрузка…');
    try {
      let name;
      if (f.type === 'image') name = await uploadImage(file);
      else {
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        const res = await fetch(`/api/upload-raw?ext=${encodeURIComponent(ext)}`, { method: 'POST', credentials: 'same-origin', body: file });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Ошибка ${res.status}`);
        name = data.file;
      }
      hidden.value = name; show(name); status.textContent = T('Готово');
    } catch (e) { status.textContent = e.message; }
  } });
  return h('div', { class: 'f', 'data-for': f.name, style: f.hidden ? 'display:none' : null }, label, pick, status, view, hidden);
}

export function readForm(form) {
  const out = {};
  for (const el of form.elements) { if (el.name) out[el.name] = el.type === 'checkbox' ? el.checked : el.value; }
  form.querySelectorAll('[data-days]').forEach((box) => { out[box.dataset.days] = [...box.querySelectorAll('input:checked')].map((i) => i.value).join(','); });
  form.querySelectorAll('[data-users]').forEach((box) => { out[box.dataset.users] = [...box.querySelectorAll('input:checked')].map((i) => Number(i.value)); });
  return out;
}

export function formPanel({ title, fields, values = {}, submitLabel = 'Сохранить', onSubmit, onCancel, extra }) {
  const box = h('div');
  const form = h('form', { class: 'grid', onsubmit: (e) => { e.preventDefault(); guard(box, async () => { await onSubmit(readForm(form), box); }); } },
    fields.map((f) => field(f, values[f.name])), extra || null,
    h('div', { class: 'row', style: 'grid-column:1/-1;margin:0' }, h('button', { class: 'primary', type: 'submit' }, T(submitLabel)), onCancel && h('button', { type: 'button', onclick: onCancel }, T('Отмена'))));
  return h('div', { class: 'panel' }, title ? h('h2', {}, T(title)) : null, box, form);
}

export function table(cols, rows, empty = 'Пока пусто') {
  if (!rows.length) return h('div', { class: 'empty' }, T(empty));
  return h('div', { class: 'scroll' }, h('table', {}, h('thead', {}, h('tr', {}, cols.map((c) => h('th', {}, T(c.label))))),
    h('tbody', {}, rows.map((r) => h('tr', {}, cols.map((c, i) => h('td', { 'data-label': T(c.label) }, c.render ? c.render(r) : r[c.key] ?? ''))))))); 
}

export function tabs(items, onPick, current) {
  const box = h('div', { class: 'tabs' });
  const draw = (cur) => box.replaceChildren(...items.map(([k, label]) => h('button', { class: k === cur ? 'active' : '', onclick: () => { draw(k); onPick(k); } }, T(label))));
  draw(current || items[0][0]);
  return box;
}

export const iconBtn = (ico, label, onclick, cls = '') => h('button', { class: `small ${cls}`, onclick, title: T(label) }, icon(ico, 14), T(label));

// Универсальный экран «список + форма добавления/редактирования».
export async function crud({ title, load, columns, fields, create, update, remove, actions, canAdd = true, hideTitle = false, addLabel = '+ Добавить', initial = () => ({}) }) {
  const root = h('div'), msgBox = h('div'), listBox = h('div'), formBox = h('div');
  const refresh = async () => {
    const rows = await load();
    const cell = (r) => h('div', { class: 'row', style: 'margin:0;flex-wrap:nowrap' },
      update && iconBtn('edit', 'Изменить', () => show(r, true)),
      actions?.(r, refresh, msgBox),
      remove && iconBtn('trash', 'Удалить', () => guard(msgBox, async () => { if (confirm(T('Удалить?'))) { await remove(r); await refresh(); } }), 'danger'));
    listBox.replaceChildren(h('div', { class: 'panel' }, table([...columns, { label: '', render: cell }], rows)));
  };
  const show = (values, editing) => {
    formBox.replaceChildren(formPanel({ title: editing ? 'Редактирование' : 'Добавить', fields: fields(editing ? values : null), values,
      onSubmit: async (data) => { await (editing ? update(values, data) : create(data)); formBox.replaceChildren(); await refresh(); msg(msgBox, T('Сохранено'), true); },
      onCancel: () => formBox.replaceChildren() }));
    formBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  root.append(h('div', { class: 'row' }, hideTitle ? null : h('h1', {}, T(title)), h('span', { class: 'spacer' }), canAdd && create && h('button', { class: 'primary', onclick: () => show(initial(), false) }, icon('plus', 16), T(addLabel.replace('+ ', '')))), msgBox, formBox, listBox);
  await refresh();
  return root;
}
