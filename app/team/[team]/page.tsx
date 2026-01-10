"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Barlow_Condensed, Teko } from "next/font/google";

// ✅ “포스터/슬로건” 느낌: 굵고 + 기울어진 Condensed
const sloganFont = Barlow_Condensed({ weight: ["900"], style: ["italic"], subsets: ["latin"] });
// ✅ UI용: 스포츠 보드 느낌
const uiFont = Teko({ weight: ["500", "700"], subsets: ["latin"] });

// recharts (client-only)
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

// ✅ 팀명 매칭 강건화(공백/대소문자/특수문자)
function normTeam(s: string) {
  return (s ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase();
}
function sameTeam(a: string, b: string) {
  return normTeam(a) === normTeam(b);
}

/**
 * ✅✅ 로고 파일명은 "네 public/logos 폴더 파일명" 그대로 사용
 * 스크린샷 기준:
 * fc서울, 강원fc, 광주fc, 김천상무, 대구fc, 대전하나시티즌, 수원fc,
 * 울산HD, 인천유나이티드, 전북현대, 제주sk, 포항스틸러스 (+ fc안양)
 */
function teamLogoPath(team: string) {
  const t = normTeam(team);

  const map: Array<{ keys: string[]; file: string }> = [
    { keys: ["fc서울", "서울", "seoul", "fcseoul"], file: "fc서울" },
    { keys: ["강원fc", "강원", "gangwon"], file: "강원fc" },
    { keys: ["광주fc", "광주", "gwangju"], file: "광주fc" },
    { keys: ["김천상무", "김천", "gimcheon", "김천상무프로축구단", "김천상무프로축구단"], file: "김천상무" },
    { keys: ["대구fc", "대구", "daegu"], file: "대구fc" },
    { keys: ["대전하나시티즌", "대전", "daejeon"], file: "대전하나시티즌" },
    { keys: ["수원fc", "수원", "suwon"], file: "수원fc" },
    { keys: ["울산hd", "울산hdfc", "울산", "ulsan"], file: "울산HD" },
    { keys: ["인천유나이티드", "인천", "incheon"], file: "인천유나이티드" },
    { keys: ["전북현대", "전북", "jeonbuk", "전북현대모터스"], file: "전북현대" },
    { keys: ["제주sk", "제주", "jeju", "제주skfc"], file: "제주sk" },
    { keys: ["포항스틸러스", "포항", "pohang"], file: "포항스틸러스" },

    // 원하면 삭제
    { keys: ["fc안양", "안양", "anyang", "fcanyang"], file: "fc안양" },
  ];

  // 1) 정확 일치
  for (const item of map) {
    if (item.keys.some((k) => normTeam(k) === t)) {
      return `/logos/${encodeURIComponent(item.file)}.png`;
    }
  }

  // 2) 부분 포함 (긴 정식명도 잡기)
  for (const item of map) {
    if (item.keys.some((k) => t.includes(normTeam(k)))) {
      return `/logos/${encodeURIComponent(item.file)}.png`;
    }
  }

  // 3) default (깨진 이미지 방지)
  return `/logos/default.png`;
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
  "인천 유나이티드": { bg: "#1a0a6aff", fg: "#000000ff" },
};

function getSlogan(team: string) {
  return (TEAM_BRAND[team]?.slogan ?? "").toUpperCase();
}
function getSloganStyle(team: string) {
  return TEAM_SLOGAN_STYLE[team] ?? { bg: "rgba(255,255,255,0.10)", fg: "#FFFFFF" };
}

function makeHeaderGradient() {
  return `
    radial-gradient(1000px 420px at 18% -20%, rgba(255,255,255,0.08), transparent 55%),
    radial-gradient(1000px 420px at 80% 0%, rgba(255,255,255,0.06), transparent 62%),
    linear-gradient(180deg, rgba(255,255,255,0.05), rgba(0,0,0,0.18))
  `.trim();
}
function makePageBg() {
  return `
    radial-gradient(1100px 520px at 18% 8%, rgba(255,255,255,0.06), transparent 60%),
    radial-gradient(900px 420px at 82% 18%, rgba(255,255,255,0.045), transparent 62%),
    linear-gradient(180deg, #05060a 0%, #060810 45%, #05060a 100%)
  `.trim();
}

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

  const card = "rgba(255,255,255,0.06)";
  const cardBorder = "1px solid rgba(255,255,255,0.12)";

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
      return { n: 0, std: NaN, range: NaN, last5Delta: NaN };
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
  const ss = useMemo(() => getSloganStyle(teamLabel), [teamLabel]);
  const sSize = useMemo(() => sloganFontSize(slogan), [slogan]);

  const headerGrad = makeHeaderGradient();
  const pageBg = makePageBg();

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
            color: "rgba(255,255,255,0.70)",
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
      <main
        className={uiFont.className}
        style={{
          minHeight: "100vh",
          background: pageBg,
          padding: 28,
          color: "rgba(255,255,255,0.92)",
        }}
      >
        {Header}
        <div style={{ marginTop: 18, fontSize: 18, fontWeight: 900 }}>Team param missing</div>
      </main>
    );
  }

  if (loading) {
    return (
      <main
        className={uiFont.className}
        style={{
          minHeight: "100vh",
          background: pageBg,
          padding: 28,
          color: "rgba(255,255,255,0.92)",
        }}
      >
        {Header}
        <div style={{ marginTop: 18, fontSize: 18, fontWeight: 900 }}>Loading Team Profile…</div>
      </main>
    );
  }

  const band = row ? ptiBand(row.PTI, league.q1, league.q2) : null;
  const bandCol = band ? ptiBandColor(band) : "rgba(255,255,255,0.55)";

  const headerTwoColStyle: React.CSSProperties = {
    display: "flex",
    gap: 14,
    alignItems: "stretch",
    flexWrap: "wrap",
  };

  return (
    <main
      className={uiFont.className}
      style={{
        minHeight: "100vh",
        background: pageBg,
        padding: "34px 28px",
        color: "rgba(255,255,255,0.92)",
      }}
    >
      <div style={{ maxWidth: 1260, margin: "0 auto" }}>
        {Header}

        {/* ===== Club header ===== */}
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
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: ss.bg, opacity: 0.95 }} />

          {/* ✅ 헤더 배경에도 로고 은은하게 */}
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
              opacity: 0.07,
              filter: "grayscale(1)",
              pointerEvents: "none",
            }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.opacity = "0";
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
                <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: -0.6, color: "rgba(255,255,255,0.94)" }}>{teamLabel}</div>

                <div style={{ marginTop: 8, color: "rgba(255,255,255,0.68)", fontSize: 13 }}>
                  변동성(Team Profile) — 지표의 흔들림으로 전술 일관성/기복을 요약합니다.
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
              {/* ✅✅✅ 로고 워터마크 (슬로건 뒤 은은하게) */}
              <img
                src={teamLogoPath(teamLabel)}
                alt=""
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: -10,
                  width: "120%",
                  height: "120%",
                  objectFit: "contain",
                  opacity: 0.12, // ← 은은함 핵심
                  filter: "grayscale(1) contrast(1.1)",
                  transform: "rotate(-10deg) scale(1.08)",
                  pointerEvents: "none",
                  userSelect: "none",
                  mixBlendMode: "overlay",
                }}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.opacity = "0";
                }}
              />

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
                    textShadow: "0 4px 0 rgba(0,0,0,0.22), 0 18px 40px rgba(0,0,0,0.25)",
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

        {/* ===== Content ===== */}
        <div style={{ display: "grid", gridTemplateColumns: "420px minmax(0, 1fr)", gap: 14, marginTop: 14 }}>
          {/* SUMMARY */}
          <div style={{ background: card, border: cardBorder, borderRadius: 18, padding: 14 }}>
            <div style={{ color: "rgba(255,255,255,0.62)", fontSize: 12, fontWeight: 900 }}>SUMMARY</div>

            {!row ? (
              <div style={{ marginTop: 10, color: "rgba(255,255,255,0.70)", fontSize: 13, lineHeight: 1.7 }}>
                overview에서 이 팀을 못 찾았어. (teamName 표기/공백 문제 가능)
                <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
                  현재 URL 팀명: <b>{teamName}</b>
                </div>
              </div>
            ) : (
              <>
                <div style={{ marginTop: 10, color: "rgba(255,255,255,0.72)", fontSize: 12, lineHeight: 1.6 }}>
                  <div style={{ color: "rgba(255,255,255,0.90)", fontWeight: 950 }}>
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
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, color: "rgba(255,255,255,0.70)" }}>
                    <span style={{ fontWeight: 900 }}>Current (overview)</span>
                    <span style={{ color: "rgba(255,255,255,0.60)" }}>TSS/SGP/PTI</span>
                  </div>
                  <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap", fontSize: 13 }}>
                    <span style={{ color: "rgba(255,255,255,0.90)", fontWeight: 950 }}>TSS {fmt(row.TSS)}</span>
                    <span style={{ color: "rgba(255,255,255,0.90)", fontWeight: 950 }}>SGP {fmt(row.SGP)}</span>
                    <span style={{ color: "rgba(255,255,255,0.90)", fontWeight: 950 }}>PTI {fmt(row.PTI)}</span>
                  </div>
                </div>

                {(() => {
                  const blocks = [
                    { k: "TSS", st: stTSS },
                    { k: "SGP", st: stSGP },
                    { k: "PTI", st: stPTI },
                  ];

                  return (
                    <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                      {blocks.map(({ k, st }) => {
                        const ok = st.n > 0 && Number.isFinite(st.std);
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
                                σ <span style={{ fontWeight: 950, color: "rgba(255,255,255,0.92)" }}>{Number.isFinite(st.std) ? fmt(st.std) : "-"}</span>
                              </span>
                              <span>
                                range{" "}
                                <span style={{ fontWeight: 950, color: "rgba(255,255,255,0.92)" }}>{Number.isFinite(st.range) ? fmt(st.range) : "-"}</span>
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
                                  width: `${clamp((Number.isFinite(st.std) ? st.std : 0) / 25, 0, 1) * 100}%`,
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
                  );
                })()}

                <div style={{ marginTop: 10, color: "rgba(255,255,255,0.58)", fontSize: 11, lineHeight: 1.6 }}>
                  *σ(표준편차)=흔들림 크기, range=최고–최저 폭, last 5 Δ=최근 5경기 전 대비 변화.
                </div>
              </>
            )}
          </div>

          {/* Right: Radar + Timeseries */}
          <div style={{ display: "grid", gridTemplateRows: "340px 420px", gap: 14 }}>
            <div style={{ background: card, border: cardBorder, borderRadius: 18, padding: 14 }}>
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

            <div style={{ background: card, border: cardBorder, borderRadius: 18, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ color: "rgba(255,255,255,0.62)", fontSize: 12, fontWeight: 900 }}>TIMESERIES</div>
                <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 11 }}>{teamSeries.length} points</div>
              </div>

              <div style={{ marginTop: 10, height: 340, background: "rgba(255,255,255,0.94)", borderRadius: 16, padding: 10 }}>
                {teamSeries.length === 0 ? (
                  <div style={{ padding: 12, color: "#111827" }}>No timeseries points.</div>
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

        {/* DEBUG */}
        {showDebug ? (
          <div style={{ marginTop: 14, background: "rgba(0,0,0,0.30)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, padding: 12 }}>
            <div style={{ fontWeight: 900, color: "rgba(255,255,255,0.88)" }}>Debug panel</div>
            <div style={{ marginTop: 8, fontSize: 12, color: "rgba(255,255,255,0.70)", lineHeight: 1.6 }}>
              <div>overview: {String(status.overviewOk)} ({status.overviewStatus})</div>
              <div>series: {String(status.seriesOk)} ({status.seriesStatus})</div>
              <div>cluster: {String(status.clusterOk)} ({status.clusterStatus})</div>
              <div style={{ marginTop: 8 }}>teamName(param): {teamName}</div>
              <div>teamLabel(resolved): {teamLabel}</div>
              <div>logoPath: {teamLogoPath(teamLabel)}</div>
              {status.err ? <div style={{ marginTop: 8, color: "rgba(239,68,68,0.95)" }}>err: {status.err}</div> : null}
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
