'use strict';

// Уведомления: пишем в таблицу notices (видно в панели) и, если есть Telegram, отправляем в бота.
function createNotifier(db) {
  let transport = null; // (telegramId, text) => Promise

  const notifier = {
    setTransport(fn) { transport = fn; },

    managerIds() {
      return db.prepare("SELECT id FROM users WHERE active = 1 AND frozen = 0 AND role IN ('director','assistant')")
        .all().map((r) => r.id);
    },

    notify(userIds, text) {
      const ids = [...new Set(userIds)];
      for (const id of ids) {
        const user = db.prepare('SELECT id, telegram_id FROM users WHERE id = ? AND active = 1 AND frozen = 0').get(id);
        if (!user) continue;
        db.prepare('INSERT INTO notices (user_id, text) VALUES (?, ?)').run(id, text);
        if (transport && user.telegram_id) {
          Promise.resolve(transport(user.telegram_id, text)).catch((e) =>
            console.error('[telegram] не удалось отправить уведомление:', e.message));
        }
      }
    },

    notifyManagers(text) { this.notify(this.managerIds(), text); },
  };
  return notifier;
}

module.exports = { createNotifier };
