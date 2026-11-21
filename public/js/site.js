import { h, api, imgUrl, paragraphs } from './common.js';
import { t, lang, setLang, LANGS, fmtDate } from './i18n.js';
import { icon } from './icons.js';

const app = document.getElementById('app');
let site = { school_name: '№1-Maktab', city: '', pages: [], stats: {} };

const AVATAR = '/img/avatar.svg';
const PAGE_KEYS = ['about', 'programs', 'contacts', 'schedule', 'clubs', 'olympiads', 'resources'];
const pageLabel = (slug, fallback) => (PAGE_KEYS.includes(slug) ? t(`page.${slug}`) : fallback);
const cityLabel = () => (lang() === 'uz' ? site.city || t('hero.city') : t('hero.city'));
const photo = (f) => (f ? imgUrl(f) : AVATAR);
const empty = (k) => h('div', { class: 'empty' }, t(k));

// ---------- шапка ----------
function buildMenu() {
  return [
    { href: '#/', label: t('nav.home'), ico: 'home', match: (h0) => h0 === '#/' || h0 === '' },
    { label: t('nav.about'), ico: 'info', match: (h0) => /^#\/(page\/(about|programs)|teachers)/.test(h0),
      children: [['#/page/about', t('page.about')], ['#/page/programs', t('page.programs')], ['#/teachers', t('nav.teachers')]] },
    { href: '#/news', label: t('nav.news'), ico: 'news', match: (h0) => h0.startsWith('#/news') },
    { label: t('nav.media'), ico: 'image', match: (h0) => /^#\/(media|announcements)/.test(h0),
      children: [['#/media', t('nav.gallery')], ['#/announcements', t('nav.announcements')]] },
    { href: '#/achievements', label: t('nav.achievements'), ico: 'trophy', match: (h0) => h0.startsWith('#/achievements') },
    { href: '#/page/contacts', label: t('nav.contact'), ico: 'check', match: (h0) => h0.startsWith('#/page/contacts') },
  ];
}

function header(hash) {
  const nav = h('nav', { id: 'nav', 'aria-label': 'Menu' }, buildMenu().map((m) => {
    const active = m.match(hash) ? ' active' : '';
    if (!m.children) return h('a', { class: `nav-item${active}`, href: m.href }, icon(m.ico, 18), m.label);
    const wrap = h('div', { class: `nav-dd${active}` });
    const btn = h('button', { class: `nav-item${active}`, type: 'button', 'aria-haspopup': 'true',
      onclick: (e) => { e.stopPropagation(); const o = wrap.classList.contains('open'); closeMenus(); if (!o) wrap.classList.add('open'); } },
    icon(m.ico, 18), m.label, icon('chevron', 14));
    wrap.append(btn, h('div', { class: 'dd-menu' }, m.children.map(([href, label]) => h('a', { href }, label))));
    return wrap;
  }));

  const langWrap = h('div', { class: 'nav-dd lang' });
  const cur = LANGS.find((l) => l[0] === lang());
  langWrap.append(
    h('button', { class: 'lang-btn', type: 'button', 'aria-label': t('nav.lang'),
      onclick: (e) => { e.stopPropagation(); const o = langWrap.classList.contains('open'); closeMenus(); if (!o) langWrap.classList.add('open'); } },
    cur[1], icon('chevron', 14)),
    h('div', { class: 'dd-menu right' }, LANGS.map(([code, short, name]) =>
      h('button', { type: 'button', class: code === lang() ? 'sel' : '', onclick: () => { setLang(code); closeMenus(); route(); } }, `${short} · ${name}`))));

  const burger = h('button', { class: 'burger', type: 'button', 'aria-label': t('nav.menu'), 'aria-controls': 'nav',
    onclick: (e) => { e.stopPropagation(); document.body.classList.toggle('menu-open'); } }, icon('menu', 24));

  return h('header', { class: 'site-header' }, h('div', { class: 'container bar' },
    h('a', { class: 'brand', href: '#/', 'aria-label': site.school_name },
      h('img', { src: '/img/logo.svg', alt: '', width: 44, height: 44 }),
      h('span', {}, h('b', {}, site.school_name), h('small', {}, cityLabel()))),
    nav,
    h('div', { class: 'bar-right' }, langWrap,
      h('a', { class: 'btn-login', href: '/panel/' }, icon('user', 18), h('span', {}, t('nav.login'))), burger)));
}

