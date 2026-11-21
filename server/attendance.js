'use strict';
const { getSettings } = require('./db');

const WEEKDAYS = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

// Текущая дата/время в часовом поясе школы.
function localNow(date, tz) {
  const parts = {};
  for (const p of new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(date)) parts[p.type] = p.value;
  const hh = Number(parts.hour), mm = Number(parts.minute);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    minutes: hh * 60 + mm,
    weekday: WEEKDAYS[parts.weekday],
  };
}

const toMinutes = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

const fmtMin = (n) => {
  const h = Math.floor(n / 60), m = n % 60;
  return h ? `${h} ч ${m} мин` : `${m} мин`;
};

// Проверки, общие для прихода и ухода: геозона, праздники, рабочий день.
function precheck(db, user, loc, now) {
  const s = getSettings(db);
  const lat = parseFloat(s.school_lat), lon = parseFloat(s.school_lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { ok: false, message: 'Координаты школы ещё не заданы. Сообщите директору.' };
  }
  if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lon)) {
    return { ok: false, message: 'Не удалось получить геолокацию.' };
  }
  const radius = parseInt(s.radius_m, 10) || 150;
  const dist = distanceMeters(lat, lon, loc.lat, loc.lon);
  if (dist > radius) {
    return { ok: false, message: `Вы вне зоны школы: до неё ${dist} м, допустимо ${radius} м.` };
  }
  const local = localNow(now, s.timezone);
  const holiday = db.prepare('SELECT title FROM holidays WHERE date = ?').get(local.date);
  if (holiday) return { ok: false, message: `Сегодня праздничный день${holiday.title ? ': ' + holiday.title : ''}.` };
  const days = user.work_days.split(',').map(Number);
  if (!days.includes(local.weekday)) return { ok: false, message: 'Сегодня у вас нерабочий день.' };
  return { ok: true, s, local, dist, grace: parseInt(s.grace_minutes, 10) || 0 };
}

function checkIn(db, notifier, user, loc, now = new Date()) {
  const pre = precheck(db, user, loc, now);
  if (!pre.ok) return pre;
  const { local, dist, grace } = pre;
  const row = db.prepare('SELECT * FROM attendance WHERE user_id = ? AND date = ?').get(user.id, local.date);
  if (row && row.check_in) {
    return { ok: false, message: `Приход уже отмечен в ${row.check_in.slice(11, 16)}.` };
  }
  const start = toMinutes(user.shift_start);
  const late = Math.max(0, local.minutes - start);
  const isLate = late > grace;
  const stamp = `${local.date} ${local.time}`;
  db.prepare(
    `INSERT INTO attendance (user_id, date, status, check_in, late_minutes, in_distance)
     VALUES (?,?, 'present', ?, ?, ?)
     ON CONFLICT(user_id, date) DO UPDATE SET status='present', check_in=excluded.check_in,
       late_minutes=excluded.late_minutes, in_distance=excluded.in_distance`
  ).run(user.id, local.date, stamp, isLate ? late : 0, dist);

  if (isLate) {
    notifier.notify([user.id],
      `⚠️ Замечание: опоздание на ${fmtMin(late)}. Занятия с ${user.shift_start}, приход в ${local.time}.`);
    notifier.notifyManagers(
      `⚠️ Опоздание: ${user.full_name} пришёл в ${local.time} (начало ${user.shift_start}, опоздание ${fmtMin(late)}).`);
  }
  return {
    ok: true, late: isLate, lateMinutes: isLate ? late : 0,
    message: isLate
      ? `Приход отмечен в ${local.time}. ⚠️ Опоздание на ${fmtMin(late)} — директор уведомлён.`
      : `✅ Приход отмечен в ${local.time}. Хорошего дня!`,
  };
}

function checkOut(db, notifier, user, loc, now = new Date()) {
  const pre = precheck(db, user, loc, now);
  if (!pre.ok) return pre;
  const { local, dist, grace } = pre;
  const row = db.prepare('SELECT * FROM attendance WHERE user_id = ? AND date = ?').get(user.id, local.date);
  if (!row || !row.check_in) return { ok: false, message: 'Сначала отметьте приход.' };
  if (row.check_out) return { ok: false, message: `Уход уже отмечен в ${row.check_out.slice(11, 16)}.` };
  const end = toMinutes(user.shift_end);
  const early = Math.max(0, end - local.minutes);
  const isEarly = early > grace;
  db.prepare('UPDATE attendance SET check_out = ?, early_minutes = ?, out_distance = ? WHERE id = ?')
    .run(`${local.date} ${local.time}`, isEarly ? early : 0, dist, row.id);

  if (isEarly) {
    notifier.notify([user.id], `⚠️ Замечание: уход раньше на ${fmtMin(early)} (конец смены ${user.shift_end}).`);
    notifier.notifyManagers(
      `⚠️ Ранний уход: ${user.full_name} ушёл в ${local.time} (конец смены ${user.shift_end}, раньше на ${fmtMin(early)}).`);
  }
  return {
    ok: true, early: isEarly, earlyMinutes: isEarly ? early : 0,
    message: isEarly
      ? `Уход отмечен в ${local.time}. ⚠️ Раньше конца смены на ${fmtMin(early)} — директор уведомлён.`
      : `🏁 Уход отмечен в ${local.time}. До завтра!`,
  };
}

// Ручная отметка директором/ассистентом (болезнь, командировка, сбой бота).
function manualMark(db, userId, date, status, note = '') {
  db.prepare(
    `INSERT INTO attendance (user_id, date, status, note) VALUES (?,?,?,?)
     ON CONFLICT(user_id, date) DO UPDATE SET status = excluded.status, note = excluded.note`
  ).run(userId, date, status, note);
}

module.exports = { localNow, distanceMeters, checkIn, checkOut, manualMark, toMinutes, fmtMin };
