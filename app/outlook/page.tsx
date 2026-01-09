"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  BarChart,
  Bar,
  LineChart,
  Line,
  ReferenceDot,
} from "recharts";

/** =========================
 * Types
 * ========================= */
type TeamOutlook = "UP" | "DOWN" | "FLAT";

type TeamOutlookRow = {
  team: string;
  team_slug?: string;
  cluster?: number;

  stability?: number; // 0~1
  pti_ceiling?: number;

  outlook?: TeamOutlook;
  confidence?: number; // 0~1

  rationale_short?: string;
  rationale_pro?: string;

  tss?: number;
  sgp?: number;
  pti?: number;

  phase_delta?: Record<string, number>;
};

type TeamDetail = {
  team: string;
  dp_path_hist?: { label: string; value: number }[];
  season_curve?: { x: string; y: number }[];
  notes?: string[];
};

type OutlookPayload = {
  generatedAt?: string;
  rows: TeamOutlookRow[];
  meta?: any;
};

/** =========================
 * 2024 / 2025 ranks
 * ========================= */
const RANK_2024: { rank: number; team: string }[] = [
  { rank: 1, team: "울산 HD FC" },
  { rank: 2, team: "강원FC" },
  { rank: 3, team: "김천 상무 프로축구단" },
  { rank: 4, team: "FC서울" },
  { rank: 5, team: "수원FC" },
  { rank: 6, team: "포항 스틸러스" },
  { rank: 7, team: "제주SK FC" },
  { rank: 8, team: "대전 하나 시티즌" },
  { rank: 9, team: "광주FC" },
  { rank: 10, team: "전북 현대 모터스" },
  { rank: 11, team: "대구FC" },
  { rank: 12, team: "인천 유나이티드" },
];

const RANK_2025: { rank: number; team: string }[] = [
  { rank: 1, team: "전북 현대 모터스" },
  { rank: 2, team: "대전 하나 시티즌" },
  { rank: 3, team: "김천 상무 프로축구단" },
  { rank: 4, team: "포항 스틸러스" },
  { rank: 5, team: "강원FC" },
  { rank: 6, team: "FC서울" },
  { rank: 7, team: "광주FC" },
  { rank: 8, team: "FC안양" },
  { rank: 9, team: "울산 HD FC" },
  { rank: 10, team: "수원FC" },
  { rank: 11, team: "제주SK FC" },
  { rank: 12, team: "대구FC" },
];

/** =========================
 * Exogenous shock tags
 * ========================= */
type ShockKey = "COACH" | "TRANSFERS" | "SANCTION" | "PROMOTED";
type ShockInfo = { COACH?: boolean; TRANSFERS?: boolean; SANCTION?: boolean; PROMOTED?: boolean };

const SHOCKS: Record<string, ShockInfo> = {
  "전북 현대 모터스": { COACH: true, TRANSFERS: true },
  "울산 HD FC": { TRANSFERS: true },
  "강원FC": { COACH: true, TRANSFERS: true },
  "광주FC": { SANCTION: true, TRANSFERS: true },
  "FC안양": { PROMOTED: true },
};

const SHOCK_META: Record<ShockKey, { label: string; cls: string }> = {
  COACH: { label: "감독 교체", cls: "bg-indigo-500/15 border-indigo-300/25 text-indigo-100" },
  TRANSFERS: { label: "대규모 이적", cls: "bg-sky-500/15 border-sky-300/25 text-sky-100" },
  SANCTION: { label: "징계/제재", cls: "bg-amber-500/15 border-amber-300/25 text-amber-100" },
  PROMOTED: { label: "승격/신규", cls: "bg-white/10 border-white/10 text-white/75" },
};

/** =========================
 * Helpers
 * ========================= */
function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
function pretty(v?: number, d = 2) {
  if (v === undefined || v === null || !Number.isFinite(v)) return "-";
  return v.toFixed(d);
}
function toTeamSlug(row: TeamOutlookRow) {
  if (row.team_slug) return row.team_slug;
  return row.team
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_")
    .replaceAll("/", "_")
    .replaceAll(".", "");
}

