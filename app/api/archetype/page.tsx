"use client";

import TopNav from "../../components/TopNav";

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
  ZAxis,
} from "recharts";
import { useEffect, useMemo, useState } from "react";

type OverviewRow = {
  team: string;
  TSS: number;
  SGP: number;
  PTI: number;
};

type ChartRow = OverviewRow & {
  cluster: number;
  color: string;
  size: number;
  _showLabel?: boolean;
};

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
function mean(arr: number[]) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
function safeNum(v: any, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
}
function ptToSize(pti: number, minPTI: number, maxPTI: number) {
  const t = (pti - minPTI) / Math.max(1e-9, maxPTI - minPTI);
  return 60 + 200 * clamp(t, 0, 1);
}

// ✅ 팀명 정규화: overview.json vs team_clusters.csv 표기 차이를 흡수
function normalizeTeam(s: string) {
  return (s ?? "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/fc/g, "")
    .replace(/프로축구단/g, "")
    .replace(/[().·\-]/g, "");
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.trim().length > 0);
  if (!lines.length) return [];
  const header = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((c) => c.trim());
    const row: Record<string, string> = {};
    for (let i = 0; i < header.length; i++) row[header[i]] = cells[i] ?? "";
    return row;
  });
}

const CLUSTER_PALETTE = ["#2563eb", "#16a34a", "#dc2626", "#7c3aed", "#ea580c", "#0891b2"];

