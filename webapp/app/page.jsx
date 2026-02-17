"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/api";
import { tgReady } from "@/lib/tg";

/* =========================
   ✅ FAVORITES (localStorage)
========================= */
const FAV_KEY = "hw_favorites_v1";

function favSafeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function getFavorites() {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(FAV_KEY);
  const arr = favSafeParse(raw);
  return Array.isArray(arr) ? arr.map(String) : [];
}

function toggleFavorite(id) {
  if (typeof window === "undefined") return [];
  const lotId = String(id);
  const fav = getFavorites();
  const next = fav.includes(lotId) ? fav.filter((x) => x !== lotId) : [lotId, ...fav];
  window.localStorage.setItem(FAV_KEY, JSON.stringify(next.slice(0, 200)));
  return next;
}

/* =========================
   IMAGES
========================= */
function resolveImage(url) {
  if (!url) return null;

  // полный URL
  if (url.startsWith("http://") || url.startsWith("https://")) return url;

  // uploads с бэка (например: /uploads/xxx.jpg)
  if (url.startsWith("/uploads/")) {
    const base = process.env.NEXT_PUBLIC_API_BASE || "";
    return `${base}${url}`;
  }

  // все остальное (/bmw-sth.jpg) — это фронт (public)
  return url;
}

function statusBadge(status) {
  if (status === "LIVE") return { text: "LIVE", bg: "#19c37d" };
  if (status === "ENDED") return { text: "ЗАВЕРШЕНО", bg: "#777" };
  return { text: "СКОРО", bg: "#777" };
}

function normalizeStatus(s) {
  // на всякий случай, если придет SCHEDULED
  if (s === "SCHEDULED") return "SOON";
  return s;
}

