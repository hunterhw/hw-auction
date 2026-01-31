"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/api";
import { tgReady } from "@/lib/tg";

export default function HomePage() {
  const [lots, setLots] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const r = await apiGet("/lots");
      if (r?.error) {
        setErr(String(r.error));
        setLots([]);
      } else {
        setLots(r?.lots || []);
      }
    } catch (e) {
      setErr("Помилка з’єднання (API).");
      setLots([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    tgReady();
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      style={{
        padding: 16,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
        background: "#0b0b0b",
        minHeight: "100vh",
        color: "white",
      }}
    >
      {/* Header */}
      <div style={{ textAlign: "center", marginTop: 6 }}>
        <div style={{ fontWeight: 1000, fontSize: 20, letterSpacing: 0.2 }}>
          ГОЛОВНА
        </div>
        <div style={{ marginTop: 6, fontWeight: 900, opacity: 0.85 }}>
          HW HUNTER AUCTION
        </div>
      </div>

      {/* Error */}
      {err && (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: 12,
            border: "1px solid #3a1f1f",
            background: "#1a1111",
            color: "white",
          }}
        >
          <div style={{ fontWeight: 900 }}>Помилка</div>
          <div style={{ marginTop: 6, opacity: 0.9 }}>{err}</div>

          <button
            onClick={load}
            style={{
              marginTop: 10,
              width: "100%",
              padding: "12px 12px",
              borderRadius: 12,
              border: "1px solid #333",
              fontWeight: 900,
              background: "#111",
              color: "white",
            }}
          >
            ОНОВИТИ
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && !err && (
        <div style={{ marginTop: 18, opacity: 0.8, textAlign: "center" }}>
          Завантаження...
        </div>
      )}

      {/* Lots list */}
      <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
        {!loading && !err && lots.length === 0 && (
          <div style={{ opacity: 0.8, textAlign: "center", marginTop: 10 }}>
            Немає активних лотів.
          </div>
        )}

        {lots.map((l) => (
          <Link
            key={l.id}
            href={`/lot/${l.id}`}
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              padding: 12,
              borderRadius: 14,
              border: "1px solid #2c2c2c",
              background: "#111",
              color: "white",
              textDecoration: "none",
            }}
          >
            {/* small image */}
            <div
              style={{
                width: 54,
                height: 54,
                borderRadius: 12,
                overflow: "hidden",
                border: "1px solid #333",
                background: "#0f0f0f",
                flex: "0 0 auto",
              }}
            >
              <img
                src={l.imageUrl}
                alt={l.title}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </div>

            {/* text */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 900, fontSize: 14, lineHeight: 1.2 }}>
                {l.title}
              </div>
              <div style={{ marginTop: 6, display: "flex", gap: 10, opacity: 0.9 }}>
                <div style={{ fontWeight: 900 }}>₴{l.currentPrice}</div>
                <div style={{ opacity: 0.7 }}>крок ₴{l.bidStep}</div>
                <div style={{ opacity: 0.7 }}>{l.status === "LIVE" ? "LIVE" : l.status}</div>
              </div>
            </div>

            <div style={{ opacity: 0.6, fontWeight: 900 }}>›</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
