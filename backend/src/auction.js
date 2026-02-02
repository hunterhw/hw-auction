import { PrismaClient } from "@prisma/client";

const prisma = globalThis.__prisma || new PrismaClient();
globalThis.__prisma = prisma;

/* ===============================
   HELPERS
================================ */
function computeStatus(lot) {
  if (!lot) return "ENDED";
  if (lot.status === "ENDED") return "ENDED";

  const now = Date.now();
  const startsAt = new Date(lot.startsAt).getTime();
  const endsAt = new Date(lot.endsAt).getTime();

  if (now < startsAt) return "SCHEDULED";
  if (now >= endsAt) return "ENDED";
  return "LIVE";
}

function toInt(v, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : def;
}

/* ===============================
   CREATE LOT (ADMIN / BOT)
   ✅ supports startsAt (scheduled lots)
================================ */
export async function createLot({ title, imageUrl, startPrice, bidStep, startsAt, endsAt }) {
  const sp = Math.max(0, toInt(startPrice, 0));
  const bs = Math.max(1, toInt(bidStep, 10));

  const start = startsAt ? new Date(startsAt) : new Date();
  const end = new Date(endsAt);

  const base = {
    title: String(title || "New lot"),
    imageUrl: String(imageUrl || ""),
    startPrice: sp,
    bidStep: bs,
    currentPrice: sp,
    startsAt: start,
    endsAt: end,
  };

  // ✅ статус вычисляем по времени
  const status = computeStatus({ ...base, status: "SCHEDULED" });

  return prisma.lot.create({
    data: {
      ...base,
      status,
      // поля уведомлений пусть будут null по умолчанию
      endedNotifiedAt: null,
      endingSoonNotifiedAt: null,
    },
  });
}

/* ===============================
   LIST LOTS
   - returns lots
   - auto-updates status based on time
================================ */
export async function listLots() {
  const lots = await prisma.lot.findMany({
    where: { status: { in: ["SCHEDULED", "LIVE", "ENDED"] } },
    orderBy: { endsAt: "asc" },
  });

  // авто-обновление статусов по времени
  const updates = [];
  for (const lot of lots) {
    const nextStatus = computeStatus(lot);
    if (nextStatus !== lot.status) {
      updates.push(
        prisma.lot.update({
          where: { id: lot.id },
          data: { status: nextStatus },
        })
      );
      lot.status = nextStatus; // обновим в памяти, чтобы фронт видел актуально
    }
  }
  if (updates.length) await Promise.allSettled(updates);

  return lots;
}

/* ===============================
   GET LOT (with bids + comments + autoBids)
================================ */
export async function getLot(id) {
  const lot = await prisma.lot.findUnique({
    where: { id: String(id) },
    include: {
      bids: { orderBy: { createdAt: "desc" }, take: 50 },
      comments: { orderBy: { createdAt: "desc" }, take: 50 },
      autoBids: { orderBy: { maxAmount: "desc" }, take: 50 },
    },
  });

  if (!lot) return null;

  const nextStatus = computeStatus(lot);
  if (nextStatus !== lot.status) {
    await prisma.lot.update({
      where: { id: lot.id },
      data: { status: nextStatus },
    });
    lot.status = nextStatus;
  }

  return lot;
}

