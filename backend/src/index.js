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

if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN is missing. Set it in backend/.env");
  process.exit(1);
}

async function checkSubscription(userId) {
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

app.get("/health", (_, res) => res.json({ ok: true }));

app.get("/lots", async (req, res) => {
  try {
    const user = authFromInitData(req);
// Отримати один лот + ставки (для polling)
app.get("/lots/:id", async (req, res) => {
  try {
    const lotId = String(req.params.id);

    const lot = await prisma.lot.findUnique({
      where: { id: lotId },
      include: {
        bids: {
          orderBy: { createdAt: "desc" },
          take: 50,
        },
      },
    });

    if (!lot) {
      return res.status(404).json({ error: "LOT_NOT_FOUND" });
    }

    res.json({
      lot: {
        id: lot.id,
        title: lot.title,
        imageUrl: lot.imageUrl,
        currentPrice: lot.currentPrice,
        bidStep: lot.bidStep,
        endsAt: lot.endsAt,
        status: lot.status,
        leaderUserId: lot.leaderUserId,
      },
      bids: lot.bids.map((b) => ({
        id: b.id,
        userId: b.userId,
        userName: b.userName,
        amount: b.amount,
        createdAt: b.createdAt,
      })),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

    // ✅ Desktop / browser fallback: allow VIEW without initData
    if (!user) {
      const lots = await listLots();
      return res.json({ lots, viewOnly: true });
    }

    const ok = await checkSubscription(user.id);
    if (!ok) return res.status(403).json({ error: "NOT_SUBSCRIBED" });

    const lots = await listLots();
    res.json({ lots, viewOnly: false });
  } catch (e) {
    res.status(401).json({ error: String(e.message || e) });
  }
});

app.get("/lots/:id", async (req, res) => {
  try {
    const user = authFromInitData(req);

    // ✅ Desktop / browser fallback: allow VIEW without initData
    if (!user) {
      const lot = await getLot(req.params.id);
      return res.json({ lot, viewOnly: true });
    }

    const ok = await checkSubscription(user.id);
    if (!ok) return res.status(403).json({ error: "NOT_SUBSCRIBED" });

    const lot = await getLot(req.params.id);
    res.json({ lot, viewOnly: false });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

app.post("/lots/:id/bid", async (req, res) => {
  try {
    const user = authFromInitData(req);if (!user) return res.status(401).json({ error: "BID_REQUIRES_TELEGRAM" });
    const ok = await checkSubscription(user.id);
    if (!ok) return res.status(403).json({ error: "NOT_SUBSCRIBED" });

    const { amount } = req.body || {};
    const result = await placeBid({
      lotId: req.params.id,
      userId: user.id,
      userName: user.username ? `@${user.username}` : `${user.first_name || "Користувач"}`,
      amount: Number(amount)
    });

    broadcastToLot(req.params.id, {
      type: "BID_PLACED",
      lotId: req.params.id,
      bid: result.bid,
      lot: result.lot
    });

    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
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

        const lot = await getLot(lotId);
        ws.send(JSON.stringify({ type: "SNAPSHOT", lot }));
      }
    } catch {}
  });

  ws.on("close", () => {
    for (const room of lotRooms.values()) room.delete(ws);
  });
});
