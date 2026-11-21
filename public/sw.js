// Сервис-воркер: сайт открывается как приложение, а оболочка (HTML/CSS/JS) работает и без интернета.
// Данные (/api) всегда берутся из сети; если сети нет — показывается последняя сохранённая копия публичных страниц.
const CACHE = 'school-v1';
const SHELL = ['/', '/css/theme.css', '/css/site.css', '/js/prefs.js', '/js/site.js', '/js/common.js', '/js/i18n.js', '/js/icons.js', '/img/logo.svg', '/img/hero.jpg', '/img/avatar.svg'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  // панель и личные данные — только из сети
  if (url.pathname.startsWith('/panel') || url.pathname.startsWith('/checkin') || (url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/public/'))) return;
  e.respondWith(fetch(req).then((res) => {
    if (res.ok && !url.pathname.startsWith('/api/backup')) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('/') : Response.error()))));
});
