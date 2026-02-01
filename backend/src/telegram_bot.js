import { createLot, deleteLot, listLots } from "./auction.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const BOT_TOKEN = process.env.BOT_TOKEN || "";
const ADMIN_IDS = (process.env.ADMIN_IDS || "")
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);

const WEBAPP_URL = process.env.WEBAPP_URL || "";
const PUBLIC_BASE = process.env.PUBLIC_BASE || "";

if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN is missing (Render env)");
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// uploads папка: backend/uploads
const uploadsDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Простий “стан діалогу” в памʼяті (для кількох адмінів)
const state = new Map(); // adminId -> { step, data }

function isAdmin(userId) {
  return ADMIN_IDS.includes(String(userId));
}

async function tg(method, body) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = { ok: false, description: "BAD_JSON_FROM_TELEGRAM" };
  }

  if (!data?.ok) {
    console.error("❌ TG API ERROR:", method, data);
  }

  return data;
}

async function sendMessage(chatId, text, extra = {}) {
  return tg("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...extra,
  });
}

async function answerCallbackQuery(id, text) {
  return tg("answerCallbackQuery", {
    callback_query_id: id,
    text,
    show_alert: false,
  });
}

function kb(items) {
  // items: [[{text, callback_data}]]
  return { reply_markup: { inline_keyboard: items } };
}

async function getFilePath(fileId) {
  const r = await tg("getFile", { file_id: fileId });
  if (!r?.ok) throw new Error("GETFILE_FAILED");
  return r.result.file_path;
}

async function downloadTelegramFile(filePath) {
  const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("DOWNLOAD_FAILED");
  const buf = Buffer.from(await res.arrayBuffer());
  return buf;
}

function newName(ext = ".jpg") {
  return crypto.randomBytes(16).toString("hex") + ext;
}

function ensureNumber(v, def) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function reset(adminId) {
  state.delete(String(adminId));
}

function getSt(adminId) {
  return state.get(String(adminId)) || null;
}

function setSt(adminId, st) {
  state.set(String(adminId), st);
}

/* =========================
   ✅ MENU COMMANDS (Telegram /)
========================= */
async function setMyCommands() {
  return tg("setMyCommands", {
    scope: { type: "default" },
    commands: [
      { command: "start", description: "Адмін меню" },
      { command: "newlot", description: "Створити лот" },
      { command: "lots", description: "Список лотів + кнопки видалення" },
      { command: "dellot", description: "Видалити лот по ID" },
      { command: "cancel", description: "Скасувати діалог" },
      { command: "myid", description: "Показати мій Telegram ID" },
    ],
  });
}

/* =========================
   ✅ INLINE ADMIN MENU
========================= */
function adminMenuKeyboard() {
  return kb([
    [{ text: "🆕 Створити лот", callback_data: "MENU_NEWLOT" }],
    [{ text: "📃 Список лотів", callback_data: "MENU_LOTS" }],
    [{ text: "❌ Скасувати", callback_data: "CANCEL" }],
  ]);
}

