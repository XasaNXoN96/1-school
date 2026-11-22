'use strict';
// Информация для родителей и гостей: меню столовой, звонки и подвоз, документы.
const fs = require('node:fs');
const path = require('node:path');
const { HttpError } = require('./http');
const { getSettings } = require('./db');
const { localNow } = require('./attendance');
const V = require('./validate');

const DOC_FILE = /^[a-f0-9]{32}\.(pdf|doc|docx|xls|xlsx)$/;
const mondayOf = (d) => V.addDays(d, -(V.weekdayOf(d) - 1));

function infoRoutes({ db, uploadsDir }) {
  const { routes, get, post, put, del } = V.makeRouter();
  const one = (sql, ...p) => db.prepare(sql).get(...p);
  const all = (sql, ...p) => db.prepare(sql).all(...p);
  const run = (sql, ...p) => db.prepare(sql).run(...p);
  const today = () => localNow(new Date(), getSettings(db).timezone).date;

  // ---------- меню столовой ----------
  const week = (start) => {
    const rows = new Map(all('SELECT * FROM menu_days WHERE date>=? AND date<=?', start, V.addDays(start, 6)).map((r) => [r.date, r]));
    return { week_start: start, days: Array.from({ length: 7 }, (_, i) => { const d = V.addDays(start, i); const r = rows.get(d); return { date: d, breakfast: r?.breakfast || '', lunch: r?.lunch || '', snack: r?.snack || '' }; }) };
  };
  get('/api/public/menu', 'public', ({ query }) => ({ ...week(mondayOf(V.date(query.date || today()))), today: today() }));
  get('/api/menu', 'manager', ({ query }) => week(mondayOf(V.date(query.date || today()))));
  put('/api/menu/:date', 'manager', ({ params, body }) => {
    const d = V.date(params.date);
    const b = V.str(body.breakfast, 600), l = V.str(body.lunch, 600), s = V.str(body.snack, 600);
    if (!b && !l && !s) run('DELETE FROM menu_days WHERE date=?', d);
    else run('INSERT INTO menu_days (date, breakfast, lunch, snack) VALUES (?,?,?,?) ON CONFLICT(date) DO UPDATE SET breakfast=excluded.breakfast, lunch=excluded.lunch, snack=excluded.snack', d, b, l, s);
    return { ok: true };
  });
  // Копирует меню недели на следующую (удобно, если меню повторяется)
  post('/api/menu/copy-week', 'manager', ({ body }) => {
    const from = mondayOf(V.date(body.date)), to = V.addDays(from, 7);
    let n = 0;
    for (const r of all('SELECT * FROM menu_days WHERE date>=? AND date<=?', from, V.addDays(from, 6))) {
      run('INSERT INTO menu_days (date, breakfast, lunch, snack) VALUES (?,?,?,?) ON CONFLICT(date) DO UPDATE SET breakfast=excluded.breakfast, lunch=excluded.lunch, snack=excluded.snack', V.addDays(r.date, 7), r.breakfast, r.lunch, r.snack);
      n++;
    }
    return { ok: true, copied: n, week_start: to };
  });

  // ---------- звонки и подвоз ----------
  const bellRows = () => all('SELECT id, shift, number, start_time, end_time FROM bells ORDER BY shift, number');
  const transport = () => all('SELECT id, title, description, times FROM transport_routes ORDER BY sort, id');
  get('/api/public/bells', 'public', () => ({ bells: bellRows(), transport: transport() }));
  get('/api/bells', 'manager', () => ({ bells: bellRows(), transport: transport() }));
  put('/api/bells', 'manager', ({ body }) => {
    if (!Array.isArray(body.bells) || body.bells.length > 40) throw new HttpError(400, 'Не более 40 звонков');
    const rows = body.bells.map((b) => ({ shift: V.int(b.shift, 1, 1, 3), number: V.int(b.number, 1, 1, 12), start_time: V.hhmm(b.start_time), end_time: V.hhmm(b.end_time) }));
    for (const r of rows) if (r.end_time <= r.start_time) throw new HttpError(400, `Урок ${r.number}: конец раньше начала`);
    db.exec('BEGIN');
    try {
      run('DELETE FROM bells');
      for (const r of rows) run('INSERT INTO bells (shift, number, start_time, end_time) VALUES (?,?,?,?)', r.shift, r.number, r.start_time, r.end_time);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    return { ok: true };
  });
  post('/api/transport', 'manager', ({ body }) => {
    const r = run('INSERT INTO transport_routes (title, description, times, sort) VALUES (?,?,?,?)', V.str(body.title, 120, true, 'название'), V.str(body.description, 500), V.str(body.times, 300), V.int(body.sort, 0, 0, 999));
    return { ok: true, id: Number(r.lastInsertRowid) };
  });
  put('/api/transport/:id', 'manager', ({ params, body }) => {
    V.must(one('SELECT 1 x FROM transport_routes WHERE id=?', params.id));
    run('UPDATE transport_routes SET title=?, description=?, times=?, sort=? WHERE id=?', V.str(body.title, 120, true, 'название'), V.str(body.description, 500), V.str(body.times, 300), V.int(body.sort, 0, 0, 999), params.id);
    return { ok: true };
  });
  del('/api/transport/:id', 'manager', ({ params }) => { run('DELETE FROM transport_routes WHERE id=?', params.id); return { ok: true }; });

  // ---------- документы ----------
  const docs = () => all('SELECT id, title, category, description, file, original_name, created_at FROM documents ORDER BY category, id DESC').map((d) => {
    let size = 0; try { size = fs.statSync(path.join(uploadsDir, d.file)).size; } catch { /* файл мог быть удалён */ }
    return { ...d, size };
  });
  get('/api/public/documents', 'public', () => docs());
  get('/api/documents', 'manager', () => docs());
  post('/api/documents', 'manager', ({ body }) => {
    const file = V.str(body.file, 100, true, 'файл');
    if (!DOC_FILE.test(file)) throw new HttpError(400, 'Некорректный файл');
    if (!fs.existsSync(path.join(uploadsDir, file))) throw new HttpError(400, 'Файл не загружен');
    const r = run('INSERT INTO documents (title, category, description, file, original_name) VALUES (?,?,?,?,?)', V.str(body.title, 150, true, 'название'), V.str(body.category, 60), V.str(body.description, 300), file, V.str(body.original_name, 120).replace(/[\\/<>"]/g, ''));
    return { ok: true, id: Number(r.lastInsertRowid) };
  });
  del('/api/documents/:id', 'manager', ({ params }) => {
    const d = V.must(one('SELECT * FROM documents WHERE id=?', params.id));
    run('DELETE FROM documents WHERE id=?', d.id);
    if (DOC_FILE.test(d.file)) fs.rmSync(path.join(uploadsDir, d.file), { force: true });
    return { ok: true };
  });

  return { routes };
}

module.exports = { infoRoutes, DOC_FILE };
