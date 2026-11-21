'use strict';
// Отметка по лицу и геозоне: одноразовая сессия → кадры с заданиями → проверка места, «живости» и личности.
const crypto = require('node:crypto');
const { HttpError } = require('./http');
const { getSettings } = require('./db');
const { distanceMeters, checkIn, checkOut, localNow } = require('./attendance');
const { readHeader } = require('./png');
const L = require('../public/js/liveness.js');

const SESSION_TTL_MS = 3 * 60_000;     // на всю проверку — 3 минуты
const MIN_SESSION_MS = 2500;           // быстрее человек не успеет выполнить задания: защита от скриптов
const MAX_FRAME_BYTES = 600_000;
const FAIL_WINDOW_MIN = 10, FAIL_LIMIT = 6;
const MAX_SAMPLES = 5;

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const toBuf = (arr) => Buffer.from(new Float32Array(arr).buffer);
const toVec = (buf) => Array.from(new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4));
const dist128 = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2; return Math.sqrt(s); };
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function faceSettings(db) {
  const s = getSettings(db);
  const f = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
  return {
    required: s.face_required === '1',
    match: f(s.face_match, 0.45), review: f(s.face_review, 0.55),
    maxAccuracy: f(s.gps_max_accuracy, 100), radius: parseInt(s.radius_m, 10) || 150,
    lat: parseFloat(s.school_lat), lon: parseFloat(s.school_lon), tz: s.timezone,
  };
}

function b64(v, max = MAX_FRAME_BYTES) {
  if (typeof v !== 'string' || v.length > max * 1.4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(v)) throw new HttpError(400, 'Некорректное изображение');
  const buf = Buffer.from(v, 'base64');
  if (!buf.length || buf.length > max) throw new HttpError(400, 'Некорректное изображение');
  return buf;
}
const jpegThumb = (v) => {
  try { const b = b64(v, 40_000); return b[0] === 0xff && b[1] === 0xd8 ? b : null; } catch { return null; }
};

// ---------- Telegram Mini App: проверка подписи initData ----------
function verifyInitData(initData, botToken, maxAgeSec = 3600, nowMs = Date.now()) {
  if (!initData || !botToken || typeof initData !== 'string' || initData.length > 4096) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash || !/^[a-f0-9]{64}$/.test(hash)) return null;
  params.delete('hash');
  const check = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calc = crypto.createHmac('sha256', secret).update(check).digest();
  if (!crypto.timingSafeEqual(calc, Buffer.from(hash, 'hex'))) return null;
  const age = nowMs / 1000 - Number(params.get('auth_date'));
  if (!Number.isFinite(age) || age > maxAgeSec || age < -300) return null;
  try { const u = JSON.parse(params.get('user')); return u && u.id ? u : null; } catch { return null; }
}

function failedRecently(db, userId, nowMs) {
  const since = new Date(nowMs - FAIL_WINDOW_MIN * 60_000).toISOString().replace('T', ' ').slice(0, 19);
  return db.prepare("SELECT COUNT(*) c FROM checkin_attempts WHERE user_id=? AND status='rejected' AND reason NOT IN ('rules','rejected_by_admin') AND created_at >= ?").get(userId, since).c;
}

const samplesOf = (db, userId) => db.prepare('SELECT id, descriptor FROM face_samples WHERE user_id=?').all(userId).map((r) => ({ id: r.id, v: toVec(r.descriptor) }));

// ---------- начало проверки ----------
function startSession(db, user, kind, nowMs = Date.now()) {
  if (kind !== 'in' && kind !== 'out') throw new HttpError(400, 'Укажите: приход или уход');
  const cfg = faceSettings(db);
  const local = localNow(new Date(nowMs), cfg.tz);
  const row = db.prepare('SELECT * FROM attendance WHERE user_id=? AND date=?').get(user.id, local.date);
  if (kind === 'in' && row?.check_in) throw new HttpError(409, `Приход уже отмечен в ${row.check_in.slice(11, 16)}`);
  if (kind === 'out' && !row?.check_in) throw new HttpError(409, 'Сначала отметьте приход');
  if (kind === 'out' && row?.check_out) throw new HttpError(409, `Уход уже отмечен в ${row.check_out.slice(11, 16)}`);
  if (!db.prepare('SELECT 1 FROM face_samples WHERE user_id=? LIMIT 1').get(user.id)) {
    throw new HttpError(409, 'Ваше лицо ещё не добавлено в систему. Попросите директора загрузить ваши фотографии.');
  }
  if (failedRecently(db, user.id, nowMs) >= FAIL_LIMIT) throw new HttpError(429, 'Слишком много неудачных попыток. Подождите 10 минут или обратитесь к директору.');
  // два разных случайных задания
  const pool = [...L.CHALLENGES];
  const challenges = [];
  while (challenges.length < 2) challenges.push(pool.splice(crypto.randomInt(pool.length), 1)[0]);
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('DELETE FROM checkin_sessions WHERE expires_at < ?').run(nowMs - 3_600_000);
  db.prepare('INSERT INTO checkin_sessions (token_hash,user_id,kind,challenges,created_at,expires_at) VALUES (?,?,?,?,?,?)')
    .run(sha(token), user.id, kind, challenges.join(','), nowMs, nowMs + SESSION_TTL_MS);
  return { token, kind, challenges, ttl_sec: SESSION_TTL_MS / 1000, radius_m: cfg.radius, max_accuracy: cfg.maxAccuracy };
}