function closeMenus() { document.querySelectorAll('.nav-dd.open').forEach((e) => e.classList.remove('open')); }
document.addEventListener('click', closeMenus);

// ---------- подвал ----------
function footer() {
  const socials = [['telegram_url', 'send', 'Telegram'], ['youtube_url', 'youtube', 'YouTube'], ['instagram_url', 'instagram', 'Instagram'], ['facebook_url', 'facebook', 'Facebook']]
    .filter(([k]) => site[k]).map(([k, ico, name]) => h('a', { class: `soc soc-${ico}`, href: site[k], target: '_blank', rel: 'noopener noreferrer', 'aria-label': name }, icon(ico, 20)));
  const hasGeo = site.school_lat && site.school_lon;
  const mapHref = hasGeo ? `https://www.openstreetmap.org/?mlat=${encodeURIComponent(site.school_lat)}&mlon=${encodeURIComponent(site.school_lon)}#map=17/${encodeURIComponent(site.school_lat)}/${encodeURIComponent(site.school_lon)}` : null;
  const pages = (slugs) => slugs.filter((s) => site.pages.some((p) => p.slug === s)).map((s) => h('li', {}, h('a', { href: `#/page/${s}` }, t(`page.${s}`))));
  return h('footer', { class: 'site-footer' }, h('div', { class: 'container' },
    h('div', { class: 'foot-grid' },
      h('div', { class: 'foot-brand' },
        h('a', { class: 'brand light', href: '#/' }, h('img', { src: '/img/logo.svg', alt: '', width: 48, height: 48 }),
          h('span', {}, h('b', {}, site.school_name), h('small', {}, cityLabel()))),
        h('p', {}, t('foot.tagline')), socials.length ? h('div', { class: 'socials' }, socials) : null),
      h('div', {}, h('h4', {}, t('foot.quick')), h('ul', {},
        h('li', {}, h('a', { href: '#/' }, t('nav.home'))), h('li', {}, h('a', { href: '#/page/about' }, t('page.about'))),
        h('li', {}, h('a', { href: '#/news' }, t('nav.news'))), h('li', {}, h('a', { href: '#/media' }, t('nav.media'))),
        h('li', {}, h('a', { href: '#/achievements' }, t('nav.achievements'))))),
      h('div', {}, h('h4', {}, t('foot.students')), h('ul', {}, pages(['schedule', 'clubs', 'olympiads', 'resources']))),
      h('div', {}, h('h4', {}, t('foot.contact')), h('ul', { class: 'contact' },
        site.address ? h('li', {}, icon('pin', 18), site.address) : null,
        site.phone ? h('li', {}, icon('phone', 18), h('a', { href: `tel:${site.phone.replace(/[^+\d]/g, '')}` }, site.phone)) : null,
        site.email ? h('li', {}, icon('mail', 18), h('a', { href: `mailto:${site.email}` }, site.email)) : null),
      mapHref ? h('a', { class: 'map-card', href: mapHref, target: '_blank', rel: 'noopener noreferrer' }, icon('pin', 22), h('span', {}, t('foot.map'))) : null)),
    h('div', { class: 'foot-bottom' },
      h('span', {}, `© ${new Date().getFullYear()} ${cityLabel()}, ${site.school_name}. ${t('foot.rights')}`),
      h('span', { class: 'note' }, t('foot.note')),
      h('button', { class: 'to-top', type: 'button', 'aria-label': t('foot.top'), onclick: () => window.scrollTo({ top: 0, behavior: 'smooth' }) }, icon('up', 20)))));
}

