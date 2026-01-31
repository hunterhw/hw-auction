"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/api";
import { tgReady } from "@/lib/tg";

export default function HomePage() {
  const [lots, setLots] = useState([]);
  const [err, setErr] = useState("");

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

  return (
    <div
      style={{
        padding: 16,
        fontFamily: "system-ui",
        color: "white",
      }}
    >
      {/* Заголовок */}
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div
          style={{
            fontSize: 26,
            fontWeight: 900,
          }}
        >
          Головна
        </div>

        <div
          style={{
            marginTop: 6,
            fontSize: 14,
            opacity: 0.7,
            fontWeight: 700,
          }}
        >
          HW HUNTER AUCTION
        </div>
      </div>

      {/* Ошибки */}
      {err && (
        <div
          style={{
            marginBottom: 12,
            color: "#ff4d4d",
            fontWeight: 700,
            textAlign: "center",
          }}
        >
          {err}
        </div>
      )}

      {/* Лоты */}
      <div style={{ display: "grid", gap: 12 }}>
        {lots.map((lot) => (
          <Link
            key={lot.id}
            href={`/lot/${lot.id}`}
            style={{
              textDecoration: "none",
              color: "inherit",
            }}
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

              {/* Текст */}
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontWeight: 900,
                    fontSize: 15,
                    marginBottom: 4,
                  }}
                >
                  {lot.title}
                </div>

                <div
                  style={{
                    fontSize: 13,
                    opacity: 0.8,
                  }}
                >
                  ₴{lot.currentPrice}
                </div>
              </div>

              {/* Стрелка */}
              <div
                style={{
                  fontSize: 18,
                  opacity: 0.4,
                  fontWeight: 900,
                }}
              >
                →
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
