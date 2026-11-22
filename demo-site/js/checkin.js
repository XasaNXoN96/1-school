// Отметка по лицу и геозоне. Порядок: место → камера → случайные задания (живость) → отправка на сервер.
// Окончательное решение принимает СЕРВЕР: здесь только подсказки, чтобы человеку было удобно пройти проверку.
import { h, api } from './common.js';

const L = window.Liveness;
const DEMO = !!window.__DEMO_ROOT; // в демо-версии без сервера камера и GPS имитируются
const app = document.getElementById('app');
const q = new URLSearchParams(location.search);
const tgData = new URLSearchParams(location.hash.slice(1)).get('tgWebAppData') || '';
const tg = () => window.Telegram?.WebApp;

// ---------------- тексты ----------------
const S = {
  ru: {
    title: 'Отметка по лицу', in: 'Приход', out: 'Уход', hello: 'Здравствуйте', start: 'Начать проверку', again: 'Повторить', close: 'Закрыть', panel: 'Открыть панель',
    intro: 'Проверим, что вы в школе и что это именно вы: посмотрите в камеру и выполните два простых задания.', place: 'Место', face: 'Лицо', live: 'Живость',
    gpsWait: 'Определяем местоположение…', gpsDenied: 'Нет доступа к геолокации. Разрешите её для Telegram/браузера и повторите.', gpsOff: 'Геолокация недоступна на этом устройстве.',
    camDenied: 'Нет доступа к камере. Разрешите камеру для Telegram/браузера и повторите.', camOff: 'Камера недоступна на этом устройстве.',
    loadModels: 'Загружаем распознавание…', neutral: 'Смотрите прямо в камеру. Глаза открыты, лицо расслаблено', noFace: 'Лицо не видно — встаньте напротив камеры при хорошем свете', hold: 'Держите…',
    wink_left: 'Закройте ЛЕВЫЙ глаз', wink_right: 'Закройте ПРАВЫЙ глаз', smile: 'Улыбнитесь широко', turn_left: 'Поверните голову ВЛЕВО', turn_right: 'Поверните голову ВПРАВО',
    wink_hint: 'Второй глаз оставьте открытым', smile_hint: 'Покажите зубы и держите', turn_hint: 'Медленно, затем держите', sec: 'с',
    timeout: 'Не получилось выполнить задание за отведённое время.', checking: 'Проверяем лицо и место…', sessionLost: 'Сессия проверки устарела. Начните заново.',
    okIn: 'Приход подтверждён', okOut: 'Уход подтверждён', pend: 'Принято условно', rej: 'Отметка не принята', at: 'в', late: 'Опоздание отмечено — директор уведомлён.', early: 'Ранний уход отмечен — директор уведомлён.',
    pendText: 'Лицо совпало не полностью. Время записано, директор проверит отметку.', rejNote: 'Время НЕ записано. Исправьте причину и повторите.',
    zoneOk: (d, r) => `${d} м от школы (допустимо ${r} м)`, zoneBad: (d, r) => `вы в ${d} м от школы, допустимо ${r} м`, accuracy: (a) => `Точность GPS: ±${a} м`,
    faceOk: 'совпадает с вашими фото', faceReview: 'совпало не полностью — на проверку директору', faceBad: 'не совпало', skipped: 'не проверялось', liveOk: 'задания выполнены', liveBad: 'задание не выполнено',
    r: { gps_missing: 'не удалось определить местоположение', gps_inaccurate: 'слишком неточное местоположение — выйдите на открытое место', gps_stale: 'данные о месте устарели', no_zone: 'координаты школы не заданы', outside_zone: 'вы вне зоны школы',
      no_face: 'лицо не найдено в кадре', multiple_faces: 'в кадре несколько лиц', face_small: 'лицо слишком далеко или не по центру', neutral_bad: 'смотрите прямо с открытыми глазами', liveness_failed: 'не выполнено задание на «живость»',
      face_mismatch: 'лицо не совпало с эталоном', other_person: 'лицо похоже на другого сотрудника', face_swap: 'в ходе проверки лицо изменилось', engine_error: 'ошибка распознавания, повторите', frames_invalid: 'некорректные кадры', rules: '' },
    notEnrolled: 'Ваше лицо ещё не добавлено в систему. Попросите директора загрузить ваши фотографии.', alreadyIn: (t) => `Приход уже отмечен в ${t}`, alreadyOut: (t) => `Уход уже отмечен в ${t}`,
    needIn: 'Сначала отметьте приход', needLogin: 'Откройте эту страницу из Telegram-бота или войдите в панель сайта.', engineOff: 'Модуль распознавания на сервере не установлен.',
    demoBanner: 'ДЕМО: камера и геолокация имитируются. Выберите, что показать:', dOk: 'Всё в порядке: в школе, лицо совпало', dZone: 'Вне круга (находится в 340 м от школы)', dFace: 'Чужое лицо (другой человек за коллегу)', dLive: 'Показали фотографию: задания не выполнены', dPend: 'Лицо совпало не полностью (на проверку директору)',
    demoNote: 'В боевой версии здесь живая камера, определение места и сравнение с фото на сервере.',
  },
  uz: {
    title: 'Yuz orqali belgilash', in: 'Kelish', out: 'Ketish', hello: 'Assalomu alaykum', start: 'Tekshiruvni boshlash', again: 'Qayta urinish', close: 'Yopish', panel: 'Panelni ochish',
    intro: "Maktabda ekanligingiz va aynan o'zingiz ekanligingizni tekshiramiz: kameraga qarang va ikkita oddiy topshiriqni bajaring.", place: 'Joy', face: 'Yuz', live: 'Jonlilik',
    gpsWait: 'Joylashuv aniqlanmoqda…', gpsDenied: "Geolokatsiyaga ruxsat yo'q. Telegram/brauzer uchun ruxsat bering va qayta urining.", gpsOff: "Bu qurilmada geolokatsiya mavjud emas.",
    camDenied: "Kameraga ruxsat yo'q. Telegram/brauzer uchun kameraga ruxsat bering va qayta urining.", camOff: "Bu qurilmada kamera mavjud emas.",
    loadModels: 'Aniqlash moduli yuklanmoqda…', neutral: "To'g'ri kameraga qarang. Ko'zlar ochiq, yuz bo'shashgan", noFace: "Yuz ko'rinmayapti — yorug' joyda kamera qarshisida turing", hold: 'Ushlab turing…',
    wink_left: "CHAP ko'zni yuming", wink_right: "O'NG ko'zni yuming", smile: 'Keng jilmaying', turn_left: 'Boshingizni CHAPGA buring', turn_right: "Boshingizni O'NGGA buring",
    wink_hint: "Ikkinchi ko'z ochiq tursin", smile_hint: "Tishlaringizni ko'rsating va ushlang", turn_hint: 'Sekin buring va ushlang', sec: 's',
    timeout: 'Topshiriqni belgilangan vaqtda bajarib bo‘lmadi.', checking: 'Yuz va joy tekshirilmoqda…', sessionLost: 'Tekshiruv sessiyasi eskirdi. Qaytadan boshlang.',
    okIn: 'Kelish tasdiqlandi', okOut: 'Ketish tasdiqlandi', pend: 'Shartli qabul qilindi', rej: 'Belgi qabul qilinmadi', at: 'soat', late: "Kechikish qayd etildi — direktor xabardor qilindi.", early: 'Erta ketish qayd etildi — direktor xabardor qilindi.',
    pendText: "Yuz to'liq mos kelmadi. Vaqt yozildi, direktor tekshiradi.", rejNote: "Vaqt YOZILMADI. Sababni bartaraf qiling va qayta urining.",
    zoneOk: (d, r) => `maktabdan ${d} m (ruxsat ${r} m)`, zoneBad: (d, r) => `siz maktabdan ${d} m uzoqdasiz, ruxsat ${r} m`, accuracy: (a) => `GPS aniqligi: ±${a} m`,
    faceOk: 'rasmlaringizga mos', faceReview: "to'liq mos emas — direktor tekshiradi", faceBad: 'mos kelmadi', skipped: 'tekshirilmadi', liveOk: 'topshiriqlar bajarildi', liveBad: 'topshiriq bajarilmadi',
    r: { gps_missing: "joylashuvni aniqlab bo'lmadi", gps_inaccurate: "joylashuv juda noaniq — ochiq joyga chiqing", gps_stale: "joylashuv ma'lumoti eskirgan", no_zone: 'maktab koordinatalari kiritilmagan', outside_zone: 'siz maktab hududidan tashqaridasiz',
      no_face: "kadrda yuz topilmadi", multiple_faces: "kadrda bir nechta yuz bor", face_small: "yuz juda uzoqda yoki markazda emas", neutral_bad: "ko'zlar ochiq holda to'g'ri qarang", liveness_failed: "jonlilik topshirig'i bajarilmadi",
      face_mismatch: "yuz namunaga mos kelmadi", other_person: "yuz boshqa xodimga o'xshaydi", face_swap: "tekshiruv davomida yuz o'zgardi", engine_error: "aniqlashda xatolik, qayta urining", frames_invalid: "noto'g'ri kadrlar", rules: '' },
    notEnrolled: "Yuzingiz tizimga hali qo'shilmagan. Direktordan rasmlaringizni yuklashni so'rang.", alreadyIn: (t) => `Kelish allaqachon belgilangan: ${t}`, alreadyOut: (t) => `Ketish allaqachon belgilangan: ${t}`,
    needIn: 'Avval kelishni belgilang', needLogin: "Bu sahifani Telegram-botdan oching yoki sayt paneliga kiring.", engineOff: "Serverda yuzni aniqlash moduli o'rnatilmagan.",
    demoBanner: "DEMO: kamera va geolokatsiya taqlid qilinadi. Nimani ko'rsatish kerakligini tanlang:", dOk: "Hammasi joyida: maktabda, yuz mos", dZone: "Doiradan tashqarida (maktabdan 340 m)", dFace: "Begona yuz (boshqa odam hamkasbi o'rniga)", dLive: "Foto ko'rsatildi: topshiriqlar bajarilmadi", dPend: "Yuz to'liq mos emas (direktor tekshiradi)",
    demoNote: "Haqiqiy versiyada bu yerda jonli kamera, joylashuvni aniqlash va serverda yuzni solishtirish ishlaydi.",
  },
  en: {
    title: 'Face check-in', in: 'Arrival', out: 'Departure', hello: 'Hello', start: 'Start verification', again: 'Try again', close: 'Close', panel: 'Open panel',
    intro: 'We will verify that you are at school and that it is really you: look at the camera and do two simple tasks.', place: 'Place', face: 'Face', live: 'Liveness',
    gpsWait: 'Getting your location…', gpsDenied: 'Location access denied. Allow it for Telegram/browser and try again.', gpsOff: 'Location is not available on this device.',
    camDenied: 'Camera access denied. Allow the camera for Telegram/browser and try again.', camOff: 'Camera is not available on this device.',
    loadModels: 'Loading face detection…', neutral: 'Look straight at the camera. Eyes open, relaxed face', noFace: 'No face visible — face the camera in good light', hold: 'Hold it…',
    wink_left: 'Close your LEFT eye', wink_right: 'Close your RIGHT eye', smile: 'Smile widely', turn_left: 'Turn your head LEFT', turn_right: 'Turn your head RIGHT',
    wink_hint: 'Keep the other eye open', smile_hint: 'Show your teeth and hold', turn_hint: 'Slowly, then hold', sec: 's',
    timeout: 'The task was not completed in time.', checking: 'Checking face and location…', sessionLost: 'The verification session expired. Start again.',
    okIn: 'Arrival confirmed', okOut: 'Departure confirmed', pend: 'Accepted provisionally', rej: 'Check-in rejected', at: 'at', late: 'Lateness recorded — the director was notified.', early: 'Early leave recorded — the director was notified.',
    pendText: 'The face did not fully match. The time is recorded; the director will review it.', rejNote: 'Time was NOT recorded. Fix the cause and try again.',
    zoneOk: (d, r) => `${d} m from school (allowed ${r} m)`, zoneBad: (d, r) => `you are ${d} m from school, allowed ${r} m`, accuracy: (a) => `GPS accuracy: ±${a} m`,
    faceOk: 'matches your photos', faceReview: 'partial match — sent to the director', faceBad: 'does not match', skipped: 'not checked', liveOk: 'tasks completed', liveBad: 'task not completed',
    r: { gps_missing: 'location unavailable', gps_inaccurate: 'location too imprecise — move to an open area', gps_stale: 'location data is stale', no_zone: 'school coordinates are not set', outside_zone: 'you are outside the school zone',
      no_face: 'no face in the frame', multiple_faces: 'several faces in the frame', face_small: 'face too far or off-centre', neutral_bad: 'look straight with eyes open', liveness_failed: 'liveness task not completed',
      face_mismatch: 'face does not match', other_person: 'face resembles another employee', face_swap: 'the face changed during verification', engine_error: 'recognition error, try again', frames_invalid: 'invalid frames', rules: '' },
    notEnrolled: 'Your face has not been added yet. Ask the director to upload your photos.', alreadyIn: (t) => `Arrival already recorded at ${t}`, alreadyOut: (t) => `Departure already recorded at ${t}`,
    needIn: 'Record your arrival first', needLogin: 'Open this page from the Telegram bot or sign in to the panel.', engineOff: 'The face recognition module is not installed on the server.',
    demoBanner: 'DEMO: camera and location are simulated. Choose what to show:', dOk: 'All good: at school, face matches', dZone: 'Outside the circle (340 m from school)', dFace: 'Wrong face (someone checking in for a colleague)', dLive: 'A photo was shown: tasks not completed', dPend: 'Partial face match (sent to the director)',
    demoNote: 'The live version uses the real camera, location, and server-side face comparison.',
  },
};
const tgLang = (() => { try { return JSON.parse(new URLSearchParams(tgData).get('user') || '{}').language_code; } catch { return ''; } })();
const pickLang = () => { let l = q.get('lang') || ''; try { l = l || localStorage.getItem('lang') || ''; } catch { /* нет доступа */ } l = l || (tgLang === 'ru' ? 'ru' : tgLang === 'en' ? 'en' : tgLang ? 'uz' : 'uz'); return S[l] ? l : 'uz'; };
let LANG = pickLang();
const t = (k, ...a) => { const v = S[LANG][k] ?? S.ru[k]; return typeof v === 'function' ? v(...a) : v; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------- интерфейс ----------------
const root = h('div', { class: 'ck-body' });
const logo = () => h('img', { src: 'img/logo.svg', alt: '' });
function head(sub) {
  return h('div', { class: 'ck-head' }, logo(), h('div', {}, h('b', {}, t('title')), h('small', {}, sub || '№1-Maktab')), h('span', { class: 'sp' }),
    h('div', { class: 'ck-lang' }, Object.keys(S).map((l) => h('button', { class: l === LANG ? 'on' : '', onclick: () => { LANG = l; try { localStorage.setItem('lang', l); } catch { /* нет доступа */ } render?.(); } }, l.toUpperCase()))));
}
let render = null;
const screen = (...kids) => { app.replaceChildren(head(ctx.name), ...kids.filter(Boolean), h('div', { class: 'ck-foot' }, '№1-Maktab · ' + (DEMO ? 'demo' : 'secure check'))); };
const steps = (n) => h('div', { class: 'ck-steps' }, [0, 1, 2, 3].map((i) => h('i', { class: i < n ? 'done' : i === n ? 'now' : '' })));
const fmtErr = (e) => e.message || String(e);

// Значок задания в зеркальной ориентации (как в предпросмотре камеры): левый глаз человека — слева на экране.
function taskIcon(kind) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 120 120');
  const add = (tag, attrs) => { const e = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); svg.append(e); };
  const eye = (cx, closed) => (closed ? add('path', { d: `M${cx - 9} 50 Q${cx} 58 ${cx + 9} 50`, fill: 'none', stroke: '#fff', 'stroke-width': 4, 'stroke-linecap': 'round' }) : add('circle', { cx, cy: 50, r: 7, fill: '#fff' }));
  const shift = kind === 'turn_left' ? -10 : kind === 'turn_right' ? 10 : 0;
  add('circle', { cx: 60 + shift, cy: 62, r: 44, fill: 'none', stroke: '#8fb1ff', 'stroke-width': 4 });
  eye(42 + shift, kind === 'wink_left'); eye(78 + shift, kind === 'wink_right');
  add('path', { d: kind === 'smile' ? 'M38 78 Q60 100 82 78' : `M${48 + shift} 84 L${72 + shift} 84`, fill: 'none', stroke: '#fff', 'stroke-width': 4, 'stroke-linecap': 'round' });
  if (kind === 'turn_left') add('path', { d: 'M18 100 L4 100 M10 94 L4 100 L10 106', stroke: '#facc15', 'stroke-width': 4, fill: 'none', 'stroke-linecap': 'round' });
  if (kind === 'turn_right') add('path', { d: 'M102 100 L116 100 M110 94 L116 100 L110 106', stroke: '#facc15', 'stroke-width': 4, fill: 'none', 'stroke-linecap': 'round' });
  return svg;
}
const hintFor = (k) => (k.startsWith('wink') ? t('wink_hint') : k === 'smile' ? t('smile_hint') : k.startsWith('turn') ? t('turn_hint') : '');

