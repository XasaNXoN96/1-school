'use strict';
const crypto = require('node:crypto');
const { HttpError } = require('./http');

const SESSION_DAYS = 14;
const MANAGER_ROLES = ['director', 'assistant'];

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [saltHex, hashHex] = String(stored || '').split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + SESSION_DAYS * 86400_000;
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)').run(sha(token), userId, expires);
  return { token, expires };
}

function userFromToken(db, token) {
  if (!token) return null;
  const row = db.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1 AND u.frozen = 0`
  ).get(sha(token), Date.now());
  return row || null;
}

function destroySession(db, token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token));
}

const isManager = (u) => !!u && MANAGER_ROLES.includes(u.role);

// Директор управляет всеми; ассистент — только учителями и персоналом.
function canManageUser(actor, target) {
  if (!actor || !target) return false;
  if (actor.role === 'director') return true;
  if (actor.role === 'assistant') return target.role === 'teacher' || target.role === 'staff';
  return false;
}

function requireRole(user, guard) {
  if (guard === 'public') return;
  if (!user) throw new HttpError(401, 'Нужно войти в систему');
  if (guard === 'manager' && !isManager(user)) throw new HttpError(403, 'Недостаточно прав');
  if (guard === 'director' && user.role !== 'director') throw new HttpError(403, 'Только для директора');
}

module.exports = {
  MANAGER_ROLES, hashPassword, verifyPassword, createSession, userFromToken,
  destroySession, isManager, canManageUser, requireRole,
};
