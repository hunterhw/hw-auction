import "dotenv/config";
import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";

import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

import { telegramWebhook } from "./telegram_bot.js";
import {
  listLots,
  getLot,
  placeBid,
  listUserBids,
  addComment,
  listComments,
  setAutoBid,
  disableAutoBid,
} from "./auction.js";
import { verifyTelegramInitData, parseUserFromInitData } from "./telegram.js";

const app = express();

/* =========================
   CORS ✅ (добавили DELETE/PUT)
========================= */
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "DELETE", "PUT", "OPTIONS"],
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
const WEBAPP_URL = process.env.WEBAPP_URL || ""; // mini-app base url (например https://xxx.vercel.app)
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

/* =========================
   HTML ESCAPE
========================= */
function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/* =========================
   SEND TG MESSAGE (private)
========================= */
async function tgSendMessage(userId, text, extra = {}) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: userId, // в приватке userId == chatId
        text: String(text),
        parse_mode: "HTML",
        disable_web_page_preview: true,
        ...extra,
      }),
    });

    const data = await res.json().catch(() => null);
    return data || { ok: false, error: "BAD_JSON_FROM_TG" };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/* =========================
   TG NOTIFY THROTTLE ✅
   - чтобы не спамить людей
========================= */
const tgThrottle = new Map();

function canTg(key, ms) {
  const now = Date.now();
  const last = tgThrottle.get(key) || 0;
  if (now - last < ms) return false;
  tgThrottle.set(key, now);
  return true;
}

function lotWebAppUrl(lotId) {
  return WEBAPP_URL ? `${WEBAPP_URL}/lot/${String(lotId)}` : "";
}

/* =========================
   HELPERS
========================= */
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

// ✅ отдаём всё, что есть в getLot: bids/comments/autoBids
function normalizeLotPayload(rawLot) {
  if (!rawLot) return { lot: null, bids: [], comments: [], autoBids: [] };

  const bids = Array.isArray(rawLot.bids) ? rawLot.bids : [];
  const comments = Array.isArray(rawLot.comments) ? rawLot.comments : [];
  const autoBids = Array.isArray(rawLot.autoBids) ? rawLot.autoBids : [];

  const { bids: _b, comments: _c, autoBids: _a, ...cleanLot } = rawLot;
  return { lot: cleanLot, bids, comments, autoBids };
}

/* =========================
   HEALTH
========================= */
app.get("/health", (_, res) => res.json({ ok: true }));

/* =========================
   TELEGRAM WEBHOOK
========================= */
app.post("/telegram/webhook", async (req, res) => {
  try {
    console.log("TG UPDATE:", JSON.stringify(req.body));
    await telegramWebhook(req, res);
  } catch (e) {
    console.error("telegram webhook error:", e);
    return res.status(200).json({ ok: true });
  }
});

/* =========================
   API ROUTES
========================= */

// 0) lots list
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

// lot by id
app.get("/lots/:id", async (req, res) => {
  try {
    const user = authFromInitData(req);

    const rawLot = await getLot(req.params.id);
    const { lot, bids, comments, autoBids } = normalizeLotPayload(rawLot);

    if (!lot) return res.json({ lot: null, bids: [], comments: [], autoBids: [], viewOnly: true });

    if (!user) return res.json({ lot, bids, comments, autoBids, viewOnly: true });

    const sub = await checkSubscription(user.id);
    if (!sub.ok) {
      return res.status(403).json({
        lot,
        bids,
        comments,
        autoBids,
        viewOnly: true,
        error: "NOT_SUBSCRIBED",
        subscribeUrl: CHANNEL_URL,
        channelId: CHANNEL_ID,
      });
    }

    return res.json({ lot, bids, comments, autoBids, viewOnly: false });
  } catch (e) {
    return res.status(400).json({ error: String(e?.message || e) });
  }
});

