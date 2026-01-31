import Script from "next/script";

export const metadata = {
  title: "HW HUNTER Auction",
  description: "Telegram Mini App — Hot Wheels аукціон",
};

export default function RootLayout({ children }) {
  return (
    <html lang="uk">
      <head />
      <body style={{ margin: 0, background: "#0b0b0b", color: "white" }}>
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />

        <div style={{ padding: 12, background: "#ff00ff", color: "#000", fontWeight: 900 }}>
          VERSION: LAYOUT-999
        </div>

        {children}
      </body>
    </html>
  );
}
