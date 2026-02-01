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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// uploads папка: backend/uploads (або ../uploads від src)
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
  return res.json();
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

export async function telegramWebhook(req, res) {
  try {
    const upd = req.body || {};

    // ✅ ЛОГ ДЛЯ ДЕБАГА (самое важное)
  

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

      if (data === "CANCEL") {
        reset(fromId);
        await answerCallbackQuery(cq.id, "Скасовано");
        await sendMessage(chatId, "✅ Скасовано. Напиши /newlot щоб почати знову.");
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
    const text = (msg.text || "").trim();

    // Команда щоб дізнатись ID (корисно для ADMIN_IDS)
    if (text === "/myid") {
      await sendMessage(chatId, `Ваш ID: <code>${fromId}</code>`);
      return res.json({ ok: true });
    }

    // якщо не адмін — не пускаємо
    if (!isAdmin(fromId)) {
      await sendMessage(chatId, "⛔️ У вас немає доступу.");
      return res.json({ ok: true });
    }

    // /start
    if (text === "/start") {
      await sendMessage(chatId, "👋 Адмін меню:\n/newlot — створити лот\n/cancel — скасувати");
      return res.json({ ok: true });
    }

    // /cancel
    if (text === "/cancel") {
      reset(fromId);
      await sendMessage(chatId, "✅ Скасовано.");
      return res.json({ ok: true });
    }

    // /newlot
    if (text === "/newlot") {
      setSt(fromId, { step: "TITLE", data: {} });
      await sendMessage(
        chatId,
        "🆕 Створення лоту.\n\n1/5 Введи <b>назву</b> лоту:",
        kb([[{ text: "Скасувати", callback_data: "CANCEL" }]])
      );
      return res.json({ ok: true });
    }

    // Далі — діалог по кроках
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

    // STEP: PHOTO (беремо з message.photo)
    if (st.step === "PHOTO") {
      const photos = msg.photo;
      if (!photos || photos.length === 0) {
        await sendMessage(chatId, "⚠️ Надішли саме фото (як зображення), не файл/текст.");
        return res.json({ ok: true });
      }

      // найбільше фото — останнє
      const best = photos[photos.length - 1];
      const filePath = await getFilePath(best.file_id);
      const buf = await downloadTelegramFile(filePath);

      const ext = path.extname(filePath) || ".jpg";
      const fname = newName(ext);
      fs.writeFileSync(path.join(uploadsDir, fname), buf);

      // шлях який відкриється з фронта: бекенд роздає /uploads
      if (!PUBLIC_BASE) {
        await sendMessage(
          chatId,
          "⚠️ PUBLIC_BASE не заданий. Додай PUBLIC_BASE у Render, наприклад:\n<code>https://hw-auction-backend.onrender.com</code>"
        );
        return res.json({ ok: true });
      }

      st.data.imageUrl = `${PUBLIC_BASE}/uploads/${fname}`;

      st.step = "START_PRICE";
      setSt(fromId, st);

      await sendMessage(chatId, "3/5 Введи <b>стартову ціну</b> (грн), напр: <code>80</code>");
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
          : {}
      );

      return res.json({ ok: true });
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error("telegramWebhook error:", e);
    return res.json({ ok: true });
  }
}
