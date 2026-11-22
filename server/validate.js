'use strict';
// Общие проверки входных данных и мини-роутер для новых модулей.
const { HttpError } = require('./http');

const str = (v, max = 200, required = false, name = 'поле') => {
  const s = v == null ? '' : String(v).trim();
  if (required && !s) throw new HttpError(400, `Заполните: ${name}`);
  if (s.length > max) throw new HttpError(400, `Слишком длинное значение: ${name}`);
  return s;
};
const int = (v, def = 0, min = 0, max = 1e9) => {
  const n = Number(v ?? def);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, 'Некорректное число');
  return n;
};
const date = (v, required = true) => {
  const s = str(v, 10);
  if (!s && !required) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) throw new HttpError(400, 'Некорректная дата (ГГГГ-ММ-ДД)');
  return s;
};
const month = (v) => {
  const s = str(v, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) throw new HttpError(400, 'Некорректный месяц (ГГГГ-ММ)');
  return s;
};
const hhmm = (v, def) => {
  const s = str(v ?? def, 5);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) throw new HttpError(400, 'Некорректное время (ЧЧ:ММ)');
  return s;
};
const oneOf = (v, list, name = 'значение') => {
  const s = String(v ?? '');
  if (!list.includes(s)) throw new HttpError(400, `Недопустимое ${name}`);
  return s;
};
const weekdayOf = (d) => { const w = new Date(`${d}T00:00:00Z`).getUTCDay(); return w === 0 ? 7 : w; };
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

function makeRouter() {
  const routes = [];
  const add = (method, pattern, guard, handler) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    routes.push({ method, re, keys, guard, handler });
  };
  return { routes, get: (p, g, h) => add('GET', p, g, h), post: (p, g, h) => add('POST', p, g, h),
    put: (p, g, h) => add('PUT', p, g, h), del: (p, g, h) => add('DELETE', p, g, h) };
}

const must = (row, msg = 'Не найдено') => { if (!row) throw new HttpError(404, msg); return row; };

// Ограничитель частоты по ключу (в памяти): не более max событий за windowMs.
// ok() — можно ли ещё; hit() — записать событие; take() — и то и другое сразу.
function rateLimiter(max, windowMs) {
  const hits = new Map();
  const recent = (key) => { const now = Date.now(); const arr = (hits.get(key) || []).filter((t) => now - t < windowMs); hits.set(key, arr); return arr; };
  const api = {
    ok: (key) => recent(key).length < max,
    hit: (key) => { hits.set(key, [...recent(key), Date.now()]); },
    take: (key) => { if (!api.ok(key)) return false; api.hit(key); return true; },
  };
  return api;
}

module.exports = { str, int, date, month, hhmm, oneOf, weekdayOf, addDays, makeRouter, must, rateLimiter };
