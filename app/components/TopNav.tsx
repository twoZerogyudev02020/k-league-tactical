"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

export default function TopNav() {
  const pathname = usePathname() || "/";

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const linkStyle = (href: string): React.CSSProperties => {
    const active = isActive(href);
    return {
      padding: "10px 14px",
      borderRadius: 999,
      border: active
        ? "1px solid rgba(255,255,255,0.45)"
        : "1px solid rgba(255,255,255,0.18)",
      background: active
        ? "rgba(255,255,255,0.18)"
        : "rgba(255,255,255,0.08)",
      color: "rgba(255,255,255,0.95)",
      fontWeight: 900,
      textDecoration: "none",
      fontSize: 12,
      display: "inline-flex",
      alignItems: "center",
      whiteSpace: "nowrap",
      transition: "all 0.15s ease",
    };
  };

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        background:
          "linear-gradient(180deg, rgba(0,0,0,0.92), rgba(0,0,0,0.75))",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
      }}
    >
      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          padding: "14px 22px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        {/* 🔥 K LEAGUE 로고 + 타이틀 */}
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          <Image
            src="/brand/kleague.png"
            alt="K LEAGUE"
            width={110}
            height={28}
            priority
          />
          <span
            style={{
              fontSize: 15,
              fontWeight: 950,
              letterSpacing: 0.3,
              color: "rgba(255,255,255,0.92)",
            }}
          >
            Tactical
          </span>
        </Link>

        {/* 메뉴 */}
        <nav
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          <Link href="/" style={linkStyle("/")}>
            Overview
          </Link>
          <Link href="/profile" style={linkStyle("/profile")}>
            Profile
          </Link>
          <Link href="/matchup" style={linkStyle("/matchup")}>
            Matchup
          </Link>
          <Link href="/impact" style={linkStyle("/impact")}>
            Impact
          </Link>
          <Link href="/validation" style={linkStyle("/validation")}>
            Validation
          </Link>
          <Link href="/simulator" style={linkStyle("/simulator")}>
            Simulator
          </Link>
          <Link href="/outlook" style={linkStyle("/outlook")}>
            Outlook
          </Link>
        </nav>
      </div>
    </header>
  );
}
