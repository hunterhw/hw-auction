import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";

import { verifyTelegramInitData, parseUserFromInitData } from "./telegram.js";
import { createLot } from "./auction.js";

const router = express.Router();

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = (process.env.ADMIN_IDS || "")
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);

function authTelegram(req) {
  const initData = req.headers["x-telegram-initdata"];
  if (!initData || typeof initData !== "string" || initData.length === 0) return null;
  if (!verifyTelegramInitData(initData, BOT_TOKEN)) throw new Error("BAD_INITDATA");
  const user = parseUserFromInitData(initData);
  if (!user?.id) throw new Error("NO_USER");
  return user;
}

function requireAdmin(req, res, next) {
  try {
    const user = authTelegram(req);
    if (!user) return res.status(401).json({ error: "ADMIN_REQUIRES_TELEGRAM" });

    const ok = ADMIN_IDS.includes(String(user.id));
    if (!ok) return res.status(403).json({ error: "NOT_ADMIN" });

    req.adminUser = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: String(e.message || e) });
  }
}

/** uploads storage **/
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadDir = path.join(__dirname, "../uploads");

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => {
    const safe = (file.originalname || "file").replace(/[^\w.\-]+/g, "_");
    cb(null, `${Date.now()}_${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
});

/**
 * POST /admin/upload
 * multipart/form-data with field "file"
 * returns { imageUrl: "/uploads/xxx.jpg" }
 */
router.post("/upload", requireAdmin, upload.single("file"), async (req, res) => {
  const f = req.file;
  if (!f) return res.status(400).json({ error: "NO_FILE" });
  return res.json({ ok: true, imageUrl: `/uploads/${f.filename}` });
});

/**
 * POST /admin/lots
 * body: { title, description, startPrice, bidStep, durationMin, imageUrl }
 */
router.post("/lots", requireAdmin, async (req, res) => {
  try {
    const { title, description, startPrice, bidStep, durationMin, imageUrl } = req.body || {};

    if (!title || String(title).trim().length < 2) return res.status(400).json({ error: "BAD_TITLE" });
    if (!startPrice || Number(startPrice) <= 0) return res.status(400).json({ error: "BAD_START_PRICE" });
    if (!bidStep || Number(bidStep) <= 0) return res.status(400).json({ error: "BAD_BID_STEP" });
    if (!durationMin || Number(durationMin) <= 0) return res.status(400).json({ error: "BAD_DURATION" });
    if (!imageUrl || String(imageUrl).length < 3) return res.status(400).json({ error: "BAD_IMAGE" });

    const lot = await createLot({
      title: String(title).trim(),
      description: String(description || "").trim(),
      startPrice: Number(startPrice),
      bidStep: Number(bidStep),
      durationMin: Number(durationMin),
      imageUrl: String(imageUrl),
    });

    return res.json({ ok: true, lot });
  } catch (e) {
    console.error("ADMIN CREATE LOT ERROR:", e);
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
});

export default router;