function teamLogoPath(team: string) {
  const map: Record<string, string> = {
    "FC서울": "fc서울",
    "FC안양": "fc안양",
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
  const key = (team || "").trim();
  const file = map[key] ?? key;
  return `/logos/${file}.png`;
}

function clusterColor(cluster?: number) {
  const palette = ["#60a5fa", "#34d399", "#fbbf24", "#a78bfa", "#fb7185", "#22c55e", "#38bdf8", "#f472b6"];
  if (cluster === undefined || cluster === null) return "rgba(255,255,255,0.55)";
  return palette[Math.abs(cluster) % palette.length];
}

function outlookMeta(outlook?: TeamOutlook) {
  if (outlook === "UP")
    return {
      label: "상승 가능",
      cls: "bg-emerald-500/15 border-emerald-300/25 text-emerald-100",
      dot: "🟢",
      color: "#34d399",
    };
  if (outlook === "DOWN")
    return {
      label: "하락 위험",
      cls: "bg-rose-500/15 border-rose-300/25 text-rose-100",
      dot: "🔴",
      color: "#fb7185",
    };
  return {
    label: "유지/중립",
    cls: "bg-white/10 border-white/10 text-white/75",
    dot: "⚪",
    color: "rgba(255,255,255,0.65)",
  };
}

function defaultPhaseDelta(phase_delta?: Record<string, number>) {
  const phases = ["P1", "P2", "P3", "P4", "P5"];
  return phases.map((p) => ({ phase: p, value: Number((phase_delta?.[p] ?? 0).toFixed(3)) }));
}

/** deterministic jitter/spread */
function hash01(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}
function jitter(v: number, key: string, amp: number) {
  const t = hash01(key) - 0.5;
  return v + t * amp;
}
function padDomain(minV: number, maxV: number, padFrac: number) {
  const lo = Number.isFinite(minV) ? minV : 0;
  const hi = Number.isFinite(maxV) ? maxV : 1;
  const range = Math.max(1e-9, hi - lo);
  const pad = range * padFrac;
  return [lo - pad, hi + pad] as [number, number];
}
function spreadPointsNormalized<T extends { team: string; x: number; y: number }>(
  pts: T[],
  opts?: { iter?: number; minDist?: number; step?: number }
): T[] {
  const iter = opts?.iter ?? 70;
  const minDist = opts?.minDist ?? 0.06;
  const step = opts?.step ?? 0.35;

  const out = pts.map((p) => ({ ...p }));
  const n = out.length;
  if (n <= 1) return out;

  for (let i = 0; i < n; i++) {
    out[i].x = clamp(out[i].x + (hash01(out[i].team + "_rx") - 0.5) * 0.01, 0, 1);
    out[i].y = clamp(out[i].y + (hash01(out[i].team + "_ry") - 0.5) * 0.01, 0, 1);
  }

  for (let it = 0; it < iter; it++) {
    for (let i = 0; i < n; i++) {
      let dxSum = 0;
      let dySum = 0;

      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const dx = out[i].x - out[j].x;
        const dy = out[i].y - out[j].y;
        const d2 = dx * dx + dy * dy;

        if (d2 < minDist * minDist) {
          const d = Math.sqrt(Math.max(1e-9, d2));
          const push = (minDist - d) / minDist;
          dxSum += (dx / d) * push;
          dySum += (dy / d) * push;
        }
      }

      const alpha = step * (1 - it / iter) * 0.9 + 0.05;
      out[i].x = clamp(out[i].x + dxSum * alpha, 0, 1);
      out[i].y = clamp(out[i].y + dySum * alpha, 0, 1);
    }
  }
  return out;
}

/** ranks map */
function makeRankMap(list: { rank: number; team: string }[]) {
  const m = new Map<string, number>();
  list.forEach((x) => m.set(x.team, x.rank));
  return m;
}
const R24 = makeRankMap(RANK_2024);
const R25 = makeRankMap(RANK_2025);
function rank2024(team: string): number | null {
  return R24.has(team) ? (R24.get(team) as number) : null;
}
function rank2025(team: string): number | null {
  return R25.has(team) ? (R25.get(team) as number) : null;
}

/** direction agreement */
function classifyDelta(uplift: number | null): TeamOutlook | "NA" {
  if (uplift === null) return "NA";
  if (uplift >= 2) return "UP";
  if (uplift <= -2) return "DOWN";
  return "FLAT";
}
function agree(pred?: TeamOutlook, actual?: TeamOutlook | "NA") {
  if (!pred || !actual || actual === "NA") return null;
  return pred === actual;
}

/** shock helpers */
function shockKeys(team: string): ShockKey[] {
  const s = SHOCKS[team];
  if (!s) return [];
  const keys: ShockKey[] = [];
  (["COACH", "TRANSFERS", "SANCTION", "PROMOTED"] as ShockKey[]).forEach((k) => {
    if (s[k]) keys.push(k);
  });
  return keys;
}
function shockTitle(team: string) {
  const keys = shockKeys(team);
  if (!keys.length) return "외생변수 태그 없음";
  return keys.map((k) => SHOCK_META[k].label).join(", ");
}

/** ✅ stronger mismatch narrative (selected team-aware) */
function buildMismatchNarrative(args: {
  team: string;
  pred: TeamOutlook;
  actual: TeamOutlook | "NA";
  uplift: number | null;
  stability?: number;
  ceiling?: number;
  confidence?: number;
  shocks: ShockKey[];
}) {
  const { team, pred, actual, uplift, stability, ceiling, confidence, shocks } = args;

  const st = stability ?? 0;
  const ce = ceiling ?? 0;
  const conf = confidence ?? 0.5;

  const lines: string[] = [];

  // 1) what mismatch means (concrete)
  if (actual === "NA") {
    lines.push("• 2024 순위가 없어(승격/데이터 부재) 2024→2025 방향 비교가 불가합니다.");
  } else if (pred === actual) {
    lines.push("• 방향은 일치합니다. (이 모델은 ‘정확한 순위’가 아니라 UP/DOWN/FLAT 방향 경향을 봅니다.)");
  } else {
    lines.push(`• 방향 불일치: 모델=${pred}, 실제(순위변동 기반)=${actual} 입니다.`);
  }

  // 2) shocks as primary explanatory lever
  if (shocks.length) {
    const labels = shocks.map((k) => SHOCK_META[k].label).join(", ");
    lines.push(`• 외생변수(조건 변화) 가능성: ${labels} → 2024 기반 구조가 2025에 그대로 재현되지 않을 수 있습니다.`);
  } else {
    lines.push("• 외생변수 태그가 없더라도, 부상/일정/전술 적합도/득점 분산(결정력) 같은 ‘경기 내 변동’으로 방향이 뒤집힐 수 있습니다.");
  }

  // 3) stability-ceiling based interpretation (more specific)
  const stTag = st >= 0.5 ? "안정성↑" : "안정성↓";
  const ceTag = ce >= 0 ? "고점(ceiling)↑" : "고점(ceiling)↓"; // ce 자체는 scale이 다를 수 있어 방향만; 실제로는 상대비교
  if (st >= 0.55 && pred === "DOWN") {
    lines.push("• 안정성은 높은 편인데 DOWN 라벨이라면: ‘패턴은 일관되지만 득점/전환의 상한이 낮다’(고점 제한) 쪽 해석이 더 자연스럽습니다.");
  } else if (st < 0.45 && pred === "UP") {
    lines.push("• 안정성이 낮은데 UP 라벨이라면: ‘터질 수는 있지만 편차가 큰 팀’(하이리스크-하이리턴)으로 보는 게 합리적입니다.");
  } else {
    lines.push(`• 스타일 힌트: ${stTag} · (상대적) ceiling 성향 → 같은 방향이라도 변동 폭이 커질 수 있습니다.`);
  }

  // 4) confidence mention
  if (conf < 0.45) {
    lines.push("• 모델 신뢰도(confidence)가 낮은 편입니다. (경계 사례: UP/FLAT/DOWN이 바뀔 수 있는 구간)");
  } else if (conf > 0.7) {
    lines.push("• 모델 신뢰도(confidence)가 높은 편이라, 불일치라면 ‘조건 변화(외생변수)’ 설명력이 커집니다.");
  }

  // 5) what to watch (actionable)
  if (pred !== actual && actual !== "NA") {
    lines.push("• 체크 포인트(발표용): 시즌 초 5~8경기에서 전환(속공)·세트피스·수비 라인 유지 지표가 ‘예측 방향’으로 수렴하는지 관찰하면 설명이 더 탄탄해집니다.");
  }

  return lines;
}

