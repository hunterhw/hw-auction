import { getInitData } from "./tg";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE;

export async function apiGet(path) {
  const initData = getInitData();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "x-telegram-initdata": initData }
  });
  return res.json();
}

export async function apiPost(path, body) {
  const initData = getInitData();
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-initdata": initData
    },
    body: JSON.stringify(body)
  });
  return res.json();
}