// ---------- карточки ----------
const newsFeatured = (n) => h('a', { class: `news-feat${n.cover ? '' : ' nocover'}`, href: `#/news/${n.id}` },
  n.cover ? h('img', { src: imgUrl(n.cover), alt: '', loading: 'lazy' }) : null,
  h('div', { class: 'overlay' }, h('span', { class: 'chip' }, fmtDate(n.created_at)), h('h3', {}, n.title)));
const newsRow = (n) => h('a', { class: 'news-row', href: `#/news/${n.id}` },
  n.cover ? h('img', { src: imgUrl(n.cover), alt: '', loading: 'lazy' }) : h('span', { class: 'ph' }, icon('news', 22)),
  h('span', {}, h('b', {}, n.title), h('small', {}, icon('calendar', 14), fmtDate(n.created_at))));
const newsCard = (n) => h('a', { class: 'card-link', href: `#/news/${n.id}` }, h('div', { class: 'card' },
  n.cover ? h('img', { class: 'cover', src: imgUrl(n.cover), alt: '', loading: 'lazy' }) : h('div', { class: 'cover ph' }, icon('news', 36)),
  h('div', { class: 'pad' }, h('div', { class: 'meta' }, fmtDate(n.created_at)), h('h3', {}, n.title), n.summary && h('p', { class: 'muted' }, n.summary))));
const achCard = (a) => h('div', { class: 'card' },
  (a.photo || a.student_photo || a.teacher_photo) ? h('img', { class: 'cover', src: imgUrl(a.photo || a.student_photo || a.teacher_photo), alt: '', loading: 'lazy' }) : null,
  h('div', { class: 'pad' }, h('div', { class: 'meta' }, fmtDate(a.date)), h('h3', {}, a.title),
    h('div', {}, a.kind === 'student' ? `${a.student_name || ''}${a.class_name ? `, ${a.class_name} ${t('class')}` : ''}` : (a.teacher_name || '')),
    a.description && h('p', { class: 'muted' }, a.description)));
const secHead = (title, ico, href) => h('div', { class: 'sec-head' }, h('h2', {}, icon(ico, 26), title),
  href ? h('a', { class: 'more', href }, t('home.all'), icon('arrow', 16)) : null);
const block = (title, body, href) => h('section', { class: 'page-block' }, h('div', { class: 'container' }, secHead(title, 'news', href), body));
const panelBox = (title, ico, href, body) => h('section', { class: 'box' }, secHead(title, ico, href), body);

