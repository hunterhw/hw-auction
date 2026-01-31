import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createLot } from "./auction.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadsDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// просте “сховище” майстра в RAM (норм для старту)
const sessions = new Map(); // chatId -> { step, data }

function isAdmin(userId, adminIds) {
  return adminIds.includes(String(userId));
}

async function tg(method, botToken, payload) {
  const url = `https://api.telegram.org/bot${botToken}/${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`TG_${method}_FAILED: ${JSON.stringify(data)}`);
  return data.result;
}

async function tgGetFilePath(botToken, fileId) {
  const r = await tg("getFile", botToken, { file_id: fileId });
  return r.file_path;
}

async function downloadTelegramFile(botToken, filePath, outAbsPath) {
  const url = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("FILE_DOWNLOAD_FAILED");
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outAbsPath, buf);
}

function reply(botToken, chatId, text) {
  return tg("sendMessage", botToken, {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
}

export async function handleTelegramUpdate(update, { botToken, adminIds }) {
  const msg = update.message || update.edited_message;
  if (!msg) return;

  const chatId = msg.chat?.id;
  const from = msg.from;
  const userId = from?.id;

  // /whoami — щоб дізнатись свій ID
  if (msg.text && msg.text.trim() === "/whoami") {
    return reply(
      botToken,
      chatId,
      `Ваш ID: <code>${userId}</code>\nДодайте його в ENV <b>ADMIN_IDS</b> на Render.`
    );
  }

  // тільки адміни
  if (!isAdmin(userId, adminIds)) {
    // можна мовчати, але краще повідомити один раз
    if (msg.text?.startsWith("/")) {
      return reply(botToken, chatId, "⛔️ Доступ заборонено.");
    }
    return;
  }

  // cancel
  if (msg.text && msg.text.trim() === "/cancel") {
    sessions.delete(String(chatId));
    return reply(botToken, chatId, "✅ Скасовано. Напишіть /newlot щоб почати заново.");
  }

  // старт майстра
  if (msg.text && msg.text.trim() === "/newlot") {
    sessions.set(String(chatId), {
      step: "TITLE",
      data: {},
    });
    return reply(botToken, chatId, "Введіть <b>назву лота</b>:");
  }

  const session = sessions.get(String(chatId));
  if (!session) return; // немає активного майстра — ігноруємо

  // кроки майстра
  if (session.step === "TITLE") {
    const title = (msg.text || "").trim();
    if (!title) return reply(botToken, chatId, "Введіть назву текстом:");
    session.data.title = title;
    session.step = "START_PRICE";
    sessions.set(String(chatId), session);
    return reply(botToken, chatId, "Стартова ціна (грн). Наприклад: <code>80</code>");
  }

  if (session.step === "START_PRICE") {
    const n = Number((msg.text || "").trim());
    if (!Number.isFinite(n) || n <= 0) {
      return reply(botToken, chatId, "❌ Введіть число > 0. Наприклад: <code>80</code>");
    }
    session.data.startPrice = n;
    session.step = "BID_STEP";
    sessions.set(String(chatId), session);
    return reply(botToken, chatId, "Крок ставки (грн). Наприклад: <code>10</code>");
  }

  if (session.step === "BID_STEP") {
    const n = Number((msg.text || "").trim());
    if (!Number.isFinite(n) || n <= 0) {
      return reply(botToken, chatId, "❌ Введіть число > 0. Наприклад: <code>10</code>");
    }
    session.data.bidStep = n;
    session.step = "DURATION";
    sessions.set(String(chatId), session);
    return reply(botToken, chatId, "Тривалість (хв). Наприклад: <code>60</code>");
  }

  if (session.step === "DURATION") {
    const n = Number((msg.text || "").trim());
    if (!Number.isFinite(n) || n <= 0) {
      return reply(botToken, chatId, "❌ Введіть число > 0. Наприклад: <code>60</code>");
    }
    session.data.durationMin = n;
    session.step = "PHOTO";
    sessions.set(String(chatId), session);
    return reply(
      botToken,
      chatId,
      "Тепер надішліть <b>фото</b> лота (як фото, не як файл).\nАбо напишіть <code>skip</code> якщо без фото."
    );
  }

  if (session.step === "PHOTO") {
    // allow skip
    if (msg.text && msg.text.trim().toLowerCase() === "skip") {
      session.data.imageUrl = "";
      session.step = "CONFIRM";
      sessions.set(String(chatId), session);
      return reply(
        botToken,
        chatId,
        `Підтвердити створення?\n\n<b>${session.data.title}</b>\nСтарт: ₴${session.data.startPrice}\nКрок: ₴${session.data.bidStep}\nТривалість: ${session.data.durationMin} хв\n\nВідповідь: <code>yes</code> або <code>no</code>`
      );
    }

    const photos = msg.photo;
    if (!Array.isArray(photos) || photos.length === 0) {
      return reply(botToken, chatId, "❌ Надішліть фото або напишіть <code>skip</code>.");
    }

    // беремо найбільше фото
    const best = photos[photos.length - 1];
    const fileId = best.file_id;

    const filePath = await tgGetFilePath(botToken, fileId);

    const ext = path.extname(filePath) || ".jpg";
    const name = `lot_${Date.now()}_${Math.random().toString(16).slice(2)}${ext}`;
    const abs = path.join(uploadsDir, name);

    await downloadTelegramFile(botToken, filePath, abs);

    session.data.imageUrl = `/uploads/${name}`;
    session.step = "CONFIRM";
    sessions.set(String(chatId), session);

    return reply(
      botToken,
      chatId,
      `Фото збережено ✅\nПідтвердити створення?\n\n<b>${session.data.title}</b>\nСтарт: ₴${session.data.startPrice}\nКрок: ₴${session.data.bidStep}\nТривалість: ${session.data.durationMin} хв\n\nВідповідь: <code>yes</code> або <code>no</code>`
    );
  }

  if (session.step === "CONFIRM") {
    const ans = (msg.text || "").trim().toLowerCase();
    if (ans === "no") {
      sessions.delete(String(chatId));
      return reply(botToken, chatId, "❌ Скасовано. Напишіть /newlot щоб почати заново.");
    }
    if (ans !== "yes") {
      return reply(botToken, chatId, "Відповідь: <code>yes</code> або <code>no</code>");
    }

    const now = Date.now();
    const endsAt = new Date(now + Number(session.data.durationMin || 60) * 60 * 1000);

    const lot = await createLot({
      title: session.data.title,
      imageUrl: session.data.imageUrl || "",
      startPrice: session.data.startPrice,
      bidStep: session.data.bidStep,
      endsAt,
    });

    sessions.delete(String(chatId));

    // Лінк на лот у webapp
    // якщо у тебе фронт на Vercel: https://hw-auction.vercel.app/lot/<id>
    const webappBase = process.env.WEBAPP_BASE_URL || "";
    const lotLink = webappBase ? `${webappBase}/lot/${lot.id}` : lot.id;

    return reply(
      botToken,
      chatId,
      `✅ Лот створено!\n<b>${lot.title}</b>\nID: <code>${lot.id}</code>\nПоточна: ₴${lot.currentPrice}\n\nПосилання: ${lotLink}`
    );
  }
}

