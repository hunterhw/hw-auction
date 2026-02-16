import { PrismaClient } from "@prisma/client";

const prisma = globalThis.__prisma || new PrismaClient();
globalThis.__prisma = prisma;

/* ===============================
   HELPERS
================================ */
function computeStatus(lot) {
  if (!lot) return "ENDED";

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
   STATUS SYNC WORKER ✅
   - чтобы лоты не зависали
================================ */
export async function syncLotStatuses() {
  const now = new Date();

  // LIVE → ENDED
  await prisma.lot.updateMany({
    where: {
      status: "LIVE",
      endsAt: { lte: now },
    },
    data: { status: "ENDED" },
  });

  // SCHEDULED → LIVE
  await prisma.lot.updateMany({
    where: {
      status: "SCHEDULED",
      startsAt: { lte: now },
    },
    data: { status: "LIVE" },
  });
}

/* ===============================
   AUTO START WORKER
   запускается сам при импорте
================================ */
setInterval(() => {
  syncLotStatuses().catch(() => {});
}, 15000); // каждые 15 сек

/* ===============================
   CREATE LOT
================================ */
export async function createLot({
  title,
  imageUrl,
  startPrice,
  bidStep,
  startsAt,
  endsAt,
}) {
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

  const status = computeStatus({ ...base });

  return prisma.lot.create({
    data: {
      ...base,
      status,
      endedNotifiedAt: null,
      endingSoonNotifiedAt: null,
    },
  });
}

/* ===============================
   LIST LOTS
   ❗ НЕ удаляет завершённые
================================ */
export async function listLots() {
  const lots = await prisma.lot.findMany({
    orderBy: { endsAt: "asc" },
  });

  // авто-обновление статусов
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

      lot.status = nextStatus;
    }
  }

  if (updates.length) await Promise.allSettled(updates);

  return lots;
}

/* ===============================
   GET LOT
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
   PLACE BID
================================ */
export async function placeBid({
  lotId,
  userId,
  userName,
  amount,
}) {
  const lotIdStr = String(lotId);
  const uid = String(userId);
  const uname = String(userName || "Користувач");
  const amt = toInt(amount, 0);

  if (!amt || amt <= 0) throw new Error("BAD_AMOUNT");

  return prisma.$transaction(async (tx) => {
    let lot = await tx.lot.findUnique({
      where: { id: lotIdStr },
    });

    if (!lot) throw new Error("LOT_NOT_FOUND");

    const prevLeaderUserId = lot.leaderUserId || null;
    const prevLeaderPrice = lot.currentPrice || 0;

    const nextStatus = computeStatus(lot);

    if (nextStatus !== lot.status) {
      await tx.lot.update({
        where: { id: lot.id },
        data: { status: nextStatus },
      });

      lot.status = nextStatus;
    }

    if (lot.status !== "LIVE")
      throw new Error("LOT_CLOSED");

    const min = lot.currentPrice + lot.bidStep;
    if (amt < min) throw new Error("MIN_BID_" + min);

    const updated = await tx.lot.updateMany({
      where: {
        id: lotIdStr,
        status: "LIVE",
        currentPrice: {
          lte: amt - lot.bidStep,
        },
      },
      data: {
        currentPrice: amt,
        leaderUserId: uid,
      },
    });

    if (updated.count !== 1) {
      const fresh = await tx.lot.findUnique({
        where: { id: lotIdStr },
      });

      const freshMin =
        (fresh?.currentPrice || 0) +
        (fresh?.bidStep || 0);

      throw new Error("MIN_BID_" + freshMin);
    }

    const bid = await tx.bid.create({
      data: {
        lotId: lotIdStr,
        userId: uid,
        userName: uname,
        amount: amt,
      },
    });

    const updatedLot = await tx.lot.findUnique({
      where: { id: lotIdStr },
    });

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
   COMMENTS
================================ */
export async function addComment({
  lotId,
  userId,
  userName,
  text,
}) {
  const t = String(text || "").trim();
  if (!t) throw new Error("EMPTY_COMMENT");

  return prisma.comment.create({
    data: {
      lotId: String(lotId),
      userId: String(userId),
      userName: String(userName || "Користувач"),
      text: t,
    },
  });
}

export async function listComments(
  lotId,
  take = 50
) {
  return prisma.comment.findMany({
    where: { lotId: String(lotId) },
    orderBy: { createdAt: "desc" },
    take,
  });
}

/* ===============================
   AUTO BID
================================ */
export async function setAutoBid({
  lotId,
  userId,
  userName,
  maxAmount,
  isActive = true,
}) {
  return prisma.autoBid.upsert({
    where: {
      lotId_userId: {
        lotId: String(lotId),
        userId: String(userId),
      },
    },
    update: {
      maxAmount: toInt(maxAmount),
      isActive,
      userName,
    },
    create: {
      lotId: String(lotId),
      userId: String(userId),
      userName,
      maxAmount: toInt(maxAmount),
      isActive,
    },
  });
}

/* ===============================
   DELETE LOT
================================ */
export async function deleteLot(lotId) {
  return prisma.lot.delete({
    where: { id: String(lotId) },
  });
}

/* ===============================
   DISABLE AUTO BID ✅
================================ */
export async function disableAutoBid({ lotId, userId }) {
  return prisma.autoBid.update({
    where: {
      lotId_userId: {
        lotId: String(lotId),
        userId: String(userId),
      },
    },
    data: { isActive: false },
  });
}
