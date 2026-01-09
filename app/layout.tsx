// app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// ✅ 전역 상단바: 전체 메뉴 TopNav를 레이아웃에서 항상 렌더
import TopNav from "./components/TopNav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "K League • Tactical",
  description: "TSS / SGP / PTI Tactical Analysis",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-[#0b1020]`}
      >
        {/* ✅ 항상 동일한 전체 메뉴 바 */}
        <TopNav />

        {/* Page */}
        {children}
      </body>
    </html>
  );
}