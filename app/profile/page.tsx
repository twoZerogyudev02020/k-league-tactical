"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

type ClusterRow = {
  team_name_ko: string;
  TSS_mean: number;
  SGP_mean: number;
  PTI_mean: number;
  PTI_BAND?: string;
  Cluster: number;
  n_matches?: number;
};

function normalize(s: string) {
  return String(s ?? "").trim().replace(/^"+|"+$/g, "");
}

function parseCSV(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length <= 1) return [];

  const header = lines[0].split(",").map((h) => normalize(h));
  const idx = (name: string) => header.findIndex((h) => h === name);

  const iTeam = idx("team_name_ko");
  const iTSS = idx("TSS_mean");
  const iSGP = idx("SGP_mean");
  const iPTI = idx("PTI_mean");
  const iCl = idx("Cluster");
  const iBand = idx("PTI_BAND");
  const iN = idx("n_matches");

  if ([iTeam, iCl].some((x) => x < 0)) return [];

  const out: ClusterRow[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cols = lines[r].split(",").map((c) => normalize(c));
    const team = cols[iTeam] ?? "";
    if (!team) continue;

    const row: ClusterRow = {
      team_name_ko: team,
      TSS_mean: iTSS >= 0 ? Number(cols[iTSS]) : NaN,
      SGP_mean: iSGP >= 0 ? Number(cols[iSGP]) : NaN,
      PTI_mean: iPTI >= 0 ? Number(cols[iPTI]) : NaN,
      Cluster: Number(cols[iCl]),
      PTI_BAND: iBand >= 0 ? cols[iBand] : undefined,
      n_matches: iN >= 0 ? Number(cols[iN]) : undefined,
    };

    if (!Number.isFinite(row.Cluster)) continue;

    // 평균 컬럼이 없을 수도 있으니, 클러스터만 있어도 row는 유지
    out.push(row);
  }
  return out;
}

function fmt(n: number) {
  return Number.isFinite(n) ? n.toFixed(2) : "—";
}

const CLUSTER_META: Record<number, { name: string; oneLine: string }> = {
  0: { name: "저강도 역습 전환형", oneLine: "빠른 전환·직선 공격으로 효율 추구" },
  1: { name: "고강도 빌드업 주도형", oneLine: "강한 압박·전술 개입으로 전개 통제" },
  2: { name: "저강도 빌드업 운영형", oneLine: "점유·패스 구조로 안정 운영" },
  3: { name: "고강도 전환 직진형", oneLine: "탈취 후 즉각 공격(하이리스크/하이리턴)" },
};

function clusterColor(c: number) {
  const palette = ["#a855f7", "#f59e0b", "#06b6d4", "#84cc16", "#f97316", "#14b8a6"];
  return palette[c % palette.length];
}

// (선택) 팀 로고: matchup에서 쓰던 매핑 그대로 사용 가능
function teamLogoSrc(name: string) {
  const m: Record<string, string> = {
    "강원FC": "/logos/강원fc.png",
    "광주FC": "/logos/광주fc.png",
    "김천 상무 프로축구단": "/logos/김천상무.png",
    "대구FC": "/logos/대구fc.png",
    "대전 하나 시티즌": "/logos/대전하나시티즌.png",
    "수원FC": "/logos/수원fc.png",
    "울산 HD FC": "/logos/울산HD.png",
    "인천 유나이티드": "/logos/인천유나이티드.png",
    "전북 현대 모터스": "/logos/전북현대.png",
    "제주SK FC": "/logos/제주sk.png",
    "포항 스틸러스": "/logos/포항스틸러스.png",
    "FC서울": "/logos/fc서울.png",
  };
  return m[name] ?? null;
}

