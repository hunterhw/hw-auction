"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/api";
import { tgReady } from "@/lib/tg";

function fmtTime(msLeft) {
  const s = Math.max(0, Math.floor(msLeft / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function getStatusRank(status) {
  // меньше = выше в списке
  if (status === "LIVE") return 0;
  if (status === "SOON") return 1;
  if (status === "ENDED") return 2;
  return 3;
}

function getBadge(lot) {
  const status = lot?.status;
  if (status === "LIVE") return { text: "LIVE", bg: "#ff3b30", color: "#fff" };
  if (status === "ENDED") return { text: "ENDED", bg: "#2a2a2a", color: "#bbb" };
  return { text: "SOON", bg: "#1f1f1f", color: "#fff" };
}

export default function HomePage() {
  const [lots, setLots] = useState([]);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");

  // тик для таймеров
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    tgReady();

    async function load() {
      try {
        const r = await apiGet("/lots");
        if (r?.error) {
          setErr(String(r.error));
          return;
        }
        setLots(r?.lots || []);
        setErr("");
      } catch (e) {
        setErr("API load failed");
      }
    }

    load();
    // можно обновлять список реже, чтобы не нагружать (например раз в 2с)
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, []);

  const filteredAndSorted = useMemo(() => {
    const query = (q || "").trim().toLowerCase();

    const filtered = (lots || []).filter((l) => {
      if (!query) return true;
      return String(l?.title || "").toLowerCase().includes(query);
    });

    filtered.sort((a, b) => {
      const ra = getStatusRank(a?.status);
      const rb = getStatusRank(b?.status);
      if (ra !== rb) return ra - rb;

      // LIVE: кто раньше заканчивается — выше
      if (a?.status === "LIVE" || b?.status === "LIVE") {
        const aEnd = a?.endsAt ? new Date(a.endsAt).getTime() : Number.POSITIVE_INFINITY;
        const bEnd = b?.endsAt ? new Date(b.endsAt).getTime() : Number.POSITIVE_INFINITY;
        return aEnd - bEnd;
      }

      // остальные: по createdAt (свежие выше)
      const aCr = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bCr = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bCr - aCr;
    });

    return filtered;
  }, [lots, q]);

  return (
    <div style={{ padding: 16, fontFamily: "system-ui", color: "white" }}>
      {/* Заголовок по центру */}
      <div style={{ textAlign: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 26, fontWeight: 900 }}>Головна</div>
        <div style={{ marginTop: 6, fontSize: 14, opacity: 0.7, fontWeight: 800 }}>
          HW HUNTER AUCTION
        </div>
      </div>

      {/* Поиск */}
      <div style={{ marginBottom: 14, display: "flex", justifyContent: "center" }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Пошук лота…"
          style={{
            width: "100%",
            maxWidth: 520,
            padding: "12px 14px",
            borderRadius: 14,
            border: "1px solid #2a2a2a",
            background: "#0f0f0f",
            color: "white",
            outline: "none",
            fontWeight: 700,
          }}
        />
      </div>

      {/* Ошибки */}
      {err && (
        <div
          style={{
            marginBottom: 12,
            color: "#ff4d4d",
            fontWeight: 800,
            textAlign: "center",
          }}
        >
          {err}
        </div>
      )}

      {/* Лоты */}
      <div style={{ display: "grid", gap: 12 }}>
        {filteredAndSorted.map((lot) => {
          const badge = getBadge(lot);

          // таймер только для LIVE
          let timerText = "";
          let isHot = false;
          if (lot?.status === "LIVE" && lot?.endsAt) {
            const msLeft = new Date(lot.endsAt).getTime() - Date.now();
            timerText = fmtTime(msLeft);
            isHot = msLeft <= 10_000; // 🔥 если ≤ 10 сек
          }

          const step = Number(lot?.bidStep || 0);

          return (
            <Link key={lot.id} href={`/lot/${lot.id}`} style={{ textDecoration: "none", color: "inherit" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: 12,
                  borderRadius: 14,
                  background: "#121212",
                  border: "1px solid #2a2a2a",
                }}
              >
                {/* Картинка */}
                <img
                  src={lot.imageUrl}
                  alt={lot.title}
                  style={{
                    width: 66,
                    height: 66,
                    objectFit: "cover",
                    borderRadius: 12,
                    border: "1px solid #333",
                    flexShrink: 0,
                  }}
                />

                {/* Тексты */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* 1-я строка: название */}
                  <div
                    style={{
                      fontWeight: 900,
                      fontSize: 15,
                      marginBottom: 6,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {lot.title}
                  </div>

                  {/* 2-я строка: цена + крок */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 13, opacity: 0.9, fontWeight: 900 }}>
                      ₴{lot.currentPrice}
                    </div>

                    {!!step && (
                      <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 900 }}>
                        КРОК ₴{step}
                      </div>
                    )}
                  </div>

                  {/* 3-я строка: бейдж + таймер + hot */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                    <div
                      style={{
                        padding: "4px 8px",
                        borderRadius: 999,
                        background: badge.bg,
                        color: badge.color,
                        fontSize: 11,
                        fontWeight: 900,
                        letterSpacing: 0.5,
                      }}
                    >
                      {badge.text}
                    </div>

                    {timerText && (
                      <div
                        style={{
                          padding: "4px 8px",
                          borderRadius: 999,
                          background: isHot ? "rgba(255,59,48,0.20)" : "rgba(255,255,255,0.08)",
                          border: "1px solid rgba(255,255,255,0.12)",
                          fontSize: 11,
                          fontWeight: 900,
                          opacity: 0.95,
                        }}
                      >
                        {timerText}
                      </div>
                    )}

                    {isHot && (
                      <div
                        style={{
                          padding: "4px 8px",
                          borderRadius: 999,
                          background: "rgba(255, 149, 0, 0.18)",
                          border: "1px solid rgba(255, 149, 0, 0.25)",
                          fontSize: 11,
                          fontWeight: 900,
                        }}
                      >
                        🔥 HOT
                      </div>
                    )}
                  </div>
                </div>

                {/* стрелка */}
                <div style={{ fontSize: 18, opacity: 0.35, fontWeight: 900, flexShrink: 0 }}>→</div>
              </div>
            </Link>
          );
        })}

        {/* Если пусто */}
        {filteredAndSorted.length === 0 && !err && (
          <div style={{ textAlign: "center", opacity: 0.6, fontWeight: 800, marginTop: 10 }}>
            Немає лотів за запитом
          </div>
        )}
      </div>

      {/* чтобы tick не считался "unused" в некоторых линтерах */}
      <div style={{ display: "none" }}>{tick}</div>
    </div>
  );
}
