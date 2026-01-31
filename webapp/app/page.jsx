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

function getBadge(lot) {
  const status = lot?.status;
  if (status === "LIVE") return { text: "LIVE", bg: "#ff3b30", color: "#fff" };
  if (status === "ENDED") return { text: "ENDED", bg: "#2c2c2c", color: "#bbb" };
  return { text: "SOON", bg: "#1f1f1f", color: "#fff" };
}

export default function HomePage() {
  const [lots, setLots] = useState([]);
  const [err, setErr] = useState("");

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
  }, []);

  const sortedLots = useMemo(() => {
    const copy = [...(lots || [])];

    // сортировка: LIVE сверху, затем по endsAt (кто раньше заканчивается — выше)
    copy.sort((a, b) => {
      const aLive = a?.status === "LIVE";
      const bLive = b?.status === "LIVE";
      if (aLive !== bLive) return aLive ? -1 : 1;

      const aEnd = a?.endsAt ? new Date(a.endsAt).getTime() : Number.POSITIVE_INFINITY;
      const bEnd = b?.endsAt ? new Date(b.endsAt).getTime() : Number.POSITIVE_INFINITY;
      return aEnd - bEnd;
    });

    return copy;
  }, [lots]);

  return (
    <div
      style={{
        padding: 16,
        fontFamily: "system-ui",
        color: "white",
      }}
    >
      {/* Заголовок по центру */}
      <div style={{ textAlign: "center", marginBottom: 18 }}>
        <div style={{ fontSize: 26, fontWeight: 900 }}>Головна</div>
        <div style={{ marginTop: 6, fontSize: 14, opacity: 0.7, fontWeight: 800 }}>
          HW HUNTER AUCTION
        </div>
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
        {sortedLots.map((lot) => {
          const badge = getBadge(lot);

          // таймер только для LIVE и если есть endsAt
          let timerText = "";
          if (lot?.status === "LIVE" && lot?.endsAt) {
            const msLeft = new Date(lot.endsAt).getTime() - Date.now();
            timerText = fmtTime(msLeft);
          }

          return (
            <Link
              key={lot.id}
              href={`/lot/${lot.id}`}
              style={{ textDecoration: "none", color: "inherit" }}
            >
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
                    width: 64,
                    height: 64,
                    objectFit: "cover",
                    borderRadius: 10,
                    border: "1px solid #333",
                    flexShrink: 0,
                  }}
                />

                {/* Центр: название + цена */}
                <div style={{ flex: 1, minWidth: 0 }}>
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

                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ fontSize: 13, opacity: 0.9, fontWeight: 800 }}>
                      ₴{lot.currentPrice}
                    </div>

                    {/* Бейдж */}
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

                    {/* Таймер */}
                    {timerText && (
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 900,
                          opacity: 0.9,
                        }}
                      >
                        {timerText}
                      </div>
                    )}
                  </div>
                </div>

                {/* Стрелка */}
                <div style={{ fontSize: 18, opacity: 0.35, fontWeight: 900 }}>→</div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