// ---------- страницы ----------
const views = {
  async home() {
    const [news, ann, teachers, ach, mediaAll, about, spot] = await Promise.all([
      api('GET', '/api/public/news?kind=news&limit=4'), api('GET', '/api/public/news?kind=announcement&limit=4'),
      api('GET', '/api/public/teachers'), api('GET', '/api/public/achievements?kind=student'),
      api('GET', '/api/public/media'), api('GET', '/api/public/pages/about').catch(() => null),
      api('GET', '/api/public/spotlight'),
    ]);
    const media = mediaAll.filter((m) => m.kind === 'photo');
    const heroImg = site.hero_image ? imgUrl(site.hero_image) : '/img/hero.jpg';
    const s = site.stats || {};
    const stats = [['users', s.students, 'stat.students'], ['cap', s.teachers, 'stat.teachers'], ['monitor', s.classes, 'stat.classes'],
      ['trophy', s.achievements, 'stat.achievements'], ['book', s.clubs, 'stat.clubs']].filter(([, v]) => v !== '' && v != null);

    const hero = h('div', { class: 'hero', style: `--hero-img:url('${heroImg}')` },
      h('div', { class: 'container hero-in' },
        h('div', { class: 'hero-text' }, h('div', { class: 'hero-city' }, cityLabel()), h('h1', {}, site.school_name),
          h('p', {}, site.motto),
          h('div', { class: 'hero-btns' },
            h('a', { class: 'btn amber', href: '#/page/about' }, icon('book', 20), t('hero.about')),
            site.video_url ? h('a', { class: 'btn ghost', href: site.video_url, target: '_blank', rel: 'noopener noreferrer' }, icon('play', 20), t('hero.video')) : null))));
    const statItems = stats.map(([ico, v, k]) =>
      h('div', { class: 'stat' }, icon(ico, 38), h('div', {}, h('b', {}, String(v)), h('span', {}, t(k)))));
    const statBar = h('div', { class: 'container' }, h('div', { class: 'stat-bar' }, statItems));

    // новости
    const newsCol = panelBox(t('home.latest'), 'news', '#/news', news.length
      ? h('div', { class: 'news-grid' }, newsFeatured(news[0]), h('div', { class: 'news-list' }, news.slice(1, 4).map(newsRow))) : empty('empty.news'));
    // учителя (лучший — первым)
    const teacherCol = panelBox(t('home.teachers'), 'user', '#/teachers', teachers.length
      ? h('div', { class: 'teach-grid' }, teachers.slice(0, 3).map((x) => h('div', { class: 'teach' },
        h('div', { class: 'teach-ph' }, h('img', { src: photo(x.photo), alt: x.full_name, loading: 'lazy' }), x.is_best ? h('span', { class: 'star', title: t('badge.teacher') }, icon('star', 16)) : null),
        h('b', {}, x.full_name), h('small', {}, x.subject)))) : empty('empty.teachers'));
    // ученики
    const seen = new Set(), top = [];
    if (spot.student) { seen.add(spot.student.full_name); top.push({ name: spot.student.full_name, sub: spot.student.best_note || t('badge.student'), photo: spot.student.photo }); }
    for (const a of ach) { if (top.length >= 3) break; if (a.student_name && !seen.has(a.student_name)) { seen.add(a.student_name); top.push({ name: a.student_name, sub: a.title, photo: a.student_photo || a.photo }); } }
    const medal = ['gold', 'silver', 'bronze'];
    const studentCol = panelBox(t('home.students'), 'trophy', '#/achievements', top.length
      ? h('div', { class: 'top-list' }, top.map((x, i) => h('div', { class: 'top-row' },
        h('span', { class: `medal ${medal[i]}` }, String(i + 1)), h('img', { src: photo(x.photo), alt: '', loading: 'lazy' }),
        h('span', {}, h('b', {}, x.name), h('small', {}, x.sub))))) : empty('empty.students'));

    const banners = h('div', { class: 'container banners' },
      h('a', { class: 'banner b1', href: '#/media' }, icon('play', 34), h('div', {}, h('h3', {}, t('banner.media')), h('p', {}, t('banner.media.sub'))), h('span', { class: 'deco' }, icon('play', 120))),
      h('a', { class: 'banner b2', href: '#/media' }, icon('image', 34), h('div', {}, h('h3', {}, t('banner.gallery')), h('p', {}, t('banner.gallery.sub'))), h('span', { class: 'deco' }, icon('image', 120))),
      h('a', { class: 'banner b3', href: '#/achievements' }, icon('trophy', 34), h('div', {}, h('h3', {}, t('banner.achievements')), h('p', {}, t('banner.achievements.sub'))), h('span', { class: 'deco' }, icon('trophy', 120))));

    const aboutText = about?.body ? about.body.replace(/\s+/g, ' ').slice(0, 260) + (about.body.length > 260 ? '…' : '') : t('empty.about');
    const aboutBox = panelBox(t('home.about'), 'book', null, h('div', { class: 'about-in' },
      site.about_image ? h('img', { src: imgUrl(site.about_image), alt: '', loading: 'lazy' }) : h('div', { class: 'about-ph' }, icon('cap', 64)),
      h('div', {}, h('p', {}, aboutText), h('a', { class: 'btn outline', href: '#/page/about' }, t('home.more'), icon('arrow', 16)))));
    const annBox = panelBox(t('home.announcements'), 'megaphone', '#/announcements', ann.length
      ? h('div', { class: 'ann-list' }, ann.map((n) => h('a', { href: `#/news/${n.id}` }, icon('calendar', 20), h('span', {}, h('b', {}, n.title), h('small', {}, fmtDate(n.created_at))), icon('right', 18)))) : empty('empty.ann'));

    return [hero, statBar,
      h('div', { class: 'container triple' }, newsCol, teacherCol, studentCol), banners,
      h('div', { class: 'container duo' }, aboutBox, annBox),
      media.length ? h('div', { class: 'container life' }, panelBox(t('home.life'), 'image', null, carousel(media))) : null,
      h('div', { class: 'container' }, h('div', { class: 'adv' }, h('div', { class: 'adv-title' }, icon('cap', 44), h('h2', {}, t('adv.title'))),
        [['monitor', 'adv.1'], ['users', 'adv.2'], ['star', 'adv.3'], ['book', 'adv.4'], ['heart', 'adv.5']].map(([ico, k]) => h('div', { class: 'adv-item' }, icon(ico, 34), h('span', {}, t(k)))))),
    ];
  },

  async news() {
    const list = await api('GET', '/api/public/news?kind=news&limit=50');
    return block(t('nav.news'), list.length ? h('div', { class: 'grid' }, list.map(newsCard)) : empty('empty.news'));
  },
  async announcements() {
    const list = await api('GET', '/api/public/news?kind=announcement&limit=50');
    return block(t('nav.announcements'), list.length ? h('div', { class: 'grid' }, list.map(newsCard)) : empty('empty.ann'));
  },
  async newsItem(id) {
    const n = await api('GET', `/api/public/news/${id}`);
    return h('article', { class: 'prose container' }, h('a', { href: n.kind === 'announcement' ? '#/announcements' : '#/news' }, t(n.kind === 'announcement' ? 'back.ann' : 'back.news')),
      h('h1', {}, n.title), h('div', { class: 'meta' }, fmtDate(n.created_at, true)),
      n.cover && h('img', { class: 'cover', src: imgUrl(n.cover), alt: '' }), paragraphs(n.body));
  },
  async media() {
    const list = await api('GET', '/api/public/media');
    const box = list.length ? h('div', { class: 'gallery' }, list.map((m) => m.kind === 'video'
      ? h('figure', { class: 'av' }, h('video', { src: imgUrl(m.file), controls: true, preload: 'metadata', playsinline: true }), (m.title || m.caption) && h('figcaption', {}, m.title || m.caption))
      : m.kind === 'audio'
        ? h('figure', { class: 'av audio' }, h('b', {}, m.title || ''), h('audio', { src: imgUrl(m.file), controls: true, preload: 'none' }), m.caption && h('figcaption', {}, m.caption))
        : h('figure', { onclick: () => lightbox(m) }, h('img', { src: imgUrl(m.file), alt: m.title || '', loading: 'lazy' }), (m.title || m.caption) && h('figcaption', {}, m.title || m.caption)))) : empty('empty.media');
    return block(t('nav.gallery'), box);
  },
  async achievements() {
    const all = await api('GET', '/api/public/achievements');
    const holder = h('div'), tabs = h('div', { class: 'tabs', role: 'tablist' });
    let kind = 'student';
    const draw = () => {
      tabs.replaceChildren(...[['student', 'tab.students'], ['teacher', 'tab.teachers']].map(([k, key]) =>
        h('button', { role: 'tab', class: k === kind ? 'active' : '', onclick: () => { kind = k; draw(); } }, t(key))));
      const list = all.filter((a) => a.kind === kind);
      holder.replaceChildren(list.length ? h('div', { class: 'grid' }, list.map(achCard)) : empty('empty.ach'));
    };
    draw();
    return block(t('nav.achievements'), [tabs, holder]);
  },
  async teachers() {
    const list = await api('GET', '/api/public/teachers');
    return block(t('nav.teachers'), list.length ? h('div', { class: 'grid people' }, list.map((x) => h('div', { class: 'card person' },
      h('div', { class: 'person-ph' }, h('img', { src: photo(x.photo), alt: x.full_name, loading: 'lazy' })),
      h('div', { class: 'pad' }, x.is_best ? h('div', {}, h('span', { class: 'badge' }, t('badge.teacher'))) : null,
        h('h3', {}, x.full_name), h('div', { class: 'muted' }, x.subject), x.bio && h('p', { class: 'muted' }, x.bio))))) : empty('empty.teachers'));
  },
  async page(slug) {
    const p = await api('GET', `/api/public/pages/${encodeURIComponent(slug)}`);
    return h('article', { class: 'prose container' }, h('h1', {}, pageLabel(p.slug, p.title)),
      p.image ? h('img', { class: 'cover', src: imgUrl(p.image), alt: '' }) : null, paragraphs(p.body),
      p.video ? h('video', { class: 'embed', src: imgUrl(p.video), controls: true, preload: 'metadata', playsinline: true }) : null,
      p.video_url ? h('p', {}, h('a', { class: 'btn outline', href: p.video_url, target: '_blank', rel: 'noopener noreferrer' }, icon('play', 18), t('hero.video'))) : null,
      p.audio ? h('audio', { class: 'embed', src: imgUrl(p.audio), controls: true, preload: 'none' }) : null);
  },
};

