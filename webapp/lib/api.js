import { getInitData } from "./tg";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE;

function buildHeaders() {
  const initData = getInitData();
  // Если initData нет (Telegram Desktop) — просто НЕ отправляем заголовок.
  // Backend в таком режиме отдаст view-only.
  return initData ? { "x-telegram-initdata": initData } : {};
}

export async function apiGet(path) {
  const headers = buildHeaders();
  const res = await fetch(`${API_BASE}${path}`, { headers });
  return res.json();
}

export async function apiPost(path, body) {
  const headers = buildHeaders();
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}