const ctx = { name: '', st: null, kind: q.get('kind') === 'out' ? 'out' : 'in', session: null };
const post = (url, body = {}) => api('POST', url, { ...body, ...(tgData ? { initData: tgData } : {}) });

// ---------------- реальная проверка ----------------
const loadScript = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load ' + src)); document.head.append(s); });
let modelsReady = null;
function loadModels() {
  return (modelsReady ||= (async () => {
    await loadScript('vendor/face/face-api.min.js');
    await window.faceapi.nets.tinyFaceDetector.loadFromUri('vendor/face');
    await window.faceapi.nets.faceLandmark68Net.loadFromUri('vendor/face');
  })());
}
function getPos(timeout = 15000) {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(Object.assign(new Error('off'), { code: 'off' }));
    navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy, time: p.timestamp }), (e) => rej(e), { enableHighAccuracy: true, timeout, maximumAge: 0 });
  });
}
async function detect(input, size) {
  const d = await window.faceapi.detectSingleFace(input, new window.faceapi.TinyFaceDetectorOptions({ inputSize: size, scoreThreshold: 0.5 })).withFaceLandmarks();
  if (!d) return null;
  const b = d.detection.box;
  return { box: { x: b.x, y: b.y, w: b.width, h: b.height }, landmarks: d.landmarks.positions.map((p) => [p.x, p.y]), width: input.videoWidth || input.width, height: input.videoHeight || input.height };
}