// place bid + outbid notify
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

    // ─────────────────────────────────────────
    // ✅ dopamine notifications (TG)
    // - outbid: предыдущему лидеру
    // - leader: текущему (кто поставил)
    // - финальные секунды: отдельный акцент
    // ─────────────────────────────────────────

    // ✅ уведомление "перебили ставку" (предыдущему лидеру)
    try {
      const prevId = result?.outbid?.userId ? String(result.outbid.userId) : null;
      const lotTitle = escHtml(result?.lot?.title || "Лот");
      const newPrice = escHtml(result?.lot?.currentPrice);
      const lotUrl = lotWebAppUrl(req.params.id);
      const endsAtMs = result?.lot?.endsAt ? new Date(result.lot.endsAt).getTime() : 0;
      const leftSec = endsAtMs ? Math.max(0, Math.ceil((endsAtMs - Date.now()) / 1000)) : null;

      if (prevId && prevId !== String(user.id)) {
        const throttleKey = `outbid:${prevId}:${req.params.id}`;
        if (canTg(throttleKey, 5000)) {
          const urgency = leftSec != null && leftSec <= 15 ? "🚨" : "⚡️";
          const leftLine = leftSec != null ? `\n⏳ До кінця: <b>${leftSec}с</b>` : "";

          const msg =
            `${urgency} Твою ставку перебили!\n` +
            `<b>${lotTitle}</b>\n` +
            `Нова ціна: <b>₴${newPrice}</b>${leftLine}\n\n` +
            `🔥 Забирай лідерство назад — натисни кнопку нижче 👇`;

          const extra = lotUrl
            ? {
                reply_markup: {
                  inline_keyboard: [[{ text: `${urgency} Відкрити лот`, web_app: { url: lotUrl } }]],
                },
              }
            : {};

          const sent = await tgSendMessage(prevId, msg, extra);
          if (!sent?.ok) console.log("OUTBID_NOTIFY_FAIL:", sent);

          // ✅ лёгкий "пинок" через 8 сек, если лот еще LIVE и лидер не вернулся
          setTimeout(async () => {
            try {
              const fresh = await getLot(req.params.id);
              if (!fresh || fresh.status !== "LIVE") return;
              const freshLeader = fresh.leaderUserId ? String(fresh.leaderUserId) : null;
              if (freshLeader === prevId) return;

              const key2 = `outbid_nudge:${prevId}:${req.params.id}`;
              if (!canTg(key2, 12000)) return;

              const endsMs2 = fresh?.endsAt ? new Date(fresh.endsAt).getTime() : 0;
              const left2 = endsMs2 ? Math.max(0, Math.ceil((endsMs2 - Date.now()) / 1000)) : null;
              const urgency2 = left2 != null && left2 <= 10 ? "🚨" : "👀";

              const msg2 =
                `${urgency2} Лот ще активний!\n` +
                `<b>${escHtml(fresh.title || lotTitle)}</b>\n` +
                `Зараз: <b>₴${escHtml(fresh.currentPrice)}</b>` +
                (left2 != null ? `\n⏳ Залишилось: <b>${left2}с</b>` : "") +
                `\n\nСпробуєш ще раз?`;

              const extra2 = lotUrl
                ? {
                    reply_markup: {
                      inline_keyboard: [[{ text: `${urgency2} Відкрити лот`, web_app: { url: lotUrl } }]],
                    },
                  }
                : {};

              await tgSendMessage(prevId, msg2, extra2);
            } catch {}
          }, 8000);
        }
      }
    } catch (e) {
      console.log("OUTBID_NOTIFY_ERROR:", e);
    }

    // ✅ уведомление лидеру (кто только что поставил)
    try {
      const uid = String(user.id);
      const lot = result?.lot;
      if (lot && String(lot.leaderUserId || "") === uid) {
        const key = `leader:${uid}:${req.params.id}`;
        if (canTg(key, 15000)) {
          const lotTitle = escHtml(lot.title || "Лот");
          const price = escHtml(lot.currentPrice);
          const endsAtMs = lot?.endsAt ? new Date(lot.endsAt).getTime() : 0;
          const leftSec = endsAtMs ? Math.max(0, Math.ceil((endsAtMs - Date.now()) / 1000)) : null;

          const isFinal = leftSec != null && leftSec <= 10;
          const badge = isFinal ? "🚨 ФІНАЛ" : "✅ ТИ ЛІДЕР";
          const leftLine = leftSec != null ? `\n⏳ До кінця: <b>${leftSec}с</b>` : "";
          const lotUrl = lotWebAppUrl(req.params.id);

          const msg =
            `${badge}\n` +
            `<b>${lotTitle}</b>\n` +
            `Твоя ставка: <b>₴${price}</b>${leftLine}\n\n` +
            (isFinal ? "Тримайся! Останні секунди 🔥" : "Тримай лідерство 💪");

          const extra = lotUrl
            ? {
                reply_markup: {
                  inline_keyboard: [[{ text: "Відкрити лот", web_app: { url: lotUrl } }]],
                },
              }
            : {};

          const sent = await tgSendMessage(uid, msg, extra);
          if (!sent?.ok) console.log("LEADER_NOTIFY_FAIL:", sent);
        }
      }
    } catch (e) {
      console.log("LEADER_NOTIFY_ERROR:", e);
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

// ✅ MY BIDS
app.get("/me/bids", async (req, res) => {
  try {
    const user = authFromInitData(req);
    if (!user) return res.status(401).json({ error: "AUTH_REQUIRED" });

    const sub = await checkSubscription(user.id);
    if (!sub.ok) {
      return res.status(403).json({
        error: "NOT_SUBSCRIBED",
        subscribeUrl: CHANNEL_URL,
        channelId: CHANNEL_ID,
      });
    }

    const bids = await listUserBids(user.id);
    return res.json({ bids });
  } catch (e) {
    return res.status(400).json({ error: String(e?.message || e) });
  }
});

// ✅ ADD COMMENT
app.post("/lots/:id/comment", async (req, res) => {
  try {
    const user = authFromInitData(req);
    if (!user) return res.status(401).json({ error: "AUTH_REQUIRED" });

    const sub = await checkSubscription(user.id);
    if (!sub.ok) {
      return res.status(403).json({
        error: "NOT_SUBSCRIBED",
        subscribeUrl: CHANNEL_URL,
        channelId: CHANNEL_ID,
      });
    }

    const text = String(req.body?.text || "").trim();
    if (!text) return res.status(400).json({ error: "EMPTY_COMMENT" });

    const c = await addComment({
      lotId: req.params.id,
      userId: user.id,
      userName: user.username ? `@${user.username}` : `${user.first_name || "Користувач"}`,
      text,
    });

    broadcastToLot(req.params.id, { type: "COMMENT_ADDED", lotId: req.params.id, comment: c });
    return res.json({ ok: true, comment: c });
  } catch (e) {
    return res.status(400).json({ error: String(e?.message || e) });
  }
});

// ✅ LIST COMMENTS
app.get("/lots/:id/comments", async (req, res) => {
  try {
    const user = authFromInitData(req);
    if (!user) return res.status(401).json({ error: "AUTH_REQUIRED" });

    const sub = await checkSubscription(user.id);
    if (!sub.ok) {
      return res.status(403).json({
        error: "NOT_SUBSCRIBED",
        subscribeUrl: CHANNEL_URL,
        channelId: CHANNEL_ID,
      });
    }

    const take = Number(req.query?.take || 50);
    const comments = await listComments(req.params.id, take);
    return res.json({ comments });
  } catch (e) {
    return res.status(400).json({ error: String(e?.message || e) });
  }
});

// ✅ AUTO BID ON
app.post("/lots/:id/autobid", async (req, res) => {
  try {
    const user = authFromInitData(req);
    if (!user) return res.status(401).json({ error: "AUTH_REQUIRED" });

    const sub = await checkSubscription(user.id);
    if (!sub.ok) {
      return res.status(403).json({
        error: "NOT_SUBSCRIBED",
        subscribeUrl: CHANNEL_URL,
        channelId: CHANNEL_ID,
      });
    }

    const maxAmount = Number(req.body?.maxAmount);
    if (!Number.isFinite(maxAmount) || maxAmount <= 0) {
      return res.status(400).json({ error: "BAD_MAX_AMOUNT" });
    }

    const ab = await setAutoBid({
      lotId: req.params.id,
      userId: user.id,
      userName: user.username ? `@${user.username}` : `${user.first_name || "Користувач"}`,
      maxAmount,
      isActive: true,
    });

    broadcastToLot(req.params.id, { type: "AUTOBID_SET", lotId: req.params.id, autoBid: ab });
    return res.json({ ok: true, autoBid: ab });
  } catch (e) {
    return res.status(400).json({ error: String(e?.message || e) });
  }
});

// ✅ AUTO BID OFF
app.delete("/lots/:id/autobid", async (req, res) => {
  try {
    const user = authFromInitData(req);
    if (!user) return res.status(401).json({ error: "AUTH_REQUIRED" });

    const sub = await checkSubscription(user.id);
    if (!sub.ok) {
      return res.status(403).json({
        error: "NOT_SUBSCRIBED",
        subscribeUrl: CHANNEL_URL,
        channelId: CHANNEL_ID,
      });
    }

    const ab = await disableAutoBid({ lotId: req.params.id, userId: user.id });
    broadcastToLot(req.params.id, { type: "AUTOBID_DISABLED", lotId: req.params.id, autoBid: ab });

    return res.json({ ok: true });
  } catch (e) {
    return res.status(400).json({ error: String(e?.message || e) });
  }
});

/* =========================
   WS
========================= */
const server = app.listen(PORT, () => console.log("✅ Backend on", PORT));
const wss = new WebSocketServer({ server });

const lotRooms = new Map(); // lotId -> Set(ws)

function broadcastToLot(lotId, payload) {
  const room = lotRooms.get(String(lotId));
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
        const { lot, bids, comments, autoBids } = normalizeLotPayload(rawLot);

        ws.send(JSON.stringify({ type: "SNAPSHOT", lot, bids, comments, autoBids }));
      }
    } catch {}
  });

  ws.on("close", () => removeWsFromAllRooms(ws));
  ws.on("error", () => removeWsFromAllRooms(ws));
});