function carousel(media) {
  const track = h('div', { class: 'car-track' }, media.map((m) => h('figure', { onclick: () => lightbox(m) }, h('img', { src: imgUrl(m.file), alt: m.title || '', loading: 'lazy' }))));
  const dots = h('div', { class: 'dots' });
  const step = () => Math.max(1, track.clientWidth * 0.9);
  const upd = () => {
    const pages = Math.max(1, Math.round(track.scrollWidth / Math.max(1, track.clientWidth)));
    const cur = Math.round(track.scrollLeft / Math.max(1, step()));
    dots.replaceChildren(...Array.from({ length: Math.min(pages, 8) }, (_, i) => h('i', { class: i === Math.min(cur, 7) ? 'on' : '' })));
  };
  track.addEventListener('scroll', () => requestAnimationFrame(upd), { passive: true });
  requestAnimationFrame(upd);
  return h('div', { class: 'carousel' },
    h('button', { class: 'car-btn prev', type: 'button', 'aria-label': t('pager.prev'), onclick: () => track.scrollBy({ left: -step(), behavior: 'smooth' }) }, icon('left', 22)),
    track,
    h('button', { class: 'car-btn next', type: 'button', 'aria-label': t('pager.next'), onclick: () => track.scrollBy({ left: step(), behavior: 'smooth' }) }, icon('right', 22)),
    dots);
}

