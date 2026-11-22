import { T, h, api, icon, state, isManager, readForm, field, guard } from './ui.js';
import { views } from './views.js';
import './views2.js';
import './views3.js';
import { lang, setLang, LANGS } from '../js/i18n.js';

const app = document.getElementById('app');
const logo = (size = 44) => h('img', { src: '../img/logo.svg', alt: '', width: size, height: size });

const MENU_MANAGER = [['dashboard', 'Главная', 'home'], ['stats', 'Статистика', 'trend'], ['users', 'Пользователи', 'users'], ['calendar', 'Календарь', 'calendar'], ['applications', 'Заявки с сайта', 'mail'], ['lessons', 'Расписание уроков', 'clock'], ['tasks', 'Поручения', 'clipboard'], ['students', 'Ученики', 'cap'],
  ['news', 'Новости', 'news'], ['announcements', 'Объявления', 'megaphone'], ['media', 'Медиа (фото/видео)', 'image'], ['pages', 'О школе', 'book'], ['achievements', 'Достижения', 'trophy'], ['reports', 'Отчёты', 'chart'], ['faq', 'Вопросы и ответы', 'help'], ['faceid', 'Проверка по лицу', 'camera'], ['audit', 'Журнал действий', 'shield'], ['settings', 'Настройки', 'settings']];
const MENU_STAFF = [['dashboard', 'Главная', 'home'], ['lessons', 'Мои уроки', 'book'], ['calendar', 'Календарь', 'calendar'], ['tasks', 'Задания', 'clipboard'], ['students', 'Ученики', 'cap'], ['achievements', 'Достижения', 'trophy'],
  ['attendance', 'Посещаемость', 'check'], ['mycheck', 'Моя отметка', 'camera'], ['salary', 'Зарплата', 'chart'], ['messages', 'Сообщения', 'mail'], ['announcements', 'Объявления', 'megaphone'], ['plans', 'Мои планы', 'clock'], ['profile', 'Профиль', 'user']];

const roleLabel = (r) => ({ director: T('Администратор'), assistant: T('Ассистент'), teacher: T('Учитель'), staff: T('Сотрудник') }[r]);
const GREET = { uz: 'Assalomu alaykum', ru: 'Здравствуйте', en: 'Hello' };

function langMenu(cls = '') {
  const wrap = h('div', { class: `dd ${cls}` });
  const cur = LANGS.find((l) => l[0] === lang());
  wrap.append(h('button', { class: 'lang-btn', type: 'button', 'aria-label': T('Язык'), onclick: (e) => { e.stopPropagation(); wrap.classList.toggle('open'); } }, cur[1], icon('chevron', 14)),
    h('div', { class: 'dd-menu' }, LANGS.map(([c, s, n]) => h('button', { type: 'button', class: c === lang() ? 'sel' : '', onclick: () => { setLang(c); state.me ? route() : start(); } }, `${s} · ${n}`))));
  return wrap;
}
document.addEventListener('click', () => document.querySelectorAll('.dd.open').forEach((e) => e.classList.remove('open')));

// ---------- вход (только логин и пароль, без регистрации) ----------
async function authScreen(setup) {
  const site = await api('GET', '/api/public/site').catch(() => ({ school_name: '№1-Maktab', city: 'Gagarin shahri' }));
  const box = h('div'), pw = h('input', { name: 'password', type: 'password', required: true, autocomplete: setup ? 'new-password' : 'current-password', placeholder: T('Пароль') });
  const eye = h('button', { type: 'button', class: 'eye', 'aria-label': T('Показать пароль'), onclick: () => { const show = pw.type === 'password'; pw.type = show ? 'text' : 'password'; eye.replaceChildren(icon(show ? 'eyeoff' : 'eye', 20)); } }, icon('eye', 20));
  const form = h('form', { onsubmit: (e) => { e.preventDefault(); const d = readForm(form); guard(box, async () => { await api('POST', setup ? '/api/setup' : '/api/auth/login', { ...d, remember: d.remember !== false }); await start(); }); } },
    setup ? h('label', { class: 'input' }, icon('user', 20), h('input', { name: 'full_name', required: true, placeholder: T('Ваше ФИО') })) : null,
    h('label', { class: 'input' }, icon('user', 20), h('input', { name: 'username', required: true, autocomplete: 'username', placeholder: T('Логин'), autocapitalize: 'none' })),
    h('label', { class: 'input' }, icon('lock', 20), pw, eye),
    setup ? null : h('div', { class: 'row between' }, h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'remember', checked: true }), T('Запомнить меня')),
      h('a', { href: '#', onclick: (e) => { e.preventDefault(); msgForgot(); } }, T('Забыли пароль?'))),
    h('button', { class: 'primary big', type: 'submit' }, icon('login', 20), setup ? T('Создать администратора и войти') : T('Войти')));
  const msgForgot = () => box.replaceChildren(h('div', { class: 'ok-msg' }, T('Пароль восстанавливает администратор школы. Обратитесь к нему.')));
  app.replaceChildren(h('div', { class: 'login-page' }, h('div', { class: 'login-lang' }, langMenu()),
    h('div', { class: 'login-card' }, h('div', { class: 'login-brand' }, logo(84), h('small', {}, site.city), h('h1', {}, site.school_name), h('p', {}, T('Информационная система школы'))),
      setup ? h('p', { class: 'muted center' }, T('Первый запуск: создайте администратора. Директор автоматически становится администратором сайта.')) : null, box, form,
      h('a', { class: 'back', href: '../index.html' }, '← ' + T('На сайт')))));
}

