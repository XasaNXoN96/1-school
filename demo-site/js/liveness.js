/* Проверка «живости» по 68 точкам лица. Один и тот же код работает в браузере (подсказки пользователю)
   и на сервере (окончательное решение): UMD, без зависимостей.
   Точки face-api.js: 0–16 овал лица, 30 кончик носа, 36–41 правый глаз человека, 42–47 левый глаз,
   48 и 54 уголки губ. Кадр не зеркальный: левый глаз человека находится справа на картинке. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.Liveness = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const ear = (p, a) => (d(p[a + 1], p[a + 5]) + d(p[a + 2], p[a + 4])) / (2 * d(p[a], p[a + 3]) || 1);

  const CHALLENGES = ['wink_left', 'wink_right', 'smile', 'turn_left', 'turn_right'];
  const T = { closed: 0.62, otherOpen: 0.8, smile: 1.07, turn: 0.12, neutralEye: 0.17, neutralYaw: 0.15, minFace: 0.22 };

  function metrics(p) {
    const jaw = d(p[0], p[16]) || 1;
    return {
      earRight: ear(p, 36), earLeft: ear(p, 42),
      mouth: d(p[48], p[54]) / jaw,
      yaw: (p[30][0] - p[0][0]) / ((p[16][0] - p[0][0]) || 1),
    };
  }

  // Исходный кадр: глаза открыты, лицо смотрит прямо.
  function neutralOk(m) {
    return m.earLeft >= T.neutralEye && m.earRight >= T.neutralEye && Math.abs(m.yaw - 0.5) <= T.neutralYaw;
  }

  // Выполнено ли задание относительно нейтрального кадра.
  function check(challenge, m, base) {
    const r = (a, b) => (b ? a / b : 1);
    const eL = r(m.earLeft, base.earLeft), eR = r(m.earRight, base.earRight);
    const dyaw = m.yaw - base.yaw;
    switch (challenge) {
      case 'wink_left': return { pass: eL <= T.closed && eR >= T.otherOpen, value: +eL.toFixed(2) };
      case 'wink_right': return { pass: eR <= T.closed && eL >= T.otherOpen, value: +eR.toFixed(2) };
      case 'smile': { const s = r(m.mouth, base.mouth); return { pass: s >= T.smile, value: +s.toFixed(2) }; }
      case 'turn_left': return { pass: dyaw >= T.turn, value: +dyaw.toFixed(2) };
      case 'turn_right': return { pass: dyaw <= -T.turn, value: +dyaw.toFixed(2) };
      default: return { pass: false, value: 0 };
    }
  }

  // Лицо достаточно крупное и находится в кадре.
  function framed(face, width, height) {
    const b = face.box, cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    return b.w / width >= T.minFace && cx > width * 0.2 && cx < width * 0.8 && cy > height * 0.15 && cy < height * 0.85;
  }

  return { CHALLENGES, T, metrics, neutralOk, check, framed };
});
