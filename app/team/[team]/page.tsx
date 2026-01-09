"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Barlow_Condensed, Teko } from "next/font/google";

// ✅ “포스터/슬로건” 느낌: 굵고 + 기울어진 Condensed 계열
const sloganFont = Barlow_Condensed({ weight: ["900"], style: ["italic"], subsets: ["latin"] });
// ✅ UI용: 스포츠 보드 느낌(숫자/라벨 깔끔)
const uiFont = Teko({ weight: ["500", "700"], subsets: ["latin"] });

// recharts는 클라이언트 전용으로 안전하게 dynamic import
const ResponsiveContainer = dynamic(() => import("recharts").then((m) => m.ResponsiveContainer), { ssr: false });
const RadarChart = dynamic(() => import("recharts").then((m) => m.RadarChart), { ssr: false });
const Radar = dynamic(() => import("recharts").then((m) => m.Radar), { ssr: false });
const PolarGrid = dynamic(() => import("recharts").then((m) => m.PolarGrid), { ssr: false });
const PolarAngleAxis = dynamic(() => import("recharts").then((m) => m.PolarAngleAxis), { ssr: false });
const PolarRadiusAxis = dynamic(() => import("recharts").then((m) => m.PolarRadiusAxis), { ssr: false });
const LineChart = dynamic(() => import("recharts").then((m) => m.LineChart), { ssr: false });
const Line = dynamic(() => import("recharts").then((m) => m.Line), { ssr: false });
const XAxis = dynamic(() => import("recharts").then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then((m) => m.YAxis), { ssr: false });
const Tooltip = dynamic(() => import("recharts").then((m) => m.Tooltip), { ssr: false });
const CartesianGrid = dynamic(() => import("recharts").then((m) => m.CartesianGrid), { ssr: false });
const Legend = dynamic(() => import("recharts").then((m) => m.Legend), { ssr: false });

type OverviewRow = { team: string; TSS: number; SGP: number; PTI: number };
type AnyRow = Record<string, any>;
type ClusterRow = { team_name_ko: string; Cluster: number };

function safeDecode(v: string | undefined) {
  if (!v) return "";
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}
function mean(arr: number[]) {
  return arr.reduce((a, b) => a + b, 0) / Math.max(arr.length, 1);
}
function std(arr: number[]) {
  const m = mean(arr);
  const v = mean(arr.map((x) => (x - m) ** 2));
  return Math.sqrt(v);
}
function fmt(n: any) {
  const x = Number(n);
  return Number.isFinite(x) ? x.toFixed(2) : "-";
}
function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
function pick(obj: AnyRow, keys: string[]) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

// ✅ 팀명 매칭 강건화
function normTeam(s: string) {
  return (s ?? "").normalize("NFKC").trim().replace(/\s+/g, "").toLowerCase();
}
function sameTeam(a: string, b: string) {
  return normTeam(a) === normTeam(b);
}

// ===== Logo mapping =====
function teamLogoPath(team: string) {
  const map: Record<string, string> = {
    "FC서울": "fc서울",
    "강원FC": "강원fc",
    "광주FC": "광주fc",
    "김천 상무 프로축구단": "김천상무",
    "대구FC": "대구fc",
    "대전 하나 시티즌": "대전하나시티즌",
    "수원FC": "수원fc",
    "울산 HD FC": "울산HD",
    "인천 유나이티드": "인천유나이티드",
    "전북 현대 모터스": "전북현대",
    "제주SK FC": "제주sk",
    "포항 스틸러스": "포항스틸러스",
  };
  const file = map[team] ?? team;
  return `/logos/${file}.png`;
}

