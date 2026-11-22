'use strict';
const crypto = require('node:crypto');
const { HttpError } = require('./http');
const { getSettings } = require('./db');

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function logLogin(db, { user_id = null, username = '', ip = '', ua = '', ok = false, reason = '' }) {
  try {
    db.prepare('INSERT INTO login_log (user_id, username, ip, ua, ok, reason) VALUES (?,?,?,?,?,?)').run(user_id, String(username).slice(0, 60), String(ip).slice(0, 60), String(ua).slice(0, 200), ok ? 1 : 0, reason);
    db.prepare("DELETE FROM login_log WHERE id < (SELECT COALESCE(MAX(id),0) - 5000 FROM login_log)").run(); // храним последние ~5000 записей
  } catch { /* журнал не должен ломать вход */ }
}

// Вход директора по одноразовому коду из Telegram. Аварийно отключается переменной окружения DISABLE_2FA=1.
function twoFactorRequired(db, user) {
  return user.role === 'director' && !!user.telegram_id && getSettings(db).director_2fa === '1' && process.env.DISABLE_2FA !== '1';
}

async function issueCode(db, notifier, user, purpose = 'вход') {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('DELETE FROM login_codes WHERE user_id=? OR expires_at < ?').run(user.id, Date.now());
  db.prepare('INSERT INTO login_codes (token_hash, user_id, code_hash, expires_at) VALUES (?,?,?,?)').run(sha(token), user.id, sha(`${token}:${code}`), Date.now() + 5 * 60_000);
  try { await notifier.sendTelegram(user.telegram_id, `🔐 Код для входа (${purpose}): ${code}\nДействует 5 минут. Никому его не сообщайте.`); }
  catch (e) {
    db.prepare('DELETE FROM login_codes WHERE token_hash=?').run(sha(token));
    throw new HttpError(503, 'Не удалось отправить код в Telegram. Проверьте, что бот работает и аккаунт привязан.');
  }
  return token;
}

// Возвращает user_id при верном коде; считает попытки (не более 5).
function checkCode(db, token, code) {
  const row = db.prepare('SELECT * FROM login_codes WHERE token_hash=?').get(sha(String(token || '')));
  if (!row || row.expires_at < Date.now()) throw new HttpError(401, 'Код устарел. Войдите заново.');
  if (row.tries >= 5) { db.prepare('DELETE FROM login_codes WHERE token_hash=?').run(row.token_hash); throw new HttpError(401, 'Слишком много попыток. Войдите заново.'); }
  db.prepare('UPDATE login_codes SET tries = tries + 1 WHERE token_hash=?').run(row.token_hash);
  const given = sha(`${token}:${String(code || '').trim()}`);
  const ok = given.length === row.code_hash.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(row.code_hash));
  if (!ok) throw new HttpError(401, 'Неверный код');
  db.prepare('DELETE FROM login_codes WHERE token_hash=?').run(row.token_hash);
  return row.user_id;
}

module.exports = { logLogin, twoFactorRequired, issueCode, checkCode };
