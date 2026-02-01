const KEY = "hw_favorites_v1";

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export function getFavorites() {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(KEY);
  const arr = safeParse(raw);
  return Array.isArray(arr) ? arr : [];
}

export function isFavorite(id) {
  const fav = getFavorites();
  return fav.includes(String(id));
}

export function toggleFavorite(id) {
  if (typeof window === "undefined") return [];
  const lotId = String(id);
  const fav = getFavorites();
  const next = fav.includes(lotId) ? fav.filter((x) => x !== lotId) : [lotId, ...fav];
  window.localStorage.setItem(KEY, JSON.stringify(next.slice(0, 200))); // лимит на всякий
  return next;
}

export function clearFavorites() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}
