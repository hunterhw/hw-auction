import { PrismaClient } from "@prisma/client";

const prisma = globalThis.__prisma || new PrismaClient();
globalThis.__prisma = prisma;

/* ===============================
   HELPERS
================================ */
function computeStatus(lot) {
  // если статус уже ENDED — оставляем
  if (lot.status === "ENDED") return "ENDED";

  const now = Date.now();
  const startsAt = new Date(lot.startsAt).getTime();
  const endsAt = new Date(lot.endsAt).getTime();

  if (now < startsAt) return "SCHEDULED";
  if (now >= endsAt) return "ENDED";
  return "LIVE";
}

/* ===============================
   CREATE LOT (ADMIN / BOT)
   - создаём как LIVE сразу
   - startsAt = now
================================ */
export async function createLot({ title, imageUrl, startPrice, bidStep, endsAt }) {
  const sp = Number(startPrice || 0);
  const bs = Number(bidStep || 10);
  const end = new Date(endsAt);

  const lot = await prisma.lot.create({
    data: {
      title: String(title || "New lot"),
      imageUrl: String(imageUrl || ""),
      startPrice: Math.max(0, Math.trunc(sp)),
      bidStep: Math.max(1, Math.trunc(bs)),
      currentPrice: Math.max(0, Math.trunc(sp)),
      status: "LIVE",
      startsAt: new Date(),
      endsAt: end,
    },
  });

  return lot;
}

/* ===============================
   LIST LOTS
   ✅ никаких DELETED (у тебя нет такого enum)
   + авто-обновление статусов по времени
================================ */
export async function listLots() {
  const lots = await prisma.lot.findMany({
    where: { status: { in: ["SCHEDULED", "LIVE", "ENDED"] } },
    orderBy: { endsAt: "asc" },
  });

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
   GET LOT (with bids)
   + авто-обновление статуса по времени
================================ */
export async function getLot(id) {
  const lot = await prisma.lot.findUnique({
    where: { id: String(id) },
    include: {
      bids: {
        orderBy: { createdAt: "desc" },
        take: 50,
      },
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
   ✅ FIX: убран `lock` (его нет в твоей Prisma версии)
================================ */
export async function placeBid({ lotId, userId, userName, amount }) {
  const lotIdStr = String(lotId);
  const uid = String(userId);
  const uname = String(userName || "Користувач");
  const amt = Math.trunc(Number(amount));

  if (!Number.isFinite(amt) || amt <= 0) {
    throw new Error("BAD_AMOUNT");
  }

  return prisma.$transaction(async (tx) => {
    const lot = await tx.lot.findUnique({
      where: { id: lotIdStr },
    });

    if (!lot) throw new Error("LOT_NOT_FOUND");

    // авто-обновим статус перед ставкой
    const nextStatus = computeStatus(lot);
    if (nextStatus !== lot.status) {
      await tx.lot.update({
        where: { id: lot.id },
        data: { status: nextStatus },
      });
      lot.status = nextStatus;
    }

    if (lot.status !== "LIVE") throw new Error("LOT_CLOSED");

    const min = lot.currentPrice + lot.bidStep;
    if (amt < min) throw new Error("MIN_BID_" + min);

    const bid = await tx.bid.create({
      data: {
        lotId: lotIdStr,
        userId: uid,
        userName: uname,
        amount: amt,
      },
    });

    const updatedLot = await tx.lot.update({
      where: { id: lotIdStr },
      data: {
        currentPrice: amt,
        leaderUserId: uid,
      },
    });

    return { bid, lot: updatedLot };
  });
}
