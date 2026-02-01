"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/api";
import { tgReady } from "@/lib/tg";

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
  const [tab, setTab] = useState("LIVE"); // LIVE | SOON | ENDED

  useEffect(() => {
    tgReady();

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

    // сначала фильтр по вкладке
    let arr = lots.filter((l) => normalizeStatus(l.status) === tab);

    // поиск
    if (q) {
      arr = arr.filter((l) => String(l.title || "").toLowerCase().includes(q));
    }

    // сортировка:
    // LIVE — по endsAt ближе к завершению
    // SOON — по startsAt ближе к старту
    // ENDED — по endsAt новые сверху
    arr.sort((a, b) => {
      const aEnd = a?.endsAt ? new Date(a.endsAt).getTime() : 0;
      const bEnd = b?.endsAt ? new Date(b.endsAt).getTime() : 0;
      const aStart = a?.startsAt ? new Date(a.startsAt).getTime() : 0;
      const bStart = b?.startsAt ? new Date(b.startsAt).getTime() : 0;

      if (tab === "LIVE") return aEnd - bEnd;
      if (tab === "SOON") return aStart - bStart;
      return bEnd - aEnd;
    });

    return arr;
  }, [lots, query, tab]);

  return (
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
      {/* Шапка */}
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
        <div style={{ fontWeight: 1000, fontSize: 18, letterSpacing: 0.5 }}>
          ГОЛОВНА
        </div>
        <div style={{ marginTop: 4, opacity: 0.75, fontWeight: 800, fontSize: 12 }}>
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
            gridTemplateColumns: "1fr 1fr 1fr",
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

        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          {filtered.map((l) => {
            const img = resolveImage(l.imageUrl);
            const badge = statusBadge(normalizeStatus(l.status));

            return (
              <Link
                key={l.id}
                href={`/lot/${l.id}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "64px 1fr auto",
                  gap: 12,
                  alignItems: "center",
                  padding: 12,
                  borderRadius: 14,
                  border: "1px solid #2c2c2c",
                  background: "rgba(15,15,15,0.92)",
                  color: "white",
                  textDecoration: "none",
                }}
              >
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
                  }}
                >
                  {img ? (
                    <img
                      src={img}
                      alt={l.title}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 800 }}>
                      NO IMG
                    </div>
                  )}
                </div>

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

                  <div style={{ marginTop: 6, opacity: 0.85, fontWeight: 900 }}>
                    ₴{l.currentPrice}
                    <span style={{ opacity: 0.65, fontWeight: 800 }}>
                      {" "}
                      / крок ₴{l.bidStep}
                    </span>
                  </div>
                </div>

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
              Нічого не знайдено
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
