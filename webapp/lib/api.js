import { getInitData, waitForInitData } from "./tg";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE;

function buildInitHeaders(initData) {
  if (!initData) return {};
  // отправляем ДВА варианта заголовка, чтобы совпало с любым бекендом
  return {
    "x-telegram-init-data": initData,
    "x-telegram-initdata": initData,
  };
}

async function headersForGet() {
  const initData = getInitData();
  return buildInitHeaders(initData);
}

async function headersForPost() {
  let initData = getInitData();
  if (!initData) initData = await waitForInitData(8000); // чуть больше времени
  return buildInitHeaders(initData);
}

export async function apiGet(path) {
  if (!API_BASE) throw new Error("NEXT_PUBLIC_API_BASE is empty");
  const headers = await headersForGet();

  const res = await fetch(`${API_BASE}${path}`, {
    headers,
    cache: "no-store",
  });

  return res.json();
}

export async function apiPost(path, body) {
  if (!API_BASE) throw new Error("NEXT_PUBLIC_API_BASE is empty");
  const headers = await headersForPost();

  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  return res.json();
}
