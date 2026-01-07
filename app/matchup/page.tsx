"use client";

import TopNav from "../components/TopNav";
import { useEffect, useMemo, useState } from "react";

/**
 * ✅ Matchup 통합 Page (3탭)
 * 1) Matches  : 경기별 비교 (필터 + 테이블 + 디테일)
 * 2) Summary  : Archetype × Archetype 매트릭스 (matchup_label_result.csv)
 * 3) Team Matrix : Team × Team 12×12 매트릭스 (matchup_long_team_perspective.csv로 즉석 집계)
 *
 * 필요 파일:
 * - /public/data/matchup_long_team_perspective.csv
 * - /public/data/matchup_label_result.csv
 * - /public/logos/*.png  (너가 제공한 한글 파일명 매핑)
 */

// -------------------------
// Types
// -------------------------

type MatchRow = {
  game_id: number;
  game_date: string;

  team_id: number;
  team_name_ko: string;
  opp_team_id: number;
  opp_team_name_ko: string;

  team_Cluster: number;
  team_PTI_BAND: string;
  opp_Cluster: number;
  opp_PTI_BAND: string;

  team_score: number;
  opp_score: number;

  TSS: number;
  SGP: number;
  PTI: number;

  dTSS: number;
  dSGP: number;
  dPTI: number;

  win: number;
  draw: number;
  loss: number;
  result_pts: number;
};

type SummaryRow = {
  team_label: string;
  opp_label: string;
  games: number;
  ppg: number;
  avg_gd: number;
  gf: number;
  ga: number;
  win_rate: number;
  draw_rate: number;
  loss_rate: number;
};

type TeamAgg = {
  team: string;
  opp: string;
  games: number;
  ppg: number;
  avg_gd: number;
  gf: number;
  ga: number;
  win_rate: number;
  draw_rate: number;
  loss_rate: number;
};

// -------------------------
// Team logo + short name (사용자 제공 버전)
// -------------------------

function teamLogoSrc(name: string) {
  const m: Record<string, string> = {
    강원FC: "/logos/강원fc.png",
    광주FC: "/logos/광주fc.png",
    "김천 상무 프로축구단": "/logos/김천상무.png",
    대구FC: "/logos/대구fc.png",
    "대전 하나 시티즌": "/logos/대전하나시티즌.png",
    수원FC: "/logos/수원fc.png",
    "울산 HD FC": "/logos/울산HD.png",
    "인천 유나이티드": "/logos/인천유나이티드.png",
    "전북 현대 모터스": "/logos/전북현대.png",
    "제주SK FC": "/logos/제주sk.png",
    "포항 스틸러스": "/logos/포항스틸러스.png",
    FC서울: "/logos/fc서울.png",
  };
  return m[name] ?? null;
}

function shortName(name: string) {
  const m: Record<string, string> = {
    강원FC: "강원",
    광주FC: "광주",
    "김천 상무 프로축구단": "김천",
    대구FC: "대구",
    "대전 하나 시티즌": "대전",
    수원FC: "수원",
    "울산 HD FC": "울산",
    "인천 유나이티드": "인천",
    "전북 현대 모터스": "전북",
    "제주SK FC": "제주",
    "포항 스틸러스": "포항",
    FC서울: "서울",
  };
  return m[name] ?? name;
}

// -------------------------
// Utils
// -------------------------

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function fmt(n: number, d = 2) {
  return Number.isFinite(n) ? n.toFixed(d) : "—";
}

function safeNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function parseCSV(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length <= 1) return { header: [], rows: [] as string[][] };

  const header = lines[0].split(",").map((h) => h.trim());
  const rows = lines.slice(1).map((line) => line.split(",").map((c) => c.trim()));
  return { header, rows };
}

function buildObjects(header: string[], rows: string[][]) {
  return rows.map((r) => {
    const obj: Record<string, string> = {};
    header.forEach((h, i) => (obj[h] = r[i] ?? ""));
    return obj;
  });
}

function structuralLabel(dTSS: number, dSGP: number, dPTI: number) {
  const score = dTSS + dSGP + dPTI;
  const th = 10;
  if (!Number.isFinite(score)) return "—";
  if (score >= th) return "ADV";
  if (score <= -th) return "DIS";
  return "NEU";
}

function badgeStyle(kind: "ADV" | "NEU" | "DIS" | "W" | "D" | "L") {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.14)",
    fontSize: 12,
    fontWeight: 900 as const,
    letterSpacing: 0.2,
    color: "rgba(255,255,255,0.92)",
  };

  if (kind === "ADV") return { ...base, background: "rgba(34,197,94,0.16)" };
  if (kind === "DIS") return { ...base, background: "rgba(239,68,68,0.16)" };
  if (kind === "NEU") return { ...base, background: "rgba(148,163,184,0.16)" };

  if (kind === "W") return { ...base, background: "rgba(34,197,94,0.16)" };
  if (kind === "L") return { ...base, background: "rgba(239,68,68,0.16)" };
  return { ...base, background: "rgba(148,163,184,0.16)" };
}

