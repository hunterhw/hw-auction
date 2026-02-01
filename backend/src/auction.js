import { PrismaClient } from "@prisma/client";

const prisma = globalThis.__prisma || new PrismaClient();
globalThis.__prisma = prisma;

/* ===============================
   HELPERS
================================ */
function computeStatus mergesStatus(lot) {
  if (!lot) return "ENDED";
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
   ✅ supports startsAt (scheduled lots)
================================ */
export async function createLot({ title, imageUrl, startPrice, bidStep, startsAt, endsAt }) {
  const sp = Number(startPrice || 0);
  const bs = Number(bidStep || 10);

  const start = startsAt ? new Date(startsAt) : new Date();
  const end = new Date(endsAt);

  const base = {
    title: String(title || "New lot"),
    imageUrl: String(imageUrl || ""),
    startPrice: Math.max(0, Math.trunc(sp)),
    bidStep: Math.max(1, Math.trunc(bs)),
    currentPrice: Math.max(0, Math.trunc(sp)),
    startsAt: start,
    endsAt: end,
  };

  // ✅ статус вычисляем по времени
  const status = computeStatus({ ...base, status: "SCHEDULED" });

  const lot = await prisma.lot.create({
    data: {
      ...base,
      status,
    },
  });

  return lot;
}

/* ===============================
   LIST LOTS
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
      lot.status = nextStatus;
    }
  }
  if (updates.length) await Promise.allSettled(updates);

  return lots;
}

/* ===============================
   GET LOT (with bids)
================================ */
export async function getLot(id) {
  const lot = await prisma.lot.findUnique({
    where: { id: String(id) },
    include: {
      bids: { orderBy: { createdAt: "desc" }, take: 50 },
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
   - без Prisma lock
   - защита от гонки через updateMany с условием
================================ */
export async function placeBid({ lotId, userId, userName, amount }) {
  const lotIdStr = String(lotId);
  const uid = String(userId);
  const uname = String(userName || "Користувач");
  const amt = Math.trunc(Number(amount));

  if (!Number.isFinite(amt) || amt <= 0) throw new Error("BAD_AMOUNT");

  return prisma.$transaction(async (tx) => {
    // читаем лот
    let lot = await tx.lot.findUnique({ where: { id: lotIdStr } });
    if (!lot) throw new Error("LOT_NOT_FOUND");

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
      // кто-то успел обновить цену раньше тебя
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

    return { bid, lot: updatedLot };
  });
}

/* ===============================
   DELETE LOT (ADMIN / BOT)
   - удалит лот + bids (Cascade в schema)
================================ */
export async function deleteLot(lotId) {
  const id = String(lotId);
  return prisma.lot.delete({
    where: { id },
  });
}
