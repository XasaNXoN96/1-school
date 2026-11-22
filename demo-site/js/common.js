// Общие помощники для гостевого сайта и панели. Весь пользовательский текст вставляется
// через textContent — HTML из базы никогда не выполняется.
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

export async function api(method, url, body) {
  const res = await fetch(url, {
    method, credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || `Ошибка ${res.status}`); e.status = res.status; throw e; }
  return data;
}

export const fmtDate = (s) => {
  if (!s) return '';
  const d = new Date(String(s).replace(' ', 'T').slice(0, 10) + 'T00:00:00');
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
};
export const fmtMoney = (n) => `${Math.round(n || 0).toLocaleString('ru-RU')} сум`;
export const imgUrl = (f) => (f ? (window.__DEMO_ROOT || '') + `uploads/${f}` : '');

// Абзацы из обычного текста (пустая строка — новый абзац).
export const paragraphs = (text) =>
  String(text || '').split(/\n{2,}/).filter(Boolean).map((p) => h('p', {}, p));

// Уменьшает фото в браузере (до 1600 px) и отправляет на сервер. Возвращает имя файла.
export async function uploadImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const data = canvas.toDataURL('image/jpeg', 0.85);
  return (await api('POST', '/api/upload', { data })).file;
}
