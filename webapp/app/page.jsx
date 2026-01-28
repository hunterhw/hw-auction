"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet } from "../lib/api";
import { tgReady } from "../lib/tg";

export default function Page() {
  const [lots, setLots] = useState([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    tgReady();
    apiGet("/lots").then((r) => {
      if (r.error) setErr(r.error);
      else setLots(r.lots || []);
    });
  }, []);

  if (err) {
    const msg =
      err === "NOT_SUBSCRIBED"
        ? "Потрібна підписка на канал @hw_hunter_ua"
        : `Помилка: ${err}`;
    return <div style={{ padding: 16 }}>{msg}</div>;
  }

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto" }}>
      <div style={{ fontWeight: 1000, fontSize: 20, marginBottom: 10 }}>Живі аукціони</div>

      <div style={{ display: "grid", gap: 12 }}>
        {lots.map((l) => (
          <Link key={l.id} href={`/lot/${l.id}`} style={{ textDecoration: "none", color: "inherit" }}>
            <div style={{ border: "1px solid #2c2c2c", borderRadius: 14, padding: 12, background: "#0f0f0f" }}>
              <div style={{ fontWeight: 900, fontSize: 16 }}>{l.title}</div>
              <img
                src={l.imageUrl}
                alt={l.title}
                style={{ width: "100%", borderRadius: 12, marginTop: 10, border: "1px solid #333" }}
              />
              <div style={{ opacity: 0.85, marginTop: 10 }}>Поточна ставка: <b>₴{l.currentPrice}</b></div>
              <div style={{ opacity: 0.65, marginTop: 4 }}>
                Статус: {l.status === "LIVE" ? "Йде" : l.status === "ENDED" ? "Завершено" : "Скоро"}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
