'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Минимальная загрузка .env (без зависимостей).
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const { createApp } = require('./app');
const { createBot, telegramApi } = require('./bot');

const port = Number(process.env.PORT || 3000);
const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
const { server, db, notifier } = createApp({
  dbFile: path.join(dataDir, 'school.db'),
  dataDir,
  publicDir: path.join(__dirname, '..', 'public'),
  cookieSecure: process.env.COOKIE_SECURE === '1',
});

const token = process.env.TELEGRAM_BOT_TOKEN;
let bot = null;
if (token) {
  const api = telegramApi(token);
  bot = createBot({ db, notifier, api });
  notifier.setTransport((chatId, text) => api.sendMessage(chatId, text));
  bot.startPolling();
  console.log('Telegram-бот запущен');
} else {
  console.log('TELEGRAM_BOT_TOKEN не задан — Telegram-бот выключен (сайт работает).');
}

server.listen(port, () => console.log(`Сайт школы: http://localhost:${port}  (панель: /panel/)`));

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { bot?.stop(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); });
}
