// app/layout.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

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

function NavLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl px-3 py-2 text-sm font-extrabold text-white/80 hover:text-white hover:bg-white/10 transition"
    >
      {label}
    </Link>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-[#0b1020]`}>
        {/* Top Nav (sticky) */}
        <header className="sticky top-0 z-50 border-b border-white/10 bg-black/30 backdrop-blur">
          <div className="mx-auto flex max-w-[1260px] items-center justify-between px-6 py-3">
            <Link href="/" className="text-white font-black tracking-tight">
              K League • Tactical
            </Link>

            <nav className="flex items-center gap-2">
              <NavLink href="/" label="Overview" />
              <NavLink href="/matchup" label="Matchup" />
              {/* 필요하면 추후 */}
              {/* <NavLink href="/teams" label="Teams" /> */}
            </nav>
          </div>
        </header>

        {/* Page */}
        {children}
      </body>
    </html>
  );
}
