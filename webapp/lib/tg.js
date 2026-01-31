export function getInitData() {
  if (typeof window === "undefined") return "";

  // 1. Стандартный способ
  const tg = window?.Telegram?.WebApp;
  if (tg?.initData && tg.initData.length > 0) {
    return tg.initData;
  }

  // 2. Fallback из URL (#tgWebAppData=)
  try {
    const hash = window.location.hash;
    if (hash.includes("tgWebAppData=")) {
      const params = new URLSearchParams(hash.slice(1));
      const data = params.get("tgWebAppData");
      return data ? decodeURIComponent(data) : "";
    }
  } catch {}

  return "";
}

export async function waitForInitData(timeout = 5000) {
  const start = Date.now();

  return new Promise((resolve) => {
    const i = setInterval(() => {
      const d = getInitData();

      if (d) {
        clearInterval(i);
        resolve(d);
      }

      if (Date.now() - start > timeout) {
        clearInterval(i);
        resolve("");
      }
    }, 200);
  });
}

export function tgReady() {
  try {
    window?.Telegram?.WebApp?.ready();
    window?.Telegram?.WebApp?.expand();
  } catch {}
}
