export function getInitData() {
  if (typeof window === "undefined") return "";
  return window?.Telegram?.WebApp?.initData || "";
}

export function tgReady() {
  if (typeof window === "undefined") return;
  window?.Telegram?.WebApp?.ready?.();
  window?.Telegram?.WebApp?.expand?.();
}
