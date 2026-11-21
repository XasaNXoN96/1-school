'use strict';
const { checkIn, checkOut, localNow } = require('./attendance');
const { monthReport, currentMonth } = require('./salary');
const { getSettings } = require('./db');
const { isManager } = require('./auth');

const PENDING_TTL_MS = 5 * 60_000;
const fmtMoney = (n) => `${Math.round(n).toLocaleString('ru-RU')} сум`;

function telegramApi(token) {
  const base = `https://api.telegram.org/bot${token}`;
  const call = async (method, payload, signal) => {
    const res = await fetch(`${base}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!data.ok) throw new Error(data.description || `Telegram API ${res.status}`);
    return data.result;
  };
  return {
    sendMessage: (chat_id, text, extra = {}) => call('sendMessage', { chat_id, text, ...extra }),
    getUpdates: (offset, signal) => call('getUpdates', { offset, timeout: 30, allowed_updates: ['message'] }, signal),
  };
}

const KB = {
  main: (manager) => ({
    reply_markup: {
      keyboard: [
        [{ text: '✅ Пришёл' }, { text: '🏁 Ушёл' }],
        [{ text: '📊 Зарплата' }, { text: '📋 Поручения' }],
        [{ text: '📚 Уроки сегодня' }, { text: '🗓 Мои планы' }],
        ...(manager ? [[{ text: '📅 Сегодня' }]] : []),
      ],
      resize_keyboard: true,
    },
  }),
  askLocation: {
    reply_markup: {
      keyboard: [[{ text: '📍 Отправить геолокацию', request_location: true }], [{ text: '❌ Отмена' }]],
      resize_keyboard: true, one_time_keyboard: true,
    },
  },
};

function createBot({ db, notifier, api, now = () => new Date(), publicUrl = '' }) {
  const base = String(publicUrl || '').replace(/\/+$/, '');
  const canMiniApp = /^https:\/\//i.test(base);
  const pending = new Map(); // telegram_id -> { action, at }
  let stopped = false, abort = null;

  const userByTg = (id) => db.prepare('SELECT * FROM users WHERE telegram_id = ? AND active = 1 AND frozen = 0').get(String(id));

  async function reply(chatId, text, extra) { return api.sendMessage(chatId, text, extra); }

  // Отметка по лицу: Telegram Mini App (web_app) — личность подтверждается подписью Telegram, место и лицо — на сервере.
  function faceMarkReply(chatId, kind, manager) {
    if (!canMiniApp) {
      return reply(chatId, 'Отметка по лицу требует безопасного адреса сайта (https). Сообщите директору: не задан PUBLIC_URL.', KB.main(manager));
    }
    const label = kind === 'in' ? '📷 Отметить приход' : '📷 Отметить уход';
    return reply(chatId, 'Нажмите кнопку: откроется камера. Нужно будет посмотреть в камеру и выполнить два простых задания (например, закрыть левый глаз или улыбнуться). Геолокация проверяется автоматически.',
      { reply_markup: { inline_keyboard: [[{ text: label, web_app: { url: `${base}/checkin?kind=${kind}` } }]] } });
  }

  function link(chatId, codeRaw) {
    const code = String(codeRaw || '').trim().toUpperCase();
    const u = code && db.prepare('SELECT * FROM users WHERE link_code = ? AND active = 1').get(code);
    if (!u) return reply(chatId, 'Код не найден или уже использован. Попросите у директора новый код.');
    const taken = db.prepare('SELECT id FROM users WHERE telegram_id = ? AND id != ?').get(String(chatId), u.id);
    if (taken) return reply(chatId, 'Этот Telegram уже привязан к другому сотруднику.');
    db.prepare('UPDATE users SET telegram_id = ?, link_code = NULL WHERE id = ?').run(String(chatId), u.id);
    return reply(chatId, `Здравствуйте, ${u.full_name}! Аккаунт привязан.\nНажимайте «Пришёл» и «Ушёл» — бот попросит геолокацию.`, KB.main(isManager(u)));
  }

  function salaryText(u) {
    const r = monthReport(db, u, currentMonth(db, now()), now());
    return [
      `📊 ${r.month} — ${u.full_name}`,
      `Оклад: ${fmtMoney(r.base)} за месяц (${r.scheduled} раб. дн.)`,
      `Пришёл: ${r.present} дн.` + (r.excused ? `, уважительно: ${r.excused}` : ''),
      `Не пришёл: ${r.absent} дн.`,
      `Опозданий: ${r.late_count}` + (r.late_minutes ? ` (${r.late_minutes} мин)` : ''),
      `К выплате на сегодня: ${fmtMoney(r.earned)}`,
    ].join('\n');
  }

  function tasksText(u) {
    const rows = db.prepare("SELECT title, due_date FROM tasks WHERE assignee_id = ? AND status = 'open' ORDER BY due_date IS NULL, due_date LIMIT 15").all(u.id);
    if (!rows.length) return '📋 Открытых поручений нет.';
    return '📋 Ваши поручения:\n' + rows.map((t, i) => `${i + 1}. ${t.title}${t.due_date ? ` (до ${t.due_date})` : ''}`).join('\n');
  }

  function lessonsText(u) {
    const t = localNow(now(), getSettings(db).timezone);
    const rows = db.prepare('SELECT * FROM lessons WHERE teacher_id = ? AND weekday = ? ORDER BY start_time').all(u.id, t.weekday);
    if (!rows.length) return '📚 Сегодня уроков нет.';
    return `📚 Уроки сегодня (${rows.length}):\n` + rows.map((l) => `${l.start_time}–${l.end_time}  ${l.class_name ? l.class_name + ' — ' : ''}${l.subject}${l.room ? ' (каб. ' + l.room + ')' : ''}`).join('\n');
  }

  function plansText(u) {
    const t = localNow(now(), getSettings(db).timezone);
    const rows = db.prepare('SELECT * FROM plans WHERE user_id = ? AND date >= ? ORDER BY date, time LIMIT 15').all(u.id, t.date);
    if (!rows.length) return '🗓 Планов нет. Добавить можно в панели сайта: «Мои планы».';
    return '🗓 Ближайшие планы:\n' + rows.map((p) => `${p.done ? '✅' : '•'} ${p.date === t.date ? 'сегодня' : p.date} ${p.time} — ${p.title}`).join('\n');
  }

  function todayText() {
    const t = localNow(now(), getSettings(db).timezone);
    const people = db.prepare("SELECT * FROM users WHERE active = 1 AND role IN ('teacher','staff') ORDER BY full_name").all()
      .filter((u) => u.work_days.split(',').map(Number).includes(t.weekday));
    if (!people.length) return '📅 Сегодня нет сотрудников по графику.';
    const lines = people.map((u) => {
      const r = db.prepare('SELECT * FROM attendance WHERE user_id = ? AND date = ?').get(u.id, t.date);
      if (r?.check_in) return `✅ ${u.full_name} — ${r.check_in.slice(11, 16)}${r.late_minutes ? ` ⚠️ опоздание ${r.late_minutes} мин` : ''}${r.check_out ? `, ушёл ${r.check_out.slice(11, 16)}` : ''}`;
      if (r?.status === 'excused') return `🟦 ${u.full_name} — уважительная причина`;
      return `⬜ ${u.full_name} — не отмечен (с ${u.shift_start})`;
    });
    return `📅 Сегодня, ${t.date}:\n` + lines.join('\n');
  }

  async function handleUpdate(update) {
    const msg = update.message;
    if (!msg || !msg.chat || msg.chat.type !== 'private') return;
    const chatId = msg.chat.id;
    const text = (msg.text || '').trim();

    const cmd = /^\/(start|link)(?:@\w+)?(?:\s+(\S+))?/i.exec(text);
    if (cmd) {
      if (cmd[2]) return link(chatId, cmd[2]);
      const u = userByTg(chatId);
      return u
        ? reply(chatId, `Здравствуйте, ${u.full_name}!`, KB.main(isManager(u)))
        : reply(chatId, 'Здравствуйте! Чтобы привязать аккаунт, отправьте: /start КОД\nКод выдаёт директор в панели сайта.');
    }

    const u = userByTg(chatId);
    if (!u) return reply(chatId, 'Сначала привяжите аккаунт: /start КОД (код выдаёт директор).');

    if (msg.location) {
      const p = pending.get(String(chatId));
      pending.delete(String(chatId));
      // При включённой проверке по лицу обычная геолокация отметку НЕ засчитывает: её можно подделать или переслать.
      if (getSettings(db).face_required === '1') return faceMarkReply(chatId, p?.action === 'out' ? 'out' : 'in', isManager(u));
      if (msg.date && Math.abs(now().getTime() / 1000 - msg.date) > 180) return reply(chatId, 'Геолокация устарела. Отправьте текущую.', KB.main(isManager(u)));
      if (msg.forward_origin || msg.forward_date) return reply(chatId, 'Пересланная геолокация не принимается. Отправьте свою текущую.', KB.main(isManager(u)));
      if (!p || now().getTime() - p.at > PENDING_TTL_MS) {
        return reply(chatId, 'Сначала нажмите «Пришёл» или «Ушёл».', KB.main(isManager(u)));
      }
      const loc = { lat: msg.location.latitude, lon: msg.location.longitude };
      const res = p.action === 'in' ? checkIn(db, notifier, u, loc, now()) : checkOut(db, notifier, u, loc, now());
      return reply(chatId, res.message, KB.main(isManager(u)));
    }

    switch (text) {
      case '✅ Пришёл': if (getSettings(db).face_required === '1') return faceMarkReply(chatId, 'in', isManager(u)); pending.set(String(chatId), { action: 'in', at: now().getTime() }); return reply(chatId, 'Отправьте геолокацию кнопкой ниже.', KB.askLocation);
      case '🏁 Ушёл': if (getSettings(db).face_required === '1') return faceMarkReply(chatId, 'out', isManager(u)); pending.set(String(chatId), { action: 'out', at: now().getTime() }); return reply(chatId, 'Отправьте геолокацию кнопкой ниже.', KB.askLocation);
      case '❌ Отмена': pending.delete(String(chatId)); return reply(chatId, 'Отменено.', KB.main(isManager(u)));
      case '📊 Зарплата': return reply(chatId, salaryText(u), KB.main(isManager(u)));
      case '📚 Уроки сегодня': return reply(chatId, lessonsText(u), KB.main(isManager(u)));
      case '🗓 Мои планы': return reply(chatId, plansText(u), KB.main(isManager(u)));
      case '📋 Поручения': return reply(chatId, tasksText(u), KB.main(isManager(u)));
      case '📅 Сегодня':
        if (!isManager(u)) break;
        return reply(chatId, todayText(), KB.main(true));
      default: break;
    }
    return reply(chatId, 'Выберите действие на клавиатуре ниже.', KB.main(isManager(u)));
  }

  async function startPolling() {
    let offset = 0, delay = 1000;
    while (!stopped) {
      try {
        abort = new AbortController();
        const updates = await api.getUpdates(offset, abort.signal);
        delay = 1000;
        for (const upd of updates) {
          offset = upd.update_id + 1;
          try { await handleUpdate(upd); } catch (e) { console.error('[telegram] ошибка обработки:', e.message); }
        }
      } catch (e) {
        if (stopped) break;
        console.error('[telegram] getUpdates:', e.message);
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(delay * 2, 30_000);
      }
    }
  }

  return { handleUpdate, startPolling, stop() { stopped = true; abort?.abort(); } };
}

module.exports = { createBot, telegramApi };
