'use strict';

// Уведомления: пишем в таблицу notices (видно в панели) и, если есть Telegram, отправляем в бота.
function createNotifier(db) {
  let transport = null;    // (telegramId, text) => Promise
  let docTransport = null; // (telegramId, filePath, caption) => Promise

  const notifier = {
    setTransport(fn) { transport = fn; },
    setDocTransport(fn) { docTransport = fn; },
    hasTransport() { return !!transport; },

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

    // Прямая отправка в Telegram-чат (родителям, код входа). Возвращает промис; без бота — отказ.
    async sendTelegram(chatId, text) {
      if (!transport) throw new Error('Telegram-бот не подключён');
      return transport(chatId, text);
    },

    async sendDocument(chatId, filePath, caption) {
      if (!docTransport) throw new Error('Telegram-бот не подключён');
      return docTransport(chatId, filePath, caption);
    },
  };
  return notifier;
}

module.exports = { createNotifier };
