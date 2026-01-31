export function tgReady() {
  try {
    const tg = window?.Telegram?.WebApp;
    tg?.ready?.();
    tg?.expand?.();
  } catch {}
}

// берём initData из #tgWebAppData
function readInitDataFromHash() {
  try {
    if (typeof window === "undefined") return "";

    const hash = window.location.hash || "";

    if (!hash.startsWith("#tgWebAppData=")) return "";

    const raw = hash.replace("#tgWebAppData=", "");
    const first = raw.split("&")[0];

    return decodeURIComponent(first);
  } catch {
    return "";
  }
}

export function getInitData() {
  if (typeof window === "undefined") return "";

  // 1. пробуем стандартный Telegram API
  const tg = window?.Telegram?.WebApp;
  const apiData = tg?.initData || "";

  if (apiData && apiData.length > 0) return apiData;

  // 2. fallback — берём из URL
  return readInitDataFromHash();
}

export async function waitForInitData(ms = 5000) {
  const start = Date.now();

  while (Date.now() - start < ms) {
    const d = getInitData();
    if (d && d.length > 0) return d;

    await new Promise((r) => setTimeout(r, 100));
  }

  return "";
}
