import "dotenv/config";
import { prisma } from "./db.js";

async function main() {
  const now = new Date();
  const ends = new Date(now.getTime() + 60 * 60 * 1000);

  const lot = await prisma.lot.create({
    data: {
      title: "BMW STH Stranger Things",
      imageUrl: "/bmw-sth.jpg",
      description: "Hot Wheels. Стан: новий (блістер).",
      startPrice: 80,
      bidStep: 10,
      currentPrice: 80,
      status: "LIVE",
      startsAt: now,
      endsAt: ends
    }
  });

  console.log("✅ Лот створено:", lot.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
