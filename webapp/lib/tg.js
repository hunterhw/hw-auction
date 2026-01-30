export function getInitData() {
  if (typeof window === "undefined") return "";
  return window?.Telegram?.WebApp?.initData || "";
}

export function tgReady() {
  if (typeof window === "undefined") return;
  window?.Telegram?.WebApp?.ready?.();
  window?.Telegram?.WebApp?.expand?.();
}

export async function waitForInitData(timeoutMs = 4000) {
  if (typeof window === "undefined") return "";
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const v = window?.Telegram?.WebApp?.initData || "";
    if (v && v.length > 0) return v;
    await new Promise((r) => setTimeout(r, 80));
  }
  return "";
}
