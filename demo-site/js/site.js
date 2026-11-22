import { h, api, imgUrl, paragraphs } from './common.js';
import { t, lang, setLang, LANGS, fmtDate, monthName as mName } from './i18n.js';
import { icon } from './icons.js';
import { extraViews as parentViews, parentLinks, parentNavMatch, parentNavLabel, homeParentBlock } from './site-extra.js';

const app = document.getElementById('app');
let site = { school_name: '№1-Maktab', city: '', pages: [], stats: {} };

const AVATAR = 'img/avatar.svg';
const PAGE_KEYS = ['about', 'programs', 'contacts', 'schedule', 'clubs', 'olympiads', 'resources'];
const pageLabel = (slug, fallback) => (PAGE_KEYS.includes(slug) ? t(`page.${slug}`) : fallback);
const cityLabel = () => (lang() === 'uz' ? site.city || t('hero.city') : t('hero.city'));
const photo = (f) => (f ? imgUrl(f) : AVATAR);
const empty = (k) => h('div', { class: 'empty' }, t(k));

// ---------- шапка ----------
function buildMenu() {
  return [
    { href: '#/', label: t('nav.home'), ico: 'home', match: (h0) => h0 === '#/' || h0 === '' },
    { label: t('nav.about'), ico: 'info', match: (h0) => /^#\/(page\/(about|programs)|teachers|tour|faq)/.test(h0),
      children: [['#/page/about', t('page.about')], ['#/page/programs', t('page.programs')], ['#/teachers', t('nav.teachers')], ['#/tour', t('nav.tour')], ['#/faq', t('nav.faq')]] },
    { href: '#/news', label: t('nav.news'), ico: 'news', match: (h0) => h0.startsWith('#/news') },
    { label: t('nav.media'), ico: 'image', match: (h0) => /^#\/(media|announcements|events)/.test(h0),
      children: [['#/media', t('nav.gallery')], ['#/announcements', t('nav.announcements')], ['#/events', t('nav.events')]] },
    { label: parentNavLabel(), ico: 'users', match: parentNavMatch, children: parentLinks() },
    { href: '#/achievements', label: t('nav.achievements'), ico: 'trophy', match: (h0) => h0.startsWith('#/achievements') },
    { href: '#/admission', label: t('nav.admission'), ico: 'cap', match: (h0) => h0.startsWith('#/admission') },
    { href: '#/contact', label: t('nav.contact'), ico: 'phone', match: (h0) => /^#\/(contact|page\/contacts)/.test(h0) },
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
      h('img', { src: 'img/logo.svg', alt: '', width: 44, height: 44 }),
      h('span', {}, h('b', {}, site.school_name), h('small', {}, cityLabel()))),
    nav,
    h('div', { class: 'bar-right' }, langWrap,
      h('a', { class: 'btn-login', href: 'panel/index.html' }, icon('user', 18), h('span', {}, t('nav.login'))), burger)));
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
        h('a', { class: 'brand light', href: '#/' }, h('img', { src: 'img/logo.svg', alt: '', width: 48, height: 48 }),
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
  (a.photo || a.student_photo || a.teacher_photo) ? h('img', { class: 'cover portrait', src: imgUrl(a.photo || a.student_photo || a.teacher_photo), alt: '', loading: 'lazy' }) : null,
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
    const todayStr = ymd(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
    const [evs, tour] = await Promise.all([api('GET', `/api/public/events?from=${todayStr}`).catch(() => []), api('GET', '/api/public/tour').catch(() => [])]);
    const media = mediaAll.filter((m) => m.kind === 'photo');
    const heroImg = site.hero_image ? imgUrl(site.hero_image) : new URL('img/hero.jpg', location.href).href;
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
      h('div', { class: 'stat' }, icon(ico, 38), h('div', {}, h('b', { 'data-count': /^\d+$/.test(String(v)) ? String(v) : null }, String(v)), h('span', {}, t(k)))));
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

    const evBox = panelBox(t('home.events'), 'calendar', '#/events', evs.length
      ? h('ul', { class: 'ev-list compact' }, evs.slice(0, 4).map(evRow)) : empty('home.noevents'));
    const admBox = h('section', { class: 'box adm-cta' }, h('span', { class: 'deco' }, icon('cap', 160)), h('h2', {}, t('home.adm')), h('p', {}, t('home.adm.sub')),
      h('div', { class: 'hero-btns' }, h('a', { class: 'btn amber', href: '#/admission' }, icon('check', 18), t('home.adm.btn')),
        site.phone ? h('a', { class: 'btn ghost', href: `tel:${site.phone.replace(/[^+\d]/g, '')}` }, icon('phone', 18), site.phone) : null));
    const tourStrip = tour.length ? h('div', { class: 'container' }, h('a', { class: 'tour-strip', href: '#/tour' },
      h('div', { class: 'tour-pics' }, tour.slice(0, 4).map((x) => h('img', { src: imgUrl(x.file), alt: '', loading: 'lazy' }))),
      h('div', { class: 'tour-text' }, h('h2', {}, icon('route', 28), t('home.tour')), h('p', {}, t('home.tour.sub')), h('span', { class: 'btn amber' }, icon('play', 18), t('home.tour.btn'))))) : null;

    const parentBlock = await homeParentBlock().catch(() => null);
    return [hero, statBar, parentBlock, h('div', { class: 'container duo events-adm' }, evBox, admBox), tourStrip && h('div', { class: 'gap' }),
      h('div', { class: 'container triple' }, newsCol, teacherCol, studentCol), tourStrip, banners,
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


// ---------- формы заявок ----------
function applyForm(kind) {
  const isAdm = kind === 'admission';
  const msg = h('div', { class: 'form-msg', role: 'status' });
  const inp = (name, label, attrs = {}) => h('label', { class: attrs.wide ? 'wide' : '' }, h('span', {}, t(label)), attrs.area
    ? h('textarea', { name, rows: 4, maxlength: 3000, required: attrs.req || null })
    : h('input', { name, type: attrs.type || 'text', maxlength: 120, required: attrs.req || null, autocomplete: attrs.ac || 'off', inputmode: attrs.mode || null }));
  const btn = h('button', { class: 'btn amber', type: 'submit' }, icon('send', 18), t('f.send'));
  const form = h('form', { class: 'apply-form', novalidate: true,
    onsubmit: async (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(form));
      if (!String(d.phone || '').trim() && !String(d.email || '').trim()) { msg.className = 'form-msg bad'; msg.textContent = t('f.need'); return; }
      btn.disabled = true; msg.className = 'form-msg'; msg.textContent = t('f.sending');
      try { await api('POST', '/api/public/apply', { ...d, kind }); form.reset(); msg.className = 'form-msg ok'; msg.textContent = t('f.ok'); }
      catch (err) { msg.className = 'form-msg bad'; msg.textContent = err.message; }
      btn.disabled = false;
    } },
  inp('name', isAdm ? 'f.parent' : 'f.name', { req: true, ac: 'name' }),
  inp('phone', 'f.phone', { type: 'tel', ac: 'tel', mode: 'tel' }),
  isAdm ? inp('child_name', 'f.child') : null, isAdm ? inp('grade', 'f.grade') : null,
  inp('email', 'f.email', { type: 'email', ac: 'email' }),
  isAdm ? null : inp('message', 'f.message', { area: true, wide: true, req: true }),
  h('input', { class: 'hp', name: 'website', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' }),
  h('div', { class: 'wide' }, btn, msg));
  return form;
}

const WD = (i) => t(`wd.${i}`);
const pad = (n) => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const evBadge = (e) => h('span', { class: `ev-kind k-${e.kind}` }, t(`ev.kind.${e.kind}`));
const monthName = (y, m, style = 'long') => mName(m, style === 'long');
const dateBox = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d) || []; return h('span', { class: 'date-box' }, h('b', {}, String(+m[3] || '')), h('small', {}, monthName(+m[1], +m[2] - 1, 'short').replace('.', ''))); };
const evRow = (e) => h('li', { class: 'ev-row' }, dateBox(e.date), h('div', {}, h('b', {}, e.title), h('div', { class: 'muted' }, [e.time, e.place].filter(Boolean).join(' · ')), e.description ? h('p', { class: 'muted' }, e.description) : null), evBadge(e));

const extraViews = {
  async events() {
    const now = new Date(); let y = now.getFullYear(), m = now.getMonth();
    const holder = h('div');
    const draw = async () => {
      const last = new Date(y, m + 1, 0).getDate();
      let list = []; try { list = await api('GET', `/api/public/events?from=${ymd(y, m, 1)}&to=${ymd(y, m, last)}`); } catch { /* пусто */ }
      const first = (new Date(y, m, 1).getDay() + 6) % 7, cells = [];
      for (let i = 0; i < first; i++) cells.push(h('div', { class: 'cal-cell empty' }));
      for (let d = 1; d <= last; d++) {
        const day = list.filter((e) => e.date === ymd(y, m, d)), isToday = ymd(y, m, d) === ymd(now.getFullYear(), now.getMonth(), now.getDate());
        cells.push(h('div', { class: `cal-cell${isToday ? ' today' : ''}${day.length ? ' has' : ''}` }, h('span', { class: 'n' }, String(d)),
          day.slice(0, 2).map((e) => h('span', { class: `cal-ev k-${e.kind}`, title: e.title }, e.title)), day.length > 2 ? h('span', { class: 'cal-more' }, `+${day.length - 2}`) : null,
          day.length ? h('span', { class: 'cal-dots' }, day.slice(0, 3).map((e) => h('i', { class: `k-${e.kind}` }))) : null));
      }
      const title = `${monthName(y, m)} ${y}`;
      holder.replaceChildren(
        h('div', { class: 'cal-head' }, h('button', { class: 'cal-nav', type: 'button', 'aria-label': t('ev.prev'), onclick: () => { m--; if (m < 0) { m = 11; y--; } draw(); } }, icon('left', 20)),
          h('h3', {}, title), h('button', { class: 'cal-nav', type: 'button', 'aria-label': t('ev.next'), onclick: () => { m++; if (m > 11) { m = 0; y++; } draw(); } }, icon('right', 20))),
        h('div', { class: 'cal-grid' }, [1, 2, 3, 4, 5, 6, 7].map((i) => h('div', { class: 'cal-wd' }, WD(i))), cells),
        h('h3', { class: 'sub' }, t('ev.list')), list.length ? h('ul', { class: 'ev-list' }, list.map(evRow)) : empty('ev.none'));
    };
    await draw();
    return block(t('ev.title'), holder);
  },

  async admission() {
    const steps = [1, 2, 3, 4].map((i) => h('li', { class: 'step' }, h('span', { class: 'step-n' }, String(i)), h('div', {}, h('b', {}, t(`adm.s${i}`)), h('p', { class: 'muted' }, t(`adm.s${i}.t`)))));
    const call = site.phone ? h('a', { class: 'btn outline', href: `tel:${site.phone.replace(/[^+\d]/g, '')}` }, icon('phone', 18), site.phone) : null;
    return h('div', { class: 'container narrow' }, h('section', { class: 'page-block pad0' }, secHead(t('adm.title'), 'cap'), h('p', { class: 'lead' }, t('adm.lead')),
      h('ol', { class: 'steps' }, steps), call, h('h3', { class: 'sub' }, t('adm.form')), h('div', { class: 'panel-card' }, applyForm('admission'))));
  },

  async tour() {
    const list = await api('GET', '/api/public/tour').catch(() => []);
    const spots = [...new Set(list.map((x) => x.tour))];
    const holder = h('div'), tabs = h('div', { class: 'tabs', role: 'tablist' });
    let cur = '';
    const draw = () => {
      tabs.replaceChildren(...[['', t('tour.all')], ...spots.map((x) => [x, x])].map(([k, label]) => h('button', { role: 'tab', class: k === cur ? 'active' : '', onclick: () => { cur = k; draw(); } }, label)));
      const shown = list.filter((x) => !cur || x.tour === cur);
      holder.replaceChildren(h('div', { class: 'tour-grid' }, shown.map((x) => h('figure', { class: 'tour-item', onclick: () => lightbox({ file: x.file, title: x.title }) },
        h('img', { src: imgUrl(x.file), alt: x.title || x.tour, loading: 'lazy' }), h('figcaption', {}, h('small', {}, x.tour), h('b', {}, x.title || ''), x.caption ? h('span', {}, x.caption) : null)))));
    };
    if (!list.length) return block(t('tour.title'), empty('tour.empty'));
    draw();
    return block(t('tour.title'), [h('p', { class: 'lead' }, t('tour.lead')), tabs, holder]);
  },

  async faq() {
    const list = await api('GET', '/api/public/faq').catch(() => []);
    return h('div', { class: 'container narrow' }, h('section', { class: 'page-block pad0' }, secHead(t('faq.title'), 'help'),
      list.length ? h('div', { class: 'faq' }, list.map((f) => h('details', {}, h('summary', {}, f.question), paragraphs(f.answer)))) : empty('faq.empty'),
      h('p', {}, h('a', { class: 'btn outline', href: '#/contact' }, icon('mail', 18), t('faq.more')))));
  },

  async contact() {
    const hasGeo = site.school_lat && site.school_lon;
    const route = hasGeo ? `https://www.openstreetmap.org/directions?to=${encodeURIComponent(site.school_lat)}%2C${encodeURIComponent(site.school_lon)}` : null;
    const row = (ico, label, val) => val ? h('li', {}, icon(ico, 22), h('span', {}, h('small', {}, label), val)) : null;
    return h('div', { class: 'container' }, h('section', { class: 'page-block pad0' }, secHead(t('con.title'), 'mail'),
      h('div', { class: 'contact-grid' },
        h('div', { class: 'panel-card' }, h('p', { class: 'lead' }, t('con.lead')), applyForm('contact')),
        h('div', { class: 'panel-card' }, h('ul', { class: 'con-list' },
          row('pin', t('con.addr'), site.address), row('phone', t('foot.contact'), site.phone ? h('a', { href: `tel:${site.phone.replace(/[^+\d]/g, '')}` }, site.phone) : null),
          row('mail', 'E-mail', site.email ? h('a', { href: `mailto:${site.email}` }, site.email) : null), row('clock', t('con.hours'), site.work_hours)),
        h('div', { class: 'con-btns' }, site.phone ? h('a', { class: 'btn amber', href: `tel:${site.phone.replace(/[^+\d]/g, '')}` }, icon('phone', 18), t('con.call')) : null,
          route ? h('a', { class: 'btn outline', href: route, target: '_blank', rel: 'noopener noreferrer' }, icon('route', 18), t('con.route')) : null,
          site.telegram_url ? h('a', { class: 'btn outline', href: site.telegram_url, target: '_blank', rel: 'noopener noreferrer' }, icon('send', 18), 'Telegram') : null)))));
  },
};
Object.assign(views, extraViews, parentViews);

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


// ---------- быстрые кнопки на телефоне, настройки отображения, анимации ----------
function quickBar() {
  const items = [site.phone && ['phone', 'quick.call', `tel:${site.phone.replace(/[^+\d]/g, '')}`], (site.school_lat && site.school_lon) && ['route', 'quick.route', `https://www.openstreetmap.org/directions?to=${encodeURIComponent(site.school_lat)}%2C${encodeURIComponent(site.school_lon)}`], ['mail', 'quick.write', '#/contact']].filter(Boolean);
  return h('div', { class: 'quickbar' }, items.map(([ico, k, href]) => h('a', { href, target: href.startsWith('http') ? '_blank' : null, rel: 'noopener noreferrer' }, icon(ico, 20), h('span', {}, t(k)))));
}

const PREF = { get: (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } } };
function applyPrefs() {
  const th = PREF.get('theme', 'auto'), dark = th === 'dark' || (th === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.dataset.fs = PREF.get('fs', '0');
}
function a11yWidget() {
  const panel = h('div', { class: 'a11y-panel', hidden: true, role: 'dialog', 'aria-label': t('a11y.title') });
  const seg = (key, opts) => h('div', { class: 'seg' }, opts.map(([v, label, ico]) => h('button', { type: 'button', class: PREF.get(key, key === 'fs' ? '0' : 'auto') === v ? 'on' : '', 'aria-pressed': String(PREF.get(key, key === 'fs' ? '0' : 'auto') === v),
    onclick: () => { PREF.set(key, v); applyPrefs(); fill(); } }, ico ? icon(ico, 16) : null, label)));
  const fill = () => panel.replaceChildren(h('b', {}, t('a11y.title')),
    h('div', {}, h('small', {}, t('a11y.theme')), seg('theme', [['auto', t('a11y.auto')], ['light', t('a11y.light'), 'sun'], ['dark', t('a11y.dark'), 'moon']])),
    h('div', {}, h('small', {}, t('a11y.size')), seg('fs', [['0', 'A'], ['1', 'A+'], ['2', 'A++']])),
    h('a', { class: 'lite-link', href: '#/' }, icon('monitor', 16), t('a11y.lite')));
  fill();
  const btn = h('button', { class: 'a11y-btn', type: 'button', 'aria-label': t('a11y.title'), title: t('a11y.title'), onclick: (e) => { e.stopPropagation(); panel.hidden = !panel.hidden; } }, icon('accessibility', 24));
  panel.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', () => { panel.hidden = true; });
  return h('div', { class: 'a11y' }, panel, btn);
}
function animateCount(el) {
  const to = +el.dataset.count; if (!to || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const t0 = performance.now(), dur = 1400;
  const step = (now) => { const k = Math.min(1, (now - t0) / dur), e = 1 - (1 - k) ** 3; el.textContent = String(Math.round(to * e)); if (k < 1) requestAnimationFrame(step); };
  el.textContent = '0'; requestAnimationFrame(step);
}
let io = null;
function enhance() {
  if (!('IntersectionObserver' in window)) return;
  io?.disconnect();
  io = new IntersectionObserver((entries) => entries.forEach((en) => {
    if (!en.isIntersecting) return;
    en.target.classList.add('in');
    en.target.querySelectorAll('[data-count]').forEach(animateCount);
    io.unobserve(en.target);
  }), { threshold: 0.12 });
  document.documentElement.classList.add('js-reveal');
  document.querySelectorAll('main .box, main .card-link, main .banner, main .adv, main .stat-bar, main .tour-strip, main .step, main .panel-card, main .ev-row, main details').forEach((el, i) => { el.classList.add('reveal'); el.style.setProperty('--d', `${(i % 4) * 70}ms`); io.observe(el); });
}
applyPrefs();
if (false && 'serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('/sw.js').catch(() => {});

async function route() {
  const hash = location.hash || '#/';
  const [, a, b] = hash.split('/');
  document.body.classList.remove('menu-open');
  let view;
  try {
    if (!a) view = await views.home();
    else if (a === 'news' && b) view = await views.newsItem(b);
    else if (['news', 'announcements', 'media', 'achievements', 'teachers', 'events', 'admission', 'tour', 'faq', 'contact', 'parents', 'cabinet', 'appointment', 'feedback', 'menu', 'bells', 'documents'].includes(a)) view = await views[a]();
    else if (a === 'page' && b) view = await views.page(b);
    else view = h('div', { class: 'container' }, empty('empty.page'));
  } catch (e) { view = h('div', { class: 'container' }, h('div', { class: 'empty' }, e.status === 404 ? t('empty.page') : t('err.load'))); }
  app.replaceChildren(header(hash), h('main', {}, view), footer(), quickBar(), a11yWidget());
  enhance();
  document.title = `${site.school_name} — ${cityLabel()}`;
  window.scrollTo(0, 0);
}

(async function init() {
  applyPrefs();
  try { site = await api('GET', '/api/public/site'); } catch { /* показываем значения по умолчанию */ }
  window.addEventListener('hashchange', route);
  route();
})();