async function startReal() {
  const info = h('div', { class: 'ck-card' }, h('div', { class: 'ck-spin' }), h('p', { style: 'text-align:center' }, t('gpsWait')));
  screen(steps(0), info);
  let pos;
  try { pos = await getPos(); } catch (e) { return fail(e.code === 'off' ? t('gpsOff') : t('gpsDenied')); }
  let session;
  try { session = await post('/api/checkin/start', { kind: ctx.kind }); } catch (e) { return fail(fmtErr(e)); }
  ctx.session = session;
  info.replaceChildren(h('div', { class: 'ck-spin' }), h('p', { style: 'text-align:center' }, t('loadModels')));
  let stream;
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('off'), { name: 'off' });
    [stream] = await Promise.all([navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false }), loadModels()]);
  } catch (e) { return fail(e.name === 'off' || e.name === 'NotFoundError' ? t('camOff') : e.name === 'NotAllowedError' ? t('camDenied') : fmtErr(e)); }

  const video = h('video', { autoplay: true, playsinline: true, muted: true });
  video.srcObject = stream; video.muted = true;
  const guide = h('div', { class: 'ck-guide' }), prompt = h('div', { class: 'ck-prompt' }), timer = h('div', { class: 'ck-timer' });
  const phase = h('div', {});
  const setPrompt = (kind, text, hint) => prompt.replaceChildren(kind ? taskIcon(kind) : '', h('div', {}, h('b', {}, text), hint ? h('small', {}, hint) : null));
  screen(steps(1), h('div', { class: 'ck-cam' }, video, guide, timer, prompt), phase);
  try { await video.play(); } catch { /* автозапуск */ }
  await new Promise((r) => (video.videoWidth ? r() : video.addEventListener('loadedmetadata', r, { once: true })));

  const grab = () => { const c = document.createElement('canvas'); c.width = 320; c.height = 240; c.getContext('2d').drawImage(video, 0, 0, 320, 240); return c; };
  const frames = [], metricsOf = (d) => L.metrics(d.landmarks);
  let base = null;
  const stepsBar = (n) => { app.querySelector('.ck-steps')?.replaceWith(steps(n)); };

  async function runStep(kind, limitMs) {
    const t0 = performance.now(); let streak = 0;
    const need = kind === 'neutral' ? 3 : 2;
    while (performance.now() - t0 < limitMs) {
      timer.textContent = `${Math.max(0, Math.ceil((limitMs - (performance.now() - t0)) / 1000))} ${t('sec')}`;
      await sleep(80);
      const d = await detect(video, 224);
      if (!d || !L.framed(d, d.width, d.height)) { guide.className = 'ck-guide bad'; if (kind === 'neutral') setPrompt(null, t('noFace')); streak = 0; continue; }
      const m = metricsOf(d);
      const ok = kind === 'neutral' ? L.neutralOk(m) : L.check(kind, m, base).pass;
      guide.className = `ck-guide${ok ? ' ok' : ''}`;
      streak = ok ? streak + 1 : 0;
      if (ok && kind !== 'neutral') setPrompt(kind, t('hold'));
      if (streak >= need) {
        // та же картинка, что уйдёт на сервер, проверяется ещё раз
        const cv = grab(); const d2 = await detect(cv, 320);
        if (d2 && L.framed(d2, d2.width, d2.height)) {
          const m2 = metricsOf(d2);
          if (kind === 'neutral' ? L.neutralOk(m2) : L.check(kind, m2, base).pass) return { cv, m: m2 };
        }
        streak = 0;
      }
    }
    throw new Error('timeout');
  }

  try {
    setPrompt(null, t('neutral'));
    const n0 = await runStep('neutral', 30000);
    base = n0.m; frames.push(n0.cv);
    const thumbC = document.createElement('canvas'); thumbC.width = 128; thumbC.height = 96; thumbC.getContext('2d').drawImage(n0.cv, 0, 0, 128, 96);
    const thumb = thumbC.toDataURL('image/jpeg', 0.6).split(',')[1];
    for (let i = 0; i < session.challenges.length; i++) {
      const c = session.challenges[i];
      stepsBar(2 + (i > 0 ? 0 : 0)); guide.className = 'ck-guide';
      setPrompt(c, t(c), hintFor(c));
      let got = null;
      for (let attempt = 0; attempt < 2 && !got; attempt++) { try { got = await runStep(c, 15000); } catch (e) { if (attempt) throw e; setPrompt(c, t(c), t('timeout')); await sleep(900); setPrompt(c, t(c), hintFor(c)); } }
      frames.push(got.cv);
      guide.className = 'ck-guide ok'; await sleep(450);
    }
    stream.getTracks().forEach((tr) => tr.stop());
    stepsBar(3);
    screen(steps(3), h('div', { class: 'ck-card ck-res' }, h('div', { class: 'ck-spin' }), h('p', {}, t('checking'))));
    let fresh = pos; try { fresh = await getPos(7000); } catch { /* берём прежнюю */ }
    const res = await post('/api/checkin/finish', { token: session.token, lat: fresh.lat, lon: fresh.lon, accuracy: fresh.accuracy, loc_time: fresh.time, thumb, frames: frames.map((f) => f.toDataURL('image/png').split(',')[1]) });
    result(res, fresh);
  } catch (e) {
    stream.getTracks().forEach((tr) => tr.stop());
    if (e.message === 'timeout') return fail(t('timeout'), true);
    fail(e.status === 400 || e.status === 410 || e.status === 409 ? `${fmtErr(e)}` : fmtErr(e), true);
  }
}

