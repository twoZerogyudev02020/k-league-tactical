"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function TopNav() {
  const pathname = usePathname();

  const linkStyle = (href: string): React.CSSProperties => ({
    padding: "10px 12px",
    borderRadius: 12,
    border: pathname === href ? "1px solid rgba(255,255,255,0.40)" : "1px solid rgba(255,255,255,0.14)",
    background: pathname === href ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.07)",
    color: "rgba(255,255,255,0.92)",
    fontWeight: 900,
    textDecoration: "none",
    fontSize: 12,
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  });

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        backdropFilter: "blur(10px)",
        background: "rgba(11,16,32,0.75)",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "14px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div style={{ fontWeight: 950, letterSpacing: 0.2 }}>K League • Tactical</div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Link href="/" style={linkStyle("/")}>Overview</Link>
          <Link href="/profile" style={linkStyle("/profile")}>Profile</Link>
          <Link href="/matchup" style={linkStyle("/matchup")}>Matchup</Link>
          <Link href="/impact" style={linkStyle("/impact")}>Impact</Link>
          <Link href="/validation" style={linkStyle("/validation")}>Validation</Link>
          <Link href="/simulator" style={linkStyle("/simulator")}>Simulator</Link>
        </div>
      </div>
    </div>
  );
}