function logAttempt(db, rec) {
  const info = db.prepare(`INSERT INTO checkin_attempts
    (user_id,date,kind,status,reason,message,via,lat,lon,accuracy,distance,zone_ok,face_ok,live_ok,face_distance,other_distance,other_user,challenges,details,thumb,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    rec.user_id, rec.date, rec.kind, rec.status, rec.reason || '', rec.message || '', rec.via || 'web',
    rec.lat ?? null, rec.lon ?? null, rec.accuracy ?? null, rec.distance ?? null,
    rec.zone_ok ?? null, rec.face_ok ?? null, rec.live_ok ?? null, rec.face_distance ?? null, rec.other_distance ?? null,
    rec.other_user || '', rec.challenges || '', JSON.stringify(rec.details || {}), rec.thumb || null,
    new Date(rec.nowMs || Date.now()).toISOString().replace('T', ' ').slice(0, 19));
  return Number(info.lastInsertRowid);
}

const REASON_RU = {
  gps_missing: 'не удалось определить местоположение', gps_inaccurate: 'слишком неточное определение местоположения',
  gps_stale: 'данные о местоположении устарели', no_zone: 'координаты школы не заданы', outside_zone: 'вы вне зоны школы',
  no_face: 'лицо не найдено в кадре', multiple_faces: 'в кадре несколько лиц', face_small: 'лицо слишком далеко или не по центру',
  neutral_bad: 'смотрите прямо в камеру с открытыми глазами', liveness_failed: 'не выполнено задание на «живость»',
  face_mismatch: 'лицо не совпало с эталоном', other_person: 'лицо похоже на другого сотрудника', face_swap: 'в ходе проверки лицо изменилось',
  engine_error: 'ошибка распознавания', frames_invalid: 'некорректные кадры',
};

// ---------- завершение: решающая проверка на сервере ----------
async function finishCheckin({ db, notifier, engine, user, body, via = 'web', nowMs = Date.now() }) {
  const cfg = faceSettings(db);
  const now = new Date(nowMs);
  const token = typeof body.token === 'string' ? body.token : '';
  const sess = token && db.prepare('SELECT * FROM checkin_sessions WHERE token_hash=?').get(sha(token));
  if (!sess || sess.user_id !== user.id) throw new HttpError(400, 'Сессия проверки не найдена. Начните заново.');
  // Сессия одноразовая: гасим её сразу, чтобы одну и ту же проверку нельзя было переиграть.
  const used = db.prepare('UPDATE checkin_sessions SET used=1 WHERE token_hash=? AND used=0').run(sha(token));
  if (!used.changes) throw new HttpError(409, 'Эта проверка уже использована. Начните заново.');
  if (sess.expires_at < nowMs) throw new HttpError(410, 'Время проверки вышло. Начните заново.');
  if (nowMs - sess.created_at < MIN_SESSION_MS) throw new HttpError(429, 'Слишком быстро. Выполните задания на экране.');
  if (failedRecently(db, user.id, nowMs) >= FAIL_LIMIT) throw new HttpError(429, 'Слишком много неудачных попыток. Подождите 10 минут.');

  const kind = sess.kind, challenges = sess.challenges.split(',');
  const date = localNow(now, cfg.tz).date;
  const rec = { user_id: user.id, date, kind, via, challenges: sess.challenges, details: {}, nowMs };
  const checks = { zone: { ok: false }, face: { ok: null }, live: { ok: null, steps: [] } };
  const fails = []; // [reason, extra]

  // 1) место
  const lat = num(body.lat), lon = num(body.lon), acc = num(body.accuracy), ts = num(body.loc_time);
  rec.lat = lat; rec.lon = lon; rec.accuracy = acc;
  if (!Number.isFinite(cfg.lat) || !Number.isFinite(cfg.lon)) fails.push('no_zone');
  else if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) fails.push('gps_missing');
  else if (acc == null || acc > cfg.maxAccuracy) fails.push('gps_inaccurate');
  else if (ts != null && Math.abs(nowMs - ts) > 120_000) fails.push('gps_stale');
  else {
    rec.distance = distanceMeters(cfg.lat, cfg.lon, lat, lon);
    if (rec.distance > cfg.radius) fails.push('outside_zone');
    else checks.zone.ok = true;
  }
  checks.zone = { ...checks.zone, distance: rec.distance ?? null, radius: cfg.radius, accuracy: acc };
  rec.zone_ok = checks.zone.ok ? 1 : 0;

  // 2) кадры
  let frames = null;
  try {
    if (!Array.isArray(body.frames) || body.frames.length !== challenges.length + 1) throw new Error('count');
    frames = body.frames.map((f) => { const buf = b64(f); readHeader(buf); return buf; });
  } catch { fails.push('frames_invalid'); }

  let faceDistance = null, status = 'rejected', pendingFace = false;
  if (frames) {
    try {
      const results = [];
      for (let i = 0; i < frames.length; i++) {
        const r = await engine.analyze(frames[i]);
        results.push(r);
        // кадр «без лица» дальше не разбираем — экономим процессор
        if (!(r.count === 1 && L.framed(r, r.width, r.height)) && i === 0) break;
        if (r.count !== 1) break;
      }
      const base = results[0];
      let faceFail = null;
      if (base.count === 0) faceFail = 'no_face';
      else if (base.count > 1) faceFail = 'multiple_faces';
      else if (!L.framed(base, base.width, base.height)) faceFail = 'face_small';
      else if (!L.neutralOk(L.metrics(base.landmarks))) faceFail = 'neutral_bad';

      if (faceFail) { fails.push(faceFail); checks.face.ok = false; checks.live.ok = false; }
      else {
        // живость: каждое задание выполнено в своём кадре, на нём тот же один человек
        const bm = L.metrics(base.landmarks);
        let liveOk = true;
        challenges.forEach((c, i) => {
          const r = results[i + 1];
          let step = { id: c, ok: false, value: null };
          if (r && r.count === 1 && L.framed(r, r.width, r.height)) {
            const ck = L.check(c, L.metrics(r.landmarks), bm);
            step = { id: c, ok: ck.pass, value: ck.value };
          }
          if (!step.ok) liveOk = false;
          checks.live.steps.push(step);
        });
        checks.live.ok = liveOk;
        rec.live_ok = liveOk ? 1 : 0;
        if (!liveOk) fails.push('liveness_failed');

        // личность: решающий кадр — нейтральный; в остальных кадрах тот же человек (с поправкой на мимику и поворот)
        const mine = samplesOf(db, user.id);
        faceDistance = Math.min(...mine.map((s) => dist128(base.descriptor, s.v)));
        let swap = false;
        for (let i = 1; i < results.length; i++) {
          const r = results[i];
          if (r.count !== 1) continue;
          // в кадрах с заданиями должен быть тот же человек, что и в первом (с запасом на мимику и поворот головы)
          if (dist128(base.descriptor, r.descriptor) > 0.62) swap = true;
          else if (faceDistance <= cfg.review && Math.min(...mine.map((s) => dist128(r.descriptor, s.v))) > cfg.review + 0.12) swap = true;
        }
        // не похож ли на кого-то другого из сотрудников больше, чем на себя
        let other = { d: Infinity, name: '' };
        for (const o of db.prepare("SELECT u.id, u.full_name FROM users u WHERE u.active=1 AND u.id != ? AND EXISTS (SELECT 1 FROM face_samples f WHERE f.user_id=u.id)").all(user.id)) {
          for (const s of samplesOf(db, o.id)) { const d = dist128(base.descriptor, s.v); if (d < other.d) other = { d, name: o.full_name }; }
        }
        rec.face_distance = +faceDistance.toFixed(3);
        if (Number.isFinite(other.d)) { rec.other_distance = +other.d.toFixed(3); rec.other_user = other.name; }
        if (swap) { fails.push('face_swap'); checks.face.ok = false; }
        else if (other.d < faceDistance - 0.02 && other.d <= cfg.review) { fails.push('other_person'); checks.face.ok = false; }
        else if (faceDistance <= cfg.match) checks.face.ok = true;
        else if (faceDistance <= cfg.review) { checks.face.ok = true; pendingFace = true; }
        else { fails.push('face_mismatch'); checks.face.ok = false; }
        rec.details.metrics = { neutral: bm, frames: results.slice(1).map((r) => (r.count === 1 ? L.metrics(r.landmarks) : null)), score: +base.score.toFixed(2) };
      }
      rec.face_ok = checks.face.ok == null ? null : checks.face.ok ? 1 : 0;
      if (rec.live_ok == null && checks.live.ok != null) rec.live_ok = checks.live.ok ? 1 : 0;
    } catch (e) {
      console.error('[face]', e.message);
      fails.push('engine_error'); rec.details.error = String(e.message).slice(0, 200);
    }
  }
  rec.thumb = jpegThumb(body.thumb);
  checks.face.state = checks.face.ok == null ? 'skipped' : checks.face.ok ? (pendingFace ? 'review' : 'match') : 'fail';

  // 3) итог
  const SEVERITY = ['no_zone', 'gps_missing', 'gps_inaccurate', 'gps_stale', 'outside_zone', 'frames_invalid', 'engine_error', 'no_face', 'multiple_faces', 'face_small', 'neutral_bad', 'liveness_failed', 'face_swap', 'other_person', 'face_mismatch'];
  let out;
  if (fails.length) {
    const reason = SEVERITY.find((r) => fails.includes(r)) || fails[0];
    rec.status = 'rejected'; rec.reason = reason; rec.details.fails = fails;
    const extra = reason === 'outside_zone' ? `: до школы ${rec.distance} м, допустимо ${cfg.radius} м` : reason === 'gps_inaccurate' ? ` (точность ${acc == null ? '?' : Math.round(acc)} м, нужно не хуже ${cfg.maxAccuracy} м)` : '';
    rec.message = `Отметка не принята — ${REASON_RU[reason] || reason}${extra}.`;
    out = { status: 'rejected', reason, message: rec.message };
  } else {
    const loc = { lat, lon };
    const res = kind === 'in' ? checkIn(db, notifier, user, loc, now) : checkOut(db, notifier, user, loc, now);
    if (!res.ok) { rec.status = 'rejected'; rec.reason = 'rules'; rec.message = res.message; out = { status: 'rejected', reason: 'rules', message: res.message }; }
    else {
      rec.status = pendingFace ? 'pending' : 'ok'; rec.reason = pendingFace ? 'face_review' : '';
      rec.message = pendingFace ? `${res.message} Отметка принята условно: директор проверит совпадение лица.` : res.message;
      out = { status: rec.status, reason: rec.reason, message: rec.message, late: !!res.late, early: !!res.early };
    }
  }
  const id = logAttempt(db, rec);
  if (rec.status === 'ok' || rec.status === 'pending') {
    db.prepare("UPDATE attendance SET verify='face', face_distance=?, review=?, attempt_id=? WHERE user_id=? AND date=?")
      .run(rec.face_distance ?? null, rec.status === 'pending' ? 'pending' : '', id, user.id, date);
  }

  // 4) уведомления: учителю — всегда, директору — только о проблемах
  const tag = kind === 'in' ? 'прихода' : 'ухода';
  if (rec.status === 'rejected' && rec.reason !== 'rules') {
    notifier.notify([user.id], `🚫 Отметка ${tag} не принята: ${REASON_RU[rec.reason] || rec.reason}.`);
    notifier.notifyManagers(`🚫 Отметка ${tag} отклонена: ${user.full_name} — ${REASON_RU[rec.reason] || rec.reason}${rec.reason === 'outside_zone' ? ` (${rec.distance} м от школы)` : ''}. Подробности — в панели, «Проверка по лицу».`);
  } else if (rec.status === 'pending') {
    notifier.notify([user.id], `🕐 Отметка ${tag} принята условно — директор проверит лицо.`);
    notifier.notifyManagers(`🕐 Нужна проверка: ${user.full_name}, отметка ${tag} — лицо совпало не полностью (${rec.face_distance}). Откройте «Проверка по лицу».`);
  } else if (rec.status === 'ok') {
    notifier.notify([user.id], `${out.message} (лицо и место подтверждены)`);
  }
  return { ...out, id, kind, time: localNow(now, cfg.tz).time, checks: publicChecks(checks) };
}

// Учителю не показываем числовое расстояние до эталона (чтобы не подбирать обход), только итог.
function publicChecks(c) {
  return { zone: c.zone, face: { ok: c.face.ok, state: c.face.state }, live: c.live };
}

// ---------- эталонные лица ----------
async function enrollFace({ db, engine, actor, target, image, thumb }) {
  const cfg = faceSettings(db);
  const count = db.prepare('SELECT COUNT(*) c FROM face_samples WHERE user_id=?').get(target.id).c;
  if (count >= MAX_SAMPLES) throw new HttpError(400, `Уже загружено максимум фото (${MAX_SAMPLES}). Удалите ненужные.`);
  const buf = b64(image, 1_500_000); readHeader(buf);
  let r;
  try { r = await engine.analyze(buf); } catch (e) { throw new HttpError(503, `Не удалось проанализировать фото: ${e.message}`); }
  if (r.count === 0) throw new HttpError(422, 'На фото не найдено лицо. Нужен чёткий портрет анфас.');
  if (r.count > 1) throw new HttpError(422, 'На фото несколько лиц. Нужно фото одного человека.');
  if (r.score < 0.6 || !L.framed(r, r.width, r.height)) throw new HttpError(422, 'Лицо слишком мелкое или нечёткое. Снимите крупнее, при хорошем свете.');
  if (!L.neutralOk(L.metrics(r.landmarks))) throw new HttpError(422, 'Нужно фото анфас с открытыми глазами.');
  const mine = samplesOf(db, target.id);
  if (mine.length && Math.min(...mine.map((s) => dist128(r.descriptor, s.v))) > 0.6) {
    throw new HttpError(422, 'Это лицо не похоже на уже загруженные фото этого сотрудника. Проверьте, что фото того же человека.');
  }
  for (const o of db.prepare("SELECT id, full_name FROM users WHERE active=1 AND id != ?").all(target.id)) {
    for (const s of samplesOf(db, o.id)) {
      if (dist128(r.descriptor, s.v) < 0.4) throw new HttpError(409, `Это лицо слишком похоже на сотрудника «${o.full_name}». Один человек не может быть записан дважды.`);
    }
  }
  const info = db.prepare('INSERT INTO face_samples (user_id, descriptor, thumb, created_by) VALUES (?,?,?,?)').run(target.id, toBuf(r.descriptor), jpegThumb(thumb), actor.id);
  return { id: Number(info.lastInsertRowid), count: count + 1, score: +r.score.toFixed(2), threshold: cfg.match };
}

// ---------- решение админа по условной отметке ----------
function reviewAttempt({ db, notifier, actor, id, approve, note = '' }) {
  const a = db.prepare('SELECT * FROM checkin_attempts WHERE id=?').get(id);
  if (!a) throw new HttpError(404, 'Не найдено');
  if (a.status !== 'pending') throw new HttpError(409, 'Эта отметка уже не ожидает решения');
  db.prepare('UPDATE checkin_attempts SET status=?, reviewed_by=?, reviewed_at=datetime(\'now\'), review_note=? WHERE id=?')
    .run(approve ? 'ok' : 'rejected', actor.id, String(note).slice(0, 200), id);
  if (!approve) {
    db.prepare("UPDATE checkin_attempts SET reason='rejected_by_admin' WHERE id=?").run(id);
    // отменяем отметку: приход — удаляем запись дня (зарплата за день не начисляется), уход — снимаем время ухода
    if (a.kind === 'in') db.prepare("DELETE FROM attendance WHERE user_id=? AND date=?").run(a.user_id, a.date);
    else db.prepare('UPDATE attendance SET check_out=NULL, early_minutes=0, out_distance=NULL WHERE user_id=? AND date=?').run(a.user_id, a.date);
  }
  const left = db.prepare("SELECT COUNT(*) c FROM checkin_attempts WHERE user_id=? AND date=? AND status='pending'").get(a.user_id, a.date).c;
  if (!left) db.prepare("UPDATE attendance SET review='' WHERE user_id=? AND date=?").run(a.user_id, a.date);
  const tag = a.kind === 'in' ? 'прихода' : 'ухода';
  notifier.notify([a.user_id], approve ? `✅ Отметка ${tag} подтверждена директором.` : `🚫 Отметка ${tag} отклонена директором${note ? ': ' + note : ''}. Время не засчитано.`);
  return { ok: true };
}

module.exports = { startSession, finishCheckin, enrollFace, reviewAttempt, verifyInitData, faceSettings, REASON_RU, MAX_SAMPLES };