// ---------- каркас ----------
// Меню: на широком экране сворачивается/разворачивается кликом (состояние запоминается), на узком — выезжает поверх.
const SIDE_KEY = 'panel_side_collapsed';
const wide = () => window.matchMedia('(min-width: 901px)').matches;
function toggleSide() {
  if (wide()) {
    const on = document.body.classList.toggle('side-collapsed');
    try { localStorage.setItem(SIDE_KEY, on ? '1' : '0'); } catch { /* ignore */ }
  } else document.body.classList.toggle('side-open');
}
try { if (localStorage.getItem(SIDE_KEY) === '1') document.body.classList.add('side-collapsed'); } catch { /* ignore */ }

async function route() {
  const me = state.me;
  const items = isManager() ? MENU_MANAGER : MENU_STAFF;
  const key = location.hash.replace('#/', '') || 'dashboard';
  const cur = items.find((m) => m[0] === key) || items[0];
  const d = await api('GET', '/api/panel/dashboard').catch(() => ({ unread: 0 }));
  const content = h('div', { class: 'content' });
  const side = h('aside', { class: 'side' }, h('a', { class: 'side-brand', href: '#/dashboard' }, logo(42), h('span', {}, h('b', {}, '№1-Maktab'), h('small', {}, 'Gagarin shahri'))),
    h('nav', {}, items.map(([k, label, ico]) => h('a', { class: `item${k === cur[0] ? ' active' : ''}`, href: `#/${k}`, onclick: () => document.body.classList.remove('side-open') }, icon(ico, 20), T(label),
      k === 'messages' && d.unread ? h('i', { class: 'badge' }, String(d.unread)) : null)),
      h('a', { class: 'item', href: '../index.html', target: '_blank' }, icon('home', 20), T('Открыть сайт'))),
    h('div', { class: 'side-role' }, icon(isManager() ? 'crown' : 'user', 20), roleLabel(me.role)));
  const greetName = isManager() ? roleLabel(me.role) : me.full_name;
  const top = h('header', { class: 'top' }, h('button', { class: 'burger', 'aria-label': T('Меню'), title: T('Меню'), onclick: toggleSide }, icon('menu', 22)),
    h('div', { class: 'hello' }, h('h1', {}, `${GREET[lang()]}, ${greetName}!`), h('p', {}, isManager() ? T('Панель управления информационной системой школы') : `${me.subject ? me.subject + ' · ' : ''}${roleLabel(me.role)}`)),
    h('span', { class: 'spacer' }), langMenu(),
    h('a', { class: 'bell', href: '#/messages', 'aria-label': T('Сообщения') }, icon('bell', 22), d.unread ? h('i', {}, String(d.unread)) : null),
    (() => { const w = h('div', { class: 'dd user' });
      w.append(h('button', { class: 'user-btn', onclick: (e) => { e.stopPropagation(); w.classList.toggle('open'); } }, h('span', { class: 'avatar' }, (me.full_name || '?').slice(0, 1)), h('span', { class: 'uname' }, h('b', {}, me.full_name), h('small', {}, roleLabel(me.role))), icon('chevron', 14)),
        h('div', { class: 'dd-menu right' }, h('a', { href: isManager() ? '#/settings' : '#/profile' }, T('Профиль')),
          h('button', { onclick: async () => { await api('POST', '/api/auth/logout'); location.reload(); } }, T('Выйти'))));
      return w; })());
  app.replaceChildren(h('div', { class: 'shell' }, side, h('div', { class: 'main' }, top, content)), h('div', { class: 'scrim', onclick: () => document.body.classList.remove('side-open') }));
  try { content.append(await views[cur[0]]()); } catch (e) { if (e.status === 401) location.reload(); else content.append(h('div', { class: 'err' }, e.message)); }
  window.scrollTo(0, 0);
}
state.route = route;

async function start() {
  document.title = 'Panel — №1-Maktab';
  try { state.me = await api('GET', '/api/auth/me'); } catch {
    state.me = null;
    const st = await api('GET', '/api/setup/status').catch(() => ({ needsSetup: false }));
    return authScreen(st.needsSetup);
  }
  if (!start.beat) { start.beat = setInterval(() => { if (state.me && !document.hidden) api('GET', '/api/ping').catch(() => {}); }, 60000); }
  if (!start.bound) { window.addEventListener('hashchange', () => state.me && route()); start.bound = true; }
  route();
}
start();
