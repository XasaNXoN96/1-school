'use strict';
const { getSettings } = require('./db');
const { localNow } = require('./attendance');

const pad = (n) => String(n).padStart(2, '0');

// Отчёт по сотруднику за месяц (month = 'YYYY-MM').
// Оклад делится на число рабочих дней месяца по графику сотрудника (минус праздники);
// начисляется за дни «пришёл» и «уважительная причина».
function monthReport(db, user, month, now = new Date()) {
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const workDays = user.work_days.split(',').map(Number);
  const holidays = new Set(
    db.prepare('SELECT date FROM holidays WHERE date LIKE ?').all(`${month}-%`).map((r) => r.date));
  const rows = new Map(
    db.prepare('SELECT * FROM attendance WHERE user_id = ? AND date LIKE ?').all(user.id, `${month}-%`)
      .map((r) => [r.date, r]));
  const today = localNow(now, getSettings(db).timezone).date;

  let scheduled = 0, elapsed = 0, present = 0, excused = 0, absent = 0;
  let lateCount = 0, lateMinutes = 0, earlyCount = 0;
  const days = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${month}-${pad(d)}`;
    let wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (wd === 0) wd = 7;
    const isWork = workDays.includes(wd) && !holidays.has(date);
    const row = rows.get(date);
    let status = isWork ? (date <= today ? 'absent' : 'upcoming') : 'off';
    if (row && isWork && row.status !== 'absent') status = row.status;
    if (isWork) {
      scheduled++;
      if (date <= today) {
        elapsed++;
        if (status === 'present') present++;
        else if (status === 'excused') excused++;
        else absent++;
      }
      if (row && row.status === 'present') {
        if (row.late_minutes > 0) { lateCount++; lateMinutes += row.late_minutes; }
        if (row.early_minutes > 0) earlyCount++;
      }
    }
    days.push({
      date, status, holiday: holidays.has(date),
      check_in: row?.check_in?.slice(11, 16) || null, check_out: row?.check_out?.slice(11, 16) || null,
      late_minutes: row?.late_minutes || 0, early_minutes: row?.early_minutes || 0, note: row?.note || '',
    });
  }
  const perDay = scheduled ? user.monthly_salary / scheduled : 0;
  return {
    user_id: user.id, full_name: user.full_name, role: user.role, month,
    base: user.monthly_salary, scheduled, elapsed, present, excused, absent,
    late_count: lateCount, late_minutes: lateMinutes, early_count: earlyCount,
    per_day: Math.round(perDay), earned: Math.round(perDay * (present + excused)), days,
  };
}

function currentMonth(db, now = new Date()) {
  return localNow(now, getSettings(db).timezone).date.slice(0, 7);
}

module.exports = { monthReport, currentMonth };