// ---------------- демо без камеры ----------------
async function startDemo(scn) {
  const sim = h('div', { class: 'sim' }), prompt = h('div', { class: 'ck-prompt' }), guide = h('div', { class: 'ck-guide' });
  const set = (kind, text, hint) => { prompt.replaceChildren(kind ? taskIcon(kind) : '', h('div', {}, h('b', {}, text), hint ? h('small', {}, hint) : null)); sim.replaceChildren(h('div', { style: 'width:46%;color:#fff' }, taskIcon(kind || 'neutral'))); };
  screen(steps(1), h('div', { class: 'ck-cam' }, sim, guide, prompt), h('p', { class: 'ck-foot' }, t('demoNote')));
  const { session } = await post('/api/checkin/start', { kind: ctx.kind, demo: scn }).then((s) => ({ session: s }));
  set(null, t('neutral')); await sleep(1300); guide.className = 'ck-guide ok'; await sleep(500);
  for (const c of session.challenges) {
    guide.className = 'ck-guide'; set(c, t(c), hintFor(c)); await sleep(1500); if (scn !== 'live') { guide.className = 'ck-guide ok'; set(c, t('hold')); await sleep(700); } else await sleep(900);
  }
  app.querySelector('.ck-steps')?.replaceWith(steps(3));
  screen(steps(3), h('div', { class: 'ck-card ck-res' }, h('div', { class: 'ck-spin' }), h('p', {}, t('checking'))));
  await sleep(1200);
  result(await post('/api/checkin/finish', { token: session.token, demo: scn }), null);
}