/** =========================
 * UI bits
 * ========================= */
function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-lg font-semibold">{title}</div>
        {subtitle && <div className="text-sm text-white/65 mt-1">{subtitle}</div>}
      </div>
    </div>
  );
}

/** Tooltip with logo */
function MapTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload as any;
  if (!p) return null;

  return (
    <div className="rounded-lg bg-black/40 backdrop-blur-md border border-white/10 p-3 text-xs shadow-xl max-w-[240px]">
      <div className="flex items-center gap-2">
        <img
          src={teamLogoPath(p.team)}
          alt={p.team}
          className="w-8 h-8 rounded-md bg-black/30 border border-white/10"
          onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
        />
        <div className="min-w-0">
          <div className="text-white/90 font-semibold truncate">{p.team}</div>
          <div className="text-white/60 truncate">Cluster {p.cluster ?? "-"}</div>
        </div>
      </div>

      <div className="text-white/70 mt-2">
        Outlook: <span className="text-white">{p.outlook ?? "FLAT"}</span>
      </div>
      <div className="text-white/70">
        Stability: <span className="text-white">{pretty(p.stability_raw ?? p.stability, 3)}</span>
      </div>
      <div className="text-white/70">
        Ceiling: <span className="text-white">{pretty(p.pti_ceiling_raw ?? p.pti_ceiling, 3)}</span>
      </div>

      <div className="text-white/50 mt-2 leading-relaxed">
        ※ 겹침 완화를 위해 <b>표시 좌표에만</b> 스프레드(반발 배치)를 적용했고, 원값은 그대로입니다.
      </div>
    </div>
  );
}

/** Dot */
function ClusterOutlookDot(props: any) {
  const { cx, cy, payload, selectedTeam } = props;
  if (!payload || cx == null || cy == null) return null;

  const team = payload.team as string;
  const isSel = team === selectedTeam;

  const o = outlookMeta((payload.outlook ?? "FLAT") as TeamOutlook);
  const ring = clusterColor(payload.cluster);

  const rOuter = isSel ? 9.6 : 8.2;
  const rInner = isSel ? 5.6 : 4.8;

  const wOuter = isSel ? 3.8 : 3.1;
  const wSep = isSel ? 2.6 : 2.1;

  return (
    <g>
      <circle cx={cx} cy={cy} r={rOuter} fill="rgba(0,0,0,0)" stroke={ring} strokeWidth={wOuter} opacity={0.95} />
      <circle
        cx={cx}
        cy={cy}
        r={rOuter - wOuter / 2 - 0.35}
        fill="rgba(0,0,0,0)"
        stroke="rgba(255,255,255,0.9)"
        strokeWidth={wSep}
        opacity={0.9}
      />
      <circle cx={cx} cy={cy} r={rInner} fill={o.color} stroke="rgba(0,0,0,0)" opacity={0.95} />
      {isSel && (
        <circle
          cx={cx}
          cy={cy}
          r={rOuter + 4.2}
          fill="rgba(255,255,255,0)"
          stroke="rgba(255,255,255,0.25)"
          strokeWidth={2}
        />
      )}
    </g>
  );
}

/** =========================
 * Page
 * ========================= */
