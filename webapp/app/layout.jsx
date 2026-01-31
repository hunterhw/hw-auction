export const metadata = {
  title: "HW HUNTER Auction",
  description: "Telegram Mini App — Hot Wheels аукціон",
};

export default function RootLayout({ children }) {
  return (
    <html lang="uk">
      <head>
        {/* Telegram Mini App SDK */}
        <script src="https://telegram.org/js/telegram-web-app.js"></script>
      </head>

      <body style={{ margin: 0, background: "#0b0b0b", color: "white" }}>
        {children}
      </body>
    </html>
  );
}