// ---------------- результат ----------------
const row = (cls, ic, title, text) => h('div', { class: `ck-row ${cls}` }, h('div', { class: 'ic' }, ic), h('div', {}, h('b', {}, title), h('span', {}, text)));
function result(res, pos) {
  ctx.redo = () => result(res, pos);
  const c = res.checks || {};
  const z = c.zone || {}, f = c.face || {}, l = c.live || {};
  const zoneRow = z.ok ? row('ok', '✓', t('place'), t('zoneOk', z.distance, z.radius)) : z.distance != null ? row('bad', '✕', t('place'), t('zoneBad', z.distance, z.radius)) : row('bad', '✕', t('place'), t('r')[res.reason] || t('r').gps_missing);
  const faceRow = f.state === 'match' ? row('ok', '✓', t('face'), t('faceOk')) : f.state === 'review' ? row('warn', '!', t('face'), t('faceReview')) : f.state === 'fail' ? row('bad', '✕', t('face'), t('r')[res.reason] || t('faceBad')) : row('skip', '–', t('face'), t('skipped'));
  const liveRow = l.ok === true ? row('ok', '✓', t('live'), t('liveOk')) : l.ok === false ? row('bad', '✕', t('live'), t('liveBad')) : row('skip', '–', t('live'), t('skipped'));
  const st = res.status;
  const title = st === 'rejected' ? t('rej') : st === 'pending' ? t('pend') : res.kind === 'out' ? t('okOut') : t('okIn');
  const sub = st === 'rejected' ? (t('r')[res.reason] || res.message) : `${t('at')} ${res.time || ''}${res.late ? ' · ' + t('late') : ''}${res.early ? ' · ' + t('early') : ''}`;
  screen(steps(4), h('div', { class: 'ck-card ck-res' }, h('div', { class: `big ${st}` }, st === 'ok' ? '✓' : st === 'pending' ? '!' : '✕'), h('h1', {}, title), h('p', {}, sub),
    st === 'pending' ? h('p', {}, t('pendText')) : st === 'rejected' && res.reason !== 'rules' ? h('p', {}, t('rejNote')) : null,
    pos ? h('div', { class: 'ck-chips', style: 'justify-content:center' }, h('span', { class: 'ck-chip' }, t('accuracy', Math.round(pos.accuracy)))) : null,
    h('div', { class: 'ck-rows' }, zoneRow, faceRow, liveRow)),
  st === 'rejected' && res.reason !== 'rules' ? h('button', { class: 'ck-btn', onclick: () => (DEMO ? demoMenu() : intro()) }, t('again')) : null, closeBtn());
}
function closeBtn() {
  return h('button', { class: 'ck-btn sec', onclick: () => { if (tg()?.close) tg().close(); else if (history.length > 1 && document.referrer) history.back(); else location.href = DEMO ? 'panel/index.html' : '/panel/'; } }, t('close'));
}
function fail(text, retry = false) {
  ctx.redo = () => fail(text, retry);
  screen(steps(0), h('div', { class: 'ck-card' }, h('div', { class: 'ck-err' }, text)), retry ? h('button', { class: 'ck-btn', onclick: intro }, t('again')) : null, closeBtn());
}