// ===== Team Brand (Slogan) =====
const TEAM_BRAND: Record<string, { slogan: string }> = {
  "울산 HD FC": { slogan: "My team ULSAN" },
  "강원FC": { slogan: "GREAT UNION, GREAT ONE TEAM" },
  "김천 상무 프로축구단": { slogan: "PRIDE OF GIMCHEON" },
  "FC서울": { slogan: "Soul of Seoul" },
  "수원FC": { slogan: "Only One, SUWON" },
  "포항 스틸러스": { slogan: "WE ARE STEEL STRONG" },
  "제주SK FC": { slogan: "YOUR STORY, OUR STORY" },
  "대전 하나 시티즌": { slogan: "Together We Stand" },
  "광주FC": { slogan: "NEW GENERATION" },
  "전북 현대 모터스": { slogan: "Progressive Pioneer" },
  "대구FC": { slogan: "SIZE DOESN'T MATTER" },
  "인천 유나이티드": { slogan: "BE UNITED, BE THE ONE" },
};

// ✅ 너가 준 “배경색/글씨색” 정확 반영
const TEAM_SLOGAN_STYLE: Record<string, { bg: string; fg: string }> = {
  "울산 HD FC": { bg: "#0EA5E9", fg: "#FFFFFF" },
  "강원FC": { bg: "#F59E0B", fg: "#0B0B0B" },
  "김천 상무 프로축구단": { bg: "#EF4444", fg: "#1E3A8A" },
  "FC서울": { bg: "#EF4444", fg: "#0B0B0B" },
  "수원FC": { bg: "#2563EB", fg: "#EF4444" },
  "포항 스틸러스": { bg: "#EF4444", fg: "#0B0B0B" },
  "제주SK FC": { bg: "#F97316", fg: "#EF4444" },
  "대전 하나 시티즌": { bg: "rgb(0,122,108)", fg: "rgb(142,37,63)" },
  "광주FC": { bg: "#FCD34D", fg: "#8B3A2E" },
  "전북 현대 모터스": { bg: "#22C55E", fg: "#FFFFFF" },
  "대구FC": { bg: "rgb(153,206,227)", fg: "#FFFFFF" },
  "인천 유나이티드": { bg: "#0B0B0B", fg: "#FFFFFF" },
};

function getSlogan(team: string) {
  return (TEAM_BRAND[team]?.slogan ?? "").toUpperCase();
}
function getSloganStyle(team: string) {
  return TEAM_SLOGAN_STYLE[team] ?? { bg: "rgba(255,255,255,0.10)", fg: "#FFFFFF" };
}

// “진짜 블랙 + 글래스” 헤더 배경(팀색은 아주 은은하게)
function makeHeaderGradient() {
  return `
    radial-gradient(1000px 420px at 18% -20%, rgba(255,255,255,0.08), transparent 55%),
    radial-gradient(1000px 420px at 80% 0%, rgba(255,255,255,0.06), transparent 62%),
    linear-gradient(180deg, rgba(255,255,255,0.05), rgba(0,0,0,0.18))
  `.trim();
}

// ===== PTI band =====
function ptiBand(pti: number, q1: number, q2: number): "LOW" | "MID" | "HIGH" {
  if (pti <= q1) return "LOW";
  if (pti <= q2) return "MID";
  return "HIGH";
}
function ptiBandColor(b: "LOW" | "MID" | "HIGH") {
  if (b === "LOW") return "#3b82f6";
  if (b === "MID") return "#22c55e";
  return "#ef4444";
}

// ===== CSV (team_clusters.csv) simple parser =====
function parseSimpleCSV(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length <= 1) return [];

  const header = lines[0].split(",").map((h) => h.trim());
  const idxTeam = header.findIndex((h) => normTeam(h) === "team_name_ko" || normTeam(h) === "team");
  const idxCl = header.findIndex((h) => normTeam(h) === "cluster");
  if (idxTeam < 0 || idxCl < 0) return [];

  const out: ClusterRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    const team = cols[idxTeam] ?? "";
    const cl = Number(cols[idxCl]);
    if (!team) continue;
    if (!Number.isFinite(cl)) continue;
    out.push({ team_name_ko: team, Cluster: cl });
  }
  return out;
}

// 길이에 따라 슬로건 글자 크기 자동 조절 (오른쪽 배너용)
function sloganFontSize(s: string) {
  const L = (s ?? "").length;
  if (L <= 14) return 54;
  if (L <= 20) return 46;
  if (L <= 28) return 40;
  return 34;
}

