// app/api/archetype/route.ts
import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

type TeamRow = {
  team: string;
  TSS: number;
  SGP: number;
  PTI: number;
};

// --- utils ---
function toNum(v: any, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
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

function zscoreMatrix(X: number[][]) {
  const n = X.length;
  const d = X[0].length;
  const mu = Array(d).fill(0);
  const sd = Array(d).fill(0);

  for (let j = 0; j < d; j++) {
    for (let i = 0; i < n; i++) mu[j] += X[i][j];
    mu[j] /= n;
  }
  for (let j = 0; j < d; j++) {
    for (let i = 0; i < n; i++) sd[j] += (X[i][j] - mu[j]) ** 2;
    sd[j] = Math.sqrt(sd[j] / Math.max(1, n - 1)) || 1;
  }

  const Z = X.map((row) => row.map((v, j) => (v - mu[j]) / sd[j]));
  return { Z, mu, sd };
}

function dist2(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return s;
}

// 아주 작은 데이터(12팀)용 심플 kmeans
function kmeans(X: number[][], k: number, iters = 50) {
  const n = X.length;
  const d = X[0].length;

  // init: 앞에서 k개 (재현성 좋고 디버깅 쉬움) — 원하면 랜덤으로 바꿔도 됨
  let C = X.slice(0, k).map((v) => v.slice());
  let labels = new Array(n).fill(0);

  for (let t = 0; t < iters; t++) {
    // assign
    let changed = false;
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d2 = dist2(X[i], C[c]);
        if (d2 < bestD) {
          bestD = d2;
          best = c;
        }
      }
      if (labels[i] !== best) {
        labels[i] = best;
        changed = true;
      }
    }

    // update
    const sum = Array.from({ length: k }, () => Array(d).fill(0));
    const cnt = Array(k).fill(0);
    for (let i = 0; i < n; i++) {
      cnt[labels[i]]++;
      for (let j = 0; j < d; j++) sum[labels[i]][j] += X[i][j];
    }
    for (let c = 0; c < k; c++) {
      if (cnt[c] === 0) continue;
      for (let j = 0; j < d; j++) C[c][j] = sum[c][j] / cnt[c];
    }

    if (!changed) break;
  }

  return { labels, centroids: C };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const k = Math.max(2, Math.min(6, Number(url.searchParams.get("k") ?? "3"))); // 기본 k=3

  // ✅ 너가 지금까지 써온 팀 요약 CSV를 그대로 사용
  // 컬럼명이 다르면 아래 매핑만 바꾸면 됨
  const filePath = path.join(process.cwd(), "public", "data", "team_TSS_SGP_PTI_master.csv");
  const csv = await fs.readFile(filePath, "utf-8");
  const rows = parseCsv(csv);

  // 컬럼 매핑(네 파일에 맞게 조절 가능)
  const teams: TeamRow[] = rows.map((r) => ({
    team: r.TeamLabel || r.team_name_ko || r.team || "",
    TSS: toNum(r.TSS),
    SGP: toNum(r.SGP),
    PTI: toNum(r.PTI),
  })).filter((r) => r.team);

  const X = teams.map((t) => [t.TSS, t.SGP, t.PTI]);
  const { Z } = zscoreMatrix(X); // 스케일 맞춰서 클러스터링
  const { labels } = kmeans(Z, k);

  // 클러스터 평균 프로파일(원본 스케일로)
  const profile = Array.from({ length: k }, () => ({ n: 0, TSS: 0, SGP: 0, PTI: 0 }));
  teams.forEach((t, i) => {
    const c = labels[i];
    profile[c].n++;
    profile[c].TSS += t.TSS;
    profile[c].SGP += t.SGP;
    profile[c].PTI += t.PTI;
  });
  profile.forEach((p) => {
    if (p.n > 0) {
      p.TSS /= p.n;
      p.SGP /= p.n;
      p.PTI /= p.n;
    }
  });

  const data = teams.map((t, i) => ({ ...t, cluster: labels[i] }));

  return NextResponse.json({ k, data, profile });
}
