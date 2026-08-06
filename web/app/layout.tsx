import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Eterix Screener — Copyability Score",
  description:
    "¿Esa wallet 'top' de Solana se puede copiar de verdad, o su PnL es arbitraje atómico imposible de replicar? Pegá la dirección y enterate.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
