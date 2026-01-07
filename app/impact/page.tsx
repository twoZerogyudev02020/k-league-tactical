"use client";

import { useEffect, useMemo, useState } from "react";
import TopNav from "../components/TopNav";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";

/**
 * 5) Utility Impact (선택 B, CSV 구조에 맞춘 버전)
 * - 목적: “이 모델을 쓰면 뭐가 달라지는데?” → 효용(dp5_value)이 개선되는가
 * - 핵심: stage(TSS→SGP→PTI)가 아니라,
 *         baseline(무개입: a1..a5=0) vs policy(개입: 하나라도 !=0) 비교로 보여줌
 */

const CSV_PATH = "/data/winprob_merged_dataset.csv"; // public/data에 위치

// ===== CSV =====
function splitCSVLine(line: string) {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseCSV(text: string) {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.length > 0);
  if (lines.length < 2) return [];
  const headers = splitCSVLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i]);
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => (obj[h] = cols[idx] ?? ""));
    rows.push(obj);
  }
  return rows;
}

function toNumLoose(v: any) {
  const s = String(v ?? "").trim();
  if (!s) return NaN;
  const cleaned = s.replace(/,/g, "").replace(/[^\d+\-eE.]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

function pickCol(cols: string[], candidates: string[]) {
  const lower = new Map(cols.map((c) => [c.toLowerCase().trim(), c]));
  for (const cand of candidates) {
    const hit = lower.get(cand.toLowerCase().trim());
    if (hit) return hit;
  }
  return null;
}

function quantile(sorted: number[], q: number) {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  const w = pos - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

type RawRow = Record<string, string>;

type GroupRow = {
  group: "Baseline (No-Intervention)" | "Policy (Intervention)";
  n: number;
  mean: number;
  p10: number;
  p50: number;
  p90: number;
  uplift_vs_baseline: number; // mean difference vs baseline
};

export default function ImpactPage() {
  const [rows, setRows] = useState<RawRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(CSV_PATH, { cache: "no-store" });
        if (!res.ok) throw new Error(`CSV fetch failed: ${res.status}`);
        const text = await res.text();
        setRows(parseCSV(text));
      } catch (e: any) {
        setErr(e?.message ?? "Unknown error");
      }
    })();
  }, []);

  const debug = useMemo(() => {
    if (!rows || rows.length === 0) return null;
    const cols = Object.keys(rows[0] ?? {});
    const dpCol = pickCol(cols, ["dp5_value", "dp_value", "policy_value", "value"]);
    const a1 = pickCol(cols, ["a1"]);
    const a2 = pickCol(cols, ["a2"]);
    const a3 = pickCol(cols, ["a3"]);
    const a4 = pickCol(cols, ["a4"]);
    const a5 = pickCol(cols, ["a5"]);
    return { rowCount: rows.length, colsCount: cols.length, dpCol, a1, a2, a3, a4, a5 };
  }, [rows]);

  const grouped = useMemo<GroupRow[]>(() => {
    if (!rows || rows.length === 0) return [];
    const cols = Object.keys(rows[0] ?? {});

    const dpCol = pickCol(cols, ["dp5_value", "dp_value", "policy_value", "value"]);
    const a1 = pickCol(cols, ["a1"]);
    const a2 = pickCol(cols, ["a2"]);
    const a3 = pickCol(cols, ["a3"]);
    const a4 = pickCol(cols, ["a4"]);
    const a5 = pickCol(cols, ["a5"]);

    if (!dpCol) return [];

    const baselineVals: number[] = [];
    const policyVals: number[] = [];

    const isNoIntervention = (r: RawRow) => {
      // a1..a5가 없으면 baseline 판별 불가 → 전부 policy로 보냄
      if (!a1 || !a2 || !a3 || !a4 || !a5) return false;
      const v1 = toNumLoose(r[a1]);
      const v2 = toNumLoose(r[a2]);
      const v3 = toNumLoose(r[a3]);
      const v4 = toNumLoose(r[a4]);
      const v5 = toNumLoose(r[a5]);
      return [v1, v2, v3, v4, v5].every((v) => Number.isFinite(v) && v === 0);
    };

    for (const r of rows) {
      const dp = toNumLoose(r[dpCol]);
      if (!Number.isFinite(dp)) continue;

      if (isNoIntervention(r)) baselineVals.push(dp);
      else policyVals.push(dp);
    }

    baselineVals.sort((a, b) => a - b);
    policyVals.sort((a, b) => a - b);

    const mean = (arr: number[]) => (arr.length ? arr.reduce((x, y) => x + y, 0) / arr.length : NaN);

    const baseMean = mean(baselineVals);
    const polMean = mean(policyVals);

    const make = (name: GroupRow["group"], arr: number[], uplift: number): GroupRow => ({
      group: name,
      n: arr.length,
      mean: mean(arr),
      p10: quantile(arr, 0.1),
      p50: quantile(arr, 0.5),
      p90: quantile(arr, 0.9),
      uplift_vs_baseline: uplift,
    });

    return [
      make("Baseline (No-Intervention)", baselineVals, 0),
      make("Policy (Intervention)", policyVals, Number.isFinite(polMean) && Number.isFinite(baseMean) ? polMean - baseMean : NaN),
    ];
  }, [rows]);

  if (err) {
    return (
      <div style={{ minHeight: "100vh", background: "#070A12", color: "white" }}>
        <TopNav />
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 20px" }}>
          <div style={{ borderRadius: 16, border: "1px solid rgba(255,80,80,0.45)", background: "rgba(255,80,80,0.12)", padding: 16 }}>
            <div style={{ fontWeight: 900 }}>CSV 로드 오류</div>
            <div style={{ marginTop: 6, opacity: 0.9 }}>{err}</div>
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
              CSV를 <b>public/data/</b> 아래에 두었는지, 경로가 <b>{CSV_PATH}</b>가 맞는지 확인해줘.
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!rows) {
    return (
      <div style={{ minHeight: "100vh", background: "#070A12", color: "white" }}>
        <TopNav />
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 20px", opacity: 0.8 }}>
          Loading…
        </div>
      </div>
    );
  }

  const missing = !debug?.dpCol;

  return (
    <div style={{ minHeight: "100vh", background: "#070A12", color: "white" }}>
      <TopNav />

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 20px" }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 22, fontWeight: 950 }}>
            5️⃣ Utility Impact — 효용(전술 가치) ‘개선 효과’
          </div>
          <div style={{ marginTop: 6, fontSize: 13, opacity: 0.9 }}>
            목적: <b>“그래서 이 모델을 쓰면 뭐가 달라지는데?”</b>에 대한 답 (dp5_value 기반)
          </div>
        </div>

        <div style={{ borderRadius: 16, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.06)", padding: 14, marginBottom: 16 }}>
          <div style={{ fontWeight: 900, color: "rgba(255,220,120,0.95)" }}>⚠ 항상 함께 표시</div>
          <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.45, opacity: 0.95 }}>
            이 페이지의 수치는 단일 경기 결과를 맞히는 <b>예측</b>이 아니라,
            모델이 산출한 <b>효용(dp5_value)</b> 기반의 구조적 경향성입니다.
          </div>
        </div>

        {(missing || grouped.length === 0) && (
          <div style={{ borderRadius: 16, border: "1px solid rgba(255,210,80,0.30)", background: "rgba(255,210,80,0.10)", padding: 14, marginBottom: 16, fontSize: 12, lineHeight: 1.45 }}>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>컬럼 탐지 결과</div>
            <div>
              - rowCount: {debug?.rowCount} / cols: {debug?.colsCount}
              <br />
              - detected dp5_value: <b>{String(debug?.dpCol ?? "NOT FOUND")}</b>
              <br />
              - detected a1..a5: <b>{String(debug?.a1 ?? "a1?")}</b>, <b>{String(debug?.a2 ?? "a2?")}</b>, <b>{String(debug?.a3 ?? "a3?")}</b>, <b>{String(debug?.a4 ?? "a4?")}</b>, <b>{String(debug?.a5 ?? "a5?")}</b>
            </div>
          </div>
        )}

        {/* 1) mean 비교 */}
        <div style={{ borderRadius: 18, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.05)", padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 950 }}>Baseline vs Policy — 평균 효용(dp5_value)</div>
          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.85 }}>
            Baseline = a1..a5 전부 0(무개입) / Policy = 하나라도 !=0(개입)
          </div>

          <div style={{ height: 360, marginTop: 12 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={grouped} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="group" tick={{ fill: "rgba(255,255,255,0.72)" }} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.72)" }} />
                <Tooltip
                  formatter={(v: any, name: any, props: any) => {
                    const d = props?.payload as GroupRow;
                    if (name === "mean") return [`${Number(v).toFixed(3)}`, `mean (n=${d.n})`];
                    if (name === "uplift_vs_baseline") return [Number.isFinite(Number(v)) ? `${Number(v).toFixed(3)}` : "N/A", "uplift vs baseline"];
                    return [String(v), name];
                  }}
                />
                <Legend />
                <ReferenceLine y={0} strokeDasharray="4 4" />
                <Bar dataKey="mean" name="mean dp5_value" fill="rgba(160,200,255,0.85)" />
                <Bar dataKey="uplift_vs_baseline" name="uplift vs baseline (mean diff)" fill="rgba(120,255,190,0.80)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 2) 분위수 비교 */}
        <div style={{ borderRadius: 18, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.05)", padding: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 950 }}>효용 분포(분위수) 비교 — p10 / p50 / p90</div>
          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.85 }}>
            평균뿐 아니라 분포가 “전체적으로” 개선되는지 확인
          </div>

          <div style={{ height: 390, marginTop: 12 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={grouped} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="group" tick={{ fill: "rgba(255,255,255,0.72)" }} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.72)" }} />
                <Tooltip formatter={(v: any) => (Number.isFinite(Number(v)) ? Number(v).toFixed(3) : "N/A")} />
                <Legend />
                <ReferenceLine y={0} strokeDasharray="4 4" />
                <Bar dataKey="p10" name="p10" fill="rgba(255,255,255,0.35)" />
                <Bar dataKey="p50" name="p50 (median)" fill="rgba(255,220,120,0.75)" />
                <Bar dataKey="p90" name="p90" fill="rgba(120,255,190,0.70)" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={{ marginTop: 12, borderRadius: 14, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)", padding: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 950 }}>핵심 메시지</div>
            <div style={{ marginTop: 6, fontSize: 13, opacity: 0.92, lineHeight: 1.45 }}>
              “무개입(baseline) 대비, 모델이 제안하는 개입(policy)을 적용한 경기에서
              <b> 전술 효용(dp5_value)의 평균 및 분포가 상향</b>되는 경향이 나타난다.”
            </div>
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
              * 다음 6번에서 “왜 이런 전술이 나오는지(해석)”와 “그 전술이 uplift를 동반하는지(검증)”로 연결.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
