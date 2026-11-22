'use strict';
// Безопасность (только директор): журнал входов, вход по коду, резервные копии.
const { HttpError } = require('./http');
const { getSettings, setSetting } = require('./db');
const V = require('./validate');
const S = require('./security');
const B = require('./backup');

function securityRoutes({ db, notifier, dataDir }) {
  const { routes, get, post, put } = V.makeRouter();
  const all = (sql, ...p) => db.prepare(sql).all(...p);

  // Подтверждение входа кодом (второй шаг после пароля)
  post('/api/auth/verify', 'public', ({ req, body, setSession }) => {
    const uid = S.checkCode(db, body.token, body.code);
    const u = db.prepare('SELECT * FROM users WHERE id=? AND active=1 AND frozen=0').get(uid);
    if (!u) throw new HttpError(401, 'Аккаунт недоступен');
    S.logLogin(db, { user_id: u.id, username: u.username, ip: req.socket.remoteAddress, ua: req.headers['user-agent'], ok: true, reason: 'по коду из Telegram' });
    setSession(u.id, body.remember !== false);
    const { password_hash, link_code, ...rest } = u; // eslint-disable-line no-unused-vars
    return { ...rest, telegram_linked: !!u.telegram_id, telegram_id: undefined };
  });

  get('/api/security/status', 'director', ({ user }) => {
    const s = getSettings(db);
    return { director_2fa: s.director_2fa === '1', telegram_linked: !!user.telegram_id, bot_ready: notifier.hasTransport(), env_disabled: process.env.DISABLE_2FA === '1',
      backup: { enabled: s.backup_enabled === '1', hours: Number(s.backup_hours), keep: Number(s.backup_keep), telegram: s.backup_telegram === '1', last: s.backup_last } };
  });
  get('/api/security/log', 'director', ({ query }) => {
    const only = query.ok === '0' ? 'WHERE ok=0' : query.ok === '1' ? 'WHERE ok=1' : '';
    const rows = all(`SELECT * FROM login_log ${only} ORDER BY id DESC LIMIT ?`, V.int(query.limit, 200, 1, 500));
    const day = all("SELECT COUNT(*) c FROM login_log WHERE ok=0 AND created_at >= datetime('now','-1 day')")[0].c;
    return { rows, failed_24h: day };
  });

  post('/api/security/2fa/start', 'director', async ({ user }) => {
    if (!user.telegram_id) throw new HttpError(400, 'Сначала привяжите Telegram к своему аккаунту (Профиль → Telegram)');
    if (!notifier.hasTransport()) throw new HttpError(400, 'Telegram-бот не запущен на сервере (нет TELEGRAM_BOT_TOKEN)');
    return { token: await S.issueCode(db, notifier, user, 'включение защиты') };
  });
  post('/api/security/2fa', 'director', ({ user, body }) => {
    if (body.enabled) {
      // включаем только после проверки, что код из Telegram реально доходит (иначе директор заблокирует сам себя)
      if (S.checkCode(db, body.token, body.code) !== user.id) throw new HttpError(401, 'Неверный код');
      setSetting(db, 'director_2fa', '1');
    } else setSetting(db, 'director_2fa', '0');
    return { ok: true };
  });

  get('/api/backups', 'director', () => ({ files: B.listBackups(dataDir) }));
  post('/api/backups', 'director', ({ user }) => {
    const b = B.makeBackup(db, dataDir);
    db.prepare('INSERT INTO audit_log (user_id, user_name, action, target) VALUES (?,?,?,?)').run(user.id, user.full_name, 'создал(а) резервную копию', 'База данных');
    return { name: b.name, size: b.size };
  });
  put('/api/backup-settings', 'director', ({ body }) => {
    if ('backup_enabled' in body) setSetting(db, 'backup_enabled', body.backup_enabled ? '1' : '0');
    if ('backup_hours' in body) setSetting(db, 'backup_hours', String(V.int(body.backup_hours, 24, 1, 168)));
    if ('backup_keep' in body) setSetting(db, 'backup_keep', String(V.int(body.backup_keep, 14, 1, 60)));
    if ('backup_telegram' in body) setSetting(db, 'backup_telegram', body.backup_telegram ? '1' : '0');
    return { ok: true };
  });

  return { routes };
}

module.exports = { securityRoutes };
