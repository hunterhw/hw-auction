import "dotenv/config";
import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";

import { listLots, getLot, placeBid } from "./auction.js";
import { verifyTelegramInitData, parseUserFromInitData } from "./telegram.js";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;
const BOT_TOKEN = process.env.BOT_TOKEN; // required
const CHANNEL_ID = process.env.CHANNEL_ID; // "@hw_hunter_ua" or -100...
const CHANNEL_URL =
  process.env.CHANNEL_URL ||
  (typeof CHANNEL_ID === "string" && CHANNEL_ID.startsWith("@")
    ? `https://t.me/${CHANNEL_ID.slice(1)}`
    : null);

if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN is missing. Set it in backend/.env");
  process.exit(1);
}

async function checkSubscription(userId) {
  // если канал не задан — считаем, что подписка не нужна
  if (!CHANNEL_ID) return true;

  const url =
    `https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?` +
    `chat_id=${encodeURIComponent(CHANNEL_ID)}&user_id=${encodeURIComponent(userId)}`;

  const res = await fetch(url);
  const data = await res.json();
  const status = data?.result?.status;

  return ["creator", "administrator", "member"].includes(status);
}

function authFromInitData(req) {
  const initData = req.headers["x-telegram-initdata"];
  if (!initData || typeof initData !== "string" || initData.length === 0) return null; // Desktop fallback

  if (!verifyTelegramInitData(initData, BOT_TOKEN)) throw new Error("BAD_INITDATA");
  const user = parseUserFromInitData(initData);
  if (!user?.id) throw new Error("NO_USER");
  return user;
}

function normalizeLotPayload(lot) {
  // на случай если getLot вернул bids внутри lot
  if (!lot) return { lot: null, bids: [] };
  const bids = Array.isArray(lot.bids) ? lot.bids : [];
  const { bids: _b, ...cleanLot } = lot;
  return { lot: cleanLot, bids };
}

app.get("/health", (_, res) => res.json({ ok: true }));

// список лотов
app.get("/lots", async (req, res) => {
  try {
    const user = authFromInitData(req);

    const lots = await listLots();

    // Desktop/Browser: просто просмотр
    if (!user) {
      return res.json({ lots, viewOnly: true });
    }

    // Telegram: проверка подписки
    const ok = await checkSubscription(user.id);
    if (!ok) {
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
    return res.status(401).json({ error: String(e.message || e) });
  }
});

// один лот + ставки (для polling)
app.get("/lots/:id", async (req, res) => {
  try {
    const user = authFromInitData(req);

    const rawLot = await getLot(req.params.id);
    const { lot, bids } = normalizeLotPayload(rawLot);

    if (!lot) {
      return res.json({ lot: null, bids: [], viewOnly: true, reason: "NOT_FOUND" });
    }

    // Desktop/Browser: просмотр
    if (!user) {
      return res.json({ lot, bids, viewOnly: true });
    }

    // Telegram: если нет подписки — даём просмотр, но говорим “подпишись”
    const ok = await checkSubscription(user.id);
    if (!ok) {
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
    return res.status(400).json({ error: String(e.message || e) });
  }
});

// ставка
app.post("/lots/:id/bid", async (req, res) => {
  try {
    const user = authFromInitData(req);
    if (!user) return res.status(401).json({ error: "BID_REQUIRES_TELEGRAM" });

    const ok = await checkSubscription(user.id);
    if (!ok) {
      return res.status(403).json({
        error: "NOT_SUBSCRIBED",
        subscribeUrl: CHANNEL_URL,
        channelId: CHANNEL_ID,
      });
    }

    const { amount } = req.body || {};
    const result = await placeBid({
      lotId: req.params.id,
      userId: user.id,
      userName: user.username ? `@${user.username}` : `${user.first_name || "Користувач"}`,
      amount: Number(amount),
    });

    broadcastToLot(req.params.id, {
      type: "BID_PLACED",
      lotId: req.params.id,
      bid: result.bid,
      lot: result.lot,
    });

    return res.json({ ok: true, ...result });
  } catch (e) {
    return res.status(400).json({ error: String(e.message || e) });
  }
});

// --- WS ---
const server = app.listen(PORT, () => console.log("✅ Backend on", PORT));
const wss = new WebSocketServer({ server });

const lotRooms = new Map(); // lotId -> Set(ws)

function broadcastToLot(lotId, payload) {
  const room = lotRooms.get(lotId);
  if (!room) return;
  const msg = JSON.stringify(payload);
  for (const ws of room) {
    if (ws.readyState === ws.OPEN) ws.send(msg);
  }
}

wss.on("connection", (ws) => {
  ws.on("message", async (raw) => {
    try {
      const data = JSON.parse(raw.toString());
      if (data?.type === "JOIN_LOT") {
        const lotId = data.lotId;
        if (!lotRooms.has(lotId)) lotRooms.set(lotId, new Set());
        lotRooms.get(lotId).add(ws);

        const rawLot = await getLot(lotId);
        const { lot, bids } = normalizeLotPayload(rawLot);
        ws.send(JSON.stringify({ type: "SNAPSHOT", lot, bids }));
      }
    } catch {}
  });

  ws.on("close", () => {
    for (const room of lotRooms.values()) room.delete(ws);
  });
});
