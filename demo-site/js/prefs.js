// Применяет тему и размер шрифта до отрисовки страницы (чтобы не мигало). Старые браузеры без модулей — в лёгкую версию.
(function () {
  try {
    var th = localStorage.getItem('theme') || 'auto', dark = th === 'dark' || (th === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-fs', localStorage.getItem('fs') || '0');
  } catch (e) { /* ignore */ }
})();
