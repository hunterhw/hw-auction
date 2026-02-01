import "dotenv/config";
import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";

import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

import { telegramWebhook } from "./telegram_bot.js";
import { listLots, getLot, placeBid } from "./auction.js";
import { verifyTelegramInitData, parseUserFromInitData } from "./telegram.js";

const app = express();

// --- CORS ---
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-telegram-initdata", "x-telegram-bot-api-secret-token"],
  })
);
app.options("*", cors());

// --- body parsers (Telegram шлёт JSON) ---
app.use(express.json({ limit: "5mb" }));

// --- paths ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ uploads folder (Persistent)
const uploadsDir = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, "../uploads");

if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use("/uploads", express.static(uploadsDir));

// --- ENV ---
const PORT = process.env.PORT || 8080;
const BOT_TOKEN = process.env.BOT_TOKEN; // required
const WEBAPP_URL = process.env.WEBAPP_URL || ""; // ✅ добавь
const CHANNEL_ID = process.env.CHANNEL_ID; // "@hw_hunter_ua" or -100...
const CHANNEL_URL =
  process.env.CHANNEL_URL ||
  (typeof CHANNEL_ID === "string" && CHANNEL_ID.startsWith("@")
    ? `https://t.me/${CHANNEL_ID.slice(1)}`
    : null);


if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN is missing. Set it in Render env");
  process.exit(1);
}
function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function tgSendMessage(userId, text, extra = {}) {
  if (!BOT_TOKEN) return { ok: false, error: "NO_BOT_TOKEN" };

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: userId, // в приватке userId == chatId
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        ...extra,
      }),
    });
    const data = await res.json();
    return data;
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

// --- helpers ---
async function checkSubscription(userId) {
  if (!CHANNEL_ID) return { ok: true };

  const url =
    `https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?` +
    `chat_id=${encodeURIComponent(CHANNEL_ID)}&user_id=${encodeURIComponent(userId)}`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (!data?.ok) return { ok: false, reason: "TG_API_ERROR", tg: data };

    const status = data?.result?.status;
    const ok = ["creator", "administrator", "member"].includes(status);
    return { ok, status };
  } catch (e) {
    return { ok: false, reason: "FETCH_ERROR", error: String(e?.message || e) };
  }
}

function authFromInitData(req) {
  const initData = req.headers["x-telegram-initdata"];
  if (!initData || typeof initData !== "string" || initData.length === 0) return null;

  if (!verifyTelegramInitData(initData, BOT_TOKEN)) throw new Error("BAD_INITDATA");
  const user = parseUserFromInitData(initData);
  if (!user?.id) throw new Error("NO_USER");
  return user;
}

function normalizeLotPayload(rawLot) {
  if (!rawLot) return { lot: null, bids: [] };
  const bids = Array.isArray(rawLot.bids) ? rawLot.bids : [];
  const { bids: _b, ...cleanLot } = rawLot;
  return { lot: cleanLot, bids };
}

// --- health ---
app.get("/health", (_, res) => res.json({ ok: true }));

// webhook
app.post("/telegram/webhook", async (req, res) => {
  try {
    console.log("TG UPDATE:", JSON.stringify(req.body));
    await telegramWebhook(req, res);
  } catch (e) {
    console.error("telegram webhook error:", e);
    return res.status(200).json({ ok: true });
  }
});

// --- API routes ---
app.get("/lots", async (req, res) => {
  try {
    const user = authFromInitData(req);
    const lots = await listLots();

    if (!user) return res.json({ lots, viewOnly: true });

    const sub = await checkSubscription(user.id);
    if (!sub.ok) {
      return res.status(403).json({
        lots,
        viewOnly: true,
        error: "NOT_SUBSCRIBED",
        subscribeUrl: CHANNEL_URL,
        channelId: CHANNEL_ID,
      });
    }

    return res.json({ lots, viewOnly: false });
  } catch (e) {
    return res.status(401).json({ error: String(e?.message || e) });
  }
});

