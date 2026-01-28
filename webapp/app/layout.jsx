export const metadata = {
  title: "HW HUNTER Auction",
  description: "Telegram Mini App — Hot Wheels аукціон"
};

export default function RootLayout({ children }) {
  return (
    <html lang="uk">
      <body style={{ margin: 0, background: "#0b0b0b", color: "white" }}>
        {children}
      </body>
    </html>
  );
}
