'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { getSettings, setSetting } = require('./db');

const NAME_RE = /^school-\d{8}-\d{6}\.sqlite$/;
const dirOf = (dataDir) => path.join(dataDir, 'backups');

function stamp(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

function listBackups(dataDir) {
  const dir = dirOf(dataDir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((n) => NAME_RE.test(n)).map((name) => {
    const st = fs.statSync(path.join(dir, name));
    return { name, size: st.size, created_at: st.mtime.toISOString() };
  }).sort((a, b) => b.name.localeCompare(a.name));
}

// Консистентная копия базы (VACUUM INTO) + удаление старых копий сверх лимита.
function makeBackup(db, dataDir, now = new Date()) {
  const dir = dirOf(dataDir);
  fs.mkdirSync(dir, { recursive: true });
  let name = `school-${stamp(now)}.sqlite`;
  for (let i = 1; fs.existsSync(path.join(dir, name)); i++) name = `school-${stamp(new Date(now.getTime() + i * 1000))}.sqlite`;
  const file = path.join(dir, name);
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  setSetting(db, 'backup_last', now.toISOString());
  const keep = Math.min(60, Math.max(1, Number(getSettings(db).backup_keep) || 14));
  for (const old of listBackups(dataDir).slice(keep)) fs.rmSync(path.join(dir, old.name), { force: true });
  return { name, file, size: fs.statSync(file).size };
}

// Вызывается по таймеру: делает копию, если с прошлой прошло больше backup_hours.
async function runBackupIfDue(db, dataDir, notifier, now = new Date()) {
  const s = getSettings(db);
  if (s.backup_enabled !== '1') return null;
  const hours = Math.min(168, Math.max(1, Number(s.backup_hours) || 24));
  const last = Date.parse(s.backup_last) || 0;
  if (now.getTime() - last < hours * 3600_000) return null;
  const b = makeBackup(db, dataDir, now);
  if (s.backup_telegram === '1' && notifier.hasTransport() && b.size <= 45 * 1024 * 1024) {
    const dirs = db.prepare("SELECT telegram_id FROM users WHERE role='director' AND active=1 AND frozen=0 AND telegram_id IS NOT NULL").all();
    for (const d of dirs) await notifier.sendDocument(d.telegram_id, b.file, `🗄 Резервная копия базы школы (${now.toISOString().slice(0, 16).replace('T', ' ')} UTC)`).catch((e) => console.error('[backup] Telegram:', e.message));
  }
  return b;
}

module.exports = { NAME_RE, dirOf, listBackups, makeBackup, runBackupIfDue };