export default function OutlookPage() {
  const [rows, setRows] = useState<TeamOutlookRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState("");
  const [clusterFilter, setClusterFilter] = useState<number | "ALL">("ALL");
  const [outlookFilter, setOutlookFilter] = useState<"ALL" | TeamOutlook>("ALL");

  const [selectedTeam, setSelectedTeam] = useState<string>(RANK_2025[0]?.team ?? "");

  const [detail, setDetail] = useState<TeamDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/data/team_tactical_outlook.json", { cache: "no-store" });
        const json: OutlookPayload = await res.json();
        const arr = Array.isArray(json?.rows) ? json.rows : [];
        setRows(arr);
        if (arr.length && !arr.find((r) => r.team === selectedTeam)) setSelectedTeam(arr[0].team);
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      if (!selectedTeam) {
        setDetail(null);
        return;
      }
      const row = rows.find((r) => r.team === selectedTeam);
      if (!row) {
        setDetail(null);
        return;
      }
      const slug = toTeamSlug(row);
      setDetailLoading(true);
      try {
        const res = await fetch(`/data/team_tactical_detail/${slug}.json`, { cache: "no-store" });
        if (!res.ok) throw new Error("no detail");
        const json: TeamDetail = await res.json();
        setDetail(json);
      } catch {
        setDetail(null);
      } finally {
        setDetailLoading(false);
      }
    })();
  }, [selectedTeam, rows]);

  const clusters = useMemo(() => {
    const s = new Set<number>();
    rows.forEach((r) => {
      if (r.cluster !== undefined && r.cluster !== null && Number.isFinite(r.cluster)) s.add(r.cluster);
    });
    return Array.from(s).sort((a, b) => a - b);
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (clusterFilter !== "ALL" && (r.cluster ?? -999) !== clusterFilter) return false;
      if (outlookFilter !== "ALL" && (r.outlook ?? "FLAT") !== outlookFilter) return false;
      if (!q) return true;
      return (
        r.team.toLowerCase().includes(q) ||
        (r.rationale_short ?? "").toLowerCase().includes(q) ||
        (r.rationale_pro ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, query, clusterFilter, outlookFilter]);

  const selectedRow = useMemo(() => rows.find((r) => r.team === selectedTeam) ?? null, [rows, selectedTeam]);

  const { mapData, yDomain, yMid } = useMemo(() => {
    const base = filtered.map((r) => {
      const s0 = Number.isFinite(r.stability as number) ? (r.stability as number) : 0;
      const c0 = Number.isFinite(r.pti_ceiling as number) ? (r.pti_ceiling as number) : 0;

      const sx = clamp(jitter(s0, r.team + "_x", 0.06), 0, 1);
      const cy = jitter(c0, r.team + "_y", 0.22);

      return {
        ...r,
        stability_raw: s0,
        pti_ceiling_raw: c0,
        stability: sx,
        pti_ceiling: cy,
      };
    });

    const ys = base.map((d: any) => (Number.isFinite(d.pti_ceiling as number) ? (d.pti_ceiling as number) : 0));
    const yMin = ys.length ? Math.min(...ys) : 0;
    const yMax = ys.length ? Math.max(...ys) : 1;

    const dom = padDomain(yMin, yMax, 0.22);
    const mid = (dom[0] + dom[1]) / 2;

    const norm = base.map((d: any) => {
      const x = clamp(d.stability as number, 0, 1);
      const y = (clamp(d.pti_ceiling as number, dom[0], dom[1]) - dom[0]) / Math.max(1e-9, dom[1] - dom[0]);
      return { team: d.team, x, y };
    });

    const spread = spreadPointsNormalized(norm, { iter: 80, minDist: 0.075, step: 0.38 });

    const merged = base.map((d: any) => {
      const p = spread.find((s) => s.team === d.team);
      if (!p) return d;
      const yBack = dom[0] + p.y * (dom[1] - dom[0]);
      return { ...d, stability: p.x, pti_ceiling: yBack };
    });

    return { mapData: merged, yDomain: dom, yMid: mid };
  }, [filtered]);

  const phaseBar = useMemo(() => {
    if (!selectedRow) return [];
    return defaultPhaseDelta(selectedRow.phase_delta).map((x) => ({ phase: x.phase, value: x.value }));
  }, [selectedRow]);

  const dpHist = useMemo(() => detail?.dp_path_hist ?? [], [detail]);
  const curve = useMemo(() => detail?.season_curve ?? [], [detail]);

  const validationList = useMemo(() => {
    return RANK_2025.map((x) => {
      const r24 = rank2024(x.team);
      const uplift = r24 === null ? null : r24 - x.rank;
      return { ...x, rank24: r24, uplift };
    });
  }, []);

  const validationSummary = useMemo(() => {
    let n = 0,
      agreeN = 0,
      na = 0;
    for (const v of validationList) {
      const row = rows.find((r) => r.team === v.team);
      const pred = row?.outlook ?? "FLAT";
      const actualDir = classifyDelta(v.uplift);
      const ok = agree(pred, actualDir);
      if (actualDir === "NA") {
        na++;
        continue;
      }
      n++;
      if (ok === true) agreeN++;
    }
    return { comparable: n, agree: agreeN, na };
  }, [validationList, rows]);

  const mismatchShockData = useMemo(() => {
    const counts: Record<ShockKey, number> = { COACH: 0, TRANSFERS: 0, SANCTION: 0, PROMOTED: 0 };
    let mismatchTeams = 0;

    for (const v of validationList) {
      const row = rows.find((r) => r.team === v.team);
      const pred = row?.outlook ?? "FLAT";
      const actualDir = classifyDelta(v.uplift);
      const ok = agree(pred, actualDir);
      if (ok === false) {
        mismatchTeams++;
        shockKeys(v.team).forEach((k) => (counts[k] += 1));
      }
    }

    return {
      mismatchTeams,
      data: (Object.keys(counts) as ShockKey[]).map((k) => ({ key: k, label: SHOCK_META[k].label, value: counts[k] })),
    };
  }, [validationList, rows]);

  if (loading) {
    return (
      <div className="min-h-screen bg-transparent text-[var(--k-fg)]">
        <div className="max-w-6xl mx-auto px-4 py-10">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent text-[var(--k-fg)]">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* Filters */}
        <div className="rounded-xl bg-white/5 border border-white/10 p-4">
          <SectionHeader title="Filters" subtitle="여기서 고른(Cluster/Outlook/Search) 팀의 ‘결과 카드’가 바로 아래에 즉시 반영됩니다." />

          <div className="mt-4 grid md:grid-cols-12 gap-3">
            <div className="md:col-span-6">
              <div className="text-xs text-white/60 mb-1">Search</div>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="팀명 / 문장 검색 (예: 안정, 리스크, P4, 전환)"
                className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-white/20"
              />
            </div>

            <div className="md:col-span-3">
              <div className="text-xs text-white/60 mb-1">Cluster</div>
              <select
                className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm"
                value={clusterFilter}
                onChange={(e) => setClusterFilter(e.target.value === "ALL" ? "ALL" : Number(e.target.value))}
              >
                <option value="ALL">ALL</option>
                {clusters.map((c) => (
                  <option key={c} value={c}>
                    Cluster {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-3">
              <div className="text-xs text-white/60 mb-1">Outlook</div>
              <select
                className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm"
                value={outlookFilter}
                onChange={(e) => setOutlookFilter(e.target.value as any)}
              >
                <option value="ALL">ALL</option>
                <option value="UP">UP</option>
                <option value="FLAT">FLAT</option>
                <option value="DOWN">DOWN</option>
              </select>
            </div>
          </div>
        </div>

        {/* Cards + Selected */}
        <div className="grid md:grid-cols-12 gap-4">
          <div className="md:col-span-7 rounded-xl bg-white/5 border border-white/10 p-4">
            <SectionHeader title="Teams · tactical outlook cards" subtitle="카드를 클릭하면 우측 상세가 바뀝니다." />

            <div className="mt-4 grid md:grid-cols-2 gap-3">
              {filtered.map((r) => {
                const badge = outlookMeta(r.outlook ?? "FLAT");
                const isSelected = r.team === selectedTeam;

                return (
                  <button
                    key={r.team}
                    onClick={() => setSelectedTeam(r.team)}
                    className={
                      "w-full text-left rounded-xl border p-4 transition " +
                      (isSelected ? "bg-white/10 border-white/20" : "bg-white/5 border-white/10 hover:bg-white/8")
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={teamLogoPath(r.team)}
                          alt={r.team}
                          className="w-10 h-10 rounded-md bg-black/20 border border-white/10"
                          onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                        />
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{r.team}</div>
                          <div className="text-xs text-white/60">
                            Cluster {r.cluster ?? "-"} · Stability {pretty(r.stability, 2)} · Ceiling {pretty(r.pti_ceiling, 2)}
                          </div>
                        </div>
                      </div>

                      <div className={`shrink-0 rounded-full border px-3 py-1 text-xs ${badge.cls}`}>
                        <span className="mr-1">{badge.dot}</span>
                        {badge.label}
                      </div>
                    </div>

                    <div className="mt-3 text-sm text-white/85 leading-relaxed line-clamp-3">{r.rationale_short ?? "—"}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="md:col-span-5 rounded-xl bg-white/5 border border-white/10 p-4 space-y-3">
            <SectionHeader title="Selected team" subtitle="막대그래프(phase impact) → 한 줄 요약 → 근거(상세) 순서로 읽기" />

            {!selectedRow ? (
              <div className="text-sm text-white/60">Select a team.</div>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <img
                    src={teamLogoPath(selectedRow.team)}
                    alt={selectedRow.team}
                    className="w-12 h-12 rounded-md bg-black/20 border border-white/10"
                    onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                  />
                  <div className="min-w-0">
                    <div className="text-lg font-semibold truncate">{selectedRow.team}</div>
                    <div className="text-xs text-white/60">
                      Cluster {selectedRow.cluster ?? "-"} · Stability {pretty(selectedRow.stability, 2)} · Ceiling{" "}
                      {pretty(selectedRow.pti_ceiling, 2)}
                      {selectedRow.confidence != null && (
                        <>
                          {" "}
                          · Conf {pretty(selectedRow.confidence, 2)}
                        </>
                      )}
                    </div>
                  </div>
                  <div className={`ml-auto rounded-full border px-3 py-1 text-xs ${outlookMeta(selectedRow.outlook).cls}`}>
                    {outlookMeta(selectedRow.outlook).dot} {outlookMeta(selectedRow.outlook).label}
                  </div>
                </div>

                <div className="rounded-xl bg-black/20 border border-white/10 p-3">
                  <div className="text-xs text-white/60 mb-2">Phase impact (What-if − Observed)</div>
                  <div className="h-[170px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={phaseBar}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                        <XAxis dataKey="phase" tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 11 }} />
                        <YAxis tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 11 }} />
                        <Tooltip />
                        <ReferenceLine y={0} stroke="rgba(255,255,255,0.25)" />
                        <Bar dataKey="value" name="Δ utility" fill="#34d399" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-2 text-[12px] text-white/60 leading-relaxed">
                    ✅ 읽는 법: 0 위=좋아지는 방향(UP 기여), 0 아래=리스크/손실(Downside) 기여
                  </div>
                </div>

                <div className="rounded-xl bg-black/20 border border-white/10 p-3">
                  <div className="text-xs text-white/60 mb-1">One-line</div>
                  <div className="text-sm text-white/85 leading-relaxed">{selectedRow.rationale_short ?? "—"}</div>
                  {selectedRow.rationale_pro && (
                    <div className="mt-2 text-[12px] text-white/60 leading-relaxed">
                      <span className="text-white/55">전문:</span> {selectedRow.rationale_pro}
                    </div>
                  )}
                </div>

                <div className="rounded-xl bg-black/20 border border-white/10 p-3">
                  <div className="text-xs text-white/60 mb-2">Why (evidence)</div>

                  {detailLoading ? (
                    <div className="text-sm text-white/60">Loading detail…</div>
                  ) : !detail ? (
                    <div className="text-sm text-white/60">detail json not found (optional).</div>
                  ) : (
                    <div className="space-y-4">
                      {dpHist?.length > 0 && (
                        <div>
                          <div className="text-[12px] text-white/60 mb-1">DP path distribution (top)</div>
                          <div className="h-[140px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={dpHist}>
                                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                                <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 10 }} />
                                <YAxis tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 10 }} />
                                <Tooltip />
                                <Bar dataKey="value" fill="#60a5fa" />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      )}

                      {curve?.length > 0 && (
                        <div>
                          <div className="text-[12px] text-white/60 mb-1">Season accumulation (curve)</div>
                          <div className="h-[160px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={curve}>
                                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                                <XAxis dataKey="x" tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 10 }} />
                                <YAxis tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 10 }} />
                                <Tooltip />
                                <Line type="monotone" dataKey="y" stroke="#a78bfa" strokeWidth={2} dot={false} />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* League map */}
        <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3">
          <SectionHeader
            title="League map · Stability × Intensity"
            subtitle="점 내부 색=Outlook(UP/DOWN/FLAT), 바깥 링=Cluster(흰 분리 링으로 색 겹침 방지). (겹침 완화를 위해 표시 좌표에 스프레드/패딩 적용)"
          />

          <div className="grid md:grid-cols-12 gap-4 items-start">
            <div className="md:col-span-8">
              <div className="flex flex-wrap items-center gap-3 text-[12px] text-white/65 mb-2">
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block w-3 h-3 rounded-full" style={{ background: "#34d399" }} /> UP
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block w-3 h-3 rounded-full" style={{ background: "rgba(255,255,255,0.65)" }} /> FLAT
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block w-3 h-3 rounded-full" style={{ background: "#fb7185" }} /> DOWN
                </span>
                <span className="text-white/45">|</span>
                <span className="text-white/55">hover: 로고/수치 툴팁 · click: 팀 선택</span>
              </div>

              <div className="h-[420px] rounded-xl bg-black/10 border border-white/10 p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 18, right: 16, bottom: 28, left: 44 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                    <XAxis
                      type="number"
                      dataKey="stability"
                      name="Stability"
                      domain={[0, 1]}
                      tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 12 }}
                      tickMargin={8}
                    />
                    <YAxis
                      type="number"
                      dataKey="pti_ceiling"
                      name="Intensity ceiling"
                      domain={yDomain as any}
                      tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 12 }}
                      tickMargin={10}
                      width={78}
                      tickFormatter={(v) => Number(v).toFixed(2)}
                    />
                    <Tooltip content={<MapTooltip />} />

                    <ReferenceLine x={0.5} stroke="rgba(255,255,255,0.18)" />
                    <ReferenceLine y={yMid} stroke="rgba(255,255,255,0.12)" />

                    <Scatter
                      data={mapData}
                      name="teams"
                      onClick={(p: any) => setSelectedTeam(p?.team ?? "")}
                      shape={(p: any) => <ClusterOutlookDot {...p} selectedTeam={selectedTeam} />}
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="md:col-span-4">
              <div className="rounded-xl bg-black/20 border border-white/10 p-4">
                <div className="text-sm font-semibold text-white/85">이 그래프가 의미하는 것</div>

                <div className="mt-2 text-[12px] text-white/65 leading-relaxed space-y-2">
                  <div>
                    • <b>가로(Stability)</b>: 시즌 내 전술/경기력 패턴이 얼마나 <b>일관</b>적인가
                  </div>
                  <div>
                    • <b>세로(Intensity ceiling)</b>: “최대로 뽑아낼 수 있는 전술 강도 상한”
                  </div>
                  <div>
                    • <b>내부 색(UP/DOWN/FLAT)</b>: <b>순위 예언</b>이 아니라 구조적 <b>방향(경향)</b>
                  </div>
                  <div>
                    • <b>바깥 링(Cluster)</b>: 비슷한 전술/스타일의 팀 묶음 (숫자 자체 의미 X)
                  </div>
                </div>

                <div className="mt-4 text-[11px] text-white/50 leading-relaxed">
                  ※ 겹침 문제 해결을 위해 표시 좌표만 배치 보정을 넣었고, 실제 수치는 툴팁에 남겨둡니다.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* =========================
            Validation
           ========================= */}
        <div className="rounded-xl bg-white/5 border border-white/10 p-4">
          <SectionHeader
            title="Validation (2024 → 2025 actual ranking)"
            subtitle={`방향성 일치율(단순): ${validationSummary.agree}/${validationSummary.comparable} (승격/비교불가 ${validationSummary.na}팀 제외). ※ ‘정확도’가 아니라 ‘방향(UP/DOWN/FLAT) 경향’ 일치 정도입니다.`}
          />

          <div className="mt-4 grid md:grid-cols-12 gap-4">
            {/* left list */}
            <div className="md:col-span-6 rounded-xl bg-black/20 border border-white/10 p-3">
              <div className="text-xs text-white/60 mb-2">2025 ranking list (click a team)</div>

              <div className="space-y-2">
                {RANK_2025.map((x) => {
                  const r24 = rank2024(x.team);
                  const uplift = r24 === null ? null : r24 - x.rank;

                  const isSelected = x.team === selectedTeam;
                  const row = rows.find((r) => r.team === x.team) ?? null;
                  const pred = row?.outlook ?? "FLAT";
                  const predBadge = outlookMeta(pred);

                  const actualDir = classifyDelta(uplift);
                  const ok = agree(pred, actualDir);

                  // ✅ (1) uplift pill
                  const upliftPill =
                    uplift === null ? (
                      <span className="rounded-full bg-white/10 border border-white/10 px-2 py-1 text-[11px] text-white/70">
                        2024 없음
                      </span>
                    ) : uplift === 0 ? (
                      <span className="rounded-full bg-white/10 border border-white/10 px-2 py-1 text-[11px] text-white/70">
                        uplift 0
                      </span>
                    ) : uplift > 0 ? (
                      <span className="rounded-full bg-emerald-500/15 border-emerald-300/25 px-2 py-1 text-[11px] text-emerald-100">
                        uplift +{uplift}
                      </span>
                    ) : (
                      <span className="rounded-full bg-rose-500/15 border border-rose-300/25 px-2 py-1 text-[11px] text-rose-100">
                        uplift {uplift}
                      </span>
                    );

                  // ✅ (2) agree pill
                  const agreePill =
                    ok === null ? (
                      <span className="rounded-full bg-white/10 border border-white/10 px-2 py-1 text-[11px] text-white/55">
                        비교 불가
                      </span>
                    ) : ok ? (
                      <span className="rounded-full bg-emerald-500/10 border border-emerald-300/20 px-2 py-1 text-[11px] text-emerald-100">
                        방향 일치
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-500/10 border border-amber-300/20 px-2 py-1 text-[11px] text-amber-100">
                        방향 불일치
                      </span>
                    );

                  // ✅ compact tags
                  const shocks = shockKeys(x.team);
                  const tagsCount = shocks.length;
                  const tagsTitle = shockTitle(x.team);

                  return (
                    <button
                      key={x.team}
                      onClick={() => setSelectedTeam(x.team)}
                      className={
                        "w-full text-left rounded-lg border px-3 py-2 transition " +
                        (isSelected ? "bg-white/10 border-white/20" : "bg-white/5 border-white/10 hover:bg-white/8")
                      }
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-10 text-sm font-semibold text-white/90">#{x.rank}</div>
                          <img
                            src={teamLogoPath(x.team)}
                            alt={x.team}
                            className="w-6 h-6 rounded-sm bg-black/20 border border-white/10"
                            onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                          />
                          <div className="font-semibold truncate">{x.team}</div>
                        </div>

                        {/* ✅ row-1: only 2 chips */}
                        <div className="flex items-center gap-2 flex-wrap justify-end">
                          {upliftPill}
                          {agreePill}
                        </div>
                      </div>

                      {/* ✅ row-2: compact meta (Model + Tags) */}
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="text-[11px] text-white/55">
                          2024:{" "}
                          {r24 === null ? <span className="text-white/45">—</span> : <span className="text-white/75">#{r24}</span>} ·
                          2025: <span className="text-white/75">#{x.rank}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={`rounded-full border px-2 py-1 text-[11px] ${predBadge.cls}`} title="모델 방향(경향) 라벨">
                            Model {predBadge.dot} {pred}
                          </span>

                          <span
                            className="rounded-full bg-white/10 border border-white/10 px-2 py-1 text-[11px] text-white/70"
                            title={tagsTitle}
                          >
                            Tags {tagsCount}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 text-[11px] text-white/45 leading-relaxed">
                ※ 리스트에서는 복잡도를 줄이기 위해 “uplift + 방향일치”만 크게 보여주고, Model/Tags는 아래에 묶었습니다.
              </div>
            </div>

            {/* right explain + mismatch + rank movement */}
            <div className="md:col-span-6 rounded-xl bg-black/20 border border-white/10 p-3">
              <div className="text-xs text-white/60 mb-2">Explain + Why mismatch can happen</div>

              {!selectedRow ? (
                <div className="text-sm text-white/60">팀을 선택해 주세요.</div>
              ) : (
                (() => {
                  const r24 = rank2024(selectedRow.team);
                  const r25 = rank2025(selectedRow.team);
                  const uplift = r24 === null || r25 === null ? null : r24 - r25;

                  const pred = (selectedRow.outlook ?? "FLAT") as TeamOutlook;
                  const actual = classifyDelta(uplift);
                  const ok = agree(pred, actual);

                  const shocks = shockKeys(selectedRow.team);
                  const narrative = buildMismatchNarrative({
                    team: selectedRow.team,
                    pred,
                    actual,
                    uplift,
                    stability: selectedRow.stability,
                    ceiling: selectedRow.pti_ceiling,
                    confidence: selectedRow.confidence,
                    shocks,
                  });

                  const statusPill =
                    ok === null ? (
                      <span className="rounded-full bg-white/10 border border-white/10 px-3 py-1 text-xs text-white/70">비교 불가</span>
                    ) : ok ? (
                      <span className="rounded-full bg-emerald-500/10 border border-emerald-300/20 px-3 py-1 text-xs text-emerald-100">
                        방향 일치
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-500/10 border border-amber-300/20 px-3 py-1 text-xs text-amber-100">
                        방향 불일치
                      </span>
                    );

                  return (
                    <>
                      <div className="flex items-center gap-3">
                        <img
                          src={teamLogoPath(selectedRow.team)}
                          alt={selectedRow.team}
                          className="w-10 h-10 rounded-md bg-black/20 border border-white/10"
                          onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                        />
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{selectedRow.team}</div>
                          <div className="text-[11px] text-white/60">
                            2024 #{r24 ?? "—"} → 2025 #{r25 ?? "—"} {uplift != null && <span>· uplift {uplift >= 0 ? `+${uplift}` : uplift}</span>}
                          </div>
                        </div>
                        <div className="ml-auto flex items-center gap-2">
                          {statusPill}
                          <span className={`rounded-full border px-3 py-1 text-xs ${outlookMeta(pred).cls}`} title="모델 방향(경향) 라벨">
                            Model {outlookMeta(pred).dot} {pred}
                          </span>
                        </div>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-2">
                        <span
                          className="rounded-full bg-white/10 border border-white/10 px-3 py-1 text-[12px] text-white/70"
                          title={shockTitle(selectedRow.team)}
                        >
                          Tags {shocks.length}
                        </span>
                        {selectedRow.confidence != null && (
                          <span className="rounded-full bg-white/10 border border-white/10 px-3 py-1 text-[12px] text-white/70" title="모델 신뢰도">
                            Conf {pretty(selectedRow.confidence, 2)}
                          </span>
                        )}
                      </div>

                      <div className="mt-3 text-sm text-white/80 leading-relaxed">{selectedRow.rationale_short ?? "—"}</div>

                      {/* ✅ stronger mismatch explanation (bullets) */}
                      <div className="mt-3 rounded-lg bg-white/5 border border-white/10 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs text-white/60">Why mismatch can happen (team-aware)</div>
                          <div className="text-[11px] text-white/55">
                            실제(순위변동)={actual === "NA" ? "NA" : actual}
                          </div>
                        </div>

                        <div className="mt-2 text-[12px] text-white/70 leading-relaxed space-y-1">
                          {narrative.map((t, idx) => (
                            <div key={idx}>{t}</div>
                          ))}
                        </div>

                        <div className="mt-2 text-[11px] text-white/50 leading-relaxed">
                          ※ 핵심: 불일치가 “모델 오류”라기보다 “조건 변화 + 변동성” 문제일 수 있음을, 팀 수치/태그로 납득시키는 구조입니다.
                        </div>
                      </div>

                      {/* mismatch drivers (league-level) */}
                      <div className="mt-3 rounded-lg bg-white/5 border border-white/10 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs text-white/60">Mismatch drivers (league-level)</div>
                          <div className="text-[11px] text-white/55">
                            불일치 팀 수: <b className="text-white/75">{mismatchShockData.mismatchTeams}</b>
                          </div>
                        </div>

                        <div className="h-[190px] mt-2">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={mismatchShockData.data}>
                              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                              <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 11 }} />
                              <YAxis tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 11 }} allowDecimals={false} />
                              <Tooltip />
                              <Bar dataKey="value" fill="#fbbf24" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>

                        <div className="mt-2 text-[12px] text-white/55 leading-relaxed">
                          → “방향 불일치” 팀들에서 어떤 외생변수가 많이 나타나는지(설명력)를 보여주는 장치입니다.
                        </div>
                      </div>

                      {/* rank movement (compact) */}
                      <div className="mt-3 rounded-lg bg-white/5 border border-white/10 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs text-white/60">Rank movement (2024 → 2025)</div>
                          <div
                            className={
                              "rounded-full border px-3 py-1 text-xs " +
                              (uplift != null && uplift > 0
                                ? "bg-emerald-500/15 border-emerald-300/25 text-emerald-100"
                                : uplift != null && uplift < 0
                                ? "bg-rose-500/15 border-rose-300/25 text-rose-100"
                                : "bg-white/10 border-white/10 text-white/75")
                            }
                            title="uplift = 2024 rank - 2025 rank (양수면 상승)"
                          >
                            {uplift == null ? "데이터 없음" : uplift === 0 ? "변동 없음" : uplift > 0 ? `상승 +${uplift}` : `하락 ${uplift}`}
                          </div>
                        </div>

                        <div className="mt-2 text-[12px] text-white/60 leading-relaxed">
                          ✅ y축은 <b>rank</b>, <b>1위가 위</b>입니다. 선이 위로 갈수록 “상승”입니다.
                        </div>

                        <div className="h-[170px] mt-2">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart
                              data={[
                                { season: "2024", rank: r24 ?? 12 },
                                { season: "2025", rank: r25 ?? 12 },
                              ]}
                              margin={{ top: 10, right: 14, bottom: 10, left: 6 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                              <XAxis dataKey="season" tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 11 }} />
                              <YAxis domain={[1, 12]} reversed tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 11 }} allowDecimals={false} />
                              <Tooltip formatter={(v: any) => [`#${v}`, "Rank"]} labelFormatter={(l) => `${l} 시즌`} />
                              <Line type="monotone" dataKey="rank" stroke="#a78bfa" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                              {r24 != null && <ReferenceDot x="2024" y={r24} r={5} fill="rgba(255,255,255,0.95)" stroke="rgba(0,0,0,0)" />}
                              {r25 != null && <ReferenceDot x="2025" y={r25} r={5} fill="rgba(255,255,255,0.95)" stroke="rgba(0,0,0,0)" />}
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </>
                  );
                })()
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
