import { PrismaClient } from "@prisma/client";
const prisma = globalThis.__prisma || new PrismaClient();
globalThis.__prisma = prisma;

export async function createLot({ title, imageUrl, startPrice, bidStep, endsAt }) {
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

  return {
    id: lot.id,
    title: lot.title,
    imageUrl: lot.imageUrl,
    currentPrice: lot.currentPrice,
    bidStep: lot.bidStep,
    endsAt: lot.endsAt,
    status: lot.status,
    leaderUserId: lot.leaderUserId,
  };
}
