import { telegramWebhook } from "./telegram_bot.js";
import "dotenv/config";
import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";

import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

import adminRouter from "./admin.js";
import { listLots, getLot, placeBid, createLot } from "./auction.js";
import { verifyTelegramInitData, parseUserFromInitData } from "./telegram.js";

const app = express();

// --- CORS (чуть аккуратнее для Telegram/iOS) ---
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-telegram-initdata"],
  })
);
app.options("*", cors());

// json
app.use(express.json({ limit: "5mb" }));

// paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// створюємо папку uploads якщо її нема
const uploadsDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// роздача завантажених файлів
app.use("/uploads", express.static(uploadsDir));

// адмін роутер (если у тебя там уже есть /admin/upload и т.д.)
app.use("/admin", adminRouter);

const PORT = process.env.PORT || 8080;
const BOT_TOKEN = process.env.BOT_TOKEN; // required
const CHANNEL_ID = process.env.CHANNEL_ID; // "@hw_hunter_ua" or -100...
const CHANNEL_URL =
  process.env.CHANNEL_URL ||
  (typeof CHANNEL_ID === "string" && CHANNEL_ID.startsWith("@")
    ? `https://t.me/${CHANNEL_ID.slice(1)}`
    : null);

if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN is missing. Set it in env (Render)");
  process.exit(1);
}

async function checkSubscription(userId) {
  // если канал не задан — считаем, что подписка не нужна
  if (!CHANNEL_ID) return { ok: true };

  const url =
    `https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?` +
    `chat_id=${encodeURIComponent(CHANNEL_ID)}&user_id=${encodeURIComponent(userId)}`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    // если бот не админ/нет прав — Telegram вернет ok:false
    if (!data?.ok) {
      return { ok: false, reason: "TG_API_ERROR", tg: data };
    }

    const status = data?.result?.status;
    const ok = ["creator", "administrator", "member"].includes(status);
    return { ok, status };
  } catch (e) {
    return { ok: false, reason: "FETCH_ERROR", error: String(e?.message || e) };
  }
}

function authFromInitData(req) {
  const initData = req.headers["x-telegram-initdata"];

  // Desktop fallback: без initData можно только смотреть
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

// --- routes ---
app.get("/health", (_, res) => res.json({ ok: true }));

// список лотов
app.get("/lots", async (req, res) => {
  try {
    const user = authFromInitData(req);
    const lots = await listLots();

    // browser/desktop: просмотр
    if (!user) return res.json({ lots, viewOnly: true });

    // Telegram: подписка
    const sub = await checkSubscription(user.id);
    if (!sub.ok) {
      console.warn("NOT_SUBSCRIBED / SUB_CHECK_FAIL:", {
        userId: user.id,
        status: sub.status,
        reason: sub.reason,
        tg: sub.tg,
        error: sub.error,
      });

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

// один лот + ставки
app.get("/lots/:id", async (req, res) => {
  try {
    const user = authFromInitData(req);

    const rawLot = await getLot(req.params.id);
    const { lot, bids } = normalizeLotPayload(rawLot);

    if (!lot) return res.json({ lot: null, bids: [], viewOnly: true, reason: "NOT_FOUND" });

    // browser/desktop: просмотр
    if (!user) return res.json({ lot, bids, viewOnly: true });

    // Telegram: если нет подписки — можно смотреть, но писать, что нет подписки
    const sub = await checkSubscription(user.id);
    if (!sub.ok) {
      console.warn("NOT_SUBSCRIBED (VIEW_ONLY):", {
        userId: user.id,
        status: sub.status,
        reason: sub.reason,
      });

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

// ставка
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

// ===== ADMIN: создать лот =====
// ВАЖНО: добавь ADMIN_KEY в Render env
const ADMIN_KEY = process.env.ADMIN_KEY || "";

app.post("/admin/lots", async (req, res) => {
  try {
    const { adminKey, title, imageUrl, startPrice, bidStep, durationMin } = req.body || {};

    if (!ADMIN_KEY || String(adminKey || "") !== String(ADMIN_KEY)) {
      return res.status(401).json({ error: "ADMIN_DENIED" });
    }

    const sp = Number(startPrice);
    const bs = Number(bidStep);
    const dm = Number(durationMin || 60);

    if (!title || !Number.isFinite(sp) || !Number.isFinite(bs) || !Number.isFinite(dm)) {
      return res.status(400).json({ error: "BAD_PAYLOAD" });
    }

    const now = new Date();
    const endsAt = new Date(now.getTime() + dm * 60 * 1000);

    const lot = await createLot({
      title: String(title),
      imageUrl: String(imageUrl || ""),
      startPrice: sp,
      bidStep: bs,
      endsAt,
    });

    return res.json({ ok: true, lot });
  } catch (e) {
    console.error("ADMIN CREATE LOT ERROR:", e);
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// --- WS ---
// ✅ Telegram webhook handler
const ADMIN_IDS = String(process.env.ADMIN_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";

import { handleTelegramUpdate } from "./tg-bot-admin.js";

app.post("/telegram/webhook", async (req, res) => {
  try {
    // Telegram надсилає секрет у заголовку, якщо ти задав secret_token у setWebhook
    const secret = req.headers["x-telegram-bot-api-secret-token"];
    if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
      return res.status(401).json({ ok: false });
    }

    await handleTelegramUpdate(req.body, {
      botToken: BOT_TOKEN,
      adminIds: ADMIN_IDS,
    });

    return res.json({ ok: true });
  } catch (e) {
    console.error("WEBHOOK ERROR:", e);
    return res.json({ ok: true }); // Telegramу важливо отримати 200
  }
});

const server = app.listen(PORT, () => console.log("✅ Backend on", PORT));
const wss = new WebSocketServer({ server });

const lotRooms = new Map(); // lotId -> Set(ws)

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
