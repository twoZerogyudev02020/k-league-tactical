"use client";

import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  Cell,
  LabelList,
} from "recharts";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Row = {
  team: string;
  TSS: number;
  SGP: number;
  PTI: number;
};

type ClusterRow = {
  team_name_ko: string;
  Cluster: number;
};

function mean(arr: number[]) {
  return arr.reduce((a, b) => a + b, 0) / Math.max(arr.length, 1);
}
function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
function ptToSize(pti: number, minPTI: number, maxPTI: number) {
  const t = (pti - minPTI) / Math.max(maxPTI - minPTI, 1e-9);
  return 70 + 230 * clamp(t, 0, 1); // 70~300
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
function quadrantLabel(tss: number, sgp: number, tssMean: number, sgpMean: number) {
  const hiT = tss >= tssMean;
  const hiS = sgp >= sgpMean;
  if (hiT && hiS) return "High-Execution Attacking";
  if (!hiT && hiS) return "Attacking w/ Low Execution";
  if (hiT && !hiS) return "High-Execution Controlled";
  return "Low-Activity Conservative";
}
function fmt(n: number) {
  return Number.isFinite(n) ? n.toFixed(2) : "-";
}

// ===== Cluster helpers =====
function normalizeTeamName(s: string) {
  return String(s).toLowerCase().replace(/\s+/g, "").trim();
}

function parseSimpleCSV(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length <= 1) return [];

  const header = lines[0].split(",").map((h) => h.trim());
  const idxTeam = header.findIndex((h) => {
    const nh = normalizeTeamName(h);
    return nh === "team_name_ko" || nh === "team" || nh === "teamname" || nh === "teamlabel";
  });
  const idxCl = header.findIndex((h) => normalizeTeamName(h) === "cluster");
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

function clusterColor(c: number | null | undefined) {
  if (c === null || c === undefined) return "rgba(17,24,39,0.22)";
  const palette = ["#a855f7", "#f59e0b", "#06b6d4", "#84cc16", "#f97316", "#14b8a6"];
  return palette[c % palette.length];
}

/** PDF 기반 클러스터 이름/기준(짧게) */
const CLUSTER_META: Record<
  number,
  { name: string; oneLine: string; bullets: string[] }
> = {
  0: {
    name: "저강도 역습 전환형",
    oneLine: "압박 개입은 낮고, 빠른 전환·직선 공격으로 효율 추구",
    bullets: [
      "TSS ↑ (전환/직선 공격 강점)",
      "SGP 중간 이상",
      "PTI ↓↓↓ (전술 개입/압박 낮음)",
    ],
  },
  1: {
    name: "고강도 빌드업 주도형",
    oneLine: "강한 압박·전술 개입으로 상대 전개 자체를 통제",
    bullets: [
      "PTI ↑↑↑ (전술 개입 강함)",
      "TSS/SGP는 낮을 수 있음(‘못함’이 아니라 ‘상대 전개 차단’)",
    ],
  },
  2: {
    name: "저강도 빌드업 운영형",
    oneLine: "압박보다 점유·패스 구조로 안정 운영(기술 중심)",
    bullets: [
      "TSS ↑↑, SGP ↑↑ (점유·구조 강점)",
      "PTI ↓ (강한 압박 팀에 취약 가능성)",
    ],
  },
  3: {
    name: "고강도 전환 직진형",
    oneLine: "강한 압박으로 탈취 후 즉각 공격(하이리스크/하이리턴)",
    bullets: [
      "PTI ↑ (압박 기반)",
      "SGP ↓, TSS 중간 (설계보다 순간 찌름/실수 유도)",
    ],
  },
};

/** ✅ 로고 경로: public/logos/{team}.png */
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

function CustomTooltip({ active, payload, clusterMap, colorMode, q1, q2 }: any) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload as any;

  const cl = clusterMap?.get?.(normalizeTeamName(d.team)) ?? null;
  const meta = cl !== null ? CLUSTER_META[cl] : null;

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.96)",
        border: "1px solid rgba(0,0,0,0.08)",
        padding: "10px 12px",
        borderRadius: 12,
        fontSize: 12,
        boxShadow: "0 12px 30px rgba(0,0,0,0.16)",
        minWidth: 220,
      }}
    >
      <div style={{ fontWeight: 900, marginBottom: 6, color: "#111827" }}>{d.team}</div>
      <div style={{ color: "#111827" }}>TSS: {fmt(d.TSS)}</div>
      <div style={{ color: "#111827" }}>SGP: {fmt(d.SGP)}</div>
      <div style={{ marginTop: 6, fontWeight: 800, color: "#111827" }}>PTI: {fmt(d.PTI)}</div>
      <div style={{ marginTop: 4, color: "#374151" }}>
        PTI Band: {ptiBand(d.PTI, q1, q2)}
      </div>
      <div style={{ marginTop: 4, color: "#374151" }}>
        Cluster:{" "}
        <span style={{ fontWeight: 900, color: "#111827" }}>
          {cl === null ? "—" : `C${cl} · ${meta?.name ?? ""}`}
        </span>
      </div>
      <div style={{ marginTop: 6, color: "#6b7280", fontSize: 11 }}>
        Color mode: {colorMode === "PTI" ? "PTI (fill)" : "Cluster (fill)"}
      </div>
    </div>
  );
}

