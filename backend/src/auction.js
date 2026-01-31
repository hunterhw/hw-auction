import { PrismaClient } from "@prisma/client";

const prisma = globalThis.__prisma || new PrismaClient();
globalThis.__prisma = prisma;

/* ===============================
   CREATE LOT (ADMIN)
================================ */
export async function createLot({
  title,
  imageUrl,
  startPrice,
  bidStep,
  endsAt,
}) {
  const lot = await prisma.lot.create({
    data: {
      title: String(title || "New lot"),
      imageUrl: String(imageUrl || ""),
      startPrice: Number(startPrice || 0),
      bidStep: Number(bidStep || 10),
      currentPrice: Number(startPrice || 0),
      status: "LIVE",
      startsAt: new Date(),
      endsAt: new Date(endsAt),
    },
  });

  return lot;
}

/* ===============================
   LIST LOTS
================================ */
export async function listLots() {
  return prisma.lot.findMany({
    where: { status: { not: "DELETED" } },
    orderBy: { endsAt: "asc" },
  });
}

/* ===============================
   GET LOT
================================ */
export async function getLot(id) {
  return prisma.lot.findUnique({
    where: { id },
    include: {
      bids: {
        orderBy: { createdAt: "desc" },
      },
    },
  });
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
  return prisma.$transaction(async (tx) => {
    const lot = await tx.lot.findUnique({
      where: { id: lotId },
      lock: { mode: "ForUpdate" },
    });

    if (!lot) throw new Error("LOT_NOT_FOUND");
    if (lot.status !== "LIVE") throw new Error("LOT_CLOSED");

    const min = lot.currentPrice + lot.bidStep;

    if (amount < min) {
      throw new Error("MIN_BID_" + min);
    }

    const bid = await tx.bid.create({
      data: {
        lotId,
        userId,
        userName,
        amount,
      },
    });

    const updatedLot = await tx.lot.update({
      where: { id: lotId },
      data: {
        currentPrice: amount,
        leaderUserId: userId,
      },
    });

    return {
      bid,
      lot: updatedLot,
    };
  });
}
