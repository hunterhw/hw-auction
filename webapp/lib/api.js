import { waitForInitData } from "./tg";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE;

async function initHeaders() {
  const initData = await waitForInitData();
  return { "x-telegram-initdata": initData };
}

export async function apiGet(path) {
  const headers = await initHeaders();
  if (!headers["x-telegram-initdata"]) return { error: "NO_INITDATA" };

  const res = await fetch(`${API_BASE}${path}`, { headers });
  return res.json();
}

export async function apiPost(path, body) {
  const headers = await initHeaders();
  if (!headers["x-telegram-initdata"]) return { error: "NO_INITDATA" };

  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}
