import { prisma } from "./db.js";

const ANTI_SNIPING_SECONDS = 10;

export async function listLots() {
  return prisma.lot.findMany({
    orderBy: [{ status: "asc" }, { endsAt: "asc" }]
  });
}

export async function getLot(id) {
  return prisma.lot.findUnique({
    where: { id },
    include: { bids: { orderBy: { createdAt: "desc" }, take: 50 } }
  });
}

export async function placeBid({ lotId, userId, userName, amount }) {
  const lot = await prisma.lot.findUnique({ where: { id: lotId } });
  if (!lot) throw new Error("LOT_NOT_FOUND");
  if (lot.status !== "LIVE") throw new Error("LOT_NOT_LIVE");

  const minNext = lot.currentPrice + lot.bidStep;
  if (amount < minNext) throw new Error(`MIN_BID_${minNext}`);

  const now = new Date();
  let newEndsAt = lot.endsAt;

  // анти-снайпінг
  const secondsLeft = Math.floor((lot.endsAt.getTime() - now.getTime()) / 1000);
  if (secondsLeft <= ANTI_SNIPING_SECONDS) {
    newEndsAt = new Date(now.getTime() + ANTI_SNIPING_SECONDS * 1000);
  }

  return prisma.$transaction(async (tx) => {
    const bid = await tx.bid.create({
      data: { lotId, userId: String(userId), userName, amount }
    });

    const lotUpdated = await tx.lot.update({
      where: { id: lotId },
      data: {
        currentPrice: amount,
        leaderUserId: String(userId),
        endsAt: newEndsAt
      }
    });

    return { bid, lot: lotUpdated };
  });
}
