import { getInitData, waitForInitData } from "./tg";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE;

async function headersForGet() {
  // просмотр можно и без initData (для Desktop view-only)
  const initData = getInitData();
  return initData ? { "x-telegram-initdata": initData } : {};
}

async function headersForPost() {
  // ставки — только с initData, ждём его
  let initData = getInitData();
  if (!initData) initData = await waitForInitData(5000);
  return initData ? { "x-telegram-initdata": initData } : {};
}

export async function apiGet(path) {
  const headers = await headersForGet();
  const res = await fetch(`${API_BASE}${path}`, { headers });
  return res.json();
}

export async function apiPost(path, body) {
  const headers = await headersForPost();
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}
