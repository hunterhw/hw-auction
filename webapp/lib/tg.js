export function getInitData() {
  if (typeof window === "undefined") return "";
  return window?.Telegram?.WebApp?.initData || "";
}

export function tgReady() {
  if (typeof window === "undefined") return;
  window?.Telegram?.WebApp?.ready?.();
  window?.Telegram?.WebApp?.expand?.();
}

// Ждём, пока Telegram подставит initData (бывает, что оно появляется не мгновенно)
export async function waitForInitData(timeoutMs = 2500) {
  if (typeof window === "undefined") return "";

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const v = window?.Telegram?.WebApp?.initData || "";
    if (v && v.length > 0) return v;
    await new Promise((r) => setTimeout(r, 60));
  }
  return "";
}
