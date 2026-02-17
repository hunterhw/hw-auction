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

  // full URL
  if (url.startsWith("http://") || url.startsWith("https://")) return url;

  // uploads from backend (e.g. /uploads/xxx.jpg)
  if (url.startsWith("/uploads/")) {
    const base = process.env.NEXT_PUBLIC_API_BASE || "";
    return `${base}${url}`;
  }

  // everything else (/bmw-sth.jpg) — frontend public
  return url;
}

function statusBadge(status) {
  if (status === "LIVE") return { text: "LIVE", bg: "#19c37d" };
  if (status === "ENDED") return { text: "ЗАВЕРШЕНО", bg: "#777" };
  return { text: "СКОРО", bg: "#777" };
}

function normalizeStatus(s) {
  if (s === "SCHEDULED") return "SOON";
  return s;
}

function fmtLeft(msLeft) {
  const s = Math.max(0, Math.floor(msLeft / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export default function HomePage() {
  const [lots, setLots] = useState([]);
  const [err, setErr] = useState("");

  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("LIVE"); // LIVE | SOON | ENDED | FAV

  const [favIds, setFavIds] = useState([]);

  // ✅ tick for countdowns in list
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    tgReady();
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

    let arr = lots;

    if (tab === "FAV") {
      arr = arr.filter((l) => favSet.has(String(l.id)));
    } else {
      arr = arr.filter((l) => normalizeStatus(l.status) === tab);
    }

    if (q) {
      arr = arr.filter((l) => String(l.title || "").toLowerCase().includes(q));
    }

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
    <>
      <style>{`
        .hw-card {
          transition: transform 120ms ease, box-shadow 180ms ease, border-color 180ms ease;
          box-shadow: 0 10px 26px rgba(0,0,0,0.25);
        }
        .hw-card:active { transform: scale(0.995); }
        .hw-hot {
          position: relative;
          border-color: rgba(255,77,77,0.6) !important;
          box-shadow: 0 0 0 1px rgba(255,77,77,0.25), 0 16px 34px rgba(0,0,0,0.32);
          animation: hwPulse 900ms ease-in-out infinite;
        }
        @keyframes hwPulse {
          0% { transform: translateZ(0) scale(1); }
          50% { transform: translateZ(0) scale(1.01); }
          100% { transform: translateZ(0) scale(1); }
        }
      `}</style>

      <div
        style={{
          minHeight: "100vh",
          color: "white",
          backgroundImage:
            "linear-gradient(rgba(0,0,0,0.65), rgba(0,0,0,0.85)), url('/bg.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundAttachment: "fixed",
        }}
      >
        {/* Header */}
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 50,
            background: "rgba(11,11,11,0.92)",
            backdropFilter: "blur(8px)",
            borderBottom: "1px solid #222",
            padding: "14px 16px 12px",
            textAlign: "center",
          }}
        >
          <div style={{ fontWeight: 1000, fontSize: 18, letterSpacing: 0.5 }}>ГОЛОВНА</div>
          <div style={{ marginTop: 4, opacity: 0.75, fontWeight: 800, fontSize: 12 }}>
            HW HUNTER AUCTION
          </div>

          {/* Search */}
          <div style={{ marginTop: 12 }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Пошук лота..."
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #2c2c2c",
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
                border: "1px solid #2c2c2c",
                background: tab === "LIVE" ? "rgba(25,195,125,0.25)" : "rgba(17,17,17,0.9)",
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
                border: "1px solid #2c2c2c",
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
                border: "1px solid #2c2c2c",
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
                border: "1px solid #2c2c2c",
                background: tab === "FAV" ? "rgba(62,136,247,0.22)" : "rgba(17,17,17,0.9)",
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
                border: "1px solid #3a1f1f",
                background: "#1a1111",
                color: "white",
                fontWeight: 800,
              }}
            >
              {err}
            </div>
          )}

          {/* small helper hint */}
          <div style={{ marginTop: 10, opacity: 0.8, fontSize: 12, fontWeight: 800 }}>
            🔥 <span style={{ opacity: 0.9 }}>HOT</span> зʼявляється, коли до кінця аукціону менше 1 хвилини.
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {filtered.map((l) => {
              const img = resolveImage(l.imageUrl);
              const st = normalizeStatus(l.status);
              const badge = statusBadge(st);
              const isFav = favIds.includes(String(l.id));

              const endsMs = l?.endsAt ? new Date(l.endsAt).getTime() : 0;
              const left = endsMs ? endsMs - Date.now() : 0;
              const isHot = st === "LIVE" && left > 0 && left <= 60_000;
              const hotText = isHot ? `HOT ${fmtLeft(left)}` : "";

              return (
                <Link
                  key={l.id}
                  href={`/lot/${l.id}`}
                  className={`hw-card ${isHot ? "hw-hot" : ""}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "64px 1fr 40px auto",
                    gap: 12,
                    alignItems: "center",
                    padding: 12,
                    borderRadius: 14,
                    border: "1px solid #2c2c2c",
                    background: "rgba(15,15,15,0.92)",
                    color: "white",
                    textDecoration: "none",
                    overflow: "hidden",
                  }}
                >
                  {/* thumbnail */}
                  <div
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: 12,
                      overflow: "hidden",
                      border: "1px solid #333",
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
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        loading="lazy"
                      />
                    ) : (
                      <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 800 }}>NO IMG</div>
                    )}

                    {/* HOT chip */}
                    {isHot && (
                      <div
                        style={{
                          position: "absolute",
                          left: 6,
                          top: 6,
                          padding: "4px 6px",
                          borderRadius: 999,
                          background: "rgba(255,77,77,0.92)",
                          fontWeight: 1000,
                          fontSize: 10,
                          letterSpacing: 0.2,
                          border: "1px solid rgba(255,255,255,0.18)",
                        }}
                      >
                        {hotText}
                      </div>
                    )}
                  </div>

                  {/* title + price */}
                  <div style={{ minWidth: 0 }}>
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

                    <div style={{ marginTop: 6, opacity: 0.88, fontWeight: 900 }}>
                      ₴{l.currentPrice}
                      <span style={{ opacity: 0.65, fontWeight: 800 }}> / крок ₴{l.bidStep}</span>
                    </div>

                    {/* subtle time hint for LIVE */}
                    {st === "LIVE" && (
                      <div style={{ marginTop: 4, fontSize: 11, opacity: 0.75, fontWeight: 800 }}>
                        До кінця: {fmtLeft(left)}
                      </div>
                    )}
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
                      border: "1px solid #2c2c2c",
                      background: "rgba(17,17,17,0.9)",
                      color: "white",
                      fontWeight: 1000,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    aria-label="favorite"
                    title="Обране"
                  >
                    {isFav ? "⭐" : "☆"}
                  </button>

                  {/* badge */}
                  <div
                    style={{
                      padding: "6px 10px",
                      borderRadius: 999,
                      background: badge.bg,
                      fontWeight: 1000,
                      fontSize: 12,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {badge.text}
                  </div>
                </Link>
              );
            })}

            {filtered.length === 0 && !err && (
              <div style={{ opacity: 0.7, fontWeight: 800, textAlign: "center", marginTop: 18 }}>
                {tab === "FAV" ? "Немає обраних лотів" : "Нічого не знайдено"}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
