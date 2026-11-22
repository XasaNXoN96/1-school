// Проверка по лицу и геозоне: журнал попыток (админ), лица сотрудников, настройки; «Моя отметка» (сотрудник).
import { T, h, api, icon, state, isManager, pill, msg, guard, table, tabs, modal, ROLE } from './ui.js';
import { views } from './views.js';
import { lang } from '../js/i18n.js';

const box = (title, ...c) => h('section', { class: 'panel' }, title ? h('h2', {}, T(title)) : null, ...c);
const CH = () => ({ wink_left: T('закрыть левый глаз'), wink_right: T('закрыть правый глаз'), smile: T('улыбка'), turn_left: T('поворот головы влево'), turn_right: T('поворот головы вправо') });
const REASON = () => ({
  gps_missing: T('не удалось определить местоположение'), gps_inaccurate: T('слишком неточное местоположение'), gps_stale: T('данные о месте устарели'), no_zone: T('координаты школы не заданы'), outside_zone: T('вне зоны школы'),
  no_face: T('лицо не найдено в кадре'), multiple_faces: T('в кадре несколько лиц'), face_small: T('лицо слишком далеко или не по центру'), neutral_bad: T('не смотрит прямо / глаза закрыты'), liveness_failed: T('не выполнено задание на «живость»'),
  face_mismatch: T('лицо не совпало с эталоном'), other_person: T('лицо похоже на другого сотрудника'), face_swap: T('в ходе проверки лицо изменилось'), engine_error: T('ошибка распознавания'), frames_invalid: T('некорректные кадры'),
  face_review: T('лицо совпало не полностью — нужна проверка'), rejected_by_admin: T('отклонено администратором'), rules: T('правила графика (праздник, выходной, повтор)'),
});
const STATUS = () => ({ ok: ['Принято', 'ok'], pending: ['Нужна проверка', 'warn'], rejected: ['Отклонено', 'bad'] });
const stTag = (s) => { const [t, c] = STATUS()[s] || [s, '']; return pill(T(t), c); };
// Время хранится в UTC: показываем по времени устройства
const when = (s) => { const d = new Date(String(s).replace(' ', 'T') + 'Z'); return Number.isNaN(+d) ? '' : d.toLocaleString(lang() === 'en' ? 'en-GB' : 'ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }); };
const chip = (ok, text) => h('span', { class: `tag ${ok === true ? 'ok' : ok === false ? 'bad' : ok === 'warn' ? 'warn' : ''}` }, text);

function chips(a) {
  const d = a.details || {}, m = d.metrics, out = [];
  out.push(chip(a.zone_ok == null ? null : !!a.zone_ok, `📍 ${a.distance != null ? `${a.distance} ${T('м')}` : '—'} ${T('из')} ${a.radius || ''}`.trim()));
  const pend = a.status === 'pending' || a.reason === 'face_review' || a.reason === 'rejected_by_admin';
  out.push(chip(a.face_ok == null ? null : a.face_ok ? (pend ? 'warn' : true) : false, `🙂 ${T('лицо')}${a.face_distance != null ? ` ${a.face_distance}` : ''}`));
  out.push(chip(a.live_ok == null ? null : !!a.live_ok, `👁 ${T('живость')}${a.challenges ? ': ' + a.challenges.split(',').map((c) => CH()[c] || c).join(', ') : ''}`));
  return h('div', { class: 'row', style: 'gap:6px;margin:6px 0' }, out, m ? null : null);
}

function attemptCard(a, refresh, msgBox, radius) {
  a.radius = radius;
  const review = (approve) => guard(msgBox, async () => { await api('POST', `/api/checkins/${a.id}/review`, { approve }); await refresh(); });
  const det = h('details', { class: 'ck-det' }, h('summary', {}, T('Подробности')),
    h('div', { class: 'muted', style: 'font-size:.85rem;line-height:1.6' },
      `GPS: ${a.lat != null ? `${a.lat.toFixed(5)}, ${a.lon.toFixed(5)}` : '—'}, ${T('точность')} ±${a.accuracy != null ? Math.round(a.accuracy) : '—'} ${T('м')}`, h('br'),
      a.other_distance != null ? `${T('Ближайший другой сотрудник')}: ${a.other_user} (${a.other_distance})` : null, a.other_distance != null ? h('br') : null,
      `${T('Канал')}: ${a.via === 'telegram' ? 'Telegram Mini App' : T('панель сайта')}`,
      a.details?.metrics ? [h('br'), `${T('Показатели кадров')}: ${JSON.stringify(a.details.metrics.frames?.map((f) => f && { eyeL: +f.earLeft.toFixed(2), eyeR: +f.earRight.toFixed(2), mouth: +f.mouth.toFixed(2), yaw: +f.yaw.toFixed(2) }))}`] : null));
  return h('div', { class: `ck-item st-${a.status}` },
    a.thumb ? h('img', { class: 'ck-th', src: a.thumb, alt: '' }) : h('span', { class: 'ck-th ph' }, (a.full_name || '?').slice(0, 1)),
    h('div', { class: 'ck-main' },
      h('div', { class: 'row', style: 'margin:0;gap:8px;flex-wrap:wrap' }, h('b', {}, a.full_name), pill(a.kind === 'in' ? T('Приход') : T('Уход'), 'info'), stTag(a.status), h('small', { class: 'muted' }, when(a.created_at))),
      chips(a),
      a.status !== 'ok' || a.reason ? h('div', { class: 'muted' }, a.status === 'rejected' && a.reason !== 'rules' && a.reason !== 'rejected_by_admin' ? `${T('Причина')}: ${REASON()[a.reason] || a.reason}` : a.reason ? REASON()[a.reason] || '' : '', a.review_note ? ` — ${a.review_note}` : '') : null,
      a.status === 'pending' ? h('div', { class: 'row', style: 'margin:8px 0 0' }, h('button', { class: 'primary small', onclick: () => review(true) }, icon('check', 14), T('Подтвердить')), h('button', { class: 'small danger', onclick: () => { if (confirm(T('Отклонить отметку? Время не будет засчитано.'))) review(false); } }, icon('close', 14), T('Отклонить'))) : null,
      det));
}

// ---------- камера / файл → PNG для сервера ----------
function toPng(source, w, hgt, maxSide = 480) {
  const k = Math.min(1, maxSide / Math.max(w, hgt));
  const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(hgt * k);
  c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
  const t = document.createElement('canvas'); t.height = 96; t.width = Math.round(96 * c.width / c.height);
  t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
  return { image: c.toDataURL('image/png').split(',')[1], thumb: t.toDataURL('image/jpeg', 0.6).split(',')[1] };
}
const loadImg = (file) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(T('Не удалось открыть изображение'))); i.src = URL.createObjectURL(file); });

