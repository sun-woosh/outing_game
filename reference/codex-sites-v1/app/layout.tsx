import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./roulette.css";

export const metadata: Metadata = {
  title: "ALL IN MACAU | 2026 DT Outing",
  description: "2026 DT Outing 소수의 선택과 룰렛 팀 게임",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
