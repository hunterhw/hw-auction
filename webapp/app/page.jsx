"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

  // otherwise front public (/bmw.jpg etc)
  return url;
}

function fmtLeft(msLeft) {
  const s = Math.max(0, Math.floor(msLeft / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function haptic(type = "impact", style = "medium") {
  try {
    const H = window?.Telegram?.WebApp?.HapticFeedback;
    if (!H) return;
    if (type === "impact") H.impactOccurred(style);
    if (type === "notification") H.notificationOccurred(style);
  } catch {}
}

function statusBadge(status) {
  if (status === "LIVE") return { text: "LIVE", bg: "#19c37d" };
  if (status === "ENDED") return { text: "ЗАВЕРШЕНО", bg: "#7a7a7a" };
  return { text: "СКОРО", bg: "#808080" };
}

function normalizeStatus(s) {
  if (s === "SCHEDULED") return "SOON";
  return s;
}

export default function HomePage() {
  const [lots, setLots] = useState([]);
  const [err, setErr] = useState("");

  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("LIVE"); // LIVE | SOON | ENDED | FAV

  const [favIds, setFavIds] = useState([]);

  // ✅ track previous prices safely (no re-renders)
  const prevPricesRef = useRef({}); // { [lotId]: number }
  const [flash, setFlash] = useState({}); // { [lotId]: true }

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

        // ✅ detect LIVE price changes -> flash + haptic
        const nextFlash = {};
        let anyLivePriceChange = false;

        for (const l of fixed) {
          const id = String(l.id);
          const prev = prevPricesRef.current[id];
          const cur = Number(l.currentPrice || 0);

          if (normalizeStatus(l.status) === "LIVE" && prev != null && prev !== cur) {
            nextFlash[id] = true;
            anyLivePriceChange = true;
          }

          prevPricesRef.current[id] = cur;
        }

        if (Object.keys(nextFlash).length) {
          setFlash((old) => ({ ...old, ...nextFlash }));
          setTimeout(() => {
            setFlash((old) => {
              const copy = { ...old };
              for (const k of Object.keys(nextFlash)) delete copy[k];
              return copy;
            });
          }, 650);
        }

        if (anyLivePriceChange && tab === "LIVE") {
          haptic("notification", "warning");
          haptic("impact", "heavy");
        }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // ✅ mini timers on cards
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
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

    // sort
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

  const heroText = useMemo(() => {
    if (tab === "LIVE") return "Зараз йде боротьба — встигни забрати лот";
    if (tab === "SOON") return "Готуйся — скоро стартує";
    if (tab === "ENDED") return "Завершені — можна подивитись історію";
    return "Твої обрані лоти";
  }, [tab]);

  return (
    <div
      style={{
        minHeight: "100vh",
        color: "white",
        background:
          "radial-gradient(900px 480px at 20% -10%, rgba(62,136,247,0.25), transparent 60%)," +
          "radial-gradient(700px 420px at 85% 10%, rgba(25,195,125,0.22), transparent 55%)," +
          "linear-gradient(rgba(0,0,0,0.65), rgba(0,0,0,0.92))," +
          "url('/bg.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
      }}
    >
      {/* Global CSS */}
      <style>{`
        .hw-header {
  position: sticky;
  top: 0;
  z-index: 50;
  padding: 14px 16px 12px;
  text-align: center;

  border-bottom: 1px solid rgba(255,255,255,0.10);
  background:
    radial-gradient(900px 260px at 10% 0%, rgba(62,136,247,0.30), transparent 55%),
    radial-gradient(700px 260px at 90% 0%, rgba(25,195,125,0.24), transparent 60%),
    linear-gradient(180deg, rgba(10,10,10,0.92), rgba(10,10,10,0.78));
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);

  overflow: hidden;
}
.hw-header:before {
  content: "";
  position: absolute;
  inset: -40px -30px;
  background:
    radial-gradient(240px 140px at 25% 20%, rgba(62,136,247,0.22), transparent 60%),
    radial-gradient(220px 140px at 75% 30%, rgba(25,195,125,0.18), transparent 60%),
    linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent);
  transform: translateX(-25%) translateY(-6px);
  animation: hwSheen 7.5s linear infinite;
  pointer-events: none;
}
.hw-header:after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(255,255,255,0.06), transparent 40%, rgba(0,0,0,0.22));
  pointer-events: none;
}
@keyframes hwSheen {
  0% { transform: translateX(-25%) translateY(-6px); opacity: 0.65; }
  50% { transform: translateX(20%) translateY(4px); opacity: 0.85; }
  100% { transform: translateX(-25%) translateY(-6px); opacity: 0.65; }
}
        .hw-title {
          position: relative;
          font-weight: 1000;
          font-size: 18px;
          letter-spacing: 0.5px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .hw-live-dot {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: #19c37d;
          box-shadow: 0 0 0 rgba(25,195,125,0.6);
          animation: hwPulse 1.3s infinite;
        }
        @keyframes hwPulse {
          0% { box-shadow: 0 0 0 0 rgba(25,195,125,0.55); }
          70% { box-shadow: 0 0 0 10px rgba(25,195,125,0); }
          100% { box-shadow: 0 0 0 0 rgba(25,195,125,0); }
        }
        .hw-card {
          transition: transform 140ms ease, box-shadow 180ms ease, border-color 180ms ease;
          box-shadow: 0 10px 26px rgba(0,0,0,0.25);
        }
        .hw-card:active { transform: scale(0.985); }
        .hw-card:hover { transform: translateY(-1px); box-shadow: 0 14px 34px rgba(0,0,0,0.32); border-color: rgba(255,255,255,0.16); }
        .hw-chip { border: 1px solid rgba(255,255,255,0.12); background: rgba(17,17,17,0.8); }
        .hw-tab { border: 1px solid #2c2c2c; background: rgba(17,17,17,0.86); transition: transform 120ms ease, border-color 180ms ease, background 180ms ease; }
        .hw-tab:active { transform: scale(0.985); }
        .hw-thumb { border: 1px solid rgba(255,255,255,0.12); background: rgba(10,10,10,0.9); }

        .hw-flash { animation: hwFlash 650ms ease-out; }
        @keyframes hwFlash {
          0% { box-shadow: 0 0 0 rgba(255,255,255,0), 0 10px 26px rgba(0,0,0,0.25); border-color: rgba(255,255,255,0.10); }
          35% { box-shadow: 0 0 22px rgba(62,136,247,0.28), 0 16px 40px rgba(0,0,0,0.35); border-color: rgba(62,136,247,0.32); }
          100% { box-shadow: 0 10px 26px rgba(0,0,0,0.25); border-color: rgba(255,255,255,0.10); }
        }

        .hw-mini-timer {
          margin-top: 6px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 900;
          opacity: 0.9;
          padding: 4px 8px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(0,0,0,0.35);
        }
        .hw-mini-timer.hot {
          border-color: rgba(255,77,77,0.28);
          background: rgba(255,77,77,0.14);
          animation: hwBlink 1s infinite;
        }
        @keyframes hwBlink {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.03); opacity: 0.75; }
          100% { transform: scale(1); opacity: 1; }
        }
        .hw-hot-pill {
          margin-left: 8px;
          font-size: 10px;
          font-weight: 1000;
          padding: 3px 7px;
          border-radius: 999px;
          border: 1px solid rgba(255,77,77,0.28);
          background: rgba(255,77,77,0.14);
        }
      `}</style>

      {/* Header */}
      <div className="hw-header">
        <div className="hw-title">
          <span className="hw-live-dot" />
          <span>ГОЛОВНА</span>
        </div>
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
            className="hw-tab"
            style={{
              padding: "10px 10px",
              borderRadius: 12,
              color: "white",
              fontWeight: 1000,
              background: tab === "LIVE" ? "rgba(25,195,125,0.18)" : undefined,
            }}
          >
            LIVE ({counts.LIVE})
          </button>

          <button
            onClick={() => setTab("SOON")}
            className="hw-tab"
            style={{
              padding: "10px 10px",
              borderRadius: 12,
              color: "white",
              fontWeight: 1000,
              background: tab === "SOON" ? "rgba(160,160,160,0.16)" : undefined,
            }}
          >
            СКОРО ({counts.SOON})
          </button>

          <button
            onClick={() => setTab("ENDED")}
            className="hw-tab"
            style={{
              padding: "10px 10px",
              borderRadius: 12,
              color: "white",
              fontWeight: 1000,
              background: tab === "ENDED" ? "rgba(160,160,160,0.16)" : undefined,
            }}
          >
            ЗАВЕРШ. ({counts.ENDED})
          </button>

          <button
            onClick={() => setTab("FAV")}
            className="hw-tab"
            style={{
              padding: "10px 10px",
              borderRadius: 12,
              color: "white",
              fontWeight: 1000,
              background: tab === "FAV" ? "rgba(62,136,247,0.18)" : undefined,
            }}
          >
            ⭐ Обране ({favIds.length})
          </button>
        </div>
      </div>

      <div style={{ padding: 16, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto" }}>
        {/* Hero / hype bar */}
        <div
          className="hw-chip"
          style={{
            borderRadius: 16,
            padding: "12px 12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <div style={{ fontWeight: 1000, lineHeight: 1.25 }}>
            {heroText}
            <div style={{ marginTop: 4, opacity: 0.75, fontWeight: 800, fontSize: 12 }}>
              {tab === "LIVE"
                ? "Тисни на лот, роби ставку — і тримай темп."
                : "Перемикай вкладки та додавай в ⭐ обране."}
            </div>
          </div>

          <div
            style={{
              flexShrink: 0,
              padding: "8px 10px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.14)",
              background: tab === "LIVE" ? "rgba(25,195,125,0.18)" : "rgba(62,136,247,0.14)",
              fontWeight: 1000,
              fontSize: 12,
              whiteSpace: "nowrap",
            }}
          >
            {tab === "FAV" ? `⭐ ${favIds.length}` : `${filtered.length} лот(ів)`}
          </div>
        </div>

        {err && (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 14,
              border: "1px solid rgba(255,90,90,0.25)",
              background: "rgba(70,20,20,0.55)",
              color: "white",
              fontWeight: 900,
            }}
          >
            {err}
          </div>
        )}

        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          {filtered.map((l) => {
            const img = resolveImage(l.imageUrl);
            const badge = statusBadge(normalizeStatus(l.status));
            const isFav = favIds.includes(String(l.id));

            const endAtMs = l?.endsAt ? new Date(l.endsAt).getTime() : 0;
            const msLeft = endAtMs ? endAtMs - Date.now() : 0;
            const timerText =
              normalizeStatus(l.status) === "LIVE" ? fmtLeft(msLeft + (tick ? 0 : 0)) : null;

            const endingSoon = normalizeStatus(l.status) === "LIVE" && msLeft <= 120_000;

            const badgeText =
              badge.text === "LIVE" ? "LIVE" : badge.text === "ЗАВЕРШЕНО" ? "ЗАВЕРШЕНО" : "СКОРО";

            return (
              <Link
                key={l.id}
                href={`/lot/${l.id}`}
                className={`hw-card ${flash[String(l.id)] ? "hw-flash" : ""}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "72px 1fr 44px auto",
                  gap: 12,
                  alignItems: "center",
                  padding: 12,
                  borderRadius: 16,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background:
                    "linear-gradient(180deg, rgba(20,20,20,0.92), rgba(12,12,12,0.92))",
                  color: "white",
                  textDecoration: "none",
                }}
              >
                {/* thumbnail */}
                <div
                  className="hw-thumb"
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 14,
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
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
                    <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 900 }}>NO IMG</div>
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

                  <div style={{ marginTop: 6, opacity: 0.92, fontWeight: 1000 }}>
                    ₴{l.currentPrice}
                    <span style={{ opacity: 0.65, fontWeight: 800 }}> / крок ₴{l.bidStep}</span>
                  </div>

                  {timerText && (
                    <div className={`hw-mini-timer ${endingSoon ? "hot" : ""}`}>
                      ⏱ {timerText}
                      {endingSoon && <span className="hw-hot-pill">🔥 HOT</span>}
                    </div>
                  )}

                  {/* subtle time info */}
                  <div style={{ marginTop: 6, fontSize: 11, opacity: 0.70, fontWeight: 800 }}>
                    {normalizeStatus(l.status) === "LIVE" && timerText
                      ? `Залишилось: ${timerText}`
                      : l.endsAt
                        ? `Завершення: ${new Date(l.endsAt).toLocaleString()}`
                        : ""}
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
                    width: 40,
                    height: 40,
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: isFav ? "rgba(62,136,247,0.18)" : "rgba(17,17,17,0.88)",
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
                    padding: "7px 10px",
                    borderRadius: 999,
                    background: badge.bg,
                    fontWeight: 1000,
                    fontSize: 12,
                    whiteSpace: "nowrap",
                    border: "1px solid rgba(255,255,255,0.14)",
                  }}
                >
                  {badgeText}
                </div>
              </Link>
            );
          })}

          {filtered.length === 0 && !err && (
            <div style={{ opacity: 0.75, fontWeight: 900, textAlign: "center", marginTop: 18 }}>
              {tab === "FAV" ? "Немає обраних лотів" : "Нічого не знайдено"}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div style={{ marginTop: 18, opacity: 0.65, fontSize: 12, fontWeight: 800, textAlign: "center" }}>
          Порада: додай лоти в ⭐, щоб швидко стежити за боротьбою.
        </div>
      </div>
    </div>
  );
}