function faceModal(user, onClose) {
  const body = h('div'), list = h('div', { class: 'row', style: 'gap:10px;flex-wrap:wrap' }), status = h('div'), camBox = h('div');
  let stream = null;
  const stopCam = () => { stream?.getTracks().forEach((tr) => tr.stop()); stream = null; camBox.replaceChildren(); };
  const load = async () => {
    const r = await api('GET', `/api/faces/${user.id}`);
    list.replaceChildren(...(r.samples.length ? r.samples.map((s) => h('div', { class: 'ck-sample' }, s.thumb ? h('img', { src: s.thumb, alt: '' }) : h('span', { class: 'ph' }, '?'),
      h('button', { class: 'small danger', title: T('Удалить'), onclick: () => guard(status, async () => { await api('DELETE', `/api/faces/sample/${s.id}`); await load(); }) }, icon('trash', 12)))) : [h('div', { class: 'empty' }, T('Фото ещё нет'))]));
  };
  const send = async (src, w, hh) => {
    msg(status, T('Анализируем фото… (до 10 секунд)'), true);
    try { const r = await api('POST', `/api/faces/${user.id}`, toPng(src, w, hh)); msg(status, `${T('Фото добавлено')} (${r.count}).`, true); await load(); }
    catch (e) { msg(status, e.message); }
  };
  const pick = h('input', { type: 'file', accept: 'image/*', onchange: async () => { const f = pick.files[0]; pick.value = ''; if (!f) return; try { const i = await loadImg(f); await send(i, i.naturalWidth, i.naturalHeight); } catch (e) { msg(status, e.message); } } });
  const openCam = async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 960 } }, audio: false });
      const v = h('video', { autoplay: true, playsinline: true, muted: true, style: 'width:100%;max-width:360px;border-radius:12px;background:#000;transform:scaleX(-1)' }); v.srcObject = stream;
      camBox.replaceChildren(v, h('div', { class: 'row', style: 'margin-top:8px' }, h('button', { class: 'primary', onclick: async () => { if (v.videoWidth) await send(v, v.videoWidth, v.videoHeight); } }, icon('camera', 16), T('Сделать снимок')), h('button', { onclick: stopCam }, T('Выключить камеру'))));
    } catch { msg(status, T('Нет доступа к камере. Можно выбрать готовый файл.')); }
  };
  body.append(h('p', { class: 'muted' }, T('Нужны чёткие портреты анфас: лицо крупно, хороший свет, без очков, маски и фильтров. Лучше 3 фото: прямо, при другом освещении, с лёгкой улыбкой. Фото не публикуются: хранится только числовой «отпечаток» лица и маленькая миниатюра для вас.')),
    list, status, h('div', { class: 'row', style: 'margin-top:10px' }, h('button', { class: 'primary', onclick: openCam }, icon('camera', 16), T('Снять камерой')), h('button', { onclick: () => pick.click() }, icon('upload', 16), T('Загрузить из файла'))), camBox);
  modal(`${T('Лицо сотрудника')}: ${user.full_name}`, body, []);
  // при закрытии окна выключаем камеру и обновляем список
  const watch = setInterval(() => { if (!body.isConnected) { clearInterval(watch); stopCam(); onClose?.(); } }, 500);
  load();
}

