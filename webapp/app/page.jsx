"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { apiGet, apiPost } from "@/lib/api";
import { tgReady } from "@/lib/tg";

/* ---------- helpers ---------- */

function fmtTime(msLeft) {
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

/* ---------- page ---------- */

export default function LotPage({ params }) {
  const router = useRouter();
  const lotId = params.id;

  const [lot, setLot] = useState(null);
  const [bids, setBids] = useState([]);
  const [err, setErr] = useState("");
  const [me, setMe] = useState({ id: null, name: "Ви" });

  const [toasts, setToasts] = useState([]);
  const toastId = useRef(0);

  const [outbid, setOutbid] = useState(false);
  const outbidTimer = useRef(null);

  const prevRef = useRef({ leaderUserId: null, topBidId: null });

  /* ---------- init ---------- */

  useEffect(() => {
    tgReady();

    const u = window?.Telegram?.WebApp?.initDataUnsafe?.user;
    if (u?.id) {
      setMe({
        id: String(u.id),
        name: u.username ? `@${u.username}` : u.first_name || "Ви",
      });
    }
  }, []);

  /* ---------- load ---------- */

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const r = await apiGet(`/lots/${lotId}`);
        if (!alive) return;

        if (r?.error) {
          setErr(`Помилка: ${r.error}`);
          return;
        }

        const nextLot = r?.lot || null;
        const nextBids = r?.bids || [];

        if (!nextLot) {
          setErr("Лот не знайдено.");
          return;
        }

        /* toast */
        const newTopBid = nextBids[0] || null;
        if (newTopBid?.id && newTopBid.id !== prevRef.current.topBidId) {
          const id = ++toastId.current;

          setToasts((t) =>
            [{ id, text: `${newTopBid.userName} поставив ₴${newTopBid.amount}` }, ...t].slice(0, 3)
          );

          setTimeout(
            () => setToasts((t) => t.filter((x) => x.id !== id)),
            2200
          );

          prevRef.current.topBidId = newTopBid.id;
        }

        /* outbid */
        const prevLeader = prevRef.current.leaderUserId;
        const newLeader = nextLot.leaderUserId;

        if (me?.id && prevLeader === me.id && newLeader !== me.id) {
          setOutbid(true);
          haptic("notification", "warning");
          haptic("impact", "heavy");

          clearTimeout(outbidTimer.current);
          outbidTimer.current = setTimeout(() => setOutbid(false), 2500);
        }

        prevRef.current.leaderUserId = newLeader;

        setLot(nextLot);
        setBids(nextBids);
        setErr("");
      } catch {
        setErr("Помилка з’єднання (API).");
      }
    }

    load();
    const t = setInterval(load, 1000);

    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [lotId, me?.id]);

  /* ---------- timer ---------- */

  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 300);
    return () => clearInterval(t);
  }, []);

  const msLeft = useMemo(() => {
    if (!lot?.endsAt) return 0;
    return new Date(lot.endsAt).getTime() - Date.now();
  }, [lot?.endsAt, tick]);

  const timeLeft = useMemo(() => fmtTime(msLeft), [msLeft]);

  /* ---------- bid ---------- */

  async function bid(amount) {
    setErr("");

    const r = await apiPost(`/lots/${lotId}/bid`, { amount });

    if (r?.error) {
      if (String(r.error).startsWith("MIN_BID_")) {
        setErr(`Мінімальна ставка: ₴${r.error.replace("MIN_BID_", "")}`);
      } else {
        setErr(`Помилка: ${r.error}`);
      }
      return;
    }

    haptic("notification", "success");
    haptic("impact", "medium");
  }

  /* ---------- back ---------- */

  function goBack() {
    router.push("/");
  }

  /* ---------- loading ---------- */

  if (!lot) {
    return (
      <div style={{ padding: 16, fontWeight: 900 }}>
        Завантаження…
      </div>
    );
  }

  const nextMin = lot.currentPrice + lot.bidStep;

  /* ---------- UI ---------- */

  return (
    <div style={{ fontFamily: "system-ui", color: "white" }}>

      {/* 🔙 BACK BUTTON */}
      <div
        style={{
          padding: "12px 14px",
          borderBottom: "1px solid #222",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <button
          onClick={goBack}
          style={{
            background: "transparent",
            border: "none",
            color: "white",
            fontSize: 16,
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          ← Назад
        </button>

        <div style={{ opacity: 0.7, fontWeight: 800 }}>
          Усі аукціони
        </div>
      </div>

      {/* CONTENT */}
      <div style={{ padding: 14 }}>

        {/* Title */}
        <div style={{ fontSize: 18, fontWeight: 900 }}>
          {lot.title}
        </div>

        {/* Image */}
        <img
          src={lot.imageUrl}
          alt={lot.title}
          style={{
            width: "100%",
            borderRadius: 14,
            marginTop: 10,
            border: "1px solid #333",
          }}
        />

        {/* Timer */}
        <div
          style={{
            marginTop: 10,
            fontSize: 22,
            fontWeight: 900,
            textAlign: "center",
          }}
        >
          {timeLeft}
        </div>

        {/* Price */}
        <div
          style={{
            marginTop: 10,
            background: "#111",
            borderRadius: 14,
            padding: 12,
          }}
        >
          <div>Поточна: ₴{lot.currentPrice}</div>
          <div>Крок: ₴{lot.bidStep}</div>
        </div>

        {/* Buttons */}
        <button
          onClick={() => bid(nextMin)}
          style={{
            marginTop: 12,
            width: "100%",
            padding: 14,
            borderRadius: 14,
            border: "1px solid #333",
            fontWeight: 900,
            fontSize: 16,
          }}
        >
          ЗРОБИТИ СТАВКУ ₴{nextMin}
        </button>

        {err && (
          <div style={{ marginTop: 10, color: "#ff4d4d", fontWeight: 800 }}>
            {err}
          </div>
        )}
      </div>
    </div>
  );
}
