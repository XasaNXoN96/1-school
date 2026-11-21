// Локализация интерфейса: узбекский (по умолчанию), русский, английский.
// Тексты, которые вводит администрация (новости, страницы и т. д.), хранятся как введены.
export const LANGS = [['uz', 'UZ', "O'zbekcha"], ['ru', 'RU', 'Русский'], ['en', 'EN', 'English']];

const D = {
  uz: {
    'nav.home': 'Bosh sahifa', 'nav.about': 'Maktab haqida', 'nav.programs': "Ta'lim dasturlari", 'nav.teachers': 'Ustozlar',
    'nav.news': 'Yangiliklar', 'nav.media': 'Media', 'nav.gallery': 'Fotogalereya', 'nav.announcements': "E'lonlar",
    'nav.achievements': 'Yutuqlar', 'nav.contact': 'Kontakt', 'nav.login': 'Kirish', 'nav.menu': 'Menyu', 'nav.lang': 'Til',
    'page.about': 'Maktab haqida', 'page.programs': "Ta'lim dasturlari", 'page.contacts': 'Kontakt',
    'page.schedule': 'Dars jadvali', 'page.clubs': "To'garaklar", 'page.olympiads': 'Olimpiadalar', 'page.resources': 'Foydali resurslar',
    'hero.city': 'Gagarin shahri', 'hero.about': 'Maktab haqida', 'hero.video': "Videoni ko'rish",
    'stat.students': "O'quvchilar", 'stat.teachers': "O'qituvchilar", 'stat.classes': 'Sinf', 'stat.achievements': 'Yutuqlar', 'stat.clubs': "To'garaklar",
    'home.latest': "So'nggi yangiliklar", 'home.all': "Barchasini ko'rish", 'home.teachers': 'Bizning ustozlarimiz', 'home.students': "Eng faol o'quvchilar",
    'banner.media': 'Media', 'banner.media.sub': 'Maktab hayotidan lavhalar',
    'banner.gallery': 'Galereya', 'banner.gallery.sub': 'Tadbirlar va maktab hayotidan suratlar',
    'banner.achievements': 'Yutuqlarimiz', 'banner.achievements.sub': "O'quvchi va ustozlarimizning muvaffaqiyatlari",
    'home.about': 'Maktab haqida', 'home.more': "Batafsil ma'lumot", 'home.announcements': "E'lonlar", 'home.life': 'Hayotimiz lavhalari',
    'adv.title': "Maktabda ta'lim olish afzalliklari", 'adv.1': 'Zamonaviy sharoitlar', 'adv.2': 'Malakali ustozlar',
    'adv.3': 'Keng imkoniyatlar', 'adv.4': "To'garaklar va klublar", 'adv.5': 'Yutuq va muvaffaqiyatlar',
    'foot.tagline': "Sifatli ta'lim, tarbiya va rivojlanish uchun qulay muhit.", 'foot.quick': 'Tezkor havolalar',
    'foot.students': "O'quvchilar uchun", 'foot.contact': 'Aloqa', 'foot.rights': 'Barcha huquqlar himoyalangan.',
    'foot.note': "Sayt o'quvchilar, ota-onalar va ustozlar uchun mo'ljallangan.", 'foot.map': "Xaritada ko'rish", 'foot.top': 'Yuqoriga',
    'badge.teacher': 'Eng yaxshi ustoz', 'badge.student': "Eng yaxshi o'quvchi", 'home.pride': 'Maktabimiz faxri',
    'tab.students': "O'quvchilar", 'tab.teachers': 'Ustozlar', 'class': 'sinf',
    'back.news': '← Barcha yangiliklar', 'back.ann': "← Barcha e'lonlar",
    'empty.news': "Hozircha yangiliklar yo'q", 'empty.ann': "Hozircha e'lonlar yo'q", 'empty.teachers': "Ustozlar ro'yxati hali bo'sh",
    'empty.students': "Hozircha ma'lumot yo'q", 'empty.ach': "Hozircha yutuqlar yo'q", 'empty.media': "Suratlar hali yo'q",
    'empty.page': 'Sahifa topilmadi', 'empty.about': "Maktab haqida ma'lumot tez orada qo'shiladi.", 'err.load': "Ma'lumotni yuklab bo'lmadi",
    'pager.prev': 'Oldingi', 'pager.next': 'Keyingi',
  },
  ru: {
    'nav.home': 'Главная', 'nav.about': 'О школе', 'nav.programs': 'Чему мы учим', 'nav.teachers': 'Учителя',
    'nav.news': 'Новости', 'nav.media': 'Медиа', 'nav.gallery': 'Фотогалерея', 'nav.announcements': 'Объявления',
    'nav.achievements': 'Достижения', 'nav.contact': 'Контакты', 'nav.login': 'Войти', 'nav.menu': 'Меню', 'nav.lang': 'Язык',
    'page.about': 'О школе', 'page.programs': 'Чему мы учим', 'page.contacts': 'Контакты',
    'page.schedule': 'Расписание уроков', 'page.clubs': 'Кружки', 'page.olympiads': 'Олимпиады', 'page.resources': 'Полезные ресурсы',
    'hero.city': 'город Гагарин', 'hero.about': 'О школе', 'hero.video': 'Смотреть видео',
    'stat.students': 'Ученики', 'stat.teachers': 'Учителя', 'stat.classes': 'Классы', 'stat.achievements': 'Достижения', 'stat.clubs': 'Кружки',
    'home.latest': 'Последние новости', 'home.all': 'Смотреть все', 'home.teachers': 'Наши учителя', 'home.students': 'Самые активные ученики',
    'banner.media': 'Медиа', 'banner.media.sub': 'Моменты из жизни школы',
    'banner.gallery': 'Галерея', 'banner.gallery.sub': 'Фотографии мероприятий и школьной жизни',
    'banner.achievements': 'Наши достижения', 'banner.achievements.sub': 'Успехи наших учеников и учителей',
    'home.about': 'О школе', 'home.more': 'Подробнее', 'home.announcements': 'Объявления', 'home.life': 'Кадры нашей жизни',
    'adv.title': 'Преимущества обучения в школе', 'adv.1': 'Современные условия', 'adv.2': 'Опытные учителя',
    'adv.3': 'Широкие возможности', 'adv.4': 'Кружки и клубы', 'adv.5': 'Успехи и достижения',
    'foot.tagline': 'Комфортная среда для качественного образования, воспитания и развития.', 'foot.quick': 'Быстрые ссылки',
    'foot.students': 'Ученикам', 'foot.contact': 'Контакты', 'foot.rights': 'Все права защищены.',
    'foot.note': 'Сайт создан для учеников, родителей и учителей.', 'foot.map': 'Показать на карте', 'foot.top': 'Наверх',
    'badge.teacher': 'Лучший учитель', 'badge.student': 'Лучший ученик', 'home.pride': 'Гордость школы',
    'tab.students': 'Ученики', 'tab.teachers': 'Учителя', 'class': 'класс',
    'back.news': '← Все новости', 'back.ann': '← Все объявления',
    'empty.news': 'Новостей пока нет', 'empty.ann': 'Объявлений пока нет', 'empty.teachers': 'Список учителей пока пуст',
    'empty.students': 'Пока нет данных', 'empty.ach': 'Пока нет достижений', 'empty.media': 'Фотографий пока нет',
    'empty.page': 'Страница не найдена', 'empty.about': 'Информация о школе скоро появится.', 'err.load': 'Не удалось загрузить данные',
    'pager.prev': 'Назад', 'pager.next': 'Далее',
  },
  en: {
    'nav.home': 'Home', 'nav.about': 'About school', 'nav.programs': 'Programs', 'nav.teachers': 'Teachers',
    'nav.news': 'News', 'nav.media': 'Media', 'nav.gallery': 'Photo gallery', 'nav.announcements': 'Announcements',
    'nav.achievements': 'Achievements', 'nav.contact': 'Contact', 'nav.login': 'Sign in', 'nav.menu': 'Menu', 'nav.lang': 'Language',
    'page.about': 'About school', 'page.programs': 'Programs', 'page.contacts': 'Contact',
    'page.schedule': 'Class schedule', 'page.clubs': 'Clubs', 'page.olympiads': 'Olympiads', 'page.resources': 'Useful resources',
    'hero.city': 'Gagarin city', 'hero.about': 'About school', 'hero.video': 'Watch video',
    'stat.students': 'Students', 'stat.teachers': 'Teachers', 'stat.classes': 'Classes', 'stat.achievements': 'Achievements', 'stat.clubs': 'Clubs',
    'home.latest': 'Latest news', 'home.all': 'View all', 'home.teachers': 'Our teachers', 'home.students': 'Most active students',
    'banner.media': 'Media', 'banner.media.sub': 'Moments from school life',
    'banner.gallery': 'Gallery', 'banner.gallery.sub': 'Photos of events and school life',
    'banner.achievements': 'Our achievements', 'banner.achievements.sub': 'Successes of our students and teachers',
    'home.about': 'About school', 'home.more': 'Read more', 'home.announcements': 'Announcements', 'home.life': 'Snapshots of our life',
    'adv.title': 'Why study at our school', 'adv.1': 'Modern facilities', 'adv.2': 'Qualified teachers',
    'adv.3': 'Wide opportunities', 'adv.4': 'Clubs and societies', 'adv.5': 'Success and achievements',
    'foot.tagline': 'A supportive environment for quality education, upbringing and growth.', 'foot.quick': 'Quick links',
    'foot.students': 'For students', 'foot.contact': 'Contact', 'foot.rights': 'All rights reserved.',
    'foot.note': 'This site is made for students, parents and teachers.', 'foot.map': 'View on map', 'foot.top': 'Back to top',
    'badge.teacher': 'Teacher of the year', 'badge.student': 'Student of the year', 'home.pride': 'Pride of our school',
    'tab.students': 'Students', 'tab.teachers': 'Teachers', 'class': 'grade',
    'back.news': '← All news', 'back.ann': '← All announcements',
    'empty.news': 'No news yet', 'empty.ann': 'No announcements yet', 'empty.teachers': 'The teachers list is empty for now',
    'empty.students': 'No data yet', 'empty.ach': 'No achievements yet', 'empty.media': 'No photos yet',
    'empty.page': 'Page not found', 'empty.about': 'Information about the school will appear soon.', 'err.load': 'Could not load data',
    'pager.prev': 'Previous', 'pager.next': 'Next',
  },
};

const MONTHS = {
  uz: ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avg', 'sen', 'okt', 'noy', 'dek'],
  uzLong: ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'],
  ru: ['янв.', 'фев.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сен.', 'окт.', 'нояб.', 'дек.'],
  ruLong: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  enLong: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};

let current = 'uz';
try { const s = localStorage.getItem('lang'); if (D[s]) current = s; } catch { /* приватный режим */ }

export const lang = () => current;
export function setLang(l) {
  if (!D[l]) return;
  current = l;
  try { localStorage.setItem('lang', l); } catch { /* ignore */ }
  document.documentElement.lang = l;
}
document.documentElement.lang = current;
export const t = (k) => D[current][k] ?? D.uz[k] ?? k;

export function fmtDate(s, long = false) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  if (!m) return '';
  const [y, mo, d] = [+m[1], +m[2] - 1, +m[3]];
  if (current === 'uz') return `${d}-${(long ? MONTHS.uzLong : MONTHS.uz)[mo]}, ${y}`;
  if (current === 'ru') return `${d} ${(long ? MONTHS.ruLong : MONTHS.ru)[mo]} ${y}`;
  return `${(long ? MONTHS.enLong : MONTHS.en)[mo]} ${d}, ${y}`;
}
