"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
import { tgReady } from "@/lib/tg";


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

export default function LotPage({ params }) {
  const lotId = params.id;

  const [lot, setLot] = useState(null);
  const [bids, setBids] = useState([]);
  const [err, setErr] = useState("");
  const [me, setMe] = useState({ id: null, name: "Ви" });
  const [wsState, setWsState] = useState("init"); // init | connecting | open | closed | error


  const isDesktopView = useMemo(() => {
    if (typeof window === "undefined") return false;
    return !(
      window?.Telegram?.WebApp?.initData &&
      window.Telegram.WebApp.initData.length > 0
    );
  }, []);

  const [toasts, setToasts] = useState([]);
  const toastId = useRef(0);

  const [outbid, setOutbid] = useState(false);
  const outbidTimer = useRef(null);

  const wsUrl = process.env.NEXT_PUBLIC_WS_BASE;

  useEffect(() => {
    tgReady();
    const u = window?.Telegram?.WebApp?.initDataUnsafe?.user;
    if (u?.id) {
      setMe({
        id: String(u.id),
        name: u.username ? `@${u.username}` : (u.first_name || "Ви"),
      });
    }
  }, []);
const prevRef = useRef({ leaderUserId: null, topBidId: null });

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
      const nextBids = (r?.bids || r?.lot?.bids || []);

      if (!nextLot) {
        setErr("Лот не знайдено.");
        return;
      }

      // toast по новой ставке
      const newTopBid = nextBids[0] || null;
      if (newTopBid?.id && newTopBid.id !== prevRef.current.topBidId) {
        const id = ++toastId.current;
        const text = `${newTopBid.userName} поставив ₴${newTopBid.amount}`;
        setToasts((t) => [{ id, text }, ...t].slice(0, 3));
        setTimeout(() => {
          setToasts((t) => t.filter((x) => x.id !== id));
        }, 2200);

        prevRef.current.topBidId = newTopBid.id;
      }

      // если тебя перебили
      const prevLeader = prevRef.current.leaderUserId
        ? String(prevRef.current.leaderUserId)
        : null;
      const newLeader = nextLot.leaderUserId ? String(nextLot.leaderUserId) : null;

      if (me?.id && prevLeader === String(me.id) && newLeader && newLeader !== String(me.id)) {
        setOutbid(true);
        haptic("notification", "warning");
        haptic("impact", "heavy");

        if (outbidTimer.current) clearTimeout(outbidTimer.current);
        outbidTimer.current = setTimeout(() => setOutbid(false), 2500);
      }

      prevRef.current.leaderUserId = nextLot.leaderUserId || null;

      setLot(nextLot);
      setBids(nextBids);
      setErr("");
    } catch (e) {
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

  
  useEffect(() => {
    setErr("");
    setWsState("connecting");




ws.onclose = () => setWsState("closed");



    ws.onopen = () => ws.send(JSON.stringify({ type: "JOIN_LOT", lotId }));
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);

     

      if (msg.type === "BID_PLACED") {
        const prevLeader = lot?.leaderUserId ? String(lot.leaderUserId) : null;

        setLot(msg.lot);
        setBids((prev) => [msg.bid, ...prev].slice(0, 50));

        // toast
        const id = ++toastId.current;
        const text = `${msg.bid.userName} поставив ₴${msg.bid.amount}`;
        setToasts((t) => [{ id, text }, ...t].slice(0, 3));
        setTimeout(() => {
          setToasts((t) => t.filter((x) => x.id !== id));
        }, 2200);

        // outbid + haptic
        const newLeader = msg.lot?.leaderUserId
          ? String(msg.lot.leaderUserId)
          : null;

        if (
          me?.id &&
          prevLeader === String(me.id) &&
          newLeader &&
          newLeader !== String(me.id)
        ) {
          setOutbid(true);
          haptic("notification", "warning");
          haptic("impact", "heavy");

          if (outbidTimer.current) clearTimeout(outbidTimer.current);
          outbidTimer.current = setTimeout(() => setOutbid(false), 2500);
        }
      }
    };

    ws.onerror = () => setErr("Помилка з’єднання (WS).");
    return () => ws.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lotId, wsUrl, me?.id]);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 250);
    return () => clearInterval(t);
  }, []);

  const msLeft = useMemo(() => {
    if (!lot?.endsAt) return 0;
    return new Date(lot.endsAt).getTime() - Date.now();
  }, [lot?.endsAt, tick]);

  const timeLeft = useMemo(() => fmtTime(msLeft), [msLeft]);
  const isHot = msLeft <= 10_000;

  const myLeading = useMemo(() => {
    if (!lot?.leaderUserId || !me?.id) return false;
    return String(lot.leaderUserId) === String(me.id);
  }, [lot?.leaderUserId, me?.id]);

  const statusLabel = useMemo(() => {
    if (!lot) return "";
    if (lot.status === "ENDED") return "АУКЦІОН ЗАВЕРШЕНО";
    if (lot.status !== "LIVE") return "СКОРО СТАРТ";
    return myLeading ? "ВИ ВЕДЕТЕ" : "ЙДЕ БОРОТЬБА";
  }, [lot, myLeading]);

  const statusColor = useMemo(() => {
    if (!lot) return "#777";
    if (lot.status === "ENDED") return "#999";
    if (lot.status !== "LIVE") return "#777";
    return myLeading ? "#19c37d" : "#ff4d4d";
  }, [lot, myLeading]);

  async function bid(amount) {
    setErr("");
    const r = await apiPost(`/lots/${lotId}/bid`, { amount });

    if (r?.error) {
      if (String(r.error).startsWith("MIN_BID_")) {
        const min = String(r.error).replace("MIN_BID_", "");
        setErr(`Мінімальна наступна ставка: ₴${min}`);
      } else if (r.error === "NOT_SUBSCRIBED") {
        setErr("Потрібна підписка на канал @hw_hunter_ua");
      } else if (r.error === "BID_REQUIRES_TELEGRAM") {
        setErr("Ставки доступні лише з телефону в Telegram (Mini App).");
      } else {
        setErr(`Помилка: ${r.error}`);
      }
      return;
    }

    haptic("notification", "success");
    haptic("impact", "medium");
  }

  const nextMin = useMemo(() => {
    if (!lot) return 0;
    return lot.currentPrice + lot.bidStep;
  }, [lot]);

  function quickBid(delta) {
    const amount = nextMin + (delta - lot.bidStep);
    bid(amount);
  }

  const initLen =
    typeof window === "undefined"
      ? 0
      : (window?.Telegram?.WebApp?.initData || "").length;

  if (!lot) {
  return (
    <div style={{ padding: 16, fontFamily: "system-ui" }}>
      <div style={{ fontWeight: 900 }}>
        Завантаження... v-777
      </div>

      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
        WS URL: {wsUrl || "EMPTY"} <br />
        WS state: {wsState} <br />
        API: {process.env.NEXT_PUBLIC_API_BASE || "EMPTY"}
      </div>

      {err && (
        <div style={{ marginTop: 8, color: "#ff4d4d", fontWeight: 700 }}>
          {err}
        </div>
      )}
    </div>
  );
}



  return (
    <>
      <div style={{ fontSize: 12, opacity: 0.7, margin: "8px 14px 0" }}>
        initData: {initLen > 0 ? `OK (${initLen})` : "EMPTY"}
      </div>

      {isDesktopView && (
        <div
          style={{
            margin: "10px 14px 0",
            padding: "10px",
            background: "#111",
            borderRadius: "10px",
            color: "#fff",
            textAlign: "center",
            fontWeight: "bold",
          }}
        >
          Режим перегляду. Ставки доступні лише з телефону.
        </div>
      )}

      <div style={{ padding: 14, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>
  {lot.title} <span style={{ fontSize: 12, opacity: 0.6 }}>v-test-1</span>
</div>
          <div
            style={{
              padding: "6px 10px",
              borderRadius: 999,
              background: statusColor,
              color: "white",
              fontWeight: 800,
              fontSize: 12,
              whiteSpace: "nowrap",
            }}
          >
            {statusLabel}
          </div>
        </div>

        <div style={{ position: "relative", marginTop: 10 }}>
          <img
            src={lot.imageUrl}
            alt={lot.title}
            style={{ width: "100%", borderRadius: 14, border: "1px solid #333" }}
          />

          <div style={{ position: "absolute", left: 10, top: 10, display: "grid", gap: 8 }}>
            {toasts.map((t) => (
              <div
                key={t.id}
                style={{
                  background: "rgba(0,0,0,0.65)",
                  color: "white",
                  padding: "8px 10px",
                  borderRadius: 12,
                  fontWeight: 700,
                  fontSize: 12,
                  maxWidth: 260,
                }}
              >
                {t.text}
              </div>
            ))}
          </div>

          {outbid && (
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "55%",
                transform: "translate(-50%, -50%)",
                background: "rgba(255, 0, 0, 0.85)",
                color: "white",
                padding: "12px 14px",
                borderRadius: 14,
                fontWeight: 1000,
                fontSize: 16,
                letterSpacing: 1,
                border: "1px solid rgba(255,255,255,0.25)",
              }}
            >
              ТЕБЕ ПЕРЕБИЛИ
            </div>
          )}

          <div
            style={{
              position: "absolute",
              right: 10,
              top: 10,
              background: isHot ? "rgba(255,0,0,0.85)" : "rgba(0,0,0,0.65)",
              color: "white",
              padding: "10px 12px",
              borderRadius: 14,
              fontWeight: 900,
              fontSize: 18,
              letterSpacing: 1,
            }}
          >
            {timeLeft}
          </div>
        </div>

        <div
          style={{
            marginTop: 12,
            display: "grid",
            gap: 6,
            border: "1px solid #2c2c2c",
            borderRadius: 14,
            padding: 12,
            background: "#0f0f0f",
            color: "white",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div style={{ opacity: 0.8 }}>Поточна ставка</div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>₴{lot.currentPrice}</div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div style={{ opacity: 0.8 }}>Мін. наступна</div>
            <div style={{ fontWeight: 900 }}>₴{nextMin}</div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div style={{ opacity: 0.8 }}>Крок</div>
            <div style={{ fontWeight: 900 }}>₴{lot.bidStep}</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 12 }}>
          <button
            onClick={() => quickBid(10)}
            disabled={lot.status !== "LIVE" || isDesktopView}
            style={{ padding: "12px 10px", borderRadius: 14, border: "1px solid #333", fontWeight: 900 }}
          >
            +₴10
          </button>
          <button
            onClick={() => quickBid(20)}
            disabled={lot.status !== "LIVE" || isDesktopView}
            style={{ padding: "12px 10px", borderRadius: 14, border: "1px solid #333", fontWeight: 900 }}
          >
            +₴20
          </button>
          <button
            onClick={() => quickBid(50)}
            disabled={lot.status !== "LIVE" || isDesktopView}
            style={{ padding: "12px 10px", borderRadius: 14, border: "1px solid #333", fontWeight: 900 }}
          >
            +₴50
          </button>
        </div>

        <button
          onClick={() => bid(nextMin)}
          disabled={lot.status !== "LIVE" || isDesktopView}
          style={{
            marginTop: 10,
            width: "100%",
            padding: "14px 12px",
            borderRadius: 14,
            border: "1px solid #333",
            fontWeight: 1000,
            fontSize: 16,
          }}
        >
          ЗРОБИТИ СТАВКУ ₴{nextMin}
        </button>

        {err && <div style={{ marginTop: 10, color: "#ff4d4d", fontWeight: 700 }}>{err}</div>}

        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Історія ставок</div>
          <div style={{ display: "grid", gap: 8 }}>
            {bids.map((b) => (
              <div
                key={b.id}
                style={{
                  border: "1px solid #2c2c2c",
                  borderRadius: 14,
                  padding: 10,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div style={{ fontWeight: 800 }}>{b.userName}</div>
                <div style={{ fontWeight: 1000 }}>₴{b.amount}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
