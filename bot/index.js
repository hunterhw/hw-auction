import "dotenv/config";
import { Bot, InlineKeyboard } from "grammy";

const bot = new Bot(process.env.BOT_TOKEN);
const WEBAPP_URL = process.env.WEBAPP_URL; // Vercel URL
const CHANNEL_ID = process.env.CHANNEL_ID || "@hw_hunter_ua";

async function isSubscribed(ctx) {
  try {
    const member = await ctx.api.getChatMember(CHANNEL_ID, ctx.from.id);
    return ["creator", "administrator", "member"].includes(member.status);
  } catch {
    return false;
  }
}

bot.command("start", async (ctx) => {
  const ok = await isSubscribed(ctx);

  if (!ok) {
    await ctx.reply("Щоб брати участь в аукціоні, підпишіться на канал і натисніть /start ще раз.");
    return;
  }

  const kb = new InlineKeyboard().webApp("Відкрити аукціон", WEBAPP_URL);
  await ctx.reply("🔥 Живі аукціони Hot Wheels у HW HUNTER:", { reply_markup: kb });
});

bot.start();
