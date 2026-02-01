"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/api";
import { tgReady } from "@/lib/tg";

function joinUrl(base, path) {
  if (!base) return path;
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

function resolveImage(url) {
  if (!url) return null;

  // уже полный URL
  if (url.startsWith("http://") || url.startsWith("https://")) return url;

  // картинки из бекенда (uploads)
  if (url.startsWith("/uploads/")) {
    const base = process.env.NEXT_PUBLIC_API_BASE || "";
    return joinUrl(base, url);
  }

  // всё остальное (например "/bmw-sth.jpg") — из фронта (public)
  return url;
}

function statusBadge(status) {
  if (status === "LIVE") return { text: "LIVE", bg: "#19c37d" };
  if (status === "ENDED") return { text: "ЗАВЕРШЕНО", bg: "#777" };
  return { text: "СКОРО", bg: "#777" };
}

export default function HomePage() {
  const [lots, setLots] = useState([]);
  const [err, setErr] = useState("");

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
        setLots(Array.isArray(r?.lots) ? r.lots : []);
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

  const sortedLots = useMemo(() => {
    const copy = [...lots];
    const rank = (s) => (s === "LIVE" ? 0 : s === "SOON" ? 1 : 2);
    copy.sort((a, b) => rank(a.status) - rank(b.status));
    return copy;
  }, [lots]);

  return (
    <div
      style={{
        minHeight: "100vh",
        color: "white",
        backgroundImage:
          "linear-gradient(rgba(0,0,0,0.65), rgba(0,0,0,0.88)), url('/bg.jpg')",
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
          background: "rgba(10,10,10,0.75)",
          backdropFilter: "blur(10px)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
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
      </div>

      <div style={{ padding: 16, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto" }}>
        {err && (
          <div
            style={{
              padding: 12,
              borderRadius: 12,
              border: "1px solid #3a1f1f",
              background: "rgba(26,17,17,0.85)",
              color: "white",
              fontWeight: 800,
            }}
          >
            {err}
          </div>
        )}

        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          {sortedLots.map((l) => {
            const img = resolveImage(l.imageUrl);
            const badge = statusBadge(l.status);

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
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(15,15,15,0.82)",
                  backdropFilter: "blur(6px)",
                  color: "white",
                  textDecoration: "none",
                }}
              >
                {/* thumbnail */}
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 12,
                    overflow: "hidden",
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(17,17,17,0.9)",
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
                      onError={(e) => {
                        // если битая ссылка — показываем "NO IMG"
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  ) : (
                    <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 800 }}>NO IMG</div>
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
                  <div style={{ marginTop: 6, opacity: 0.9, fontWeight: 900 }}>
                    ₴{l.currentPrice}
                    <span style={{ opacity: 0.65, fontWeight: 800 }}> / крок ₴{l.bidStep}</span>
                  </div>
                </div>

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

          {sortedLots.length === 0 && !err && (
            <div style={{ opacity: 0.7, fontWeight: 800, textAlign: "center", marginTop: 18 }}>
              Немає активних лотів
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
