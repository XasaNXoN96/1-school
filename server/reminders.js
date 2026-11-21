'use strict';
const { getSettings } = require('./db');
const { localNow } = require('./attendance');

// Рассылает напоминания из «Моих планов»: в панель и в Telegram-бот.
function runReminders(db, notifier, now = new Date()) {
  const t = localNow(now, getSettings(db).timezone);
  const due = db.prepare(
    `SELECT p.* FROM plans p JOIN users u ON u.id = p.user_id
     WHERE p.notified = 0 AND p.done = 0 AND u.active = 1 AND u.frozen = 0
       AND (p.date < ? OR (p.date = ? AND p.time <= ?))`).all(t.date, t.date, t.time);
  for (const p of due) {
    notifier.notify([p.user_id], `⏰ Напоминание: ${p.title} (${p.date === t.date ? '' : p.date + ' '}${p.time})`);
    db.prepare('UPDATE plans SET notified = 1 WHERE id = ?').run(p.id);
  }
  return due.length;
}

module.exports = { runReminders };
