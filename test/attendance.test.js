'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { openDb, setSetting } = require('../server/db');
const { createNotifier } = require('../server/notify');
const { hashPassword } = require('../server/auth');
const { checkIn, checkOut, manualMark, distanceMeters } = require('../server/attendance');
const { monthReport } = require('../server/salary');

const SCHOOL = { lat: 40.5, lon: 68.0 };
function setup() {
  const db = openDb(':memory:');
  setSetting(db, 'school_lat', SCHOOL.lat); setSetting(db, 'school_lon', SCHOOL.lon);
  const notifier = createNotifier(db);
  const sent = [];
  notifier.setTransport(async (tg, text) => sent.push([tg, text]));
  const mk = (name, role, extra = {}) => {
    const r = db.prepare(`INSERT INTO users (username,password_hash,full_name,role,monthly_salary,shift_start,shift_end,work_days,telegram_id)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(name, hashPassword('password1'), name, role,
      extra.salary ?? 3_000_000, '09:00', '14:00', extra.days ?? '1,2,3,4,5,6', extra.tg ?? null);
    return db.prepare('SELECT * FROM users WHERE id=?').get(r.lastInsertRowid);
  };
  return { db, notifier, sent, mk };
}
// 2026-11-16 — понедельник. Часовой пояс школы UTC+5, поэтому 09:45 = 04:45Z.
const at = (day, hhmm) => { const [h, m] = hhmm.split(':').map(Number); return new Date(Date.UTC(2026, 10, day, h - 5, m)); };

test('вовремя: замечаний нет', () => {
  const { db, notifier, sent, mk } = setup();
  const t = mk('teacher', 'teacher');
  const r = checkIn(db, notifier, t, { lat: 40.5, lon: 68.0 }, at(16, '09:05'));
  assert.equal(r.ok, true); assert.equal(r.late, false); assert.equal(sent.length, 0);
});

test('опоздание 9:45 при начале в 9:00: замечание и уведомление директору', () => {
  const { db, notifier, sent, mk } = setup();
  mk('director', 'director', { tg: '111' });
  const t = mk('teacher', 'teacher', { tg: '222' });
  const r = checkIn(db, notifier, t, SCHOOL, at(16, '09:45'));
  assert.equal(r.late, true); assert.equal(r.lateMinutes, 45);
  assert.ok(sent.find(([tg, txt]) => tg === '111' && txt.includes('Опоздание') && txt.includes('45')));
  assert.ok(sent.find(([tg, txt]) => tg === '222' && txt.includes('Замечание')));
});

test('вне радиуса — приход не засчитывается', () => {
  const { db, notifier, mk } = setup();
  const t = mk('teacher', 'teacher');
  const r = checkIn(db, notifier, t, { lat: 40.52, lon: 68.0 }, at(16, '09:00'));
  assert.equal(r.ok, false); assert.match(r.message, /вне зоны/);
  assert.ok(distanceMeters(40.5, 68, 40.52, 68) > 2000);
});

test('повторный приход, уход без прихода, ранний уход', () => {
  const { db, notifier, sent, mk } = setup();
  mk('director', 'director', { tg: '1' });
  const t = mk('teacher', 'teacher');
  assert.equal(checkOut(db, notifier, t, SCHOOL, at(16, '13:00')).ok, false);
  assert.equal(checkIn(db, notifier, t, SCHOOL, at(16, '09:00')).ok, true);
  assert.equal(checkIn(db, notifier, t, SCHOOL, at(16, '09:01')).ok, false);
  const out = checkOut(db, notifier, t, SCHOOL, at(16, '12:00'));
  assert.equal(out.early, true); assert.equal(out.earlyMinutes, 120);
  assert.ok(sent.some(([, x]) => x.includes('Ранний уход')));
});

test('нерабочий день и праздник', () => {
  const { db, notifier, mk } = setup();
  const t = mk('teacher', 'teacher', { days: '1,2,3,4,5' });
  assert.match(checkIn(db, notifier, t, SCHOOL, at(21, '09:00')).message, /нерабочий/); // суббота
  db.prepare("INSERT INTO holidays (date,title) VALUES ('2026-11-17','Праздник')").run();
  assert.match(checkIn(db, notifier, t, SCHOOL, at(17, '09:00')).message, /праздничный/);
});

test('зарплата: 3 000 000 сум, отработано 10 дней из 26', () => {
  const { db, notifier, mk } = setup();
  const t = mk('teacher', 'teacher', { salary: 3_000_000 }); // пн–сб
  db.prepare("INSERT INTO holidays (date,title) VALUES ('2026-11-19','x')").run(); // ещё один выходной
  // ноябрь 2026: 30 дней, воскресений 5 (1,8,15,22,29) → 25 рабочих, минус праздник = 24
  for (const d of [2, 3, 4, 5, 6, 7, 9, 10, 11, 12]) checkIn(db, notifier, t, SCHOOL, at(d, '09:00'));
  const rep = monthReport(db, t, '2026-11', at(30, '15:00'));
  assert.equal(rep.scheduled, 24); assert.equal(rep.present, 10);
  assert.equal(rep.earned, Math.round((3_000_000 / 24) * 10));
  assert.equal(rep.absent, rep.elapsed - 10);
});

test('уважительная причина оплачивается, прогулы — нет; будущие дни не считаются прогулами', () => {
  const { db, mk } = setup();
  const t = mk('teacher', 'teacher', { salary: 2_400_000, days: '1,2,3,4,5,6' });
  manualMark(db, t.id, '2026-11-02', 'excused', 'болезнь');
  const rep = monthReport(db, t, '2026-11', at(4, '10:00')); // сегодня 4 ноября
  assert.equal(rep.elapsed, 3); assert.equal(rep.excused, 1); assert.equal(rep.absent, 2);
  assert.equal(rep.earned, Math.round((2_400_000 / rep.scheduled) * 1));
});
