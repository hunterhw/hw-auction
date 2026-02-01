const BOT_TOKEN = process.env.BOT_TOKEN || "";

async function tg(method, body) {
  if (!BOT_TOKEN) return { ok: false, description: "NO_BOT_TOKEN" };

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function notifyUser(userId, text) {
  // userId = Telegram numeric id (у тебя он такой же как leaderUserId)
  if (!userId) return;
  await tg("sendMessage", {
    chat_id: String(userId),
    text: String(text),
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
}