app.get("/lots/:id", async (req, res) => {
  try {
    const user = authFromInitData(req);

    const rawLot = await getLot(req.params.id);
    const { lot, bids } = normalizeLotPayload(rawLot);

    if (!lot) return res.json({ lot: null, bids: [], viewOnly: true, reason: "NOT_FOUND" });

    if (!user) return res.json({ lot, bids, viewOnly: true });

    const sub = await checkSubscription(user.id);
    if (!sub.ok) {
      return res.status(403).json({
        lot,
        bids,
        viewOnly: true,
        error: "NOT_SUBSCRIBED",
        subscribeUrl: CHANNEL_URL,
        channelId: CHANNEL_ID,
      });
    }

    return res.json({ lot, bids, viewOnly: false });
  } catch (e) {
    return res.status(400).json({ error: String(e?.message || e) });
  }
});

app.post("/lots/:id/bid", async (req, res) => {
  try {
    const user = authFromInitData(req);
    if (!user) return res.status(401).json({ error: "BID_REQUIRES_TELEGRAM" });

    const sub = await checkSubscription(user.id);
    if (!sub.ok) {
      return res.status(403).json({
        error: "NOT_SUBSCRIBED",
        subscribeUrl: CHANNEL_URL,
        channelId: CHANNEL_ID,
      });
    }

    const { amount } = req.body || {};
    const numAmount = Number(amount);

    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: "BAD_AMOUNT" });
    }

    const result = await placeBid({
      lotId: req.params.id,
      userId: user.id,
      userName: user.username ? `@${user.username}` : `${user.first_name || "Користувач"}`,
      amount: numAmount,
    });
// ✅ уведомление "перебили ставку"
try {
  const prevId = result?.outbid?.userId ? String(result.outbid.userId) : null;

  // если был лидер и это не тот же человек, что поставил сейчас
  if (prevId && prevId !== String(user.id)) {
    const lotTitle = escHtml(result?.lot?.title || "Лот");
    const newPrice = escHtml(result?.lot?.currentPrice);
    const lotUrl = WEBAPP_URL ? `${WEBAPP_URL}/lot/${req.params.id}` : "";

    const msg =
  `⚡️ Твою ставку перебили!\n` +
  `<b>${lotTitle}</b>\n` +
  `Нова ціна: <b>₴${newPrice}</b>\n` +
  `\nНатисни кнопку нижче 👇`;


    // можно кнопкой
    const extra =
  lotUrl
    ? {
        reply_markup: {
          inline_keyboard: [[{ text: "Відкрити лот", web_app: { url: lotUrl } }]],
        },
      }
    : {};


    const sent = await tgSendMessage(prevId, msg, extra);

    // если юзер не стартовал бота — Telegram вернет ошибку, просто игнорим
    if (!sent?.ok) {
      console.log("OUTBID_NOTIFY_FAIL:", sent);
    }
  }
} catch (e) {
  console.log("OUTBID_NOTIFY_ERROR:", e);
}

    broadcastToLot(req.params.id, {
      type: "BID_PLACED",
      lotId: req.params.id,
      bid: result.bid,
      lot: result.lot,
    });

    return res.json({ ok: true, ...result });
  } catch (e) {
    return res.status(400).json({ error: String(e?.message || e) });
  }
});

// --- WS ---
const server = app.listen(PORT, () => console.log("✅ Backend on", PORT));
const wss = new WebSocketServer({ server });

const lotRooms = new Map();

function broadcastToLot(lotId, payload) {
  const room = lotRooms.get(lotId);
  if (!room) return;
  const msg = JSON.stringify(payload);
  for (const ws of room) {
    if (ws.readyState === ws.OPEN) {
      try {
        ws.send(msg);
      } catch {}
    }
  }
}

function removeWsFromAllRooms(ws) {
  for (const [lotId, room] of lotRooms.entries()) {
    room.delete(ws);
    if (room.size === 0) lotRooms.delete(lotId);
  }
}

wss.on("connection", (ws) => {
  ws.on("message", async (raw) => {
    try {
      const data = JSON.parse(raw.toString());
      if (data?.type === "JOIN_LOT") {
        const lotId = String(data.lotId || "");
        if (!lotId) return;

        if (!lotRooms.has(lotId)) lotRooms.set(lotId, new Set());
        lotRooms.get(lotId).add(ws);

        const rawLot = await getLot(lotId);
        const { lot, bids } = normalizeLotPayload(rawLot);

        ws.send(JSON.stringify({ type: "SNAPSHOT", lot, bids }));
      }
    } catch {}
  });

  ws.on("close", () => removeWsFromAllRooms(ws));
  ws.on("error", () => removeWsFromAllRooms(ws));
});
