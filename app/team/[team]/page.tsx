"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

// recharts는 클라이언트 전용으로 안전하게 dynamic import
import dynamic from "next/dynamic";

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

// timeseries는 팀마다 round별 지표가 있어야 함
// (필드명 다를 수 있으니, 아래에서 유연하게 매핑)
type AnyRow = Record<string, any>;

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

export default function TeamProfilePage() {
  const router = useRouter();
  const params = useParams<{ team?: string }>();
  const teamName = useMemo(() => safeDecode(params?.team), [params]);

  const bg = "#0b1020";
  const card = "rgba(255,255,255,0.06)";
  const cardBorder = "1px solid rgba(255,255,255,0.10)";
  const textDim = "rgba(255,255,255,0.72)";
  const textStrong = "rgba(255,255,255,0.92)";

  const [overview, setOverview] = useState<OverviewRow[] | null>(null);
  const [seriesRaw, setSeriesRaw] = useState<AnyRow[] | null>(null);

  // ✅ 화면에 원인 찍기용
  const [status, setStatus] = useState<{
    overviewUrl: string;
    seriesUrl: string;
    overviewOk?: boolean;
    seriesOk?: boolean;
    overviewStatus?: number;
    seriesStatus?: number;
    err?: string;
    overviewSample?: any;
    seriesSample?: any;
  }>({
    overviewUrl: "/data/overview.json",
    seriesUrl: "/data/team_timeseries.json",
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const overviewUrl = "/data/overview.json";
        const seriesUrl = "/data/team_timeseries.json";

        const [oRes, sRes] = await Promise.all([
          fetch(overviewUrl, { cache: "no-store" }),
          fetch(seriesUrl, { cache: "no-store" }),
        ]);

        const overviewOk = oRes.ok;
        const seriesOk = sRes.ok;

        const overviewStatus = oRes.status;
        const seriesStatus = sRes.status;

        let oJson: any = null;
        let sJson: any = null;

        if (overviewOk) oJson = await oRes.json();
        if (seriesOk) sJson = await sRes.json();

        if (!alive) return;

        setStatus((prev) => ({
          ...prev,
          overviewUrl,
          seriesUrl,
          overviewOk,
          seriesOk,
          overviewStatus,
          seriesStatus,
          overviewSample: Array.isArray(oJson) ? oJson?.[0] : oJson,
          seriesSample: Array.isArray(sJson) ? sJson?.[0] : sJson,
        }));

        setOverview(Array.isArray(oJson) ? (oJson as OverviewRow[]) : []);
        setSeriesRaw(Array.isArray(sJson) ? (sJson as AnyRow[]) : []);
      } catch (e: any) {
        if (!alive) return;
        setStatus((prev) => ({ ...prev, err: e?.message ?? String(e) }));
        setOverview([]);
        setSeriesRaw([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const loading = overview === null || seriesRaw === null;

  // ✅ 데이터 매핑 (필드명이 달라도 최대한 맞춰줌)
  const teamSeries = useMemo(() => {
    if (!seriesRaw || !teamName) return [];

    // 팀 컬럼 추정: team, Team, TeamLabel, team_name 등
    const teamKeys = ["team", "Team", "TeamLabel", "team_name", "club", "Club", "TEAM"];

    // 라운드 컬럼 추정: round, Round, GW, matchweek 등
    const roundKeys = ["round", "Round", "GW", "gw", "matchweek", "MatchWeek", "md", "MD"];

    // 지표 컬럼 추정
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
    if (!overview || overview.length === 0) return { tssMean: 0, sgpMean: 0, ptiMean: 0 };
    return {
      tssMean: mean(overview.map((r) => r.TSS)),
      sgpMean: mean(overview.map((r) => r.SGP)),
      ptiMean: mean(overview.map((r) => r.PTI)),
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

  // ✅ 공통 헤더
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
      <div
        style={{
          padding: "10px 12px",
          borderRadius: 12,
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.12)",
          color: textDim,
          fontSize: 12,
        }}
      >
        Prototype • Team Profile
      </div>
    </div>
  );

  if (!teamName) {
    return (
      <main style={{ minHeight: "100vh", background: bg, padding: 28, color: textStrong }}>
        {Header}
        <div style={{ marginTop: 18, fontSize: 18, fontWeight: 950 }}>Team param missing</div>
      </main>
    );
  }

  if (loading) {
    return (
      <main style={{ minHeight: "100vh", background: bg, padding: 28, color: textStrong }}>
        {Header}
        <div style={{ marginTop: 18, fontSize: 18, fontWeight: 950 }}>Loading Team Profile…</div>
        <div style={{ marginTop: 10, color: textDim, fontSize: 13 }}>
          fetching <code style={{ color: textStrong }}>{status.overviewUrl}</code>,{" "}
          <code style={{ color: textStrong }}>{status.seriesUrl}</code>
        </div>
      </main>
    );
  }

  // ✅ 여기부터는 “무조건 화면이 뜸”
  return (
    <main
      style={{
        minHeight: "100vh",
        background: `radial-gradient(900px 400px at 10% 0%, rgba(59,130,246,0.22), transparent 60%),
                     radial-gradient(900px 450px at 90% 10%, rgba(34,197,94,0.18), transparent 60%),
                     radial-gradient(900px 450px at 60% 90%, rgba(239,68,68,0.14), transparent 55%),
                     ${bg}`,
        padding: "34px 28px",
      }}
    >
      <div style={{ maxWidth: 1260, margin: "0 auto" }}>
        {Header}

        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 30, fontWeight: 950, letterSpacing: -0.6, color: textStrong }}>
            변동성(Team Profile)
          </div>
          <div style={{ marginTop: 8, color: textDim, fontSize: 13, lineHeight: 1.6 }}>
            team param: <b style={{ color: textStrong }}>{teamName}</b> (norm: {normTeam(teamName)})
          </div>
        </div>

        {/* ✅ 진단 패널: 여기 보고 “뭐가 문제인지” 바로 확정 가능 */}
        <div style={{ marginTop: 14, background: card, border: cardBorder, borderRadius: 18, padding: 14 }}>
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
            {status.err ? (
              <div style={{ marginTop: 8, color: "#fecaca" }}>err: {status.err}</div>
            ) : null}
            <div style={{ marginTop: 8 }}>
              overview sample:{" "}
              <code style={{ color: textStrong }}>{JSON.stringify(status.overviewSample)?.slice(0, 160)}…</code>
            </div>
            <div style={{ marginTop: 6 }}>
              series sample:{" "}
              <code style={{ color: textStrong }}>{JSON.stringify(status.seriesSample)?.slice(0, 160)}…</code>
            </div>
            <div style={{ marginTop: 8 }}>
              row found:{" "}
              <b style={{ color: row ? "#22c55e" : "#ef4444" }}>{row ? "YES" : "NO"}</b> / series points:{" "}
              <b style={{ color: teamSeries.length ? "#22c55e" : "#fbbf24" }}>{teamSeries.length}</b>
            </div>
          </div>
        </div>

        {/* ✅ 실제 콘텐츠: row가 없거나 시계열이 없어도 “페이지는 유지” */}
        <div style={{ display: "grid", gridTemplateColumns: "420px minmax(0, 1fr)", gap: 14, marginTop: 14 }}>
          <div style={{ background: card, border: cardBorder, borderRadius: 18, padding: 14 }}>
            <div style={{ color: "rgba(255,255,255,0.62)", fontSize: 12, fontWeight: 900 }}>SUMMARY</div>
            <div style={{ marginTop: 10, color: textDim, fontSize: 13, lineHeight: 1.7 }}>
              {!row ? (
                <>
                  overview에서 이 팀을 못 찾았어. (teamName 표기/공백 문제 가능)
                  <div style={{ marginTop: 8, color: "rgba(255,255,255,0.55)", fontSize: 12 }}>
                    해결: overview.json 팀명과 URL 팀명이 같은지 확인하거나, norm 매칭으로 이미 대부분 커버됨.
                  </div>
                </>
              ) : (
                <>
                  <div>
                    Team: <b style={{ color: textStrong }}>{row.team}</b>
                  </div>
                  <div style={{ marginTop: 6 }}>TSS: {fmt(row.TSS)} / SGP: {fmt(row.SGP)} / PTI: {fmt(row.PTI)}</div>
                </>
              )}
            </div>
          </div>

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
                      <Radar name={row.team} dataKey="team" stroke="#111827" fill="#111827" fillOpacity={0.20} />
                      <Radar name="League Avg" dataKey="league" stroke="#2563eb" fill="#2563eb" fillOpacity={0.12} />
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
                      <Line type="monotone" dataKey="TSS" stroke="#111827" dot={false} />
                      <Line type="monotone" dataKey="SGP" stroke="#2563eb" dot={false} />
                      <Line type="monotone" dataKey="PTI" stroke="#dc2626" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