// ---------- админ ----------
views.faceid = async () => {
  const root = h('div'), msgBox = h('div'), body = h('div'); let tab = 'log'; let timer = null;
  const info = await api('GET', '/api/faces');
  const cfgWrap = h('div');

  const drawLog = async () => {
    const r = await api('GET', `/api/checkins${filter.status ? `?status=${filter.status}` : ''}`);
    list.replaceChildren(...(r.attempts.length ? r.attempts.map((a) => attemptCard(a, drawLog, msgBox, r.settings.radius_m)) : [h('div', { class: 'empty' }, T('Попыток отметки пока не было'))]));
    pendBadge.textContent = r.pending ? `${T('Ждут решения')}: ${r.pending}` : '';
  };
  const filter = { status: '' };
  const list = h('div', { class: 'ck-list' }), pendBadge = h('b', { style: 'color:#8a5a00' });
  const logView = () => {
    const sel = h('select', { style: 'width:auto', onchange: (e) => { filter.status = e.target.value; drawLog(); } }, [['', T('Все')], ['pending', T('Ждут решения')], ['rejected', T('Отклонённые')], ['ok', T('Принятые')]].map(([v, l]) => h('option', { value: v }, l)));
    return [h('div', { class: 'row' }, sel, pendBadge, h('span', { class: 'spacer' }), h('small', { class: 'muted' }, h('span', { class: 'live-dot' }), T('обновляется автоматически'))), list];
  };
  const facesView = async () => {
    const f = await api('GET', '/api/faces');
    return table([{ label: 'Сотрудник', render: (u) => h('b', {}, u.full_name) }, { label: 'Роль', render: (u) => ROLE()[u.role] || u.role }, { label: 'Предмет', key: 'subject' },
      { label: 'Фото лица', render: (u) => (u.samples ? pill(`${u.samples} ${T('шт.')}`, 'ok') : pill(T('нет'), 'bad')) },
      { label: '', render: (u) => h('button', { class: 'small', onclick: () => faceModal(u, async () => { show('faces'); }) }, icon('camera', 14), T('Фото')) }], f.users);
  };
  const settingsView = () => {
    const s = info.settings || {};
    return h('div', {}, h('p', { class: 'muted' }, T('Круг школы (координаты и радиус) задаётся в разделе «Настройки». Здесь — правила проверки лица.')),
      (() => {
        const out = h('div'), form = h('form', { class: 'grid', onsubmit: (e) => { e.preventDefault(); guard(out, async () => {
          await api('PUT', '/api/face-settings', { face_required: form.face_required.checked, face_match: form.face_match.value, face_review: form.face_review.value, gps_max_accuracy: form.gps_max_accuracy.value });
          msg(out, T('Сохранено'), true); }); } },
        h('label', { class: 'f check wide' }, h('input', { type: 'checkbox', name: 'face_required', checked: s.face_required === '1' }), T('Обязательная проверка по лицу: отметка из Telegram без камеры не засчитывается')),
        h('label', { class: 'f' }, T('Порог совпадения (меньше — строже)'), h('input', { name: 'face_match', type: 'number', step: '0.01', min: '0.3', max: '0.6', value: s.face_match || '0.45' }), h('small', { class: 'muted' }, T('Расстояние до эталона не больше этого значения — лицо «совпало».'))),
        h('label', { class: 'f' }, T('Порог ручной проверки'), h('input', { name: 'face_review', type: 'number', step: '0.01', min: '0.4', max: '0.7', value: s.face_review || '0.55' }), h('small', { class: 'muted' }, T('Между порогами — отметка принята условно и ждёт вашего решения. Выше — отказ.'))),
        h('label', { class: 'f' }, T('Допустимая погрешность GPS, м'), h('input', { name: 'gps_max_accuracy', type: 'number', min: '10', max: '500', value: s.gps_max_accuracy || '100' }), h('small', { class: 'muted' }, T('Если телефон определил место грубее — отказ (защита от «примерного» местоположения).'))),
        h('div', { class: 'row', style: 'grid-column:1/-1' }, h('button', { class: 'primary', type: 'submit' }, T('Сохранить'))));
        return h('div', {}, out, form);
      })());
  };
  const show = async (k) => {
    tab = k; clearInterval(timer); timer = null;
    if (k === 'log') { body.replaceChildren(...logView()); await drawLog(); timer = setInterval(() => { if (!root.isConnected) { clearInterval(timer); return; } if (!document.hidden) drawLog().catch(() => {}); }, 8000); }
    else if (k === 'faces') body.replaceChildren(box(null, await facesView()));
    else body.replaceChildren(box(null, settingsView()));
  };
  const total = info.users.length, withFace = info.users.filter((u) => u.samples).length;
  const flag = (ok, text) => h('span', { class: `tag ${ok ? 'ok' : 'bad'}` }, `${ok ? '✓' : '✕'} ${text}`);
  root.append(h('div', { class: 'row' }, h('h1', {}, T('Проверка по лицу и месту'))),
    box(null, h('p', { class: 'muted', style: 'margin-top:0' }, T('Приход и уход подтверждаются тремя проверками: внутри круга школы, «живой» человек (случайные задания: моргнуть, улыбнуться, повернуть голову) и совпадение лица с фото сотрудника. Решение принимает сервер.')),
      h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap' }, flag(info.engine, T('распознавание на сервере')), flag(info.telegram, T('Telegram-бот подключён')), flag(info.miniapp, T('адрес https (PUBLIC_URL)')), flag(withFace === total && total > 0, `${T('фото загружены')}: ${withFace}/${total}`))),
    msgBox, tabs([['log', 'Журнал проверок'], ['faces', 'Лица сотрудников'], ['settings', 'Правила']], show, 'log'), body);
  await show('log');
  return root;
};

// ---------- сотрудник ----------
views.mycheck = async () => {
  const root = h('div'); const CKP = '../checkin.html';
  const [st, my] = await Promise.all([api('POST', '/api/checkin/state', {}), api('GET', '/api/my/checkins')]);
  const btn = (kind, label, enabled) => (enabled ? h('a', { class: 'primary-link', href: `${CKP}?kind=${kind}`, style: 'display:inline-flex;gap:8px;align-items:center;padding:14px 20px;font-size:1.05rem' }, icon('camera', 20), label) : null);
  root.append(h('h1', {}, T('Моя отметка')),
    box(null,
      h('div', { class: 'stat-line' }, h('div', {}, h('b', {}, st.check_in || '—'), T('Приход')), h('div', {}, h('b', {}, st.check_out || '—'), T('Уход')), h('div', {}, h('b', {}, `${st.radius_m} ${T('м')}`), T('круг школы'))),
      !st.enrolled ? h('div', { class: 'err' }, T('Ваше лицо ещё не добавлено. Попросите директора загрузить ваши фотографии — без них проверка недоступна.')) : null,
      st.review === 'pending' ? h('div', { class: 'ok-msg', style: 'background:#fff4e0;color:#8a5a00' }, T('Отметка принята условно: директор проверит совпадение лица.')) : null,
      st.enrolled && st.engine ? h('div', { class: 'row' }, btn('in', T('Отметить приход'), !st.check_in), btn('out', T('Отметить уход'), !!st.check_in && !st.check_out)) : null,
      h('p', { class: 'muted' }, my.required ? T('Отметка в Telegram без камеры не засчитывается. Откройте бота → «Пришёл» → кнопка «Отметить приход», либо нажмите кнопку выше (с телефона).') : T('Отметку можно сделать через Telegram-бот или кнопкой выше (с телефона). Нужны доступ к камере и геолокации.'))),
    box('Мои последние попытки', my.attempts.length ? h('div', { class: 'ck-list' }, my.attempts.map((a) => h('div', { class: `ck-item st-${a.status}` }, h('div', { class: 'ck-main' },
      h('div', { class: 'row', style: 'margin:0;gap:8px;flex-wrap:wrap' }, pill(a.kind === 'in' ? T('Приход') : T('Уход'), 'info'), stTag(a.status), h('small', { class: 'muted' }, when(a.created_at))),
      h('div', { class: 'row', style: 'gap:6px;margin:6px 0' }, chip(a.zone_ok == null ? null : !!a.zone_ok, `📍 ${a.distance != null ? a.distance + ' ' + T('м') : '—'}`), chip(a.face_ok == null ? null : !!a.face_ok, `🙂 ${T('лицо')}`), chip(a.live_ok == null ? null : !!a.live_ok, `👁 ${T('живость')}`)),
      h('div', { class: 'muted' }, a.status === 'rejected' && a.reason !== 'rules' ? (REASON()[a.reason] || a.reason) : a.message || ''))))) : h('div', { class: 'empty' }, T('Попыток пока не было'))));
  return root;
};

// Баннер на главной админа: есть отметки, ждущие решения
const baseDash = views.dashboard;
views.dashboard = async () => {
  const el = await baseDash();
  if (isManager()) {
    const d = await api('GET', '/api/panel/dashboard').catch(() => ({}));
    if (d.face_pending) el.prepend(h('a', { class: 'alert', href: '#/faceid' }, icon('camera', 18), `${T('Отметок на проверке (лицо)')}: ${d.face_pending}`));
  }
  return el;
};
void state;
