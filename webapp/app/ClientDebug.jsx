"use client";

import { useEffect, useState } from "react";

export default function ClientDebug() {
  const [info, setInfo] = useState({
    href: "",
    hasTG: false,
    initLen: 0,
    userId: "",
  });

  useEffect(() => {
    const tg = window?.Telegram?.WebApp;
    const initData = tg?.initData || "";
    const userId = tg?.initDataUnsafe?.user?.id ? String(tg.initDataUnsafe.user.id) : "";

    setInfo({
      href: window.location.href,
      hasTG: !!tg,
      initLen: initData.length,
      userId,
    });
  }, []);

  return (
    <div
      style={{
        padding: 10,
        background: "#000",
        color: "#fff",
        fontSize: 12,
        borderBottom: "1px solid #222",
      }}
    >
      <div style={{ fontWeight: 800 }}>LAYOUT OK ✅</div>
      <div>href: {info.href || "-"}</div>
      <div>Telegram.WebApp: {info.hasTG ? "YES" : "NO"}</div>
      <div>initData length: {info.initLen}</div>
      <div>userId: {info.userId || "none"}</div>
    </div>
  );
}