export default function ArchetypePage() {
  const [overview, setOverview] = useState<OverviewRow[]>([]);
  const [clusterMap, setClusterMap] = useState<Map<string, number>>(new Map());

  const [loading, setLoading] = useState(true);

  const [showAllLabels, setShowAllLabels] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      try {
        const [ovRes, clRes] = await Promise.all([fetch("/data/overview.json"), fetch("/data/team_clusters.csv")]);

        const ovJson = await ovRes.json();
        const ovArr: any[] = Array.isArray(ovJson) ? ovJson : (ovJson?.data ?? []);
        const ovRows: OverviewRow[] = ovArr
          .map((d: any) => ({
            team: String(d.team ?? ""),
            TSS: safeNum(d.TSS),
            SGP: safeNum(d.SGP),
            PTI: safeNum(d.PTI),
          }))
          .filter((d) => d.team);

        const clText = await clRes.text();
        const clRows = parseCsv(clText);

        // ✅ team_name_ko + Cluster 확정
        const m = new Map<string, number>();
        for (const r of clRows) {
          const team = r.team_name_ko || "";
          const cStr = r.Cluster || "0";
          if (team) m.set(normalizeTeam(team), safeNum(cStr, 0));
        }

        if (!alive) return;
        setOverview(ovRows);
        setClusterMap(m);
      } catch {
        if (!alive) return;
        setOverview([]);
        setClusterMap(new Map());
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  const ptiStats = useMemo(() => {
    const arr = overview.map((d) => d.PTI).slice().sort((a, b) => a - b);
    return {
      minPTI: arr.length ? arr[0] : 0,
      maxPTI: arr.length ? arr[arr.length - 1] : 1,
    };
  }, [overview]);

  const chartData: ChartRow[] = useMemo(() => {
    const { minPTI, maxPTI } = ptiStats;

    return overview.map((d) => {
      const cluster = clusterMap.get(normalizeTeam(d.team)) ?? 0;
      const color = CLUSTER_PALETTE[cluster % CLUSTER_PALETTE.length];
      const show = showAllLabels || (selectedTeam ? d.team === selectedTeam : false);

      return {
        ...d,
        cluster,
        color,
        size: ptToSize(d.PTI, minPTI, maxPTI),
        _showLabel: show,
      };
    });
  }, [overview, ptiStats, clusterMap, showAllLabels, selectedTeam]);

  const avg = useMemo(() => {
    return {
      TSS: mean(chartData.map((d) => d.TSS)),
      SGP: mean(chartData.map((d) => d.SGP)),
    };
  }, [chartData]);

  // ✅ 클러스터 평균 프로파일(“섞여 보인다” 문제를 설득력 있게 해결하는 핵심)
  const clusterProfile = useMemo(() => {
    const agg = new Map<number, { n: number; TSS: number; SGP: number; PTI: number }>();
    for (const d of chartData) {
      const cur = agg.get(d.cluster) ?? { n: 0, TSS: 0, SGP: 0, PTI: 0 };
      cur.n += 1;
      cur.TSS += d.TSS;
      cur.SGP += d.SGP;
      cur.PTI += d.PTI;
      agg.set(d.cluster, cur);
    }
    const rows = Array.from(agg.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([cluster, v]) => ({
        cluster,
        n: v.n,
        TSS: v.TSS / Math.max(1, v.n),
        SGP: v.SGP / Math.max(1, v.n),
        PTI: v.PTI / Math.max(1, v.n),
      }));
    return rows;
  }, [chartData]);

  // 스타일
  const bg = "#0b1220";
  const card = "rgba(255,255,255,0.06)";
  const stroke = "rgba(255,255,255,0.12)";
  const textStrong = "rgba(255,255,255,0.92)";
  const textDim = "rgba(255,255,255,0.72)";

  return (
    <div style={{ minHeight: "100vh", background: bg }}>
      <TopNav />

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: 22, display: "grid", gap: 16 }}>
        {/* Header */}
        <div
          style={{
            padding: 16,
            borderRadius: 18,
            background: card,
            border: `1px solid ${stroke}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div>
            <div style={{ fontSize: 28, fontWeight: 950, letterSpacing: -0.6, color: textStrong }}>
              Archetype (Cluster)
            </div>
            <div style={{ marginTop: 6, color: textDim, fontSize: 13 }}>
              x: TSS / y: SGP / size: PTI / color: Cluster (from team_clusters.csv)
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button
              onClick={() => setShowAllLabels((v) => !v)}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: `1px solid ${stroke}`,
                background: showAllLabels ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.07)",
                color: textStrong,
                fontSize: 12,
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              {showAllLabels ? "Hide labels" : "Show labels"}
            </button>

            <button
              onClick={() => setSelectedTeam(null)}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: `1px solid ${stroke}`,
                background: "rgba(255,255,255,0.07)",
                color: textStrong,
                fontSize: 12,
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              Clear select
            </button>
          </div>
        </div>

        {/* Scatter */}
        <div style={{ padding: 16, borderRadius: 18, background: card, border: `1px solid ${stroke}` }}>
          {loading ? (
            <div style={{ color: textStrong, padding: 24, fontWeight: 800 }}>Loading…</div>
          ) : !chartData.length ? (
            <div style={{ color: textStrong, padding: 24, fontWeight: 800 }}>
              데이터가 비어있음.{" "}
              <span style={{ fontWeight: 600, color: textDim }}>
                public/data/overview.json / public/data/team_clusters.csv 확인
              </span>
            </div>
          ) : (
            <div style={{ width: "100%", height: 560 }}>
              <ResponsiveContainer>
                <ScatterChart margin={{ top: 20, right: 20, bottom: 30, left: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.18)" />
                  <XAxis
                    dataKey="TSS"
                    stroke="rgba(255,255,255,0.80)"
                    tick={{ fill: "rgba(255,255,255,0.80)", fontSize: 12 }}
                    tickLine={{ stroke: "rgba(255,255,255,0.35)" }}
                    axisLine={{ stroke: "rgba(255,255,255,0.45)" }}
                    domain={[0, 100]}
                    type="number"
                    tickCount={6}
                    tickFormatter={(v) => Number(v).toFixed(0)}
                  />
                  <YAxis
                    dataKey="SGP"
                    stroke="rgba(255,255,255,0.80)"
                    tick={{ fill: "rgba(255,255,255,0.80)", fontSize: 12 }}
                    tickLine={{ stroke: "rgba(255,255,255,0.35)" }}
                    axisLine={{ stroke: "rgba(255,255,255,0.45)" }}
                    domain={[0, 100]}
                    type="number"
                    tickCount={6}
                    tickFormatter={(v) => Number(v).toFixed(0)}
                  />
                  <ZAxis dataKey="size" range={[70, 280]} />
                  <ReferenceLine x={avg.TSS} stroke="rgba(255,255,255,0.45)" strokeDasharray="4 4" />
                  <ReferenceLine y={avg.SGP} stroke="rgba(255,255,255,0.45)" strokeDasharray="4 4" />

                  <Tooltip
                    cursor={{ strokeDasharray: "3 3" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p: any = payload[0].payload;
                      return (
                        <div
                          style={{
                            background: "rgba(15,23,42,0.96)",
                            border: "1px solid rgba(255,255,255,0.18)",
                            padding: 12,
                            borderRadius: 14,
                            color: "rgba(255,255,255,0.92)",
                            width: 280,
                          }}
                        >
                          <div style={{ fontWeight: 950 }}>{p.team}</div>
                          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>Cluster: {p.cluster}</div>
                          <div style={{ marginTop: 10, fontSize: 12, lineHeight: 1.5 }}>
                            TSS: <b>{Number(p.TSS).toFixed(1)}</b>
                            <br />
                            SGP: <b>{Number(p.SGP).toFixed(1)}</b>
                            <br />
                            PTI: <b>{Number(p.PTI).toFixed(1)}</b>
                          </div>
                          <div style={{ marginTop: 10 }}>
                            <button
                              onClick={() => setSelectedTeam(p.team)}
                              style={{
                                padding: "8px 10px",
                                borderRadius: 12,
                                border: "1px solid rgba(255,255,255,0.18)",
                                background: "rgba(255,255,255,0.10)",
                                color: "rgba(255,255,255,0.92)",
                                fontSize: 12,
                                fontWeight: 900,
                                cursor: "pointer",
                              }}
                            >
                              Select (label fix)
                            </button>
                          </div>
                        </div>
                      );
                    }}
                  />

                  <Scatter data={chartData} onClick={(d: any) => setSelectedTeam(d?.team ?? null)}>
                    {chartData.map((d, idx) => {
                      const isSelected = selectedTeam ? d.team === selectedTeam : true;
                      return (
                        <Cell
                          key={idx}
                          fill={d.color}
                          fillOpacity={isSelected ? 0.92 : 0.20}
                          stroke={isSelected ? "rgba(255,255,255,0.60)" : "rgba(255,255,255,0.00)"}
                          strokeWidth={isSelected ? 1 : 0}
                        />
                      );
                    })}

                    <LabelList
                      dataKey="team"
                      position="top"
                      content={(props: any) => {
                        const { x, y, value, payload } = props;
                        if (!payload?._showLabel) return null;
                        return (
                          <text
                            x={x}
                            y={y - 10}
                            textAnchor="middle"
                            fill="rgba(255,255,255,0.92)"
                            fontSize={12}
                            fontWeight={900}
                          >
                            {String(value)}
                          </text>
                        );
                      }}
                    />
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Profile table */}
        <div style={{ padding: 16, borderRadius: 18, background: card, border: `1px solid ${stroke}` }}>
          <div style={{ color: textStrong, fontWeight: 950, marginBottom: 10 }}>Cluster Average Profile</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, color: "rgba(255,255,255,0.86)" }}>
            <thead>
              <tr style={{ textAlign: "left" }}>
                <th style={{ borderBottom: `1px solid ${stroke}`, padding: 10 }}>Cluster</th>
                <th style={{ borderBottom: `1px solid ${stroke}`, padding: 10 }}>n</th>
                <th style={{ borderBottom: `1px solid ${stroke}`, padding: 10 }}>TSS(avg)</th>
                <th style={{ borderBottom: `1px solid ${stroke}`, padding: 10 }}>SGP(avg)</th>
                <th style={{ borderBottom: `1px solid ${stroke}`, padding: 10 }}>PTI(avg)</th>
              </tr>
            </thead>
            <tbody>
              {clusterProfile.map((r) => (
                <tr key={r.cluster}>
                  <td style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: 10 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 999,
                          background: CLUSTER_PALETTE[r.cluster % CLUSTER_PALETTE.length],
                          display: "inline-block",
                        }}
                      />
                      {r.cluster}
                    </span>
                  </td>
                  <td style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: 10 }}>{r.n}</td>
                  <td style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: 10 }}>{r.TSS.toFixed(2)}</td>
                  <td style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: 10 }}>{r.SGP.toFixed(2)}</td>
                  <td style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: 10 }}>{r.PTI.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: 10, color: "rgba(255,255,255,0.70)", fontSize: 12 }}>
            • “점이 섞여 보이는지”보다 중요한 건, 클러스터 평균 프로파일이 전술적으로 구분되는지(표에서 확인).
          </div>
        </div>
      </div>
    </div>
  );
}