export default function ProfilePage() {
  const [rows, setRows] = useState<ClusterRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/data/team_clusters.csv", { cache: "no-store" });
        if (!res.ok) throw new Error(`team_clusters.csv fetch failed: ${res.status}`);
        const text = await res.text();
        const parsed = parseCSV(text);
        if (!alive) return;
        setRows(parsed);
        setErr(null);
      } catch (e: any) {
        if (!alive) return;
        setRows([]);
        setErr(e?.message ?? String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const { clusterAvg, teamsByCluster, hasAverages } = useMemo(() => {
    const data = rows ?? [];
    const by = new Map<number, ClusterRow[]>();
    const teams = new Map<number, string[]>();

    for (const r of data) {
      const arr = by.get(r.Cluster) ?? [];
      arr.push(r);
      by.set(r.Cluster, arr);

      const t = teams.get(r.Cluster) ?? [];
      t.push(r.team_name_ko);
      teams.set(r.Cluster, t);
    }

    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(xs.length, 1);
    const out = Array.from(by.entries())
      .map(([cl, arr]) => {
        const tss = arr.map((x) => x.TSS_mean).filter(Number.isFinite);
        const sgp = arr.map((x) => x.SGP_mean).filter(Number.isFinite);
        const pti = arr.map((x) => x.PTI_mean).filter(Number.isFinite);
        return {
          cluster: `C${cl}`,
          cl,
          name: CLUSTER_META[cl]?.name ?? "",
          TSS: tss.length ? mean(tss) : NaN,
          SGP: sgp.length ? mean(sgp) : NaN,
          PTI: pti.length ? mean(pti) : NaN,
          nTeams: arr.length,
        };
      })
      .sort((a, b) => a.cl - b.cl);

    const has = out.some((c) => Number.isFinite(c.TSS) || Number.isFinite(c.SGP) || Number.isFinite(c.PTI));

    // 팀 목록 정리(중복 제거)
    for (const [k, v] of teams.entries()) {
      teams.set(k, Array.from(new Set(v)).sort((a, b) => a.localeCompare(b)));
    }

    return { clusterAvg: out, teamsByCluster: teams, hasAverages: has };
  }, [rows]);

  if (rows === null) {
    return (
      <main style={{ minHeight: "100vh", background: "transparent", color: "var(--k-fg)", padding: 28 }}>
        <div style={{ marginTop: 18, fontWeight: 900 }}>Loading profile…</div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", background: "transparent", color: "var(--k-fg)", padding: "24px 20px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 30, fontWeight: 950 }}>Cluster Profile</div>
          <div style={{ marginTop: 6, opacity: 0.75 }}>
            “왜 이런 상성이 나오는가?”를 설명하는 해석용 페이지 (클러스터 성격 + 소속 팀).
          </div>
        </div>

        {err && (
          <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: "rgba(255,255,255,0.08)" }}>
            <b>Load error:</b> {err}
            <div style={{ marginTop: 6, opacity: 0.8 }}>✅ public/data/team_clusters.csv 경로 확인</div>
          </div>
        )}

        {/* Cluster cards */}
        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          {clusterAvg.map((c) => (
            <div
              key={c.cl}
              style={{
                borderRadius: 18,
                padding: 14,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.10)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontWeight: 950 }}>
                  {c.cluster} · {c.name}
                </div>
                <span style={{ width: 12, height: 12, borderRadius: 999, background: clusterColor(c.cl) }} />
              </div>

              <div style={{ marginTop: 6, opacity: 0.75, fontSize: 13 }}>
                {CLUSTER_META[c.cl]?.oneLine ?? ""}
              </div>

              <div style={{ marginTop: 10, fontSize: 12, opacity: 0.85 }}>
                TSS {fmt(c.TSS)} · SGP {fmt(c.SGP)} · PTI {fmt(c.PTI)} · Teams {c.nTeams}
              </div>

              <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
                {(teamsByCluster.get(c.cl) ?? []).slice(0, 10).map((t) => {
                  const src = teamLogoSrc(t);
                  return (
                    <span
                      key={`${c.cl}-${t}`}
                      title={t}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "8px 10px",
                        borderRadius: 999,
                        border: "1px solid rgba(255,255,255,0.12)",
                        background: "rgba(255,255,255,0.06)",
                        fontSize: 12,
                        fontWeight: 900,
                        opacity: 0.95,
                      }}
                    >
                      {src ? (
                        <img src={src} alt={t} style={{ width: 18, height: 18, objectFit: "contain" }} />
                      ) : (
                        <span style={{ width: 18, height: 18, borderRadius: 999, background: "rgba(255,255,255,0.12)" }} />
                      )}
                      {t}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Chart */}
        <div
          style={{
            marginTop: 12,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 18,
            padding: 14,
          }}
        >
          <div style={{ fontWeight: 950, opacity: 0.9, display: "flex", justifyContent: "space-between" }}>
            <span>Cluster Average Profile (TSS/SGP/PTI)</span>
            <span style={{ fontSize: 12, opacity: 0.65 }}>
              {hasAverages ? "평균 지표 표시" : "현재 CSV에 평균 컬럼이 없어서 차트가 비어 보일 수 있음"}
            </span>
          </div>

          <div style={{ marginTop: 10, height: 420, background: "rgba(255,255,255,0.94)", borderRadius: 16, padding: 10 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={clusterAvg} margin={{ top: 18, right: 18, bottom: 20, left: 12 }}>
                <CartesianGrid />
                <XAxis dataKey="cluster" tick={{ fill: "#111827", fontWeight: 800 }} />
                <YAxis tick={{ fill: "#111827", fontWeight: 700 }} domain={[0, 100]} />
                <Tooltip
                  content={({ active, payload }: any) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div style={{ background: "white", borderRadius: 10, padding: 10, border: "1px solid rgba(0,0,0,0.10)" }}>
                        <div style={{ fontWeight: 900, color: "#111827" }}>
                          {d.cluster} · {d.name}
                        </div>
                        <div style={{ marginTop: 6, color: "#111827" }}>TSS: {fmt(d.TSS)}</div>
                        <div style={{ color: "#111827" }}>SGP: {fmt(d.SGP)}</div>
                        <div style={{ color: "#111827", fontWeight: 900 }}>PTI: {fmt(d.PTI)}</div>
                        <div style={{ marginTop: 6, color: "#6b7280", fontSize: 12 }}>Teams: {d.nTeams}</div>
                      </div>
                    );
                  }}
                />
                <Legend />
                <Bar dataKey="TSS" name="TSS (mean)" fill="#3b82f6" />
                <Bar dataKey="SGP" name="SGP (mean)" fill="#22c55e" />
                <Bar dataKey="PTI" name="PTI (mean)" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={{ marginTop: 14, opacity: 0.65, fontSize: 12 }}>
          이제 Matchup 페이지에서 “유형×유형 / 팀×팀” 결과를 해석할 때 이 페이지를 근거로 쓰면 됨.
        </div>
      </div>
    </main>
  );
}
