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
    import { prisma } from "./prisma.js"; // якщо у тебе prisma імпортується інакше — скажи, підлаштую

export async function createLot({ title, description, startPrice, bidStep, durationMin, imageUrl }) {
  const now = new Date();
  const endsAt = new Date(now.getTime() + Number(durationMin) * 60 * 1000);

  const lot = await prisma.lot.create({
    data: {
      title,
      description,
      imageUrl,
      startPrice: Number(startPrice),
      bidStep: Number(bidStep),
      currentPrice: Number(startPrice),
      status: "LIVE",
      startsAt: now,
      endsAt,
      leaderUserId: null,
    },
  });

  return {
    id: lot.id,
    title: lot.title,
    imageUrl: lot.imageUrl,
    description: lot.description,
    startPrice: lot.startPrice,
    bidStep: lot.bidStep,
    currentPrice: lot.currentPrice,
    leaderUserId: lot.leaderUserId,
    status: lot.status,
    startsAt: lot.startsAt,
    endsAt: lot.endsAt,
    createdAt: lot.createdAt,
  };
}


    return { bid, lot: lotUpdated };
  });
}
