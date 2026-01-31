import { getInitData, waitForInitData } from "./tg";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE;

async function headersForGet() {
  const initData = getInitData();
  return initData ? { "x-telegram-initdata": initData } : {};
}

async function headersForPost() {
  let initData = getInitData();
  if (!initData) initData = await waitForInitData(5000);
  return initData ? { "x-telegram-initdata": initData } : {};
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return { error: "BAD_RESPONSE" };
  }
}

export async function apiGet(path) {
  const headers = await headersForGet();
  const res = await fetch(`${API_BASE}${path}`, { headers });
  const data = await safeJson(res);
  return data;
}

export async function apiPost(path, body) {
  const headers = await headersForPost();
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await safeJson(res);
  return data;
}
