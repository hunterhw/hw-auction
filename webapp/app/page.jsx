"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/api";
import { tgReady } from "@/lib/tg";

/* =========================
   ✅ FAVORITES (localStorage)
========================= */
const FAV_KEY = "hw_favorites_v1";
const SND_KEY = "hw_sound_v1";

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
   SOUND (localStorage toggle)
========================= */
function getSoundEnabled() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SND_KEY) === "1";
}
function setSoundEnabled(v) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SND_KEY, v ? "1" : "0");
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

// ✅ tiny “casino” tick sound (WebAudio)
function playBidTick() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();

    o.type = "triangle";
    o.frequency.value = 820;

    g.gain.value = 0.0001;
    g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);

    o.connect(g);
    g.connect(ctx.destination);

    o.start();
    o.stop(ctx.currentTime + 0.13);

    o.onended = () => {
      try {
        ctx.close();
      } catch {}
    };
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

  // ✅ casino effects
  const [screenFlash, setScreenFlash] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const toastId = useRef(0);
  const [toasts, setToasts] = useState([]); // [{id, text}]

  useEffect(() => {
    tgReady();
    setFavIds(getFavorites());
    setSoundOn(getSoundEnabled());
  }, []);

  function pushToast(text) {
    const id = ++toastId.current;
    setToasts((t) => [{ id, text }, ...t].slice(0, 3));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2400);
  }

  useEffect(() => {
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

        // ✅ detect LIVE price changes -> flash + haptic + sound + toast + screen flash
        const nextFlash = {};
        let anyLivePriceChange = false;
        let firstChanged = null;

        for (const l of fixed) {
          const id = String(l.id);
          const prev = prevPricesRef.current[id];
          const cur = Number(l.currentPrice || 0);

          if (normalizeStatus(l.status) === "LIVE" && prev != null && prev !== cur) {
            nextFlash[id] = true;
            anyLivePriceChange = true;
            if (!firstChanged) firstChanged = l;
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
          // ✅ haptic + screen flash
          haptic("notification", "warning");
          haptic("impact", "heavy");

          setScreenFlash(true);
          setTimeout(() => setScreenFlash(false), 180);

          // ✅ sound (if enabled)
          if (soundOn) playBidTick();

          // ✅ toast
          if (firstChanged?.title) {
            pushToast(`⚡️ Нова ставка: ${firstChanged.title} — ₴${firstChanged.currentPrice}`);
          } else {
            pushToast("⚡️ Нова ставка в LIVE!");
          }
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
  }, [tab, soundOn]);

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
          background:
            radial-gradient(1100px 340px at 15% 0%, rgba(62,136,247,0.18), rgba(0,0,0,0) 60%),
            radial-gradient(900px 320px at 85% 0%, rgba(25,195,125,0.14), rgba(0,0,0,0) 55%),
            rgba(11,11,11,0.86);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-bottom: 1px solid rgba(255,255,255,0.10);
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
          animation: hwPulse 1.05s infinite;
        }
        @keyframes hwPulse {
          0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(25,195,125,0.55); }
          60% { transform: scale(1.05); box-shadow: 0 0 0 11px rgba(25,195,125,0); }
          100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(25,195,125,0); }
        }

        .hw-card {
          transition: transform 140ms ease, box-shadow 180ms ease, border-color 180ms ease;
          box-shadow: 0 10px 26px rgba(0,0,0,0.25);
        }
        .hw-card:active { transform: scale(0.985); }
        .hw-card:hover {
          transform: translateY(-1px);
          box-shadow: 0 14px 34px rgba(0,0,0,0.32);
          border-color: rgba(255,255,255,0.16);
        }
        .hw-chip { border: 1px solid rgba(255,255,255,0.12); background: rgba(17,17,17,0.8); }
        .hw-tab {
          border: 1px solid #2c2c2c;
          background: rgba(17,17,17,0.86);
          transition: transform 120ms ease, border-color 180ms ease, background 180ms ease;
        }
        .hw-tab:active { transform: scale(0.985); }
        .hw-thumb { border: 1px solid rgba(255,255,255,0.12); background: rgba(10,10,10,0.9); }

        .hw-flash { animation: hwFlash 650ms ease-out; }
        @keyframes hwFlash {
          0% { box-shadow: 0 0 0 rgba(255,255,255,0), 0 10px 26px rgba(0,0,0,0.25); border-color: rgba(255,255,255,0.10); }
          35% { box-shadow: 0 0 22px rgba(62,136,247,0.28), 0 16px 40px rgba(0,0,0,0.35); border-color: rgba(62,136,247,0.32); }
          100% { box-shadow: 0 10px 26px rgba(0,0,0,0.25); border-color: rgba(255,255,255,0.10); }
        }

        .hw-price-pop { animation: hwPricePop 520ms ease-out; }
        @keyframes hwPricePop {
          0% { transform: translateY(0); filter: brightness(1); }
          35% { transform: translateY(-1px) scale(1.03); filter: brightness(1.22); }
          100% { transform: translateY(0) scale(1); filter: brightness(1); }
        }

        .hw-mini-timer {
          margin-top: 6px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 900;
          opacity: 0.92;
          padding: 4px 8px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(0,0,0,0.35);
        }
        .hw-mini-timer.hot {
          border-color: rgba(255,77,77,0.28);
          background: rgba(255,77,77,0.14);
          animation: hwBlink 0.95s infinite;
        }
        @keyframes hwBlink {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.035); opacity: 0.78; }
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

        /* ✅ LIVE badge pulse too */
        .hw-badge-live {
          animation: hwBadgePulse 1.05s infinite;
          transform-origin: center;
        }
        @keyframes hwBadgePulse {
          0% { transform: scale(1); filter: brightness(1); box-shadow: 0 0 0 rgba(25,195,125,0); }
          55% { transform: scale(1.04); filter: brightness(1.12); box-shadow: 0 0 18px rgba(25,195,125,0.25); }
          100% { transform: scale(1); filter: brightness(1); box-shadow: 0 0 0 rgba(25,195,125,0); }
        }

        /* ✅ Screen flash on new bid */
        .hw-screen-flash {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 80;
          background:
            radial-gradient(900px 340px at 50% 30%, rgba(62,136,247,0.18), transparent 60%),
            radial-gradient(850px 340px at 50% 65%, rgba(25,195,125,0.12), transparent 55%),
            rgba(255,255,255,0.04);
          opacity: 0;
          transform: translateZ(0);
        }
        .hw-screen-flash.on { animation: hwScreenFlash 180ms ease-out; }
        @keyframes hwScreenFlash {
          0% { opacity: 0; }
          35% { opacity: 1; }
          100% { opacity: 0; }
        }

        /* ✅ Toasts */
        .hw-toasts {
          position: fixed;
          left: 12px;
          right: 12px;
          top: 76px;
          z-index: 90;
          display: grid;
          gap: 8px;
          pointer-events: none;
        }
        .hw-toast {
          max-width: 520px;
          margin: 0 auto;
          padding: 10px 12px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(0,0,0,0.70);
          backdrop-filter: blur(8px);
          font-weight: 900;
          font-size: 12px;
          animation: hwToastIn 240ms ease-out;
        }
        @keyframes hwToastIn {
          0% { transform: translateY(-6px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }

        /* ✅ Sound toggle pill */
        .hw-sound {
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(0,0,0,0.32);
          color: white;
          font-weight: 1000;
          font-size: 12px;
          padding: 7px 10px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .hw-sound:active { transform: scale(0.985); }

        @media (prefers-reduced-motion: reduce) {
          .hw-live-dot, .hw-badge-live, .hw-mini-timer.hot, .hw-flash, .hw-screen-flash.on { animation: none !important; }
        }
      `}</style>

      {/* ✅ Screen flash */}
      <div className={`hw-screen-flash ${screenFlash ? "on" : ""}`} />

      {/* ✅ Toasts */}
      {toasts.length > 0 && (
        <div className="hw-toasts" aria-live="polite" aria-atomic="true">
          {toasts.map((t) => (
            <div key={t.id} className="hw-toast">
              {t.text}
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <div className="hw-header">
        <div className="hw-title">
          <span className="hw-live-dot" />
          <span>ГОЛОВНА</span>
        </div>

        <div style={{ marginTop: 6, display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ opacity: 0.75, fontWeight: 800, fontSize: 12 }}>HW HUNTER AUCTION</div>

          <button
            className="hw-sound"
            onClick={() => {
              const next = !soundOn;
              setSoundOn(next);
              setSoundEnabled(next);
              // quick feedback
              haptic("impact", "light");
              if (next) playBidTick();
              pushToast(next ? "🔊 Звук увімкнено" : "🔇 Звук вимкнено");
            }}
            type="button"
          >
            <span style={{ opacity: 0.9 }}>{soundOn ? "🔊" : "🔇"}</span>
            <span>{soundOn ? "Sound ON" : "Sound OFF"}</span>
          </button>
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
            type="button"
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
            type="button"
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
            type="button"
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
            type="button"
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

            const isFlashing = !!flash[String(l.id)];

            return (
              <Link
                key={l.id}
                href={`/lot/${l.id}`}
                className={`hw-card ${isFlashing ? "hw-flash" : ""}`}
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
                    <span className={isFlashing ? "hw-price-pop" : ""}>₴{l.currentPrice}</span>
                    <span style={{ opacity: 0.65, fontWeight: 800 }}> / крок ₴{l.bidStep}</span>
                  </div>

                  {timerText && (
                    <div className={`hw-mini-timer ${endingSoon ? "hot" : ""}`}>
                      ⏱ {timerText}
                      {endingSoon && <span className="hw-hot-pill">🔥 HOT</span>}
                    </div>
                  )}

                  <div style={{ marginTop: 6, fontSize: 11, opacity: 0.7, fontWeight: 800 }}>
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
                    haptic("impact", "light");
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
                  type="button"
                >
                  {isFav ? "⭐" : "☆"}
                </button>

                {/* badge */}
                <div
                  className={badgeText === "LIVE" ? "hw-badge-live" : ""}
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

        <div style={{ marginTop: 18, opacity: 0.65, fontSize: 12, fontWeight: 800, textAlign: "center" }}>
          Порада: додай лоти в ⭐, щоб швидко стежити за боротьбою.
        </div>
      </div>
    </div>
  );
}
