"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";

export default function AdminPage() {
  const [lots, setLots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // форма
  const [title, setTitle] = useState("BMW STH Stranger Things");
  const [imageUrl, setImageUrl] = useState("/bmw-sth.jpg"); // файл должен лежать в webapp/public
  const [startPrice, setStartPrice] = useState(80);
  const [bidStep, setBidStep] = useState(10);
  const [durationMin, setDurationMin] = useState(60);

  async function loadLots() {
    setErr("");
    setLoading(true);
    try {
      const r = await apiGet("/lots");
      if (r?.error) {
        setErr(String(r.error));
        setLots([]);
      } else {
        setLots(r?.lots || []);
      }
    } catch (e) {
      setErr("API load failed");
      setLots([]);
    } finally {
      setLoading(false);
    }
  }

  async function createLot() {
    setErr("");
    setLoading(true);
    try {
      // простая защита (чтобы не светить админку всем)
      // поставь в webapp .env: NEXT_PUBLIC_ADMIN_KEY=...
      const adminKey = process.env.NEXT_PUBLIC_ADMIN_KEY;

      const body = {
        title,
        imageUrl,
        startPrice: Number(startPrice),
        bidStep: Number(bidStep),
        durationMin: Number(durationMin),
      };

      const r = await apiPost("/admin/lots", {
        ...body,
        adminKey: adminKey || "",
      });

      if (r?.error) {
        setErr(String(r.error));
      } else {
        await loadLots();
      }
    } catch (e) {
      setErr("Create lot failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLots();
  }, []);

  return (
    <div
      style={{
        padding: 16,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
        color: "white",
        background: "#0b0b0b",
        minHeight: "100vh",
      }}
    >
      <div style={{ textAlign: "center", marginTop: 8 }}>
        <div style={{ fontWeight: 1000, fontSize: 18 }}>HW HUNTER AUCTION</div>
        <div style={{ opacity: 0.7, marginTop: 4, fontWeight: 800 }}>ADMIN MENU</div>
      </div>

      {/* форма */}
      <div
        style={{
          marginTop: 16,
          border: "1px solid #222",
          background: "#0f0f0f",
          borderRadius: 14,
          padding: 14,
        }}
      >
        <div style={{ fontWeight: 1000, marginBottom: 10 }}>Створити лот</div>

        <Field label="Назва">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={inputStyle}
            placeholder="Назва лоту"
          />
        </Field>

        <Field label="Image URL (наприклад /bmw-sth.jpg)">
          <input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            style={inputStyle}
            placeholder="/image.jpg"
          />
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
            Якщо пишеш <b>/bmw-sth.jpg</b> — файл має бути в <b>webapp/public</b>
          </div>
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Стартова ціна">
            <input
              type="number"
              value={startPrice}
              onChange={(e) => setStartPrice(e.target.value)}
              style={inputStyle}
            />
          </Field>

          <Field label="Крок ставки">
            <input
              type="number"
              value={bidStep}
              onChange={(e) => setBidStep(e.target.value)}
              style={inputStyle}
            />
          </Field>
        </div>

        <Field label="Тривалість (хв)">
          <input
            type="number"
            value={durationMin}
            onChange={(e) => setDurationMin(e.target.value)}
            style={inputStyle}
          />
        </Field>

        <button
          onClick={createLot}
          disabled={loading}
          style={{
            width: "100%",
            marginTop: 10,
            padding: "12px 12px",
            borderRadius: 12,
            border: "1px solid #333",
            fontWeight: 1000,
            background: "#3e88f7",
            color: "white",
          }}
        >
          {loading ? "..." : "СТВОРИТИ ЛОТ"}
        </button>

        {err && (
          <div style={{ marginTop: 10, color: "#ff4d4d", fontWeight: 800 }}>
            {err}
          </div>
        )}
      </div>

      {/* список */}
      <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
        <button
          onClick={loadLots}
          disabled={loading}
          style={{
            flex: 1,
            padding: "12px 12px",
            borderRadius: 12,
            border: "1px solid #333",
            fontWeight: 1000,
            background: "#111",
            color: "white",
          }}
        >
          {loading ? "..." : "ОНОВИТИ СПИСОК"}
        </button>
      </div>

      <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
        {lots.map((l) => (
          <div
            key={l.id}
            style={{
              border: "1px solid #222",
              background: "#0f0f0f",
              borderRadius: 14,
              padding: 12,
              display: "flex",
              gap: 12,
              alignItems: "center",
            }}
          >
            <div
              style={{
                width: 54,
                height: 54,
                borderRadius: 12,
                overflow: "hidden",
                border: "1px solid #333",
                background: "#000",
                flexShrink: 0,
              }}
            >
              {/* превью */}
              <img
                src={l.imageUrl || "/placeholder.jpg"}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            </div>

            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 1000, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {l.title}
              </div>
              <div style={{ opacity: 0.75, fontWeight: 800, marginTop: 2 }}>
                ₴{l.currentPrice} • step ₴{l.bidStep} • {l.status}
              </div>
              <div style={{ opacity: 0.55, fontSize: 12, marginTop: 2 }}>
                id: {l.id}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6, fontWeight: 800 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "12px 12px",
  borderRadius: 12,
  border: "1px solid #333",
  background: "#0b0b0b",
  color: "white",
  outline: "none",
  fontWeight: 800,
};

