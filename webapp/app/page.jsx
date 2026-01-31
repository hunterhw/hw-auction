"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/api";
import { tgReady } from "@/lib/tg";

export default function HomePage() {
  const [lots, setLots] = useState([]);
  const [err, setErr] = useState("");

  const initLen =
    typeof window === "undefined" ? 0 : (window?.Telegram?.WebApp?.initData || "").length;

  const hashLen =
    typeof window === "undefined" ? 0 : (window?.location?.hash || "").length;

  const hasTG =
    typeof window === "undefined" ? false : !!window?.Telegram?.WebApp;

  useEffect(() => {
    tgReady();

    async function load() {
      try {
        const r = await apiGet("/lots");
        if (r?.error) return setErr(String(r.error));
        setLots(r?.lots || []);
        setErr("");
      } catch (e) {
        setErr("API load failed");
      }
    }

    load();
  }, []);

  return (
    <div style={{ padding: 16, fontFamily: "system-ui" }}>
      <div style={{ fontWeight: 900, fontSize: 18 }}>Головна</div>

      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
        hasTG: {String(hasTG)} <br />
        initDataLen: {initLen} <br />
        hashLen: {hashLen}
      </div>

      {err && (
        <div style={{ marginTop: 10, color: "#ff4d4d", fontWeight: 700 }}>
          {err}
        </div>
      )}

      <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
        {lots.map((l) => (
          <Link
            key={l.id}
            href={`/lot/${l.id}`}
            style={{
              padding: 12,
              borderRadius: 12,
              border: "1px solid #333",
              color: "white",
              textDecoration: "none",
              fontWeight: 800,
            }}
          >
            {l.title} — ₴{l.currentPrice}
          </Link>
        ))}
      </div>
    </div>
  );
}
