import { getInitData, waitForInitData } from "./tg";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "https://hw-auction-backend.onrender.com";

// GET может быть view-only (без initData)
async function headersForGet() {
  const initData = getInitData();
  return initData ? { "x-telegram-initdata": initData } : {};
}

// POST/DELETE/PUT лучше ждать initData, чтобы ставки/удаление работали всегда
async function headersForWrite() {
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
  return safeJson(res);
}

export async function apiPost(path, body) {
  const headers = await headersForWrite();
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return safeJson(res);
}

export async function apiPut(path, body) {
  const headers = await headersForWrite();
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return safeJson(res);
}

export async function apiDelete(path) {
  const headers = await headersForWrite();
  const res = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
    headers,
  });
  return safeJson(res);
}