function lightbox(m) {
  const close = () => { lb.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const lb = h('div', { class: 'lightbox', role: 'dialog', 'aria-modal': 'true', onclick: close }, h('img', { src: imgUrl(m.file), alt: m.title || '' }));
  document.body.append(lb);
  document.addEventListener('keydown', onKey);
}

async function route() {
  const hash = location.hash || '#/';
  const [, a, b] = hash.split('/');
  document.body.classList.remove('menu-open');
  let view;
  try {
    if (!a) view = await views.home();
    else if (a === 'news' && b) view = await views.newsItem(b);
    else if (['news', 'announcements', 'media', 'achievements', 'teachers'].includes(a)) view = await views[a]();
    else if (a === 'page' && b) view = await views.page(b);
    else view = h('div', { class: 'container' }, empty('empty.page'));
  } catch (e) { view = h('div', { class: 'container' }, h('div', { class: 'empty' }, e.status === 404 ? t('empty.page') : t('err.load'))); }
  app.replaceChildren(header(hash), h('main', {}, view), footer());
  document.title = `${site.school_name} — ${cityLabel()}`;
  window.scrollTo(0, 0);
}

(async function init() {
  try { site = await api('GET', '/api/public/site'); } catch { /* показываем значения по умолчанию */ }
  window.addEventListener('hashchange', route);
  route();
})();
