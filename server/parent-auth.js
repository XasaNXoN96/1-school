'use strict';
const crypto = require('node:crypto');
const { HttpError } = require('./http');

const COOKIE = 'psid';
const DAYS = 30;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// Коды родителей: 8 знаков без похожих (0/O, 1/I), ≈ 40 бит — перебор ограничен лимитом попыток.
function newParentCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.randomBytes(8), (b) => alphabet[b % alphabet.length]).join('');
}

function uniqueParentCode(db) {
  for (let i = 0; i < 20; i++) {
    const c = newParentCode();
    if (!db.prepare('SELECT 1 x FROM students WHERE parent_code = ?').get(c)) return c;
  }
  throw new Error('Не удалось создать код');
}

// Вход родителя: добавляет ребёнка к сессии (cookie) — у родителя может быть несколько детей.
function parentLogin(db, cookies, code) {
  const clean = String(code || '').trim().toUpperCase().replace(/[\s-]/g, '');
  const st = clean.length >= 6 && db.prepare('SELECT * FROM students WHERE parent_code = ? AND active = 1').get(clean);
  if (!st) throw new HttpError(401, 'Код не найден. Проверьте код или обратитесь в школу.');
  let token = cookies[COOKIE];
  const known = token && db.prepare('SELECT 1 x FROM parent_sessions WHERE token_hash = ? AND expires_at > ?').get(sha(token), Date.now());
  if (!known) token = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + DAYS * 86400_000;
  db.prepare('INSERT INTO parent_sessions (token_hash, student_id, expires_at) VALUES (?,?,?) ON CONFLICT(token_hash, student_id) DO UPDATE SET expires_at = excluded.expires_at')
    .run(sha(token), st.id, expires);
  db.prepare('DELETE FROM parent_sessions WHERE expires_at < ?').run(Date.now());
  return { token, expires, student: st };
}

function parentChildren(db, cookies) {
  const token = cookies[COOKIE];
  if (!token) return [];
  return db.prepare(`SELECT s.* FROM parent_sessions p JOIN students s ON s.id = p.student_id
    WHERE p.token_hash = ? AND p.expires_at > ? AND s.active = 1 ORDER BY s.full_name`).all(sha(token), Date.now());
}

// Проверяет, что ребёнок относится к сессии родителя; без student_id берёт единственного ребёнка.
function requireChild(db, cookies, studentId) {
  const kids = parentChildren(db, cookies);
  if (!kids.length) throw new HttpError(401, 'Войдите по коду родителя');
  if (studentId == null || studentId === '') {
    if (kids.length === 1) return kids[0];
    throw new HttpError(400, 'Укажите ребёнка');
  }
  const kid = kids.find((k) => k.id === Number(studentId));
  if (!kid) throw new HttpError(403, 'Нет доступа к этому ученику');
  return kid;
}

function parentLogout(db, cookies) {
  if (cookies[COOKIE]) db.prepare('DELETE FROM parent_sessions WHERE token_hash = ?').run(sha(cookies[COOKIE]));
}

module.exports = { COOKIE, DAYS, newParentCode, uniqueParentCode, parentLogin, parentChildren, requireChild, parentLogout };