// ---------------- стартовый экран ----------------
function demoMenu() {
  ctx.redo = demoMenu;
  const scen = [['ok', 'dOk'], ['zone', 'dZone'], ['face', 'dFace'], ['live', 'dLive'], ['pend', 'dPend']];
  screen(steps(0), h('div', { class: 'ck-card' }, h('span', { class: 'ck-kind' }, t(ctx.kind)), h('h1', { style: 'margin-top:8px' }, t('title')), h('p', {}, t('intro')), h('p', { class: 'ck-chip warn' }, t('demoBanner'))),
    ...scen.map(([k, label]) => h('button', { class: 'ck-btn demo', onclick: () => startDemo(k).catch((e) => fail(fmtErr(e))) }, t(label))));
}
async function intro() {
  ctx.redo = null;
  if (DEMO) return demoMenu();
  let st;
  try { st = await post('/api/checkin/state'); } catch (e) { return screen(h('div', { class: 'ck-card' }, h('div', { class: 'ck-err' }, e.status === 401 ? t('needLogin') : fmtErr(e))), closeBtn()); }
  ctx.st = st; ctx.name = st.name;
  if (!q.get('kind')) ctx.kind = st.check_in ? 'out' : 'in';
  let block = '';
  if (!st.engine) block = t('engineOff');
  else if (!st.enrolled) block = t('notEnrolled');
  else if (ctx.kind === 'in' && st.check_in) block = t('alreadyIn', st.check_in);
  else if (ctx.kind === 'out' && !st.check_in) block = t('needIn');
  else if (ctx.kind === 'out' && st.check_out) block = t('alreadyOut', st.check_out);
  screen(steps(0), h('div', { class: 'ck-card' }, h('span', { class: 'ck-kind' }, t(ctx.kind)), h('h1', { style: 'margin-top:8px' }, `${t('hello')}, ${st.name}!`), h('p', {}, t('intro')),
    block ? h('div', { class: 'ck-err' }, block) : null),
  block ? null : h('button', { class: 'ck-btn', onclick: () => startReal().catch((e) => fail(fmtErr(e), true)) }, '📷 ' + t('start')), closeBtn());
}
render = () => (ctx.redo ? ctx.redo() : intro());
try { tg()?.ready?.(); tg()?.expand?.(); } catch { /* вне Telegram */ }
if (tgData) loadScript('https://telegram.org/js/telegram-web-app.js').then(() => { try { window.Telegram.WebApp.ready(); window.Telegram.WebApp.expand(); } catch { /* ignore */ } }).catch(() => {});
app.append(root);
intro();