function cellColor(metric: "ppg" | "avg_gd" | "win_rate", v: number) {
  const t =
    metric === "avg_gd"
      ? (v + 1.0) / 2.0
      : metric === "ppg"
      ? v / 3.0
      : v;

  const x = clamp(t, 0, 1);
  if (x < 0.5) {
    const a = 0.12 + (0.58 * (0.5 - x)) / 0.5;
    return `rgba(59,130,246,${a})`;
  } else {
    const a = 0.12 + (0.58 * (x - 0.5)) / 0.5;
    return `rgba(239,68,68,${a})`;
  }
}

function resultChar(r: MatchRow) {
  if (r.win === 1) return "W";
  if (r.draw === 1) return "D";
  if (r.loss === 1) return "L";
  return "—";
}

// -------------------------
// Page
// -------------------------

export default function MatchupPage() {
  const [mode, setMode] = useState<"matches" | "summary" | "team_matrix">("matches");

  // Matches
  const [matches, setMatches] = useState<MatchRow[] | null>(null);
  const [mErr, setMErr] = useState<string | null>(null);

  // Summary
  const [summary, setSummary] = useState<SummaryRow[] | null>(null);
  const [sErr, setSErr] = useState<string | null>(null);
  const [sumMetric, setSumMetric] = useState<"ppg" | "avg_gd" | "win_rate">("ppg");
  const [hoverSum, setHoverSum] = useState<SummaryRow | null>(null);

  // Team Matrix
  const [teamMetric, setTeamMetric] = useState<"ppg" | "avg_gd" | "win_rate">("ppg");
  const [hoverTeam, setHoverTeam] = useState<TeamAgg | null>(null);

  // Filters (matches)
  const [teamFilter, setTeamFilter] = useState<string>("ALL");
  const [oppFilter, setOppFilter] = useState<string>("ALL");
  const [labelFilter, setLabelFilter] = useState<"ALL" | "ADV" | "NEU" | "DIS">("ALL");
  const [resultFilter, setResultFilter] = useState<"ALL" | "W" | "D" | "L">("ALL");
  const [search, setSearch] = useState<string>("");

  const [selected, setSelected] = useState<MatchRow | null>(null);

  // Load matches
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/data/matchup_long_team_perspective.csv", { cache: "no-store" });
        if (!res.ok) throw new Error(`matchup_long_team_perspective.csv fetch failed: ${res.status}`);
        const text = await res.text();
        const { header, rows } = parseCSV(text);
        const objs = buildObjects(header, rows);

        const out: MatchRow[] = objs
          .map((o) => ({
            game_id: Number(o.game_id),
            game_date: o.game_date,

            team_id: Number(o.team_id),
            team_name_ko: o.team_name_ko,
            opp_team_id: Number(o.opp_team_id),
            opp_team_name_ko: o.opp_team_name_ko,

            team_Cluster: Number(o.team_Cluster),
            team_PTI_BAND: o.team_PTI_BAND,
            opp_Cluster: Number(o.opp_Cluster),
            opp_PTI_BAND: o.opp_PTI_BAND,

            team_score: Number(o.team_score),
            opp_score: Number(o.opp_score),

            TSS: Number(o.TSS),
            SGP: Number(o.SGP),
            PTI: Number(o.PTI),

            dTSS: Number(o.dTSS),
            dSGP: Number(o.dSGP),
            dPTI: Number(o.dPTI),

            win: Number(o.win),
            draw: Number(o.draw),
            loss: Number(o.loss),
            result_pts: Number(o.result_pts),
          }))
          .filter((r) => Number.isFinite(r.game_id) && r.team_name_ko && r.opp_team_name_ko);

        if (!alive) return;
        setMatches(out);
        setSelected(out[0] ?? null);
        setMErr(null);
      } catch (e: any) {
        if (!alive) return;
        setMatches([]);
        setSelected(null);
        setMErr(e?.message ?? String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Load summary
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/data/matchup_label_result.csv", { cache: "no-store" });
        if (!res.ok) throw new Error(`matchup_label_result.csv fetch failed: ${res.status}`);
        const text = await res.text();
        const { header, rows } = parseCSV(text);

        const it = header.indexOf("team_label");
        const io = header.indexOf("opp_label");
        if (it < 0 || io < 0) throw new Error("matchup_label_result.csv header에 team_label/opp_label이 없습니다.");

        const out: SummaryRow[] = rows
          .map((c) => ({
            team_label: c[it],
            opp_label: c[io],
            games: safeNum(c[header.indexOf("games")]),
            ppg: safeNum(c[header.indexOf("ppg")]),
            avg_gd: safeNum(c[header.indexOf("avg_gd")]),
            gf: safeNum(c[header.indexOf("gf")]),
            ga: safeNum(c[header.indexOf("ga")]),
            win_rate: safeNum(c[header.indexOf("win_rate")]),
            draw_rate: safeNum(c[header.indexOf("draw_rate")]),
            loss_rate: safeNum(c[header.indexOf("loss_rate")]),
          }))
          .filter((r) => r.team_label && r.opp_label);

        if (!alive) return;
        setSummary(out);
        setSErr(null);
      } catch (e: any) {
        if (!alive) return;
        setSummary([]);
        setSErr(e?.message ?? String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Team list
  const teamList = useMemo(() => {
    const s = new Set<string>();
    (matches ?? []).forEach((r) => s.add(r.team_name_ko));
    return ["ALL", ...Array.from(s).sort((a, b) => a.localeCompare(b))];
  }, [matches]);

  const oppList = useMemo(() => {
    const s = new Set<string>();
    (matches ?? []).forEach((r) => s.add(r.opp_team_name_ko));
    return ["ALL", ...Array.from(s).sort((a, b) => a.localeCompare(b))];
  }, [matches]);

  // Filtered matches
  const filtered = useMemo(() => {
    const data = matches ?? [];
    const q = search.trim();
    return data
      .filter((r) => (teamFilter === "ALL" ? true : r.team_name_ko === teamFilter))
      .filter((r) => (oppFilter === "ALL" ? true : r.opp_team_name_ko === oppFilter))
      .filter((r) => {
        if (labelFilter === "ALL") return true;
        const lab = structuralLabel(r.dTSS, r.dSGP, r.dPTI);
        return lab === labelFilter;
      })
      .filter((r) => {
        if (resultFilter === "ALL") return true;
        return resultChar(r) === resultFilter;
      })
      .filter((r) => {
        if (!q) return true;
        const hay = `${r.team_name_ko} ${r.opp_team_name_ko} ${r.game_date} ${r.game_id}`.toLowerCase();
        return hay.includes(q.toLowerCase());
      })
      .sort((a, b) => (a.game_date < b.game_date ? 1 : -1));
  }, [matches, teamFilter, oppFilter, labelFilter, resultFilter, search]);

  // Summary matrix labels
  const sumLabels = useMemo(() => {
    const s = new Set<string>();
    (summary ?? []).forEach((r) => {
      s.add(r.team_label);
      s.add(r.opp_label);
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [summary]);

  const sumMatrix = useMemo(() => {
    const m = new Map<string, SummaryRow>();
    (summary ?? []).forEach((r) => m.set(`${r.team_label}__${r.opp_label}`, r));
    return m;
  }, [summary]);

  // Team Matrix teams (12)
  const teamNames = useMemo(() => {
    const s = new Set<string>();
    (matches ?? []).forEach((r) => s.add(r.team_name_ko));
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [matches]);

  const teamAggMatrix = useMemo(() => {
    const data = matches ?? [];
    const key = (t: string, o: string) => `${t}__${o}`;

    const acc = new Map<
      string,
      {
        games: number;
        pts: number;
        gd: number;
        gf: number;
        ga: number;
        w: number;
        d: number;
        l: number;
      }
    >();

    for (const r of data) {
      const k = key(r.team_name_ko, r.opp_team_name_ko);
      const a = acc.get(k) ?? { games: 0, pts: 0, gd: 0, gf: 0, ga: 0, w: 0, d: 0, l: 0 };
      a.games += 1;
      a.pts += Number.isFinite(r.result_pts) ? r.result_pts : 0;
      a.gd += Number.isFinite(r.team_score) && Number.isFinite(r.opp_score) ? r.team_score - r.opp_score : 0;
      a.gf += Number.isFinite(r.team_score) ? r.team_score : 0;
      a.ga += Number.isFinite(r.opp_score) ? r.opp_score : 0;
      a.w += r.win === 1 ? 1 : 0;
      a.d += r.draw === 1 ? 1 : 0;
      a.l += r.loss === 1 ? 1 : 0;
      acc.set(k, a);
    }

    const out = new Map<string, TeamAgg>();
    for (const [k, a] of acc.entries()) {
      const [team, opp] = k.split("__");
      const games = Math.max(a.games, 1);
      out.set(k, {
        team,
        opp,
        games: a.games,
        ppg: a.pts / games,
        avg_gd: a.gd / games,
        gf: a.gf / games,
        ga: a.ga / games,
        win_rate: a.w / games,
        draw_rate: a.d / games,
        loss_rate: a.l / games,
      });
    }
    return out;
  }, [matches]);

  const loadingMatches = matches === null;
  const loadingSummary = summary === null;

  return (
    <main style={{ minHeight: "100vh", background: "#0b1020", color: "white", padding: "24px 20px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <TopNav />

        {/* Header + Tabs */}
        <div style={{ marginTop: 16, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 30, fontWeight: 950 }}>Matchup</div>
            <div style={{ marginTop: 6, opacity: 0.75 }}>
              Matches + Summary(Archetype×Archetype) + Team Matrix(12×12). Not prediction — conditional structure.
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {TabBtn("Matches", mode === "matches", () => setMode("matches"))}
            {TabBtn("Summary", mode === "summary", () => setMode("summary"))}
            {TabBtn("Team Matrix", mode === "team_matrix", () => setMode("team_matrix"))}
          </div>
        </div>

        {/* -------------------- MATCHES -------------------- */}
        {mode === "matches" && (
          <>
            {loadingMatches ? (
              <div style={{ marginTop: 18, fontWeight: 900 }}>Loading matches…</div>
            ) : (
              <>
                {mErr && (
                  <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: "rgba(255,255,255,0.08)" }}>
                    <b>Load error:</b> {mErr}
                    <div style={{ marginTop: 6, opacity: 0.8 }}>✅ public/data/matchup_long_team_perspective.csv 경로 확인</div>
                  </div>
                )}

                {/* Filters */}
                <div
                  style={{
                    marginTop: 14,
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    borderRadius: 18,
                    padding: 14,
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 180px 180px 1fr",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} style={selectStyleFix()}>
                    {teamList.map((t) => (
                      <option key={t} value={t}>
                        {t === "ALL" ? "팀(전체)" : t}
                      </option>
                    ))}
                  </select>

                  <select value={oppFilter} onChange={(e) => setOppFilter(e.target.value)} style={selectStyleFix()}>
                    {oppList.map((t) => (
                      <option key={t} value={t}>
                        {t === "ALL" ? "상대(전체)" : t}
                      </option>
                    ))}
                  </select>

                  <select value={labelFilter} onChange={(e) => setLabelFilter(e.target.value as any)} style={selectStyleFix()}>
                    <option value="ALL">구조라벨(전체)</option>
                    <option value="ADV">ADV (우위)</option>
                    <option value="NEU">NEU (중립)</option>
                    <option value="DIS">DIS (열위)</option>
                  </select>

                  <select value={resultFilter} onChange={(e) => setResultFilter(e.target.value as any)} style={selectStyleFix()}>
                    <option value="ALL">결과(전체)</option>
                    <option value="W">W</option>
                    <option value="D">D</option>
                    <option value="L">L</option>
                  </select>

                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="검색: 팀/상대/날짜/game_id"
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.14)",
                      background: "rgba(255,255,255,0.06)",
                      color: "rgba(255,255,255,0.92)",
                      fontWeight: 800,
                      outline: "none",
                    }}
                  />
                </div>

                {/* Table + Detail */}
                <div
                  style={{
                    marginTop: 12,
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    borderRadius: 18,
                    padding: 14,
                    display: "grid",
                    gridTemplateColumns: "1fr 340px",
                    gap: 12,
                    alignItems: "start",
                  }}
                >
                  {/* Table */}
                  <div style={{ overflowX: "auto" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontWeight: 950, opacity: 0.9 }}>Matches (filtered: {filtered.length})</div>
                      <div style={{ fontSize: 12, opacity: 0.65 }}>* 구조라벨 = dTSS+dSGP+dPTI (th=10)</div>
                    </div>

                    <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, marginTop: 10 }}>
                      <thead>
                        <tr style={{ textAlign: "left", fontSize: 12, opacity: 0.9 }}>
                          {["date", "team", "opp", "score", "struct", "result", "dTSS", "dSGP", "dPTI", "teamC", "oppC"].map(
                            (h) => (
                              <th
                                key={h}
                                style={{ padding: "10px 10px", borderBottom: "1px solid rgba(255,255,255,0.10)" }}
                              >
                                {h}
                              </th>
                            )
                          )}
                        </tr>
                      </thead>

                      <tbody>
                        {filtered.slice(0, 220).map((r) => {
                          const struct = structuralLabel(r.dTSS, r.dSGP, r.dPTI) as "ADV" | "NEU" | "DIS" | "—";
                          const res = resultChar(r) as "W" | "D" | "L" | "—";
                          const isSel = selected?.game_id === r.game_id && selected?.team_id === r.team_id;

                          return (
                            <tr
                              key={`${r.game_id}-${r.team_id}`}
                              onClick={() => setSelected(r)}
                              style={{
                                cursor: "pointer",
                                background: isSel ? "rgba(255,255,255,0.08)" : "transparent",
                              }}
                            >
                              <td style={tdStyle()}>{r.game_date}</td>
                              <td style={tdStyle()}>{r.team_name_ko}</td>
                              <td style={tdStyle()}>{r.opp_team_name_ko}</td>
                              <td style={tdStyle()}>
                                {r.team_score}-{r.opp_score}
                              </td>
                              <td style={tdStyle()}>{struct !== "—" ? <span style={badgeStyle(struct)}>{struct}</span> : "—"}</td>
                              <td style={tdStyle()}>{res !== "—" ? <span style={badgeStyle(res)}>{res}</span> : "—"}</td>
                              <td style={tdStyle()}>{fmt(r.dTSS, 2)}</td>
                              <td style={tdStyle()}>{fmt(r.dSGP, 2)}</td>
                              <td style={tdStyle()}>{fmt(r.dPTI, 2)}</td>
                              <td style={tdStyle()}>{r.team_Cluster}</td>
                              <td style={tdStyle()}>{r.opp_Cluster}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    <div style={{ marginTop: 10, fontSize: 12, opacity: 0.65 }}>* 상위 220행만 표시(속도).</div>
                  </div>

                  {/* Detail */}
                  <div
                    style={{
                      borderRadius: 18,
                      padding: 14,
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.10)",
                    }}
                  >
                    <div style={{ fontWeight: 950, opacity: 0.85 }}>DETAIL</div>

                    {!selected ? (
                      <div style={{ marginTop: 10, opacity: 0.75, fontSize: 13, lineHeight: 1.6 }}>
                        좌측에서 경기를 클릭하면 상세가 뜹니다.
                      </div>
                    ) : (
                      <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.75 }}>
                        <div style={{ fontWeight: 950 }}>
                          {selected.team_name_ko} <span style={{ opacity: 0.7 }}>vs</span> {selected.opp_team_name_ko}
                        </div>
                        <div style={{ opacity: 0.75, marginTop: 2 }}>
                          game_id: {selected.game_id} · {selected.game_date}
                        </div>

                        <div style={{ marginTop: 10 }}>
                          <b>Score:</b> {selected.team_score} - {selected.opp_score}{" "}
                          <span style={badgeStyle(resultChar(selected) as any)}>{resultChar(selected)}</span>
                        </div>

                        <div style={{ marginTop: 10 }}>
                          <b>Structural:</b>{" "}
                          <span style={badgeStyle(structuralLabel(selected.dTSS, selected.dSGP, selected.dPTI) as any)}>
                            {structuralLabel(selected.dTSS, selected.dSGP, selected.dPTI)}
                          </span>
                        </div>

                        <div style={{ marginTop: 10 }}>
                          <div style={{ fontWeight: 950, opacity: 0.9 }}>Delta (team - opp)</div>
                          <div>dTSS: <b>{fmt(selected.dTSS, 2)}</b></div>
                          <div>dSGP: <b>{fmt(selected.dSGP, 2)}</b></div>
                          <div>dPTI: <b>{fmt(selected.dPTI, 2)}</b></div>
                        </div>

                        <div style={{ marginTop: 10 }}>
                          <div style={{ fontWeight: 950, opacity: 0.9 }}>Team / Opp Cluster</div>
                          <div>Team: C{selected.team_Cluster} · {selected.team_PTI_BAND}</div>
                          <div>Opp: C{selected.opp_Cluster} · {selected.opp_PTI_BAND}</div>
                        </div>

                        <div style={{ marginTop: 10 }}>
                          <div style={{ fontWeight: 950, opacity: 0.9 }}>Raw (this match)</div>
                          <div>TSS/SGP/PTI: {fmt(selected.TSS)} / {fmt(selected.SGP)} / {fmt(selected.PTI)}</div>
                          <div>PTS: {selected.result_pts}</div>
                        </div>

                        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.65 }}>
                          구조(ADV/NEU/DIS)와 결과(W/D/L)가 어긋나는 경기 = 예외 케이스 카드로 뽑으면 발표가 강해짐.
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* -------------------- SUMMARY -------------------- */}
        {mode === "summary" && (
          <>
            {loadingSummary ? (
              <div style={{ marginTop: 18, fontWeight: 900 }}>Loading summary…</div>
            ) : (
              <>
                {sErr && (
                  <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: "rgba(255,255,255,0.08)" }}>
                    <b>Load error:</b> {sErr}
                    <div style={{ marginTop: 6, opacity: 0.8 }}>✅ public/data/matchup_label_result.csv 경로 확인</div>
                  </div>
                )}

                <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  {(["ppg", "avg_gd", "win_rate"] as const).map((m) => (
                    <button key={m} onClick={() => setSumMetric(m)} style={metricBtnStyle(sumMetric === m)}>
                      {m}
                    </button>
                  ))}
                </div>

                <div
                  style={{
                    marginTop: 12,
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    borderRadius: 18,
                    padding: 14,
                    display: "grid",
                    gridTemplateColumns: "1fr 320px",
                    gap: 12,
                    alignItems: "start",
                  }}
                >
                  <div style={{ overflowX: "auto" }}>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: `220px repeat(${sumLabels.length}, minmax(110px, 1fr))`,
                        gap: 8,
                        alignItems: "stretch",
                      }}
                    >
                      <div />
                      {sumLabels.map((lab) => (
                        <div
                          key={`col-${lab}`}
                          style={{
                            position: "sticky",
                            top: 0,
                            zIndex: 20,
                            padding: "10px 10px",
                            borderRadius: 12,
                            background: "rgba(15,23,42,0.92)",
                            border: "1px solid rgba(255,255,255,0.10)",
                            fontWeight: 950,
                            fontSize: 12,
                            opacity: 0.95,
                            whiteSpace: "nowrap",
                          }}
                          title={lab}
                        >
                          {lab}
                        </div>
                      ))}

                      {sumLabels.map((rowLab) => (
                        <>
                          <div
                            key={`row-${rowLab}`}
                            style={{
                              position: "sticky",
                              left: 0,
                              zIndex: 15,
                              padding: "10px 10px",
                              borderRadius: 12,
                              background: "rgba(15,23,42,0.92)",
                              border: "1px solid rgba(255,255,255,0.10)",
                              fontWeight: 950,
                              fontSize: 12,
                              opacity: 0.95,
                              whiteSpace: "nowrap",
                            }}
                            title={rowLab}
                          >
                            {rowLab}
                          </div>

                          {sumLabels.map((colLab) => {
                            const r = sumMatrix.get(`${rowLab}__${colLab}`) ?? null;
                            const v = r ? (r as any)[sumMetric] : NaN;
                            const bg = r ? cellColor(sumMetric, Number(v)) : "rgba(255,255,255,0.03)";

                            return (
                              <div
                                key={`${rowLab}__${colLab}`}
                                onMouseEnter={() => setHoverSum(r)}
                                onMouseLeave={() => setHoverSum(null)}
                                style={{
                                  padding: 10,
                                  borderRadius: 14,
                                  border: "1px solid rgba(255,255,255,0.10)",
                                  background: bg,
                                  minHeight: 56,
                                }}
                              >
                                <div style={{ fontWeight: 950, fontSize: 14 }}>
                                  {r ? fmt(Number(v), sumMetric === "win_rate" ? 3 : 2) : "—"}
                                </div>
                                <div style={{ marginTop: 4, fontSize: 11, opacity: 0.75 }}>
                                  {r ? `games ${r.games}` : ""}
                                </div>
                              </div>
                            );
                          })}
                        </>
                      ))}
                    </div>
                  </div>

                  <DetailCardSummary hover={hoverSum} />
                </div>
              </>
            )}
          </>
        )}

        {/* -------------------- TEAM MATRIX (로고 + sticky) -------------------- */}
        {mode === "team_matrix" && (
          <>
            {loadingMatches ? (
              <div style={{ marginTop: 18, fontWeight: 900 }}>Loading team matrix…</div>
            ) : (
              <>
                <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  {(["ppg", "avg_gd", "win_rate"] as const).map((m) => (
                    <button key={m} onClick={() => setTeamMetric(m)} style={metricBtnStyle(teamMetric === m)}>
                      {m}
                    </button>
                  ))}
                </div>

                <div
                  style={{
                    marginTop: 12,
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    borderRadius: 18,
                    padding: 14,
                    display: "grid",
                    gridTemplateColumns: "1fr 320px",
                    gap: 12,
                    alignItems: "start",
                  }}
                >
                  {/* Matrix */}
                  <div style={{ overflowX: "auto" }}>
                    <div style={{ fontWeight: 950, opacity: 0.9, marginBottom: 10 }}>
                      Team × Team Matrix ({teamNames.length} teams)
                      <span style={{ marginLeft: 10, fontSize: 12, opacity: 0.65 }}>
                        * long 데이터 즉석 집계(조건부 평균)
                      </span>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: `220px repeat(${teamNames.length}, minmax(110px, 1fr))`,
                        gap: 8,
                        alignItems: "stretch",
                      }}
                    >
                      {/* top-left empty sticky corner */}
                      <div
                        style={{
                          position: "sticky",
                          top: 0,
                          left: 0,
                          zIndex: 30,
                          height: 1,
                        }}
                      />

                      {/* Column headers (sticky top) */}
                      {teamNames.map((lab) => {
                        const src = teamLogoSrc(lab);
                        return (
                          <div
                            key={`tcol-${lab}`}
                            style={{
                              position: "sticky",
                              top: 0,
                              zIndex: 20,
                              padding: "8px 8px",
                              borderRadius: 12,
                              background: "rgba(15,23,42,0.92)",
                              border: "1px solid rgba(255,255,255,0.10)",
                              fontWeight: 950,
                              fontSize: 12,
                              opacity: 0.95,
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              justifyContent: "center",
                              whiteSpace: "nowrap",
                            }}
                            title={lab}
                          >
                            {src ? (
                              <img src={src} alt={lab} style={{ width: 22, height: 22, objectFit: "contain" }} />
                            ) : (
                              <span
                                style={{
                                  width: 22,
                                  height: 22,
                                  borderRadius: 999,
                                  background: "rgba(255,255,255,0.12)",
                                  display: "inline-block",
                                }}
                              />
                            )}
                            <span>{shortName(lab)}</span>
                          </div>
                        );
                      })}

                      {/* Rows */}
                      {teamNames.map((rowTeam) => (
                        <>
                          {/* Row header (sticky left) */}
                          <div
                            key={`trow-${rowTeam}`}
                            style={{
                              position: "sticky",
                              left: 0,
                              zIndex: 15,
                              padding: "8px 8px",
                              borderRadius: 12,
                              background: "rgba(15,23,42,0.92)",
                              border: "1px solid rgba(255,255,255,0.10)",
                              fontWeight: 950,
                              fontSize: 12,
                              opacity: 0.95,
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              whiteSpace: "nowrap",
                            }}
                            title={rowTeam}
                          >
                            {teamLogoSrc(rowTeam) ? (
                              <img
                                src={teamLogoSrc(rowTeam)!}
                                alt={rowTeam}
                                style={{ width: 22, height: 22, objectFit: "contain" }}
                              />
                            ) : null}
                            {shortName(rowTeam)}
                          </div>

                          {/* Cells */}
                          {teamNames.map((colTeam) => {
                            const r = teamAggMatrix.get(`${rowTeam}__${colTeam}`) ?? null;
                            const v = r ? (r as any)[teamMetric] : NaN;
                            const bg = r ? cellColor(teamMetric, Number(v)) : "rgba(255,255,255,0.03)";

                            // 자기 자신(대진X)은 대시 표시
                            const isSelf = rowTeam === colTeam;

                            return (
                              <div
                                key={`${rowTeam}__${colTeam}`}
                                onMouseEnter={() => setHoverTeam(r)}
                                onMouseLeave={() => setHoverTeam(null)}
                                style={{
                                  padding: 8,
                                  borderRadius: 12,
                                  border: "1px solid rgba(255,255,255,0.10)",
                                  background: isSelf ? "rgba(255,255,255,0.04)" : bg,
                                  minHeight: 52,
                                  transition: "transform 120ms ease, border-color 120ms ease",
                                }}
                              >
                                <div style={{ fontWeight: 950, fontSize: 14 }}>
                                  {isSelf ? "—" : r ? fmt(Number(v), teamMetric === "win_rate" ? 3 : 2) : "—"}
                                </div>
                                <div style={{ marginTop: 4, fontSize: 11, opacity: 0.75 }}>
                                  {!isSelf && r ? `games ${r.games}` : ""}
                                </div>
                              </div>
                            );
                          })}
                        </>
                      ))}
                    </div>
                  </div>

                  <DetailCardTeam hover={hoverTeam} />
                </div>
              </>
            )}
          </>
        )}

        <div style={{ marginTop: 14, opacity: 0.65, fontSize: 12 }}>
          ✅ Team Matrix는 로고+sticky 헤더 적용 완료. 드롭다운은 흰 배경/검정 글씨로 “옵션 글씨 안 보임” 문제 해결.
        </div>
      </div>
    </main>
  );
}

// -------------------------
// Components
// -------------------------

function DetailCardSummary({ hover }: { hover: SummaryRow | null }) {
  return (
    <div
      style={{
        borderRadius: 18,
        padding: 14,
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.10)",
      }}
    >
      <div style={{ fontWeight: 950, opacity: 0.85 }}>DETAIL</div>

      {!hover ? (
        <div style={{ marginTop: 10, opacity: 0.75, fontSize: 13, lineHeight: 1.6 }}>
          셀에 마우스를 올리면 요약이 나옵니다.
          <div style={{ marginTop: 10, opacity: 0.6, fontSize: 12 }}>“예측”이 아니라 “조건부 경향성”</div>
        </div>
      ) : (
        <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.7 }}>
          <div style={{ fontWeight: 950 }}>
            {hover.team_label} <span style={{ opacity: 0.7 }}>vs</span> {hover.opp_label}
          </div>
          <div style={{ marginTop: 8, opacity: 0.85 }}>
            games: <b>{hover.games}</b>
          </div>
          <div>ppg: <b>{fmt(hover.ppg)}</b></div>
          <div>avg_gd: <b>{fmt(hover.avg_gd)}</b></div>
          <div>
            gf/ga: <b>{fmt(hover.gf)}</b> / <b>{fmt(hover.ga)}</b>
          </div>
          <div style={{ marginTop: 8 }}>
            W/D/L: <b>{fmt(hover.win_rate, 3)}</b> / <b>{fmt(hover.draw_rate, 3)}</b> /{" "}
            <b>{fmt(hover.loss_rate, 3)}</b>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailCardTeam({ hover }: { hover: TeamAgg | null }) {
  return (
    <div
      style={{
        borderRadius: 18,
        padding: 14,
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.10)",
      }}
    >
      <div style={{ fontWeight: 950, opacity: 0.85 }}>DETAIL</div>

      {!hover ? (
        <div style={{ marginTop: 10, opacity: 0.75, fontSize: 13, lineHeight: 1.6 }}>
          셀에 마우스를 올리면 팀×팀 요약이 나옵니다.
          <div style={{ marginTop: 10, opacity: 0.6, fontSize: 12 }}>
            Team Matrix는 “실전 팀-팀 관계”를 한눈에 보여줍니다.
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.7 }}>
          <div style={{ fontWeight: 950, display: "flex", alignItems: "center", gap: 8 }}>
            {teamLogoSrc(hover.team) ? (
              <img src={teamLogoSrc(hover.team)!} alt={hover.team} style={{ width: 22, height: 22, objectFit: "contain" }} />
            ) : null}
            {shortName(hover.team)} <span style={{ opacity: 0.7 }}>vs</span>{" "}
            {teamLogoSrc(hover.opp) ? (
              <img src={teamLogoSrc(hover.opp)!} alt={hover.opp} style={{ width: 22, height: 22, objectFit: "contain" }} />
            ) : null}
            {shortName(hover.opp)}
          </div>

          <div style={{ marginTop: 8, opacity: 0.85 }}>
            games: <b>{hover.games}</b>
          </div>
          <div>ppg: <b>{fmt(hover.ppg)}</b></div>
          <div>avg_gd: <b>{fmt(hover.avg_gd)}</b></div>
          <div>
            gf/ga (per game): <b>{fmt(hover.gf)}</b> / <b>{fmt(hover.ga)}</b>
          </div>
          <div style={{ marginTop: 8 }}>
            W/D/L: <b>{fmt(hover.win_rate, 3)}</b> / <b>{fmt(hover.draw_rate, 3)}</b> / <b>{fmt(hover.loss_rate, 3)}</b>
          </div>
        </div>
      )}
    </div>
  );
}

// -------------------------
// UI helpers
// -------------------------

function TabBtn(label: string, active: boolean, onClick: () => void) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "10px 12px",
        borderRadius: 12,
        border: active ? "1px solid rgba(255,255,255,0.40)" : "1px solid rgba(255,255,255,0.14)",
        background: active ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.07)",
        color: "rgba(255,255,255,0.92)",
        fontWeight: 900,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function metricBtnStyle(active: boolean) {
  return {
    padding: "10px 12px",
    borderRadius: 12,
    border: active ? "1px solid rgba(255,255,255,0.40)" : "1px solid rgba(255,255,255,0.14)",
    background: active ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.07)",
    color: "rgba(255,255,255,0.92)",
    fontWeight: 900 as const,
    cursor: "pointer",
  };
}

function tdStyle() {
  return {
    padding: "10px 10px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    fontSize: 12,
    opacity: 0.92,
    whiteSpace: "nowrap" as const,
  };
}

/**
 * ✅ Windows 기본 select 옵션이 흰 배경이라 글씨가 안 보이던 문제 해결용
 */
function selectStyleFix() {
  return {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.92)",
    color: "#111827",
    fontWeight: 900 as const,
    outline: "none",
  };
}