/* ===============================
   PLACE BID  (NO LOCK ✅)
   - защита от гонки через updateMany с условием
   - возвращает outbid (кто был лидером до ставки)
================================ */
export async function placeBid({ lotId, userId, userName, amount }) {
  const lotIdStr = String(lotId);
  const uid = String(userId);
  const uname = String(userName || "Користувач");
  const amt = toInt(amount, 0);

  if (!Number.isFinite(Number(amount)) || amt <= 0) throw new Error("BAD_AMOUNT");

  return prisma.$transaction(async (tx) => {
    // читаем лот
    let lot = await tx.lot.findUnique({ where: { id: lotIdStr } });
    if (!lot) throw new Error("LOT_NOT_FOUND");

    // сохраним предыдущего лидера ДО обновления
    const prevLeaderUserId = lot.leaderUserId ? String(lot.leaderUserId) : null;
    const prevLeaderPrice = Number(lot.currentPrice || 0);

    // обновим статус по времени
    const nextStatus = computeStatus(lot);
    if (nextStatus !== lot.status) {
      await tx.lot.update({
        where: { id: lot.id },
        data: { status: nextStatus },
      });
      lot = { ...lot, status: nextStatus };
    }

    if (lot.status !== "LIVE") throw new Error("LOT_CLOSED");

    const min = lot.currentPrice + lot.bidStep;
    if (amt < min) throw new Error("MIN_BID_" + min);

    // атомарно обновляем цену только если ставка >= min
    const updated = await tx.lot.updateMany({
      where: {
        id: lotIdStr,
        status: "LIVE",
        // эквивалент: amt >= currentPrice + bidStep
        currentPrice: { lte: amt - lot.bidStep },
      },
      data: {
        currentPrice: amt,
        leaderUserId: uid,
      },
    });

    if (updated.count !== 1) {
      const fresh = await tx.lot.findUnique({ where: { id: lotIdStr } });
      const freshMin = (fresh?.currentPrice || 0) + (fresh?.bidStep || 0);
      throw new Error("MIN_BID_" + freshMin);
    }

    // пишем ставку
    const bid = await tx.bid.create({
      data: {
        lotId: lotIdStr,
        userId: uid,
        userName: uname,
        amount: amt,
      },
    });

    const updatedLot = await tx.lot.findUnique({ where: { id: lotIdStr } });

    return {
      bid,
      lot: updatedLot,
      outbid: {
        userId: prevLeaderUserId,
        price: prevLeaderPrice,
      },
    };
  });
}

/* ===============================
   USER BID HISTORY
================================ */
export async function listUserBids(userId) {
  const uid = String(userId);

  const bids = await prisma.bid.findMany({
    where: { userId: uid },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { lot: true },
  });

  return bids.map((b) => ({
    id: b.id,
    lotId: b.lotId,
    amount: b.amount,
    createdAt: b.createdAt,
    lot: b.lot
      ? {
          id: b.lot.id,
          title: b.lot.title,
          imageUrl: b.lot.imageUrl,
          status: b.lot.status,
          currentPrice: b.lot.currentPrice,
          endsAt: b.lot.endsAt,
        }
      : null,
  }));
}

/* ===============================
   COMMENTS
================================ */
export async function addComment({ lotId, userId, userName, text }) {
  const lotIdStr = String(lotId);
  const uid = String(userId);
  const uname = String(userName || "Користувач");
  const t = String(text || "").trim();

  if (!t) throw new Error("EMPTY_COMMENT");
  if (t.length > 500) throw new Error("COMMENT_TOO_LONG");

  // проверим, что лот есть
  const lot = await prisma.lot.findUnique({ where: { id: lotIdStr } });
  if (!lot) throw new Error("LOT_NOT_FOUND");

  return prisma.comment.create({
    data: {
      lotId: lotIdStr,
      userId: uid,
      userName: uname,
      text: t,
    },
  });
}

export async function listComments(lotId, take = 50) {
  const lotIdStr = String(lotId);
  const n = Math.max(1, Math.min(200, toInt(take, 50)));

  return prisma.comment.findMany({
    where: { lotId: lotIdStr },
    orderBy: { createdAt: "desc" },
    take: n,
  });
}

/* ===============================
   AUTO BID (base)
   - хранение максимума ставки пользователя
   - дальше можно подключить логику авто-перебития
================================ */
export async function setAutoBid({ lotId, userId, userName, maxAmount, isActive = true }) {
  const lotIdStr = String(lotId);
  const uid = String(userId);
  const uname = String(userName || "Користувач");
  const max = Math.max(0, toInt(maxAmount, 0));
  const active = Boolean(isActive);

  const lot = await prisma.lot.findUnique({ where: { id: lotIdStr } });
  if (!lot) throw new Error("LOT_NOT_FOUND");

  return prisma.autoBid.upsert({
    where: { lotId_userId: { lotId: lotIdStr, userId: uid } },
    update: { maxAmount: max, isActive: active, userName: uname },
    create: { lotId: lotIdStr, userId: uid, userName: uname, maxAmount: max, isActive: active },
  });
}

export async function disableAutoBid({ lotId, userId }) {
  const lotIdStr = String(lotId);
  const uid = String(userId);

  return prisma.autoBid.update({
    where: { lotId_userId: { lotId: lotIdStr, userId: uid } },
    data: { isActive: false },
  });
}

/* ===============================
   DELETE LOT (ADMIN / BOT)
================================ */
export async function deleteLot(lotId) {
  const id = String(lotId);
  return prisma.lot.delete({ where: { id } });
}
