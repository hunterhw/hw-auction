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

  // otherwise front public (/bmw.jpg etc)
  return url;
}

function fmtLeft(msLeft) {
  const s = Math.max(0, Math.floor(msLeft / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function statusBadge(status) {
  if (status === "LIVE") return { text: "LIVE", bg: "#19c37d" };
  if (status === "ENDED") return { text: "ЗАВЕРШЕНО", bg: "#7a7a7a" };
  return { text: "СКОРО", bg: "#808080" };
}

function normalizeStatus(s) {
  // keep your tab naming logic
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
    if (tab === "LIVE") return "Зараз йде боротьба — встигни забрати лот 🔥";
    if (tab === "SOON") return "Готуйся — скоро стартує 🚀";
    if (tab === "ENDED") return "Завершені — можна подивитись історію 🏁";
    return "Твої обрані лоти ⭐";
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
      {/* Global CSS (plain style tag, not styled-jsx) */}
      <style>{`
        .hw-header {
          position: sticky;
          top: 0;
          z-index: 50;
          background: rgba(11,11,11,0.88);
          backdrop-filter: blur(10px);
          border-bottom: 1px solid #222;
          padding: 14px 16px 12px;
          text-align: center;
        }
        .hw-title {
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
        .hw-chip {
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(17,17,17,0.8);
        }
        .hw-tab {
          border: 1px solid #2c2c2c;
          background: rgba(17,17,17,0.86);
          transition: transform 120ms ease, border-color 180ms ease, background 180ms ease;
        }
        .hw-tab:active { transform: scale(0.985); }
        .hw-thumb {
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(10,10,10,0.9);
        }
      
        .hw-dot{
          width:8px;height:8px;border-radius:999px;
          display:inline-block;
          margin-right:6px;
          background: currentColor;
          box-shadow: 0 0 0 0 rgba(255,255,255,0.0);
          animation: hwPulse 1.15s infinite;
        }
        @keyframes hwPulse{
          0%{ transform: scale(0.85); opacity: .75; box-shadow: 0 0 0 0 rgba(255,255,255,0.0); }
          60%{ transform: scale(1.05); opacity: 1; box-shadow: 0 0 0 10px rgba(255,255,255,0.0); }
          100%{ transform: scale(0.85); opacity: .75; box-shadow: 0 0 0 0 rgba(255,255,255,0.0); }
        }

        .hw-progress{
          grid-column: 1 / -1;
          height: 6px;
          border-radius: 999px;
          background: rgba(255,255,255,0.08);
          overflow: hidden;
          border: 1px solid rgba(255,255,255,0.10);
          margin-top: 10px;
        }
        .hw-progress > i{
          display:block;
          height:100%;
          width: var(--p, 0%);
          background: var(--c, rgba(255,255,255,0.45));
          border-radius: 999px;
          transition: width 350ms ease;
          position: relative;
        }
        .hw-progress > i:after{
          content:"";
          position:absolute; inset:0;
          background: linear-gradient(90deg, rgba(255,255,255,0.00), rgba(255,255,255,0.22), rgba(255,255,255,0.00));
          transform: translateX(-60%);
          animation: hwShine 1.6s infinite;
        }
        @keyframes hwShine{
          0%{ transform: translateX(-60%); }
          100%{ transform: translateX(160%); }
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
              {tab === "LIVE" ? "Тисни на лот, роби ставку — і тримай темп." : "Перемикай вкладки та додавай в ⭐ обране."}
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
            const stNorm = normalizeStatus(l.status);
            const isLive = stNorm === "LIVE";

            const isFav = favIds.includes(String(l.id));
            const now = Date.now();
            const startMs = l?.startsAt ? new Date(l.startsAt).getTime() : 0;
            const endMs = l?.endsAt ? new Date(l.endsAt).getTime() : 0;
            const durMs = Math.max(1, endMs - startMs);
            const leftMs = Math.max(0, endMs - now);
            const pctLeft = Math.max(0, Math.min(1, leftMs / durMs));
            const barP = `${Math.round(pctLeft * 100)}%`;
            const barC =
              normalizeStatus(l.status) === "LIVE"
                ? "rgba(25,195,125,0.85)"
                : normalizeStatus(l.status) === "SOON"
                  ? "rgba(255,255,255,0.35)"
                  : "rgba(255,255,255,0.20)";


            const endMs = l?.endsAt ? new Date(l.endsAt).getTime() : 0;
            const msLeft = endMs ? endMs - Date.now() : 0;
            const endingSoon = normalizeStatus(l.status) === "LIVE" && msLeft <= 120_000; // 2 хв
            const timerText = normalizeStatus(l.status) === "LIVE" ? fmtLeft(msLeft + (tick ? 0 : 0)) : null;

            const badgeText =
              badge.text === "LIVE" ? "🔥 LIVE" : badge.text === "ЗАВЕРШЕНО" ? "🏁 ЗАВЕРШЕНО" : "⏳ СКОРО";

            return (
              <Link
                key={l.id}
                href={`/lot/${l.id}`}
                className="hw-card"
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

                  {/* subtle time info */}
                  <div style={{ marginTop: 6, fontSize: 11, opacity: 0.70, fontWeight: 800 }}>
                    {l.endsAt ? `Завершення: ${new Date(l.endsAt).toLocaleString()}` : ""}
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
                  {isLive ? <span className="hw-dot" /> : null}{badgeText}
                </div>
              
                {/* progress */}
                <div className="hw-progress" aria-hidden="true">
                  <i style={{ "--p": barP, "--c": barC }} />
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