export default function Home() {
  const router = useRouter();

  const [rows, setRows] = useState<Row[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [clusterRows, setClusterRows] = useState<ClusterRow[] | null>(null);
  const [clusterErr, setClusterErr] = useState<string | null>(null);
  const [clusterFilter, setClusterFilter] = useState<number | "ALL">("ALL");

  // ✅ 색상 모드: PTI / CLUSTER (혼합 표현 제거)
  const [colorMode, setColorMode] = useState<"PTI" | "CLUSTER">("CLUSTER"); // 기본을 CLUSTER로 추천

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/data/overview.json", { cache: "no-store" });
        if (!res.ok) throw new Error(`overview.json fetch failed: ${res.status}`);
        const json = await res.json();
        if (!alive) return;
        setRows(Array.isArray(json) ? (json as Row[]) : []);
      } catch (e: any) {
        if (!alive) return;
        setLoadErr(e?.message ?? String(e));
        setRows([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/data/team_clusters.csv", { cache: "no-store" });
        if (!res.ok) throw new Error(`team_clusters.csv fetch failed: ${res.status}`);
        const text = await res.text();
        const parsed = parseSimpleCSV(text);

        if (!alive) return;
        setClusterRows(parsed);
        setClusterErr(null);
      } catch (e: any) {
        if (!alive) return;
        setClusterRows([]);
        setClusterErr(e?.message ?? String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const [query, setQuery] = useState("");
  const [bandFilter, setBandFilter] = useState<"ALL" | "LOW" | "MID" | "HIGH">("ALL");
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);

  const derived = useMemo(() => {
    const safeRows = rows ?? [];
    if (!safeRows.length) {
      return { data: [] as any[], tssMean: 0, sgMean: 0, minPTI: 0, maxPTI: 1, q1: 0, q2: 1 };
    }

    const tssMean = mean(safeRows.map((r) => r.TSS));
    const sgMean = mean(safeRows.map((r) => r.SGP));

    const ptis = safeRows.map((r) => r.PTI).slice().sort((a, b) => a - b);
    const minPTI = ptis[0] ?? 0;
    const maxPTI = ptis[ptis.length - 1] ?? 1;

    const q1 = ptis[Math.floor(ptis.length * (1 / 3))] ?? minPTI;
    const q2 = ptis[Math.floor(ptis.length * (2 / 3))] ?? maxPTI;

    const data = safeRows.map((r) => {
      const band = ptiBand(r.PTI, q1, q2);
      return { ...r, band, color: ptiBandColor(band), size: ptToSize(r.PTI, minPTI, maxPTI) };
    });

    return { data, tssMean, sgMean, minPTI, maxPTI, q1, q2 };
  }, [rows]);

  const clusterMap = useMemo(() => {
    const m = new Map<string, number>();
    (clusterRows ?? []).forEach((r) => {
      m.set(normalizeTeamName(r.team_name_ko), r.Cluster);
    });
    return m;
  }, [clusterRows]);

  const clusterIds = useMemo(() => {
    const s = new Set<number>();
    (clusterRows ?? []).forEach((r) => s.add(r.Cluster));
    return Array.from(s).sort((a, b) => a - b);
  }, [clusterRows]);

  // ✅ bandFilter는 “PTI band 필터”라서, colorMode가 CLUSTER여도 그대로 유지 가능.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return derived.data.filter((d) => {
      const okName = q.length === 0 ? true : String(d.team).toLowerCase().includes(q);
      const okBand = bandFilter === "ALL" ? true : d.band === bandFilter;
      return okName && okBand;
    });
  }, [derived.data, query, bandFilter]);

  const selected = useMemo(() => {
    if (!selectedTeam) return null;
    return derived.data.find((d) => d.team === selectedTeam) ?? null;
  }, [derived.data, selectedTeam]);

  // ✅ (중요) “차트에서 흐리게 처리할 기준”에 clusterFilter도 포함
  const filteredTeamSet = useMemo(() => new Set(filtered.map((d) => d.team)), [filtered]);

  const full = derived.data;

  const hasAnyFilter =
    query.trim().length > 0 || bandFilter !== "ALL" || clusterFilter !== "ALL";

  const bg = "#0b1020";
  const card = "rgba(255,255,255,0.06)";
  const cardBorder = "1px solid rgba(255,255,255,0.10)";
  const textDim = "rgba(255,255,255,0.72)";
  const textStrong = "rgba(255,255,255,0.92)";

  const kpi = [
    { label: "Teams", value: String((rows ?? []).length) },
    { label: "TSS mean", value: fmt(derived.tssMean) },
    { label: "SGP mean", value: fmt(derived.sgMean) },
    { label: "PTI range", value: `${fmt(derived.minPTI)}–${fmt(derived.maxPTI)}` },
  ];

  // ✅ clusterFilter가 선택되면, 오른쪽 리스트/차트 둘 다 동일 기준 사용
  const matchesClusterFilter = (team: string) => {
    if (clusterFilter === "ALL") return true;
    const cl = clusterMap.get(normalizeTeamName(team));
    return cl === clusterFilter;
  };

  const filteredWithCluster = useMemo(() => {
    return filtered.map((t) => ({
      ...t,
      cluster: clusterMap.get(normalizeTeamName(t.team)) ?? null,
    }));
  }, [filtered, clusterMap]);

  // 클러스터 기준/이름이 “확실하게” 보이게: summary에 meta 노출
  const clusterSummary = useMemo(() => {
    const buckets = new Map<number, string[]>();
    (derived.data ?? []).forEach((t) => {
      const cl = clusterMap.get(normalizeTeamName(t.team));
      if (cl === undefined) return;
      const arr = buckets.get(cl) ?? [];
      arr.push(t.team);
      buckets.set(cl, arr);
    });

    return Array.from(buckets.entries())
      .map(([cl, teams]) => ({
        cl,
        teams: teams.slice().sort((a, b) => a.localeCompare(b)),
        meta: CLUSTER_META[cl],
      }))
      .sort((a, b) => a.cl - b.cl);
  }, [derived.data, clusterMap]);

  if (rows === null) {
    return (
      <main style={{ minHeight: "100vh", background: bg, padding: 28, color: textStrong }}>
        <div style={{ fontSize: 18, fontWeight: 950 }}>Loading overview…</div>
        <div style={{ marginTop: 8, color: textDim, fontSize: 13 }}>
          fetching <code style={{ color: textStrong }}>/data/overview.json</code>
        </div>
      </main>
    );
  }
  if (loadErr) {
    return (
      <main style={{ minHeight: "100vh", background: bg, padding: 28, color: textStrong }}>
        <div style={{ fontSize: 18, fontWeight: 950 }}>Overview data load failed</div>
        <div style={{ marginTop: 8, color: textDim, fontSize: 13, lineHeight: 1.6 }}>
          {loadErr}
          <div style={{ marginTop: 10 }}>
            ✅ <b>public/data/overview.json</b> 파일 존재 확인해.
          </div>
        </div>
      </main>
    );
  }

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
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
          <div>
            <div style={{ fontSize: 36, fontWeight: 950, letterSpacing: -0.6, color: textStrong }}>
              K League Tactical Overview
            </div>
            <div style={{ marginTop: 8, color: textDim, fontSize: 14 }}>
              TSS–SGP distribution (bubble size = PTI, color = mode). Dashed lines show league averages.
            </div>
          </div>

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
            Prototype • Overview
          </div>
        </div>

        {/* KPI cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, marginTop: 18 }}>
          {kpi.map((x) => (
            <div
              key={x.label}
              style={{
                background: card,
                border: cardBorder,
                borderRadius: 16,
                padding: "12px 14px",
              }}
            >
              <div style={{ color: "rgba(255,255,255,0.62)", fontSize: 12 }}>{x.label}</div>
              <div style={{ marginTop: 6, color: textStrong, fontSize: 18, fontWeight: 900 }}>{x.value}</div>
            </div>
          ))}
        </div>

        {/* Layout */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 340px",
            gap: 14,
            marginTop: 14,
            alignItems: "start",
          }}
        >
          {/* Left: Chart card */}
          <div
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 18,
              padding: 14,
              overflow: "hidden",
            }}
          >
            {/* Controls */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search team..."
                style={{
                  flex: "1 1 240px",
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.14)",
                  borderRadius: 12,
                  padding: "10px 12px",
                  color: "rgba(255,255,255,0.92)",
                  outline: "none",
                }}
              />

              {/* PTI band filter */}
              <div style={{ display: "flex", gap: 8 }}>
                {(["ALL", "LOW", "MID", "HIGH"] as const).map((b) => (
                  <button
                    key={b}
                    onClick={() => setBandFilter(b)}
                    style={{
                      padding: "9px 10px",
                      borderRadius: 12,
                      border:
                        bandFilter === b ? "1px solid rgba(255,255,255,0.40)" : "1px solid rgba(255,255,255,0.14)",
                      background: bandFilter === b ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.07)",
                      color: "rgba(255,255,255,0.88)",
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    {b}
                  </button>
                ))}
              </div>

              {/* ✅ Color mode toggle (혼합 제거) */}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setColorMode("PTI")}
                  style={{
                    padding: "9px 10px",
                    borderRadius: 12,
                    border:
                      colorMode === "PTI" ? "1px solid rgba(255,255,255,0.40)" : "1px solid rgba(255,255,255,0.14)",
                    background: colorMode === "PTI" ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.07)",
                    color: "rgba(255,255,255,0.88)",
                    fontSize: 12,
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  Color: PTI
                </button>

                <button
                  onClick={() => setColorMode("CLUSTER")}
                  style={{
                    padding: "9px 10px",
                    borderRadius: 12,
                    border:
                      colorMode === "CLUSTER"
                        ? "1px solid rgba(255,255,255,0.40)"
                        : "1px solid rgba(255,255,255,0.14)",
                    background: colorMode === "CLUSTER" ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.07)",
                    color: "rgba(255,255,255,0.88)",
                    fontSize: 12,
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  Color: Cluster
                </button>
              </div>

              <button
                onClick={() => {
                  setQuery("");
                  setBandFilter("ALL");
                  setSelectedTeam(null);
                  setClusterFilter("ALL");
                  setColorMode("CLUSTER");
                }}
                style={{
                  marginLeft: "auto",
                  padding: "9px 10px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(255,255,255,0.07)",
                  color: "rgba(255,255,255,0.85)",
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Reset
              </button>
            </div>

            {/* Chart */}
            <div
              style={{
                height: 520,
                marginTop: 12,
                background: "rgba(255,255,255,0.94)",
                borderRadius: 16,
                padding: 10,
              }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 22, right: 22, bottom: 30, left: 26 }}>
                  <CartesianGrid />

                  {/* Axis labels + strong ticks */}
                  <XAxis
                    type="number"
                    dataKey="TSS"
                    name="TSS"
                    domain={[0, 100]}
                    tick={{ fontSize: 12, fill: "#111827", fontWeight: 700 }}
                    axisLine={{ stroke: "#111827" }}
                    tickLine={{ stroke: "#111827" }}
                    label={{
                      value: "TSS (Execution Intensity)",
                      position: "insideBottom",
                      offset: -12,
                      fill: "#111827",
                      fontWeight: 800,
                    }}
                  />
                  <YAxis
                    type="number"
                    dataKey="SGP"
                    name="SGP"
                    domain={[0, 100]}
                    tick={{ fontSize: 12, fill: "#111827", fontWeight: 700 }}
                    axisLine={{ stroke: "#111827" }}
                    tickLine={{ stroke: "#111827" }}
                    label={{
                      value: "SGP (Progression Tendency)",
                      angle: -90,
                      position: "insideLeft",
                      fill: "#111827",
                      fontWeight: 800,
                    }}
                  />

                  <ReferenceLine x={derived.tssMean} stroke="#111827" strokeDasharray="4 4" />
                  <ReferenceLine y={derived.sgMean} stroke="#111827" strokeDasharray="4 4" />

                  <Tooltip
                    content={
                      <CustomTooltip
                        clusterMap={clusterMap}
                        colorMode={colorMode}
                        q1={derived.q1}
                        q2={derived.q2}
                      />
                    }
                  />

                  <Scatter
                    data={full.map((d) => {
                      const passQueryBand = filteredTeamSet.has(d.team);
                      const passCluster = matchesClusterFilter(d.team);
                      const passAll = passQueryBand && passCluster;

                      return {
                        ...d,
                        _passAll: passAll,
                        _showLabel:
                          (selectedTeam && d.team === selectedTeam) ||
                          (hasAnyFilter && passAll),
                      };
                    })}
                    onClick={(e: any) => {
                      if (!e || !e.team) return;
                      setSelectedTeam(e.team);
                    }}
                  >
                    {full.map((d, idx) => {
                      const passQueryBand = filteredTeamSet.has(d.team);
                      const passCluster = matchesClusterFilter(d.team);
                      const passAll = passQueryBand && passCluster;

                      // ✅ 클러스터 필터가 켜지면 차트에서도 흐리게 처리
                      const dim = hasAnyFilter && !passAll;
                      const isSel = selectedTeam === d.team;

                      const cl = clusterMap.get(normalizeTeamName(d.team)) ?? null;

                      // ✅ 혼합 제거:
                      // PTI 모드: fill=PTI band / stroke=기본
                      // CLUSTER 모드: fill=cluster / stroke=기본
                      const fillColor = colorMode === "PTI" ? d.color : clusterColor(cl);

                      const opacity = dim ? 0.12 : 0.95;
                      const strokeColor = isSel ? "#111827" : "rgba(17,24,39,0.22)";
                      const strokeWidth = isSel ? 2.8 : 1.2;

                      return (
                        <Cell
                          key={`cell-${idx}`}
                          fill={fillColor}
                          fillOpacity={opacity}
                          stroke={strokeColor}
                          strokeWidth={strokeWidth}
                        />
                      );
                    })}

                    <LabelList
                      dataKey="team"
                      position="top"
                      offset={8}
                      content={(props: any) => {
                        const { x, y, value, payload } = props;
                        if (!payload?._showLabel) return null;

                        return (
                          <text
                            x={x}
                            y={y}
                            dy={-6}
                            textAnchor="middle"
                            fontSize="11"
                            fontWeight="900"
                            fill="#111827"
                            style={{ pointerEvents: "none" }}
                          >
                            {value}
                          </text>
                        );
                      }}
                    />
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>

            {/* Legend + “기준” 설명을 더 확실히 */}
            <div style={{ marginTop: 10, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div style={{ color: "rgba(255,255,255,0.70)", fontSize: 12, lineHeight: 1.55 }}>
                <div style={{ fontWeight: 900, color: "rgba(255,255,255,0.90)" }}>
                  What defines clusters?
                </div>
                <div style={{ marginTop: 6, color: "rgba(255,255,255,0.66)" }}>
                  TSS = 직선성/전환/위협 창출, SGP = 점유·패스 구조·빌드업, PTI = 압박·전술 개입 강도.
                </div>

                {colorMode === "PTI" ? (
                  <div style={{ marginTop: 8 }}>
                    <span style={{ fontWeight: 900 }}>Color:</span> PTI Band —
                    <span style={{ marginLeft: 8, color: "#3b82f6", fontWeight: 900 }}>LOW</span> /
                    <span style={{ marginLeft: 6, color: "#22c55e", fontWeight: 900 }}>MID</span> /
                    <span style={{ marginLeft: 6, color: "#ef4444", fontWeight: 900 }}>HIGH</span>
                    <span style={{ marginLeft: 10, color: "rgba(255,255,255,0.60)" }}>• Size: PTI</span>
                  </div>
                ) : (
                  <div style={{ marginTop: 8 }}>
                    <span style={{ fontWeight: 900 }}>Color:</span> Cluster
                    <span style={{ marginLeft: 10, color: "rgba(255,255,255,0.60)" }}>• Size: PTI</span>
                    <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap" }}>
                      {clusterIds.map((cid) => (
                        <div key={cid} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: 999,
                              background: clusterColor(cid),
                              border: "1px solid rgba(255,255,255,0.22)",
                              display: "inline-block",
                            }}
                          />
                          <span style={{ color: "rgba(255,255,255,0.82)", fontWeight: 900 }}>
                            C{cid}
                          </span>
                          <span style={{ color: "rgba(255,255,255,0.62)" }}>
                            {CLUSTER_META[cid]?.name ?? ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ color: "rgba(255,255,255,0.62)", fontSize: 12, textAlign: "right" }}>
                Click a point for team insights • Hover for tooltip
                {clusterFilter !== "ALL" && (
                  <div style={{ marginTop: 6, color: "rgba(255,255,255,0.72)", fontWeight: 900 }}>
                    Cluster filter: C{clusterFilter}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* TEAM INSIGHT */}
            <div style={{ background: card, border: cardBorder, borderRadius: 18, padding: 14 }}>
              <div style={{ color: "rgba(255,255,255,0.62)", fontSize: 12, fontWeight: 900 }}>TEAM INSIGHT</div>

              {!selected ? (
                <div style={{ marginTop: 10, color: textDim, fontSize: 13, lineHeight: 1.6 }}>
                  Click a point on the chart to inspect a team.
                  <div style={{ marginTop: 10, color: "rgba(255,255,255,0.55)", fontSize: 12 }}>
                    Tip: Use the search box to quickly find a club.
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 10 }}>
                  <div
                    style={{
                      borderRadius: 18,
                      padding: 14,
                      background: "linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.04))",
                      border: "1px solid rgba(255,255,255,0.12)",
                      boxShadow: "0 18px 40px rgba(0,0,0,0.25)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <img
                        src={teamLogoPath(selected.team)}
                        alt={selected.team}
                        style={{
                          width: 58,
                          height: 58,
                          borderRadius: 14,
                          objectFit: "contain",
                          background: "rgba(255,255,255,0.92)",
                          padding: 6,
                          border: "1px solid rgba(255,255,255,0.18)",
                        }}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = "/logos/default.png";
                        }}
                      />

                      <div>
                        <div style={{ fontSize: 20, fontWeight: 950, color: "rgba(255,255,255,0.92)" }}>
                          {selected.team}
                        </div>
                        <div style={{ marginTop: 4, fontSize: 12, color: "rgba(255,255,255,0.70)" }}>
                          PTI Band:{" "}
                          <span style={{ color: selected.color, fontWeight: 950 }}>{selected.band}</span>
                        </div>
                        <div style={{ marginTop: 4, fontSize: 12, color: "rgba(255,255,255,0.70)" }}>
                          Quadrant:{" "}
                          <span style={{ fontWeight: 950, color: "rgba(255,255,255,0.92)" }}>
                            {quadrantLabel(selected.TSS, selected.SGP, derived.tssMean, derived.sgMean)}
                          </span>
                        </div>

                        {/* Cluster 표시 + 이름 */}
                        {(() => {
                          const cl = clusterMap.get(normalizeTeamName(selected.team));
                          const meta = cl !== undefined ? CLUSTER_META[cl] : null;
                          return (
                            <div style={{ marginTop: 4, fontSize: 12, color: "rgba(255,255,255,0.70)" }}>
                              Cluster:{" "}
                              <span style={{ fontWeight: 950, color: "rgba(255,255,255,0.92)" }}>
                                {cl === undefined ? "—" : `C${cl} · ${meta?.name ?? ""}`}
                              </span>
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Stats bars */}
                    <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                      {[
                        { k: "TSS", v: selected.TSS },
                        { k: "SGP", v: selected.SGP },
                        { k: "PTI", v: selected.PTI },
                      ].map((s) => (
                        <div key={s.k}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "rgba(255,255,255,0.75)" }}>
                            <span style={{ fontWeight: 900 }}>{s.k}</span>
                            <span style={{ fontWeight: 950 }}>{fmt(s.v)}</span>
                          </div>
                          <div
                            style={{
                              marginTop: 6,
                              height: 10,
                              borderRadius: 999,
                              background: "rgba(255,255,255,0.10)",
                              border: "1px solid rgba(255,255,255,0.10)",
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                width: `${clamp(s.v, 0, 100)}%`,
                                height: "100%",
                                borderRadius: 999,
                                background: `linear-gradient(90deg, ${selected.color}, rgba(255,255,255,0.35))`,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={() => router.push(`/team/${encodeURIComponent(selected.team)}`)}
                      style={{
                        marginTop: 12,
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 14,
                        border: "1px solid rgba(255,255,255,0.16)",
                        background:
                          "linear-gradient(135deg, rgba(59,130,246,0.25), rgba(34,197,94,0.18), rgba(255,255,255,0.06))",
                        color: "rgba(255,255,255,0.92)",
                        fontWeight: 950,
                        cursor: "pointer",
                        boxShadow: "0 12px 30px rgba(0,0,0,0.25)",
                      }}
                    >
                      변동성(Team Profile) 보기 →
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Quadrant Guide */}
            <div style={{ background: card, border: cardBorder, borderRadius: 18, padding: 14 }}>
              <div style={{ color: "rgba(255,255,255,0.62)", fontSize: 12, fontWeight: 900 }}>QUADRANT GUIDE</div>
              <div style={{ marginTop: 10, color: textDim, fontSize: 12, lineHeight: 1.65 }}>
                <div>
                  <span style={{ fontWeight: 900, color: textStrong }}>High-Execution Attacking</span> — strong execution + aggressive progression.
                </div>
                <div style={{ marginTop: 8 }}>
                  <span style={{ fontWeight: 900, color: textStrong }}>Attacking w/ Low Execution</span> — progression exists but execution intensity is weak.
                </div>
                <div style={{ marginTop: 8 }}>
                  <span style={{ fontWeight: 900, color: textStrong }}>High-Execution Controlled</span> — high execution with more controlled progression.
                </div>
                <div style={{ marginTop: 8 }}>
                  <span style={{ fontWeight: 900, color: textStrong }}>Low-Activity Conservative</span> — low intensity + conservative progression.
                </div>
              </div>
            </div>

            {/* Teams list */}
            <div style={{ background: card, border: cardBorder, borderRadius: 18, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ color: "rgba(255,255,255,0.62)", fontSize: 12, fontWeight: 900 }}>TEAMS</div>
                <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 11 }}>
                  {filtered.filter((t) => matchesClusterFilter(t.team)).length} shown
                </div>
              </div>

              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8, maxHeight: 280, overflow: "auto" }}>
                {filtered
                  .filter((t) => matchesClusterFilter(t.team))
                  .slice()
                  .sort((a, b) => a.team.localeCompare(b.team))
                  .map((t) => {
                    const cl = clusterMap.get(normalizeTeamName(t.team));
                    const meta = cl !== undefined ? CLUSTER_META[cl] : null;

                    return (
                      <button
                        key={t.team}
                        onClick={() => setSelectedTeam(t.team)}
                        style={{
                          textAlign: "left",
                          padding: "10px 10px",
                          borderRadius: 14,
                          border: selectedTeam === t.team ? "1px solid rgba(255,255,255,0.34)" : "1px solid rgba(255,255,255,0.12)",
                          background: selectedTeam === t.team ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.06)",
                          color: "rgba(255,255,255,0.86)",
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                          <div style={{ fontWeight: 900 }}>{t.team}</div>
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.60)", display: "flex", gap: 8, alignItems: "center" }}>
                            {cl !== undefined && (
                              <>
                                <span style={{ fontWeight: 900 }}>C{cl}</span>
                                <span
                                  style={{
                                    width: 10,
                                    height: 10,
                                    borderRadius: 999,
                                    background: clusterColor(cl),
                                    border: "1px solid rgba(255,255,255,0.22)",
                                    display: "inline-block",
                                  }}
                                />
                              </>
                            )}
                            <span style={{ color: ptiBandColor(t.band), fontWeight: 900 }}>{t.band}</span>
                          </div>
                        </div>
                        <div style={{ marginTop: 4, fontSize: 11, color: "rgba(255,255,255,0.60)" }}>
                          {cl !== undefined ? `(${meta?.name ?? ""}) ` : ""}
                          TSS {fmt(t.TSS)} • SGP {fmt(t.SGP)} • PTI {fmt(t.PTI)}
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>

            {/* CLUSTERS card: 필터 누르면 차트도 같이 반영됨 */}
            <div style={{ background: card, border: cardBorder, borderRadius: 18, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ color: "rgba(255,255,255,0.62)", fontSize: 12, fontWeight: 900 }}>CLUSTERS</div>
                <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 11 }}>
                  {clusterRows ? `${clusterRows.length} mapped` : "loading"}
                </div>
              </div>

              {clusterErr ? (
                <div style={{ marginTop: 10, color: "rgba(255,255,255,0.70)", fontSize: 12, lineHeight: 1.6 }}>
                  Cluster data load failed:
                  <div style={{ marginTop: 6, color: "rgba(255,255,255,0.55)", fontSize: 11 }}>{clusterErr}</div>
                  <div style={{ marginTop: 10, fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
                    ✅ <b>public/data/team_clusters.csv</b> 경로 확인해줘.
                  </div>
                </div>
              ) : (
                <>
                  {/* Filter buttons */}
                  <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      onClick={() => setClusterFilter("ALL")}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 12,
                        border:
                          clusterFilter === "ALL"
                            ? "1px solid rgba(255,255,255,0.40)"
                            : "1px solid rgba(255,255,255,0.14)",
                        background: clusterFilter === "ALL" ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.07)",
                        color: "rgba(255,255,255,0.88)",
                        fontSize: 12,
                        fontWeight: 900,
                        cursor: "pointer",
                      }}
                    >
                      ALL
                    </button>

                    {clusterIds.map((cid) => (
                      <button
                        key={cid}
                        onClick={() => setClusterFilter(cid)}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 12,
                          border:
                            clusterFilter === cid
                              ? "1px solid rgba(255,255,255,0.40)"
                              : "1px solid rgba(255,255,255,0.14)",
                          background: clusterFilter === cid ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.07)",
                          color: "rgba(255,255,255,0.88)",
                          fontSize: 12,
                          fontWeight: 900,
                          cursor: "pointer",
                        }}
                        title={CLUSTER_META[cid]?.oneLine ?? ""}
                      >
                        C{cid}
                      </button>
                    ))}
                  </div>

                  {/* 기준/이름/요약을 명확히 */}
                  <div style={{ marginTop: 12, color: "rgba(255,255,255,0.70)", fontSize: 12, lineHeight: 1.6 }}>
                    {clusterSummary.map((c) => (
                      <div
                        key={c.cl}
                        style={{
                          marginTop: 10,
                          padding: "10px 10px",
                          borderRadius: 14,
                          border: clusterFilter === c.cl ? "1px solid rgba(255,255,255,0.28)" : "1px solid rgba(255,255,255,0.10)",
                          background: clusterFilter === c.cl ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.04)",
                          cursor: "pointer",
                        }}
                        onClick={() => setClusterFilter(clusterFilter === c.cl ? "ALL" : c.cl)}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                          <div>
                            <span style={{ fontWeight: 950, color: "rgba(255,255,255,0.92)" }}>
                              C{c.cl} · {c.meta?.name ?? ""}
                            </span>
                            <span style={{ color: "rgba(255,255,255,0.55)" }}> — {c.teams.length} teams</span>
                          </div>
                          <span
                            style={{
                              width: 12,
                              height: 12,
                              borderRadius: 999,
                              background: clusterColor(c.cl),
                              border: "1px solid rgba(255,255,255,0.22)",
                              display: "inline-block",
                            }}
                          />
                        </div>
                        <div style={{ marginTop: 6, fontSize: 11, color: "rgba(255,255,255,0.66)" }}>
                          {c.meta?.oneLine ?? ""}
                        </div>
                        <div style={{ marginTop: 6, fontSize: 11, color: "rgba(255,255,255,0.58)" }}>
                          {(c.meta?.bullets ?? []).slice(0, 3).join(" • ")}
                        </div>
                      </div>
                    ))}
                    <div style={{ marginTop: 10, fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
                      *Cluster definitions are based on TSS/SGP/PTI tactical axes.
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16, color: "rgba(255,255,255,0.55)", fontSize: 11 }}>
          Next: add Match-up (Home vs Away) page + win-probability lift visualization.
        </div>
      </div>
    </main>
  );
}