export default function TeamProfilePage() {
  const router = useRouter();
  const params = useParams<{ team?: string }>();
  const teamName = useMemo(() => safeDecode(params?.team), [params]);

  // ✅ K리그 테마 변수 기반 (배경은 layout/body가 담당 → page는 투명)
  const card = "var(--k-card)";
  const cardBorder = "1px solid var(--k-border)";
  const textDim = "var(--k-fg-dim)";
  const textStrong = "var(--k-fg)";

  const [overview, setOverview] = useState<OverviewRow[] | null>(null);
  const [seriesRaw, setSeriesRaw] = useState<AnyRow[] | null>(null);
  const [clusterRows, setClusterRows] = useState<ClusterRow[] | null>(null);

  const [showDebug, setShowDebug] = useState(false);

  const [status, setStatus] = useState<{
    overviewUrl: string;
    seriesUrl: string;
    clusterUrl: string;
    overviewOk?: boolean;
    seriesOk?: boolean;
    clusterOk?: boolean;
    overviewStatus?: number;
    seriesStatus?: number;
    clusterStatus?: number;
    err?: string;
    overviewSample?: any;
    seriesSample?: any;
  }>({
    overviewUrl: "/data/overview.json",
    seriesUrl: "/data/team_timeseries.json",
    clusterUrl: "/data/team_clusters.csv",
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const overviewUrl = "/data/overview.json";
        const seriesUrl = "/data/team_timeseries.json";
        const clusterUrl = "/data/team_clusters.csv";

        const [oRes, sRes, cRes] = await Promise.all([
          fetch(overviewUrl, { cache: "no-store" }),
          fetch(seriesUrl, { cache: "no-store" }),
          fetch(clusterUrl, { cache: "no-store" }).catch(() => null as any),
        ]);

        const overviewOk = oRes?.ok;
        const seriesOk = sRes?.ok;
        const clusterOk = cRes?.ok;

        const overviewStatus = oRes?.status;
        const seriesStatus = sRes?.status;
        const clusterStatus = cRes?.status;

        let oJson: any = null;
        let sJson: any = null;
        let cText: string | null = null;

        if (overviewOk) oJson = await oRes.json();
        if (seriesOk) sJson = await sRes.json();
        if (clusterOk) cText = await cRes.text();

        if (!alive) return;

        setStatus((prev) => ({
          ...prev,
          overviewUrl,
          seriesUrl,
          clusterUrl,
          overviewOk,
          seriesOk,
          clusterOk,
          overviewStatus,
          seriesStatus,
          clusterStatus,
          overviewSample: Array.isArray(oJson) ? oJson?.[0] : oJson,
          seriesSample: Array.isArray(sJson) ? sJson?.[0] : sJson,
        }));

        setOverview(Array.isArray(oJson) ? (oJson as OverviewRow[]) : []);
        setSeriesRaw(Array.isArray(sJson) ? (sJson as AnyRow[]) : []);
        setClusterRows(cText ? parseSimpleCSV(cText) : []);
      } catch (e: any) {
        if (!alive) return;
        setStatus((prev) => ({ ...prev, err: e?.message ?? String(e) }));
        setOverview([]);
        setSeriesRaw([]);
        setClusterRows([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const loading = overview === null || seriesRaw === null || clusterRows === null;

  const teamSeries = useMemo(() => {
    if (!seriesRaw || !teamName) return [];

    const teamKeys = ["team", "Team", "TeamLabel", "team_name", "club", "Club", "TEAM"];
    const roundKeys = ["round", "Round", "GW", "gw", "matchweek", "MatchWeek", "md", "MD"];
    const tssKeys = ["TSS", "tss"];
    const sgpKeys = ["SGP", "sgp"];
    const ptiKeys = ["PTI", "pti"];

    const filtered = seriesRaw
      .filter((r) => {
        const t = String(pick(r, teamKeys) ?? "");
        return sameTeam(t, teamName);
      })
      .map((r) => {
        const round = Number(pick(r, roundKeys));
        const TSS = pick(r, tssKeys);
        const SGP = pick(r, sgpKeys);
        const PTI = pick(r, ptiKeys);
        return {
          round: Number.isFinite(round) ? round : 0,
          TSS: TSS === undefined ? null : Number(TSS),
          SGP: SGP === undefined ? null : Number(SGP),
          PTI: PTI === undefined ? null : Number(PTI),
        };
      })
      .sort((a, b) => a.round - b.round);

    return filtered;
  }, [seriesRaw, teamName]);

  const row = useMemo(() => {
    if (!overview || !teamName) return null;
    return overview.find((r) => sameTeam(r.team, teamName)) ?? null;
  }, [overview, teamName]);

  const league = useMemo(() => {
    if (!overview || overview.length === 0) return { tssMean: 0, sgpMean: 0, ptiMean: 0, q1: 0, q2: 1 };
    const ptis = overview.map((r) => r.PTI).slice().sort((a, b) => a - b);
    const q1 = ptis[Math.floor(ptis.length * (1 / 3))] ?? ptis[0] ?? 0;
    const q2 = ptis[Math.floor(ptis.length * (2 / 3))] ?? ptis[ptis.length - 1] ?? 1;
    return {
      tssMean: mean(overview.map((r) => r.TSS)),
      sgpMean: mean(overview.map((r) => r.SGP)),
      ptiMean: mean(overview.map((r) => r.PTI)),
      q1,
      q2,
    };
  }, [overview]);

  const radarData = useMemo(() => {
    if (!row) return [];
    return [
      { metric: "TSS", team: row.TSS, league: league.tssMean },
      { metric: "SGP", team: row.SGP, league: league.sgpMean },
      { metric: "PTI", team: row.PTI, league: league.ptiMean },
    ];
  }, [row, league]);

  const clusterId = useMemo(() => {
    if (!clusterRows || !teamName) return null;
    const hit = clusterRows.find((r) => sameTeam(r.team_name_ko, teamName));
    return hit ? hit.Cluster : null;
  }, [clusterRows, teamName]);

  function metricStats(key: "TSS" | "SGP" | "PTI") {
    const vals = teamSeries.map((d) => Number(d[key])).filter((x) => Number.isFinite(x));
    if (!vals.length) {
      return { n: 0, mean: NaN, std: NaN, min: NaN, max: NaN, range: NaN, last5Delta: NaN };
    }
    const s = std(vals);
    const mi = Math.min(...vals);
    const ma = Math.max(...vals);
    const range = ma - mi;

    const last = vals[vals.length - 1];
    const prev = vals.length >= 6 ? vals[vals.length - 6] : vals[0];
    const last5Delta = last - prev;

    return { n: vals.length, std: s, range, last5Delta };
  }

  const stTSS = useMemo(() => metricStats("TSS"), [teamSeries]);
  const stSGP = useMemo(() => metricStats("SGP"), [teamSeries]);
  const stPTI = useMemo(() => metricStats("PTI"), [teamSeries]);

  const mostVolatile = useMemo(() => {
    const items = [
      { k: "TSS", v: stTSS.std },
      { k: "SGP", v: stSGP.std },
      { k: "PTI", v: stPTI.std },
    ].filter((x) => Number.isFinite(x.v));
    items.sort((a, b) => b.v - a.v);
    return items[0]?.k ?? "-";
  }, [stTSS, stSGP, stPTI]);

  const teamLabel = row?.team ?? teamName;
  const slogan = useMemo(() => getSlogan(teamLabel), [teamLabel]);
  const ss = useMemo(() => getSloganStyle(teamLabel), [teamLabel]); // bg/fg
  const sSize = useMemo(() => sloganFontSize(slogan), [slogan]);

  const headerGrad = makeHeaderGradient();

  const leagueStroke = "rgba(17,24,39,0.78)";
  const teamStroke = "rgba(0,0,0,0.35)";

  const Header = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <button
        onClick={() => router.push("/")}
        style={{
          padding: "10px 12px",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(255,255,255,0.06)",
          color: "rgba(255,255,255,0.86)",
          cursor: "pointer",
          fontWeight: 900,
        }}
      >
        ← Overview
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={() => setShowDebug((v) => !v)}
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(255,255,255,0.06)",
            color: "rgba(255,255,255,0.80)",
            cursor: "pointer",
            fontWeight: 900,
            fontSize: 12,
          }}
        >
          Debug {showDebug ? "ON" : "OFF"}
        </button>

        <div
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "var(--k-fg-dim)",
            fontSize: 12,
          }}
        >
          Prototype • Team Profile
        </div>
      </div>
    </div>
  );

  if (!teamName) {
    return (
      <main className={uiFont.className} style={{ minHeight: "100vh", background: "transparent", padding: 28, color: "var(--k-fg)" }}>
        {Header}
        <div style={{ marginTop: 18, fontSize: 18, fontWeight: 900 }}>Team param missing</div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className={uiFont.className} style={{ minHeight: "100vh", background: "transparent", padding: 28, color: "var(--k-fg)" }}>
        {Header}
        <div style={{ marginTop: 18, fontSize: 18, fontWeight: 900 }}>Loading Team Profile…</div>
        <div style={{ marginTop: 10, color: "var(--k-fg-dim)", fontSize: 13 }}>
          fetching <code style={{ color: "var(--k-fg)" }}>{status.overviewUrl}</code>,{" "}
          <code style={{ color: "var(--k-fg)" }}>{status.seriesUrl}</code>
        </div>
      </main>
    );
  }

  const band = row ? ptiBand(row.PTI, league.q1, league.q2) : null;
  const bandCol = band ? ptiBandColor(band) : "rgba(255,255,255,0.55)";

  // ✅ styled-jsx 없이 “모바일 줄바꿈”을 flexWrap으로 해결
  const headerTwoColStyle: React.CSSProperties = {
    display: "flex",
    gap: 14,
    alignItems: "stretch",
    flexWrap: "wrap",
  };

  return (
    <main className={uiFont.className} style={{ minHeight: "100vh", background: "transparent", padding: "34px 28px" }}>
      <div style={{ maxWidth: 1260, margin: "0 auto" }}>
        {Header}

        {/* ===== Club header (왼쪽 정보 + 오른쪽 슬로건 배너) ===== */}
        <div
          style={{
            marginTop: 14,
            background: headerGrad,
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 18,
            padding: 14,
            position: "relative",
            overflow: "hidden",
            boxShadow: "0 18px 40px rgba(0,0,0,0.22)",
          }}
        >
          {/* 얇은 포인트 라인: 슬로건 배너 bg색 */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: ss.bg, opacity: 0.95 }} />

          {/* 로고 워터마크 */}
          <img
            src={teamLogoPath(teamLabel)}
            alt=""
            aria-hidden="true"
            style={{
              position: "absolute",
              right: 10,
              top: -18,
              width: 210,
              height: 210,
              objectFit: "contain",
              opacity: 0.06,
              filter: "grayscale(1)",
              pointerEvents: "none",
            }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />

          <div style={headerTwoColStyle}>
            {/* LEFT */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 320, flex: "2 1 520px" }}>
              <img
                src={teamLogoPath(teamLabel)}
                alt={teamLabel}
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 16,
                  objectFit: "contain",
                  background: "rgba(255,255,255,0.92)",
                  padding: 8,
                  border: "1px solid rgba(255,255,255,0.18)",
                  flex: "0 0 auto",
                }}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = "/logos/default.png";
                }}
              />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: -0.6, color: "var(--k-fg)" }}>
                  {teamLabel}
                </div>

                <div style={{ marginTop: 8, color: "var(--k-fg-dim)", fontSize: 13 }}>
                  변동성(Team Profile) — 지표의 “흔들림”으로 전술 일관성/기복을 요약합니다.
                </div>

                <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span
                    style={{
                      padding: "6px 10px",
                      borderRadius: 999,
                      border: "1px solid rgba(255,255,255,0.14)",
                      background: "rgba(255,255,255,0.06)",
                      color: "rgba(255,255,255,0.86)",
                      fontSize: 12,
                      fontWeight: 800,
                    }}
                  >
                    Cluster: <span style={{ color: "rgba(255,255,255,0.92)" }}>{clusterId === null ? "—" : `C${clusterId}`}</span>
                  </span>

                  <span
                    style={{
                      padding: "6px 10px",
                      borderRadius: 999,
                      border: "1px solid rgba(255,255,255,0.14)",
                      background: "rgba(255,255,255,0.06)",
                      color: "rgba(255,255,255,0.86)",
                      fontSize: 12,
                      fontWeight: 800,
                    }}
                  >
                    PTI Band: <span style={{ color: bandCol, fontWeight: 900 }}>{band ?? "—"}</span>
                  </span>

                  <span
                    style={{
                      padding: "6px 10px",
                      borderRadius: 999,
                      border: "1px solid rgba(255,255,255,0.14)",
                      background: "rgba(255,255,255,0.06)",
                      color: "rgba(255,255,255,0.86)",
                      fontSize: 12,
                      fontWeight: 800,
                    }}
                  >
                    Most volatile: <span style={{ color: "rgba(255,255,255,0.92)" }}>{mostVolatile}</span>
                  </span>
                </div>
              </div>
            </div>

            {/* RIGHT: SLOGAN BANNER */}
            <div
              style={{
                position: "relative",
                borderRadius: 18,
                overflow: "hidden",
                border: "1px solid rgba(255,255,255,0.18)",
                background: ss.bg,
                boxShadow: "0 16px 36px rgba(0,0,0,0.28)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 14,
                minHeight: 110,
                maxWidth: 420,
                flex: "1 1 360px",
              }}
            >
              {/* 워터마크 텍스트 */}
              {slogan ? (
                <div
                  className={sloganFont.className}
                  style={{
                    position: "absolute",
                    left: -10,
                    top: 10,
                    transform: "rotate(-10deg)",
                    fontSize: sSize + 18,
                    letterSpacing: 3.2,
                    opacity: 0.12,
                    color: ss.fg,
                    whiteSpace: "nowrap",
                    pointerEvents: "none",
                    filter: "blur(0.2px)",
                  }}
                >
                  {slogan}
                </div>
              ) : null}

              <div style={{ textAlign: "right", width: "100%", paddingRight: 6 }}>
                <div
                  className={sloganFont.className}
                  style={{
                    fontSize: sSize,
                    lineHeight: 0.92,
                    letterSpacing: 2.2,
                    textTransform: "uppercase",
                    color: ss.fg,
                    textShadow: "0 3px 0 rgba(0,0,0,0.18), 0 18px 40px rgba(0,0,0,0.22)",
                    transform: "skewX(-12deg)",
                  }}
                >
                  {slogan}
                </div>

                <div style={{ marginTop: 8, fontSize: 12, fontWeight: 900, color: ss.fg, opacity: 0.85, letterSpacing: 1.6 }}>
                  CLUB SLOGAN
                </div>
              </div>

              <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 3, background: ss.fg, opacity: 0.25 }} />
            </div>
          </div>
        </div>

        {/* DEBUG */}
        {showDebug ? (
          <div style={{ marginTop: 14, background: card as any, border: cardBorder as any, borderRadius: 18, padding: 14 }}>
            <div style={{ color: "rgba(255,255,255,0.62)", fontSize: 12, fontWeight: 900 }}>DEBUG STATUS</div>
            <div style={{ marginTop: 10, color: textDim, fontSize: 12, lineHeight: 1.7 }}>
              <div>
                overview: <code style={{ color: textStrong }}>{status.overviewUrl}</code> →{" "}
                <b style={{ color: status.overviewOk ? "#22c55e" : "#ef4444" }}>
                  {String(status.overviewOk)} ({status.overviewStatus})
                </b>
              </div>
              <div>
                timeseries: <code style={{ color: textStrong }}>{status.seriesUrl}</code> →{" "}
                <b style={{ color: status.seriesOk ? "#22c55e" : "#ef4444" }}>
                  {String(status.seriesOk)} ({status.seriesStatus})
                </b>
              </div>
              <div>
                clusters: <code style={{ color: textStrong }}>{status.clusterUrl}</code> →{" "}
                <b style={{ color: status.clusterOk ? "#22c55e" : "#fbbf24" }}>
                  {String(status.clusterOk)} ({status.clusterStatus})
                </b>
              </div>
              {status.err ? <div style={{ marginTop: 8, color: "#fecaca" }}>err: {status.err}</div> : null}
              <div style={{ marginTop: 8 }}>
                overview sample: <code style={{ color: textStrong }}>{JSON.stringify(status.overviewSample)?.slice(0, 160)}…</code>
              </div>
              <div style={{ marginTop: 6 }}>
                series sample: <code style={{ color: textStrong }}>{JSON.stringify(status.seriesSample)?.slice(0, 160)}…</code>
              </div>
              <div style={{ marginTop: 8 }}>
                row found: <b style={{ color: row ? "#22c55e" : "#ef4444" }}>{row ? "YES" : "NO"}</b> / series points:{" "}
                <b style={{ color: teamSeries.length ? "#22c55e" : "#fbbf24" }}>{teamSeries.length}</b>
              </div>
            </div>
          </div>
        ) : null}

        {/* ===== Content ===== */}
        <div style={{ display: "grid", gridTemplateColumns: "420px minmax(0, 1fr)", gap: 14, marginTop: 14 }}>
          {/* SUMMARY */}
          <div style={{ background: card as any, border: cardBorder as any, borderRadius: 18, padding: 14 }}>
            <div style={{ color: "rgba(255,255,255,0.62)", fontSize: 12, fontWeight: 900 }}>SUMMARY</div>

            {!row ? (
              <div style={{ marginTop: 10, color: textDim, fontSize: 13, lineHeight: 1.7 }}>
                overview에서 이 팀을 못 찾았어. (teamName 표기/공백 문제 가능)
              </div>
            ) : (
              <>
                <div style={{ marginTop: 10, color: textDim, fontSize: 12, lineHeight: 1.6 }}>
                  <div style={{ color: "rgba(255,255,255,0.86)", fontWeight: 950 }}>
                    “변동성”은 시즌 동안 지표가 얼마나 흔들렸는지(표준편차/범위/최근 변화)를 요약합니다.
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 12,
                    padding: "10px 12px",
                    borderRadius: 14,
                    background: "rgba(0,0,0,0.22)",
                    border: "1px solid rgba(255,255,255,0.12)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, color: textDim }}>
                    <span style={{ fontWeight: 900 }}>Current (overview)</span>
                    <span style={{ color: "rgba(255,255,255,0.60)" }}>TSS/SGP/PTI</span>
                  </div>
                  <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap", fontSize: 13 }}>
                    <span style={{ color: "rgba(255,255,255,0.88)", fontWeight: 950 }}>TSS {fmt(row.TSS)}</span>
                    <span style={{ color: "rgba(255,255,255,0.88)", fontWeight: 950 }}>SGP {fmt(row.SGP)}</span>
                    <span style={{ color: "rgba(255,255,255,0.88)", fontWeight: 950 }}>PTI {fmt(row.PTI)}</span>
                  </div>
                </div>

                <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                  {[
                    { k: "TSS", st: stTSS },
                    { k: "SGP", st: stSGP },
                    { k: "PTI", st: stPTI },
                  ].map(({ k, st }) => {
                    const ok = st.n > 0 && Number.isFinite(st.std);
                    const stdVal = ok ? st.std : NaN;
                    const rangeVal = ok ? st.range : NaN;
                    const d5 = ok ? st.last5Delta : NaN;

                    const d5Color =
                      !Number.isFinite(d5)
                        ? "rgba(255,255,255,0.70)"
                        : d5 > 0
                          ? "rgba(34,197,94,0.95)"
                          : d5 < 0
                            ? "rgba(239,68,68,0.95)"
                            : "rgba(255,255,255,0.70)";
                    const d5Txt = !Number.isFinite(d5) ? "-" : `${d5 >= 0 ? "+" : ""}${fmt(d5)}`;

                    return (
                      <div
                        key={k}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 14,
                          border: "1px solid rgba(255,255,255,0.12)",
                          background: "rgba(255,255,255,0.05)",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                          <div style={{ fontWeight: 950, color: "rgba(255,255,255,0.88)" }}>{k} Variability</div>
                          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.60)" }}>{st.n ? `${st.n} pts` : "—"}</div>
                        </div>

                        <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12, color: "rgba(255,255,255,0.72)" }}>
                          <span>
                            σ <span style={{ fontWeight: 950, color: "rgba(255,255,255,0.92)" }}>{Number.isFinite(stdVal) ? fmt(stdVal) : "-"}</span>
                          </span>
                          <span>
                            range <span style={{ fontWeight: 950, color: "rgba(255,255,255,0.92)" }}>{Number.isFinite(rangeVal) ? fmt(rangeVal) : "-"}</span>
                          </span>
                          <span>
                            last 5 Δ <span style={{ fontWeight: 950, color: d5Color }}>{d5Txt}</span>
                          </span>
                        </div>

                        <div
                          style={{
                            marginTop: 8,
                            height: 8,
                            borderRadius: 999,
                            background: "rgba(255,255,255,0.10)",
                            border: "1px solid rgba(255,255,255,0.10)",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${clamp((Number.isFinite(stdVal) ? stdVal : 0) / 25, 0, 1) * 100}%`,
                              height: "100%",
                              borderRadius: 999,
                              background: `linear-gradient(90deg, ${ss.bg}, rgba(255,255,255,0.35))`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ marginTop: 10, color: "rgba(255,255,255,0.58)", fontSize: 11, lineHeight: 1.6 }}>
                  *σ(표준편차)는 “흔들림의 크기”, range는 “최고–최저 폭”, last 5 Δ는 최근 5경기 전 대비 변화입니다.
                </div>
              </>
            )}
          </div>

          {/* Right: Radar + Timeseries */}
          <div style={{ display: "grid", gridTemplateRows: "340px 420px", gap: 14 }}>
            <div style={{ background: card as any, border: cardBorder as any, borderRadius: 18, padding: 14 }}>
              <div style={{ color: "rgba(255,255,255,0.62)", fontSize: 12, fontWeight: 900 }}>RADAR</div>
              <div style={{ marginTop: 10, height: 280, background: "rgba(255,255,255,0.94)", borderRadius: 16, padding: 10 }}>
                {!row ? (
                  <div style={{ padding: 12, color: "#111827" }}>No overview row → radar skipped.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData}>
                      <PolarGrid />
                      <PolarAngleAxis dataKey="metric" />
                      <PolarRadiusAxis domain={[0, 100]} />
                      <Radar name="League Avg" dataKey="league" stroke={leagueStroke} fill={leagueStroke} fillOpacity={0.10} />
                      <Radar name={row.team} dataKey="team" stroke={teamStroke} fill={teamStroke} fillOpacity={0.18} />
                      <Legend />
                    </RadarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div style={{ background: card as any, border: cardBorder as any, borderRadius: 18, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ color: "rgba(255,255,255,0.62)", fontSize: 12, fontWeight: 900 }}>TIMESERIES</div>
                <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 11 }}>{teamSeries.length} points</div>
              </div>

              <div style={{ marginTop: 10, height: 340, background: "rgba(255,255,255,0.94)", borderRadius: 16, padding: 10 }}>
                {teamSeries.length === 0 ? (
                  <div style={{ padding: 12, color: "#111827" }}>
                    No timeseries points. (team_timeseries.json에서 팀/라운드 컬럼명이 코드와 다를 가능성 큼)
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={teamSeries}>
                      <CartesianGrid />
                      <XAxis dataKey="round" />
                      <YAxis domain={[0, 100]} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="TSS" stroke="rgba(17,24,39,0.70)" dot={false} />
                      <Line type="monotone" dataKey="SGP" stroke="rgba(37,99,235,0.78)" dot={false} />
                      {/* PTI는 팀 슬로건 배너 배경색으로 */}
                      <Line type="monotone" dataKey="PTI" stroke={ss.bg} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
                <button
                  onClick={() => router.push("/profile")}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.16)",
                    background: "rgba(255,255,255,0.07)",
                    color: "rgba(255,255,255,0.88)",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  Profile(클러스터 해석)로 이동 →
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ✅ styled-jsx 없음: nested 에러 불가능 */}
      </div>
    </main>
  );
}