export async function telegramWebhook(req, res) {
  try {
    const upd = req.body || {};

    // 1) callback кнопки
    if (upd?.callback_query) {
      const cq = upd.callback_query;
      const fromId = cq.from?.id;
      const chatId = cq.message?.chat?.id;
      const data = cq.data || "";

      if (!isAdmin(fromId)) {
        await answerCallbackQuery(cq.id, "Доступ заборонено");
        return res.json({ ok: true });
      }

      // меню кнопки
      if (data === "MENU_NEWLOT") {
        await answerCallbackQuery(cq.id, "Створення лоту");
        setSt(fromId, { step: "TITLE", data: {} });
        await sendMessage(
          chatId,
          "🆕 Створення лоту.\n\n1/5 Введи <b>назву</b> лоту:",
          kb([[{ text: "Скасувати", callback_data: "CANCEL" }]])
        );
        return res.json({ ok: true });
      }

      if (data === "MENU_LOTS") {
        await answerCallbackQuery(cq.id, "Завантажую лоти...");
        const lots = await listLots();

        if (!lots?.length) {
          await sendMessage(chatId, "Поки що лотів немає.", adminMenuKeyboard());
          return res.json({ ok: true });
        }

        const last = lots.slice(-10).reverse();
        for (const l of last) {
          await sendMessage(
            chatId,
            `<b>${l.title}</b>\n` +
              `ID: <code>${l.id}</code>\n` +
              `Статус: <b>${l.status}</b>\n` +
              `Ціна: ₴${l.currentPrice} (крок ₴${l.bidStep})`,
            kb([[{ text: "🗑 Видалити", callback_data: `DELLOT:${l.id}` }]])
          );
        }
        await sendMessage(chatId, "Готово ✅", adminMenuKeyboard());
        return res.json({ ok: true });
      }

      // CANCEL
      if (data === "CANCEL") {
        reset(fromId);
        await answerCallbackQuery(cq.id, "Скасовано");
        await sendMessage(chatId, "✅ Скасовано.", adminMenuKeyboard());
        return res.json({ ok: true });
      }

      // удалить лот: запрос подтверждения
      if (data.startsWith("DELLOT:")) {
        const lotId = data.slice("DELLOT:".length);

        await answerCallbackQuery(cq.id, "Підтвердіть видалення");

        await sendMessage(
          chatId,
          `⚠️ Видалити лот?\n<code>${lotId}</code>\n\nЦе видалить лот і всі ставки назавжди.`,
          kb([
            [
              { text: "✅ Так, видалити", callback_data: `DELLOT_CONFIRM:${lotId}` },
              { text: "❌ Скасувати", callback_data: "CANCEL" },
            ],
          ])
        );
        return res.json({ ok: true });
      }

      // подтверждение удаления
      if (data.startsWith("DELLOT_CONFIRM:")) {
        const lotId = data.slice("DELLOT_CONFIRM:".length);

        await answerCallbackQuery(cq.id, "Видаляю...");

        try {
          await deleteLot(lotId);
          await sendMessage(
            chatId,
            `🗑 Лот видалено: <code>${lotId}</code>`,
            adminMenuKeyboard()
          );
        } catch (e) {
          await sendMessage(
            chatId,
            `❌ Не вдалось видалити.\n${String(e?.message || e)}`,
            adminMenuKeyboard()
          );
        }

        return res.json({ ok: true });
      }

      await answerCallbackQuery(cq.id, "OK");
      return res.json({ ok: true });
    }

    // 2) звичайні повідомлення
    const msg = upd?.message;
    if (!msg) return res.json({ ok: true });

    const chatId = msg.chat?.id;
    const fromId = msg.from?.id;

    // текст/команда
    const text = (msg.text || "").trim();

    // ✅ ВАЖНО: нормализация команд
    // /start@BotName -> /start
    // /start payload -> /start
    const cmd = text.split(/\s+/)[0].replace(/@[\w_]+$/, "").toLowerCase();

    // /myid
    if (cmd === "/myid") {
      await sendMessage(chatId, `Ваш ID: <code>${fromId}</code>`);
      return res.json({ ok: true });
    }

    // если не админ
    if (!isAdmin(fromId)) {
      await sendMessage(chatId, "⛔️ У вас немає доступу.");
      return res.json({ ok: true });
    }

    // /start
    if (cmd === "/start") {
      await setMyCommands();
      await sendMessage(
        chatId,
        "👋 Адмін меню (кнопки нижче) або команди:\n/newlot\n/lots\n/dellot <id>\n/cancel",
        adminMenuKeyboard()
      );
      return res.json({ ok: true });
    }

    // /cancel
    if (cmd === "/cancel") {
      reset(fromId);
      await sendMessage(chatId, "✅ Скасовано.", adminMenuKeyboard());
      return res.json({ ok: true });
    }

    // /lots
    if (cmd === "/lots") {
      const lots = await listLots();

      if (!lots?.length) {
        await sendMessage(chatId, "Поки що лотів немає.", adminMenuKeyboard());
        return res.json({ ok: true });
      }

      const last = lots.slice(-10).reverse();
      for (const l of last) {
        await sendMessage(
          chatId,
          `<b>${l.title}</b>\n` +
            `ID: <code>${l.id}</code>\n` +
            `Статус: <b>${l.status}</b>\n` +
            `Ціна: ₴${l.currentPrice} (крок ₴${l.bidStep})`,
          kb([[{ text: "🗑 Видалити", callback_data: `DELLOT:${l.id}` }]])
        );
      }

      await sendMessage(chatId, "Готово ✅", adminMenuKeyboard());
      return res.json({ ok: true });
    }

    // /dellot <id>
    if (cmd === "/dellot") {
      const parts = text.split(" ").filter(Boolean);
      const lotId = parts[1];

      if (!lotId) {
        await sendMessage(
          chatId,
          "Використання: <code>/dellot LOT_ID</code>\nАбо <code>/lots</code> щоб вибрати кнопкою.",
          adminMenuKeyboard()
        );
        return res.json({ ok: true });
      }

      await sendMessage(
        chatId,
        `⚠️ Підтвердь видалення лоту:\n<code>${lotId}</code>`,
        kb([
          [
            { text: "✅ Так, видалити", callback_data: `DELLOT_CONFIRM:${lotId}` },
            { text: "❌ Скасувати", callback_data: "CANCEL" },
          ],
        ])
      );
      return res.json({ ok: true });
    }

    // /newlot
    if (cmd === "/newlot") {
      setSt(fromId, { step: "TITLE", data: {} });
      await sendMessage(
        chatId,
        "🆕 Створення лоту.\n\n1/5 Введи <b>назву</b> лоту:",
        kb([[{ text: "Скасувати", callback_data: "CANCEL" }]])
      );
      return res.json({ ok: true });
    }

    // Диалог по шагам
    const st = getSt(fromId);
    if (!st) return res.json({ ok: true });

    // STEP: TITLE
    if (st.step === "TITLE") {
      st.data.title = text || "New lot";
      st.step = "PHOTO";
      setSt(fromId, st);

      await sendMessage(
        chatId,
        "2/5 Надішли <b>фото</b> лоту (як картинку):",
        kb([[{ text: "Скасувати", callback_data: "CANCEL" }]])
      );
      return res.json({ ok: true });
    }

    // STEP: PHOTO
    if (st.step === "PHOTO") {
      const photos = msg.photo;

      if (!photos || photos.length === 0) {
        await sendMessage(chatId, "⚠️ Надішли саме фото (як зображення), не файл/текст.");
        return res.json({ ok: true });
      }

      const best = photos[photos.length - 1];
      const filePath = await getFilePath(best.file_id);
      const buf = await downloadTelegramFile(filePath);

      const ext = path.extname(filePath) || ".jpg";
      const fname = newName(ext);
      fs.writeFileSync(path.join(uploadsDir, fname), buf);

      if (!PUBLIC_BASE) {
        reset(fromId);
        await sendMessage(
          chatId,
          "⚠️ PUBLIC_BASE не заданий. Додай PUBLIC_BASE у Render, наприклад:\n<code>https://hw-auction-backend.onrender.com</code>",
          adminMenuKeyboard()
        );
        return res.json({ ok: true });
      }

      st.data.imageUrl = `${PUBLIC_BASE}/uploads/${fname}`;

      st.step = "START_PRICE";
      setSt(fromId, st);

      await sendMessage(
        chatId,
        "3/5 Введи <b>стартову ціну</b> (грн), напр: <code>80</code>"
      );
      return res.json({ ok: true });
    }

    // STEP: START_PRICE
    if (st.step === "START_PRICE") {
      st.data.startPrice = ensureNumber(text, 0);
      st.step = "BID_STEP";
      setSt(fromId, st);

      await sendMessage(chatId, "4/5 Введи <b>крок ставки</b> (грн), напр: <code>10</code>");
      return res.json({ ok: true });
    }

    // STEP: BID_STEP
    if (st.step === "BID_STEP") {
      st.data.bidStep = ensureNumber(text, 10);
      st.step = "DURATION";
      setSt(fromId, st);

      await sendMessage(chatId, "5/5 Введи <b>тривалість</b> (хв), напр: <code>60</code>");
      return res.json({ ok: true });
    }

    // STEP: DURATION -> create lot
    if (st.step === "DURATION") {
      const durationMin = Math.max(1, ensureNumber(text, 60));
      const endsAt = new Date(Date.now() + durationMin * 60 * 1000);

      const lot = await createLot({
        title: st.data.title,
        imageUrl: st.data.imageUrl,
        startPrice: st.data.startPrice,
        bidStep: st.data.bidStep,
        endsAt,
      });

      reset(fromId);

      const lotUrl = WEBAPP_URL ? `${WEBAPP_URL}/lot/${lot.id}` : "";
      await sendMessage(
        chatId,
        `✅ Лот створено!\n\n<b>${lot.title}</b>\nСтарт: ₴${lot.currentPrice}\nКрок: ₴${lot.bidStep}\n`,
        lotUrl
          ? { reply_markup: { inline_keyboard: [[{ text: "Відкрити лот", url: lotUrl }]] } }
          : adminMenuKeyboard()
      );

      if (!lotUrl) {
        await sendMessage(chatId, "Меню:", adminMenuKeyboard());
      }

      return res.json({ ok: true });
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error("telegramWebhook error:", e);
    return res.json({ ok: true });
  }
}