export default function HomePage() {
  const [lots, setLots] = useState([]);
  const [err, setErr] = useState("");

  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("LIVE"); // LIVE | SOON | ENDED | FAV

  const [favIds, setFavIds] = useState([]);

  useEffect(() => {
    tgReady();
    // подтягиваем избранное один раз при старте
    setFavIds(getFavorites());

    let alive = true;

    async function load() {
      try {
        const r = await apiGet("/lots");
        if (!alive) return;

        if (r?.error) {
          setErr(String(r.error));
          setLots([]);
          return;
        }

        setErr("");
        const raw = Array.isArray(r?.lots) ? r.lots : [];
        // нормализуем статус
        const fixed = raw.map((x) => ({ ...x, status: normalizeStatus(x.status) }));
        setLots(fixed);
      } catch {
        setErr("Помилка з’єднання (API).");
      }
    }

    load();
    const t = setInterval(load, 2500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const counts = useMemo(() => {
    const c = { LIVE: 0, SOON: 0, ENDED: 0 };
    for (const l of lots) {
      const st = normalizeStatus(l.status);
      if (c[st] !== undefined) c[st]++;
    }
    return c;
  }, [lots]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const favSet = new Set(favIds.map(String));

    // сначала фильтр по вкладке
    let arr = lots;

    if (tab === "FAV") {
      arr = arr.filter((l) => favSet.has(String(l.id)));
    } else {
      arr = arr.filter((l) => normalizeStatus(l.status) === tab);
    }

    // поиск
    if (q) {
      arr = arr.filter((l) => String(l.title || "").toLowerCase().includes(q));
    }

    // сортировка:
    // LIVE — по endsAt ближе к завершению
    // SOON — по startsAt ближе к старту
    // ENDED — по endsAt новые сверху
    // FAV — как LIVE (по окончанию), чтобы удобнее было
    arr.sort((a, b) => {
      const aEnd = a?.endsAt ? new Date(a.endsAt).getTime() : 0;
      const bEnd = b?.endsAt ? new Date(b.endsAt).getTime() : 0;
      const aStart = a?.startsAt ? new Date(a.startsAt).getTime() : 0;
      const bStart = b?.startsAt ? new Date(b.startsAt).getTime() : 0;

      if (tab === "LIVE" || tab === "FAV") return aEnd - bEnd;
      if (tab === "SOON") return aStart - bStart;
      return bEnd - aEnd;
    });

    return arr;
  }, [lots, query, tab, favIds]);

  return (
    <div
      className="hw-root"
      style={{
        minHeight: "100vh",
        color: "white",
        backgroundImage:
          "linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.9)), url('/bg.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
      }}
    >
      <style jsx global>{`
        .hw-root * { box-sizing: border-box; }
        @keyframes hwGlow {
          0% { filter: drop-shadow(0 0 0 rgba(62,136,247,0.0)); }
          50% { filter: drop-shadow(0 0 18px rgba(62,136,247,0.22)); }
          100% { filter: drop-shadow(0 0 0 rgba(62,136,247,0.0)); }
        }
        @keyframes hwPulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.02); }
          100% { transform: scale(1); }
        }
        .hw-hero {
          position: sticky;
          top: 0;
          z-index: 50;
          background: rgba(11,11,11,0.9);
          backdrop-filter: blur(10px);
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .hw-title { animation: hwGlow 3.2s ease-in-out infinite; }
        .hw-card {
          transition: transform 140ms ease, box-shadow 220ms ease, border-color 220ms ease;
          box-shadow: 0 10px 26px rgba(0,0,0,0.28);
        }
        .hw-card:active { transform: scale(0.992); }
        @media (hover:hover) {
          .hw-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 16px 38px rgba(0,0,0,0.34);
            border-color: rgba(255,255,255,0.18);
          }
        }
        .hw-badge-live { animation: hwPulse 1.6s ease-in-out infinite; }
      `}</style>

      {/* Шапка */}
      <div className="hw-hero" style={{ padding: "14px 16px 12px", textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 10,
              background: "linear-gradient(135deg, rgba(62,136,247,0.9), rgba(25,195,125,0.85))",
              boxShadow: "0 10px 22px rgba(0,0,0,0.35)",
            }}
          />
          <div className="hw-title" style={{ fontWeight: 1000, fontSize: 18, letterSpacing: 0.6 }}>
            ГОЛОВНА
          </div>
        </div>

        <div style={{ marginTop: 4, opacity: 0.78, fontWeight: 900, fontSize: 12, letterSpacing: 0.9 }}>
          HW HUNTER AUCTION
        </div>

        {/* Поиск */}
        <div style={{ marginTop: 12 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Пошук лота..."
            style={{
              width: "100%",
              padding: "11px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(17,17,17,0.9)",
              color: "white",
              fontWeight: 800,
              outline: "none",
            }}
          />
        </div>

        {/* Tabs */}
        <div
          style={{
            marginTop: 10,
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr 1fr",
            gap: 8,
          }}
        >
          <button
            onClick={() => setTab("LIVE")}
            style={{
              padding: "10px 10px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.12)",
              background: tab === "LIVE" ? "rgba(25,195,125,0.22)" : "rgba(17,17,17,0.9)",
              color: "white",
              fontWeight: 1000,
            }}
          >
            LIVE ({counts.LIVE})
          </button>

          <button
            onClick={() => setTab("SOON")}
            style={{
              padding: "10px 10px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.12)",
              background: tab === "SOON" ? "rgba(160,160,160,0.18)" : "rgba(17,17,17,0.9)",
              color: "white",
              fontWeight: 1000,
            }}
          >
            СКОРО ({counts.SOON})
          </button>

          <button
            onClick={() => setTab("ENDED")}
            style={{
              padding: "10px 10px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.12)",
              background: tab === "ENDED" ? "rgba(160,160,160,0.18)" : "rgba(17,17,17,0.9)",
              color: "white",
              fontWeight: 1000,
            }}
          >
            ЗАВЕРШ. ({counts.ENDED})
          </button>

          <button
            onClick={() => setTab("FAV")}
            style={{
              padding: "10px 10px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.12)",
              background: tab === "FAV" ? "rgba(62,136,247,0.2)" : "rgba(17,17,17,0.9)",
              color: "white",
              fontWeight: 1000,
            }}
          >
            ⭐ Обране ({favIds.length})
          </button>
        </div>
      </div>

      <div style={{ padding: 16, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto" }}>
        {err && (
          <div
            style={{
              padding: 12,
              borderRadius: 12,
              border: "1px solid rgba(255,80,80,0.25)",
              background: "rgba(26,17,17,0.9)",
              color: "white",
              fontWeight: 900,
            }}
          >
            {err}
          </div>
        )}

        {/* мини-статы */}
        <div
          style={{
            marginTop: 12,
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 10,
          }}
        >
          <div style={{ border: "1px solid rgba(255,255,255,0.1)", background: "rgba(15,15,15,0.85)", borderRadius: 14, padding: 12 }}>
            <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 900 }}>LIVE зараз</div>
            <div style={{ marginTop: 4, fontWeight: 1000, fontSize: 18 }}>🔥 {counts.LIVE}</div>
          </div>
          <div style={{ border: "1px solid rgba(255,255,255,0.1)", background: "rgba(15,15,15,0.85)", borderRadius: 14, padding: 12 }}>
            <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 900 }}>Скоро старт</div>
            <div style={{ marginTop: 4, fontWeight: 1000, fontSize: 18 }}>⏱️ {counts.SOON}</div>
          </div>
          <div style={{ border: "1px solid rgba(255,255,255,0.1)", background: "rgba(15,15,15,0.85)", borderRadius: 14, padding: 12 }}>
            <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 900 }}>Завершено</div>
            <div style={{ marginTop: 4, fontWeight: 1000, fontSize: 18 }}>🏁 {counts.ENDED}</div>
          </div>
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          {filtered.map((l) => {
            const img = resolveImage(l.imageUrl);
            const badge = statusBadge(normalizeStatus(l.status));
            const isFav = favIds.includes(String(l.id));
            const isLive = normalizeStatus(l.status) === "LIVE";

            return (
              <Link
                key={l.id}
                href={`/lot/${l.id}`}
                className="hw-card"
                style={{
                  display: "grid",
                  gridTemplateColumns: "64px 1fr 40px auto",
                  gap: 12,
                  alignItems: "center",
                  padding: 12,
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(15,15,15,0.9)",
                  color: "white",
                  textDecoration: "none",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {isLive && (
                  <div
                    aria-hidden
                    style={{
                      position: "absolute",
                      inset: 0,
                      background:
                        "linear-gradient(115deg, rgba(25,195,125,0.0), rgba(25,195,125,0.08), rgba(62,136,247,0.0))",
                      opacity: 0.9,
                      pointerEvents: "none",
                    }}
                  />
                )}

                {/* thumbnail */}
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 12,
                    overflow: "hidden",
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "#111",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    position: "relative",
                  }}
                >
                  {img ? (
                    <img
                      src={img}
                      alt={l.title}
                      onError={(e) => {
                        try {
                          e.currentTarget.src = "/placeholder.jpg";
                        } catch {}
                      }}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 900 }}>NO IMG</div>
                  )}
                  {isLive && (
                    <div
                      style={{
                        position: "absolute",
                        left: 6,
                        bottom: 6,
                        padding: "3px 6px",
                        borderRadius: 999,
                        fontSize: 10,
                        fontWeight: 1000,
                        background: "rgba(0,0,0,0.55)",
                        border: "1px solid rgba(255,255,255,0.2)",
                      }}
                    >
                      🔥
                    </div>
                  )}
                </div>

                {/* title + price */}
                <div style={{ minWidth: 0, position: "relative" }}>
                  <div
                    style={{
                      fontWeight: 1000,
                      fontSize: 14,
                      lineHeight: 1.2,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {l.title}
                  </div>

                  <div style={{ marginTop: 6, opacity: 0.9, fontWeight: 1000 }}>
                    ₴{l.currentPrice}
                    <span style={{ opacity: 0.65, fontWeight: 900 }}> / крок ₴{l.bidStep}</span>
                  </div>
                </div>

                {/* ⭐ favorite */}
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const next = toggleFavorite(l.id);
                    setFavIds(next);
                  }}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(17,17,17,0.9)",
                    color: "white",
                    fontWeight: 1000,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    position: "relative",
                    zIndex: 2,
                  }}
                  aria-label="favorite"
                  title="Обране"
                >
                  {isFav ? "⭐" : "☆"}
                </button>

                {/* badge */}
                <div
                  className={isLive ? "hw-badge-live" : ""}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    background: badge.bg,
                    fontWeight: 1000,
                    fontSize: 12,
                    whiteSpace: "nowrap",
                    border: "1px solid rgba(255,255,255,0.14)",
                    position: "relative",
                    zIndex: 2,
                  }}
                >
                  {badge.text}
                </div>
              </Link>
            );
          })}

          {filtered.length === 0 && !err && (
            <div style={{ opacity: 0.7, fontWeight: 900, textAlign: "center", marginTop: 18 }}>
              {tab === "FAV" ? "Немає обраних лотів" : "Нічого не знайдено"}
            </div>
          )}
        </div>
      </div>
    </div>
  );

}
