import Script from "next/script";

export const metadata = {
  title: "HW HUNTER Auction",
  description: "Telegram Mini App — Hot Wheels аукціон",
};

export default function RootLayout({ children }) {
  return (
    <html lang="uk">
      <body style={{ margin: 0, background: "#0b0b0b", color: "white" }}>
        
        {/* Telegram SDK */}
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />

        {children}
      </body>
    </html>
  );
}
