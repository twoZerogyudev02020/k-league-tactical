"use client";

import TopNav from "../components/TopNav";
import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  Legend,
  BarChart,
  Bar,
  Cell,
  ScatterChart,
  Scatter,
} from "recharts";

/** =========================
 * Types
 * ========================= */
type StateRow = {
  match_id: string;
  game_date?: string;
  team: string;
  opponent?: string;
  time_bin: string;

  tempo: number;
  tempo_raw?: number;
  pressure: number;
  buildup: number;
  downside: number;

  uplift: number; // Observed(SAFE) utility proxy
};

type Payload = {
  generatedAt?: string;
  states: StateRow[];
  meta?: any;
};

type Weights = {
  tempo: number;
  pressure: number;
  buildup: number;
  downside: number;
};

type TeamCostWeights = {
  TeamLabel: string;
  wF: number;
  wS: number;
  wI: number;
};

type TimelinePoint = {
  time_bin: string;

  // display values (line chart) — may be rescaled
  u_safe: number;
  u_policy: number;

  // always-true raw values
  u_safe_raw: number;
  u_policy_raw: number;

  // deltas
  delta_raw: number;
};

type DecompPoint = {
  time_bin: string;
  attack: number;
  risk: number; // negative for chart
  util: number;
};

type VerdictLabel = "GOOD" | "RISKY" | "EFFICIENT" | "BAD" | "FLAT";

type Candidate = {
  id: string;
  w: Weights;
  uplift: number; // raw mean(policy) - mean(observed)
  risk: number; // raw mean(downside contribution)
  net: number; // attack - risk
  score: number; // regularized score for "best"
};

/** =========================
 * Defaults
 * ========================= */
const DEFAULT_W: Weights = {
  tempo: 0.35,
  pressure: 0.25,
  buildup: 0.4,
  downside: 0.6,
};

const EPS = 0.02;

/** =========================
 * Helpers
 * ========================= */
function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
function mean(arr: number[]) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
function safeMinMax(arr: number[]) {
  let mn = Infinity;
  let mx = -Infinity;
  for (const v of arr) {
    if (!Number.isFinite(v)) continue;
    mn = Math.min(mn, v);
    mx = Math.max(mx, v);
  }
  if (!Number.isFinite(mn) || !Number.isFinite(mx)) return [0, 0] as const;
  return [mn, mx] as const;
}
function rescale01(x: number, mn: number, mx: number) {
  const d = mx - mn;
  if (!Number.isFinite(x) || !Number.isFinite(d) || d === 0) return 0.5;
  return (x - mn) / d;
}
function phaseOrderLabel(label: string) {
  if (label.startsWith("P1")) return 1;
  if (label.startsWith("P2")) return 2;
  if (label.startsWith("P3")) return 3;
  if (label.startsWith("P4")) return 4;
  if (label.startsWith("P5")) return 5;
  return 99;
}
function weightsToId(w: Weights) {
  return `T${w.tempo.toFixed(2)}_P${w.pressure.toFixed(2)}_B${w.buildup.toFixed(
    2
  )}_D${w.downside.toFixed(2)}`;
}
function l2sq(a: Weights, b: Weights) {
  const dt = a.tempo - b.tempo;
  const dp = a.pressure - b.pressure;
  const db = a.buildup - b.buildup;
  const dd = a.downside - b.downside;
  return dt * dt + dp * dp + db * db + dd * dd;
}

/** public/logos/{team}.png */
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
  const key = (team || "").trim();
  const file = map[key] ?? key;
  return `/logos/${file}.png`;
}

function TeamBadge({ team }: { team: string }) {
  if (!team) return null;
  return (
    <div className="flex items-center gap-2 rounded-lg bg-black/20 border border-white/10 px-3 py-2">
      <img
        src={teamLogoPath(team)}
        alt={team}
        width={22}
        height={22}
        className="rounded-sm"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
      <div className="text-sm text-white/85">{team}</div>
    </div>
  );
}

function getTempoValue(s: StateRow, useTempoRaw: boolean) {
  if (useTempoRaw && Number.isFinite(s.tempo_raw as number)) return s.tempo_raw as number;
  return s.tempo;
}

function policyUtility(s: StateRow, w: Weights, useTempoRaw: boolean) {
  return (
    w.tempo * getTempoValue(s, useTempoRaw) +
    w.pressure * s.pressure +
    w.buildup * s.buildup -
    w.downside * s.downside
  );
}

function attackPart(s: StateRow, w: Weights, useTempoRaw: boolean) {
  return (
    w.tempo * getTempoValue(s, useTempoRaw) +
    w.pressure * s.pressure +
    w.buildup * s.buildup
  );
}

function riskPart(s: StateRow, w: Weights) {
  return w.downside * s.downside; // magnitude
}

/** =========================
 * UI bits
 * ========================= */
function Slider({
  label,
  value,
  base,
  onChange,
  disabled,
  min = 0,
  max = 1,
  step = 0.01,
}: {
  label: string;
  value: number;
  base: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
}) {
  const diff = value - base;
  return (
    <div className={disabled ? "opacity-60" : ""}>
      <div className="flex justify-between text-xs text-white/70">
        <span>
          {label} {disabled && <span className="text-yellow-200/80">(inactive)</span>}
        </span>
        <span>
          {value.toFixed(2)}{" "}
          <span className={diff >= 0 ? "text-green-300" : "text-red-300"}>
            ({diff >= 0 ? "+" : ""}
            {diff.toFixed(2)})
          </span>
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(clamp(Number(e.target.value), min, max))}
        className="w-full"
      />
    </div>
  );
}

type MatchItem = { match_id: string; label: string; teams: string[] };

function MatchSelect({
  value,
  matches,
  onChange,
}: {
  value: string;
  matches: MatchItem[];
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const cur = matches.find((m) => m.match_id === value);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between rounded-lg bg-black/30 border border-white/15 px-3 py-2 hover:bg-black/40"
      >
        <div className="flex items-center gap-2">
          {(cur?.teams ?? []).slice(0, 2).map((t) => (
            <img
              key={t}
              src={teamLogoPath(t)}
              alt={t}
              className="w-5 h-5 rounded-sm"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ))}
          <span className="text-sm text-white/85 truncate">{cur?.label ?? "Select match"}</span>
        </div>
        <span className="text-white/60 text-xs">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="absolute z-50 mt-2 w-full rounded-xl bg-[#0b1220] border border-white/15 shadow-xl overflow-hidden">
          <div className="max-h-72 overflow-auto">
            {matches.map((m) => (
              <button
                key={m.match_id}
                type="button"
                onClick={() => {
                  onChange(m.match_id);
                  setOpen(false);
                }}
                className={
                  "w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/10 " +
                  (m.match_id === value ? "bg-white/5" : "")
                }
              >
                {m.teams.slice(0, 2).map((t) => (
                  <img
                    key={t}
                    src={teamLogoPath(t)}
                    alt={t}
                    className="w-5 h-5 rounded-sm"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                ))}
                <span className="text-sm text-white/80">{m.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: any[];
  label?: any;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0]?.payload as TimelinePoint | undefined;
  if (!p) return null;

  return (
    <div className="rounded-lg bg-[#0b1220] border border-white/15 p-3 text-xs shadow-lg">
      <div className="text-white/70 mb-2">{String(label)}</div>
      <div className="space-y-1">
        <div className="text-[#7dd3fc]">
          Observed (raw): <span className="text-white">{p.u_safe_raw.toFixed(3)}</span>
        </div>
        <div className="text-[#34d399]">
          Policy (raw): <span className="text-white">{p.u_policy_raw.toFixed(3)}</span>
        </div>
        <div className="text-white/70">
          Δ(raw):{" "}
          <span className={p.delta_raw >= 0 ? "text-green-300" : "text-red-300"}>
            {p.delta_raw >= 0 ? "+" : ""}
            {p.delta_raw.toFixed(3)}
          </span>
        </div>
      </div>
    </div>
  );
}

/** =========================
 * A) Verdict (4-quadrant + plain-language)
 * ========================= */
function verdictLabelFrom(uplift: number, net: number): VerdictLabel {
  const up = uplift > EPS;
  const down = uplift < -EPS;
  const netUp = net > EPS;
  const netDown = net < -EPS;

  if (up && netUp) return "GOOD";
  if (up && netDown) return "RISKY";
  if (down && netUp) return "EFFICIENT";
  if (down && netDown) return "BAD";
  return "FLAT";
}

function VerdictStrip({
  uplift,
  net,
  risk,
}: {
  uplift: number; // raw
  net: number; // raw
  risk: number; // magnitude (positive)
}) {
  const label = verdictLabelFrom(uplift, net);

  let chip = "⚪";
  let title = "FLAT";
  let cls = "bg-white/5 border-white/10 text-white/75";
  let sentence = "변화가 크지 않습니다.";

  if (label === "GOOD") {
    chip = "🟢";
    title = "GOOD";
    cls = "bg-emerald-500/10 border-emerald-300/20 text-emerald-200";
    sentence = "승리 proxy와 순효용이 함께 증가했습니다. (무리하지 않아도 좋아지는 방향)";
  } else if (label === "RISKY") {
    chip = "🟡";
    title = "RISKY";
    cls = "bg-yellow-500/10 border-yellow-300/20 text-yellow-200";
    sentence =
      "승리 proxy는 늘었지만, 리스크가 더 커져 순효용이 감소했습니다. (과도한 전술 강도 경고)";
  } else if (label === "EFFICIENT") {
    chip = "🔵";
    title = "EFFICIENT";
    cls = "bg-sky-500/10 border-sky-300/20 text-sky-200";
    sentence =
      "승리 proxy는 약간 줄었지만, 리스크 감소로 순효용은 증가했습니다. (안전하게 효율을 올린 케이스)";
  } else if (label === "BAD") {
    chip = "🔴";
    title = "BAD";
    cls = "bg-rose-500/10 border-rose-300/20 text-rose-200";
    sentence = "승리 proxy와 순효용이 함께 감소했습니다. (이 전술 강도는 피하는 쪽이 좋음)";
  }

  return (
    <div className={`rounded-xl border p-4 ${cls}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Verdict (한 줄 결론)</div>
          <div className="text-xs text-white/70">
            “승리 proxy(UPLIFT)”와 “순효용(NET=Attack−Risk)”을 함께 봅니다.
          </div>
        </div>
        <div className="text-lg font-bold whitespace-nowrap">
          {chip} {title}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mt-3">
        <div className="rounded-lg bg-black/20 border border-white/10 p-3 text-center">
          <div className="text-xs text-white/60">UPLIFT (raw)</div>
          <div className={`font-semibold ${uplift >= 0 ? "text-emerald-200" : "text-rose-200"}`}>
            {uplift >= 0 ? "+" : ""}
            {uplift.toFixed(3)}
          </div>
          <div className="text-[11px] text-white/55 mt-1">Policy − Observed</div>
        </div>

        <div className="rounded-lg bg-black/20 border border-white/10 p-3 text-center">
          <div className="text-xs text-white/60">RISK (penalty)</div>
          <div className="font-semibold text-rose-200">-{risk.toFixed(3)}</div>
          <div className="text-[11px] text-white/55 mt-1">Downside contribution</div>
        </div>

        <div className="rounded-lg bg-black/20 border border-white/10 p-3 text-center">
          <div className="text-xs text-white/60">NET utility</div>
          <div className={`font-semibold ${net >= 0 ? "text-emerald-200" : "text-rose-200"}`}>
            {net >= 0 ? "+" : ""}
            {net.toFixed(3)}
          </div>
          <div className="text-[11px] text-white/55 mt-1">Attack − Risk</div>
        </div>
      </div>

      <div className="mt-3 rounded-lg bg-black/15 border border-white/10 p-3">
        <div className="text-xs text-white/70 font-semibold mb-1">How to interpret</div>
        <div className="text-sm text-white/85">{sentence}</div>
        <div className="text-[11px] text-white/55 mt-2">
          ✅ 팁: “초록(UPLIFT)”만 보면 오해할 수 있어요. <b>NET이 플러스인지</b>를 같이 봐야 합니다.
        </div>
      </div>
    </div>
  );
}

/** =========================
 * B) Phase Heatbar (RAW ONLY)
 * ========================= */
function PhaseHeatbar({ timeline }: { timeline: TimelinePoint[] }) {
  if (!timeline.length) return null;
  const items = [...timeline].sort(
    (a, b) => phaseOrderLabel(a.time_bin) - phaseOrderLabel(b.time_bin)
  );

  return (
    <div className="rounded-xl bg-black/20 border border-white/10 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Phase impact (5칸 요약)</div>
        <div className="text-xs text-white/60">색/값 = Δ(raw) = Policy raw − Observed raw</div>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {items.map((t) => {
          const v = t.delta_raw;
          const status = v > EPS ? "UP" : v < -EPS ? "DOWN" : "FLAT";

          const cls =
            status === "UP"
              ? "bg-emerald-400/30 border-emerald-300/30"
              : status === "DOWN"
              ? "bg-rose-400/30 border-rose-300/30"
              : "bg-white/10 border-white/10";

          const icon = status === "UP" ? "▲" : status === "DOWN" ? "▼" : "—";
          const iconCls =
            status === "UP"
              ? "text-emerald-200"
              : status === "DOWN"
              ? "text-rose-200"
              : "text-white/70";

          return (
            <div
              key={t.time_bin}
              className={`rounded-lg border ${cls} px-3 py-2`}
              title={`${t.time_bin} | Δraw=${t.delta_raw.toFixed(3)} | obs_raw=${t.u_safe_raw.toFixed(
                3
              )} | pol_raw=${t.u_policy_raw.toFixed(3)}`}
            >
              <div className="flex items-center justify-between">
                <div className="text-xs text-white/70">{t.time_bin}</div>
                <div className={`text-sm font-bold ${iconCls}`}>{icon}</div>
              </div>
              <div className="mt-1 text-sm font-semibold text-white">
                {v >= 0 ? "+" : ""}
                {v.toFixed(3)}
              </div>
              <div className="text-[11px] text-white/60">
                obs {t.u_safe_raw.toFixed(2)} · pol {t.u_policy_raw.toFixed(2)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-2 text-[11px] text-white/55">
        ✅ 여기(heatbar)는 <b>항상 raw</b>라서 “초록처럼 보이는데 사실 나빠짐” 오해가 안 생깁니다.
      </div>
    </div>
  );
}

/** =========================
 * Reading Guide (visual, non-paper)
 * ========================= */
function ReadingGuide({ autoRescale }: { autoRescale: boolean }) {
  return (
    <div className="rounded-xl bg-black/20 border border-white/10 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">How to read (일반인용 30초 가이드)</div>
          <div className="text-xs text-white/60 mt-1">논문식 설명 대신 “보는 순서”만 정리</div>
        </div>
        <div className="text-xs text-white/60">
          {autoRescale ? "Line chart = 모양(rescaled)" : "Line chart = raw"}
        </div>
      </div>

      <div className="mt-3 grid md:grid-cols-3 gap-3">
        <div className="rounded-lg bg-white/5 border border-white/10 p-3">
          <div className="text-xs text-white/60 mb-1">1) Verdict 먼저</div>
          <div className="text-sm text-white/85">
            <b>NET</b>이 제일 중요합니다. <br />
            UPLIFT가 ↑여도 NET이 ↓면 “무리한 전술”일 수 있어요.
          </div>
        </div>

        <div className="rounded-lg bg-white/5 border border-white/10 p-3">
          <div className="text-xs text-white/60 mb-1">2) Phase heatbar</div>
          <div className="text-sm text-white/85">
            어떤 구간(P1~P5)이 좋아지고/나빠지는지 <b>한 줄</b>로 봅니다. <br />
            (여기는 <b>항상 raw</b>)
          </div>
        </div>

        <div className="rounded-lg bg-white/5 border border-white/10 p-3">
          <div className="text-xs text-white/60 mb-1">3) 차트는 근거</div>
          <div className="text-sm text-white/85">
            라인차트는 “추세/모양”을, 분해(bar)는 “왜 NET이 그렇게 나왔는지” 근거를 보여줍니다.
          </div>
        </div>
      </div>

      <div className="mt-3 text-[11px] text-white/55">
        🎯 추천 순서: <b>Verdict → Heatbar → (필요하면) Pareto/라인/분해</b>
      </div>
    </div>
  );
}

/** =========================
 * Near-optimal + Pareto Panel
 * - key point: do NOT show "extreme argmax" as "the answer"
 * - show "near-optimal region" + "trade-off (uplift vs risk)"
 * ========================= */
function CandidatePanel({
  candidates,
  current,
  base,
  onJump,
}: {
  candidates: Candidate[];
  current: Candidate | null;
  base: Candidate | null;
  onJump: (w: Weights) => void;
}) {
  if (!candidates.length) return null;

  const best = candidates[0];
  const bestScore = best.score;
  const curScore = current?.score ?? NaN;
  const gap = Number.isFinite(curScore) ? bestScore - curScore : NaN;

  const near = candidates.filter((c) => c.score >= bestScore * 0.98).slice(0, 8); // top near-optimal

  const scatterData = candidates.slice(0, 50).map((c) => ({
    x: c.risk,
    y: c.uplift,
    id: c.id,
    score: c.score,
  }));

  const curPt = current
    ? [{ x: current.risk, y: current.uplift, id: "CURRENT" }]
    : [];
  const basePt = base ? [{ x: base.risk, y: base.uplift, id: "BASE" }] : [];
  const bestPt = [{ x: best.risk, y: best.uplift, id: "BEST" }];

  return (
    <div className="rounded-xl bg-black/20 border border-white/10 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Stability / Trade-off view</div>
          <div className="text-xs text-white/60 mt-1">
            “최적 1개”가 아니라 <b>거의 최적(near-optimal)</b> 후보군과 <b>UPLIFT↔RISK</b> 균형을 보여줍니다.
          </div>
        </div>
        <div className="text-xs text-white/60 text-right">
          <div>
            best score: <span className="text-white/80">{bestScore.toFixed(3)}</span>
          </div>
          {Number.isFinite(gap) && (
            <div>
              gap(current→best):{" "}
              <span className={gap <= 0.02 ? "text-emerald-200" : "text-yellow-200"}>
                {gap.toFixed(3)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* near-optimal chips */}
      <div className="rounded-lg bg-white/5 border border-white/10 p-3">
        <div className="flex items-center justify-between">
          <div className="text-xs text-white/70 font-semibold">Near-optimal candidates (top)</div>
          <div className="text-[11px] text-white/55">
            score ≥ 98% of best (과도한 극단해 방지용)
          </div>
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          {near.map((c) => (
            <button
              key={c.id}
              onClick={() => onJump(c.w)}
              className="px-3 py-1 rounded-full bg-black/30 border border-white/10 hover:bg-white/10 text-[11px] text-white/80"
              title={`uplift=${c.uplift.toFixed(3)} | risk=${c.risk.toFixed(3)} | net=${c.net.toFixed(
                3
              )} | score=${c.score.toFixed(3)}`}
            >
              T{c.w.tempo.toFixed(1)} · P{c.w.pressure.toFixed(1)} · B{c.w.buildup.toFixed(1)} · D
              {c.w.downside.toFixed(1)}
            </button>
          ))}
        </div>

        <div className="mt-2 text-[11px] text-white/55">
          ✅ 이 버튼들은 “극단 하나”가 아니라, <b>비슷하게 좋은(안정적인)</b> 여러 해를 보여줘서 일반인 오해를 줄입니다.
        </div>
      </div>

      {/* Pareto scatter */}
      <div className="rounded-lg bg-white/5 border border-white/10 p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs text-white/70 font-semibold">Pareto view (UPLIFT vs RISK)</div>
          <div className="text-[11px] text-white/55">오른쪽으로 갈수록 Risk↑, 위로 갈수록 Uplift↑</div>
        </div>

        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
              <XAxis
                type="number"
                dataKey="x"
                name="Risk"
                tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 11 }}
              />
              <YAxis
                type="number"
                dataKey="y"
                name="Uplift"
                tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 11 }}
              />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0]?.payload as any;
                  return (
                    <div className="rounded-lg bg-[#0b1220] border border-white/15 p-3 text-xs shadow-lg">
                      <div className="text-white/80 font-semibold">{p.id}</div>
                      <div className="text-white/70 mt-1">
                        risk: <span className="text-white">{Number(p.x).toFixed(3)}</span>
                      </div>
                      <div className="text-white/70">
                        uplift: <span className="text-white">{Number(p.y).toFixed(3)}</span>
                      </div>
                      {p.score !== undefined && (
                        <div className="text-white/60">
                          score: <span className="text-white">{Number(p.score).toFixed(3)}</span>
                        </div>
                      )}
                    </div>
                  );
                }}
              />

              <Scatter data={scatterData} name="candidates" fill="rgba(255,255,255,0.35)" />
              <Scatter data={basePt} name="base" fill="#a78bfa" />
              <Scatter data={curPt} name="current" fill="#34d399" />
              <Scatter data={bestPt} name="best" fill="#fbbf24" />
              <ReferenceLine x={0} stroke="rgba(255,255,255,0.25)" />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.25)" />
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-2 text-[11px] text-white/55">
          ✅ 핵심: Uplift만 최대화하면 Risk가 커질 수 있어요. 이 그림은 그 <b>트레이드오프</b>를 한 번에 보여줍니다.
        </div>
      </div>
    </div>
  );
}

/** =========================
 * Page
 * ========================= */
export default function SimulatorPage() {
  const [data, setData] = useState<StateRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [matchId, setMatchId] = useState("");
  const [team, setTeam] = useState("");

  // sliders (what-if)
  const [wTempo, setWTempo] = useState(DEFAULT_W.tempo);
  const [wPressure, setWPressure] = useState(DEFAULT_W.pressure);
  const [wBuildup, setWBuildup] = useState(DEFAULT_W.buildup);
  const [wDownside, setWDownside] = useState(DEFAULT_W.downside);

  // toggles
  const [autoRescale, setAutoRescale] = useState(true);
  const [useTempoRaw, setUseTempoRaw] = useState(true);

  // "stability" controls (to prevent misleading extremes)
  const [stabilityMode, setStabilityMode] = useState(true);
  const [gridStep, setGridStep] = useState(0.1); // 0.05 too heavy in UI
  const [lambdaBase, setLambdaBase] = useState(0.8); // penalty strength
  const [minWeight, setMinWeight] = useState(0.0); // 0.05 if you want hard anti-extreme

  // optional (paper weights)
  const [teamCost, setTeamCost] = useState<TeamCostWeights[]>([]);

  const w: Weights = useMemo(
    () => ({ tempo: wTempo, pressure: wPressure, buildup: wBuildup, downside: wDownside }),
    [wTempo, wPressure, wBuildup, wDownside]
  );

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/data/state_summaries.json", { cache: "no-store" });
        const json: Payload = await res.json();
        setData(Array.isArray(json.states) ? json.states : []);
      } catch {
        setData([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/data/team_weights_cost_only_v4.json", { cache: "force-cache" });
        const json = await res.json();
        if (Array.isArray(json)) setTeamCost(json as TeamCostWeights[]);
      } catch {
        setTeamCost([]);
      }
    })();
  }, []);

  const matches = useMemo(() => {
    const m = new Map<string, { date?: string; teams: Set<string> }>();
    for (const r of data) {
      if (!r.match_id || !r.team) continue;
      if (!m.has(r.match_id)) m.set(r.match_id, { date: r.game_date, teams: new Set() });
      m.get(r.match_id)!.teams.add(r.team);
      if (!m.get(r.match_id)!.date && r.game_date) m.get(r.match_id)!.date = r.game_date;
    }
    return Array.from(m.entries()).map(([id, v]) => ({
      match_id: id,
      label: `${v.date ?? "date?"} · ${Array.from(v.teams).join(" vs ")}`,
      teams: Array.from(v.teams),
    }));
  }, [data]);

  useEffect(() => {
    if (!matchId && matches.length) {
      setMatchId(matches[0].match_id);
      setTeam(matches[0].teams[0] ?? "");
    }
  }, [matches, matchId]);

  useEffect(() => {
    if (!matchId) return;
    const m = matches.find((x) => x.match_id === matchId);
    if (!m) return;
    if (!m.teams.includes(team)) setTeam(m.teams[0] ?? "");
  }, [matchId, matches, team]);

  const rows = useMemo(() => {
    return data
      .filter((r) => r.match_id === matchId && r.team === team)
      .sort((a, b) => phaseOrderLabel(a.time_bin) - phaseOrderLabel(b.time_bin));
  }, [data, matchId, team]);

  const opponent = useMemo(() => rows[0]?.opponent ?? "", [rows]);

  const hasTempoRaw = useMemo(
    () => rows.some((r) => Number.isFinite(r.tempo_raw as number)),
    [rows]
  );

  const tempoInactive = useMemo(() => {
    if (!rows.length) return false;
    const tArr = rows.map((r) => getTempoValue(r, useTempoRaw && hasTempoRaw));
    const [mn, mx] = safeMinMax(tArr);
    return mn === mx;
  }, [rows, useTempoRaw, hasTempoRaw]);

  const teamCostRow = useMemo(() => {
    if (!teamCost.length || !team) return null;
    return teamCost.find((x) => x.TeamLabel === team) ?? null;
  }, [teamCost, team]);

  // baseline reference for stability penalty
  const baseW: Weights = useMemo(() => {
    // start from DEFAULT_W (not paper) for stable baseline
    // If you want to bias toward paper downside (wI), you can apply it here.
    const d = { ...DEFAULT_W };
    if (teamCostRow && Number.isFinite(teamCostRow.wI)) {
      // mild hint (optional): keep within 0~1
      d.downside = clamp(teamCostRow.wI, 0, 1);
    }
    return d;
  }, [teamCostRow]);

  // timeline (raw truth + rescaled display)
  const timeline: TimelinePoint[] = useMemo(() => {
    if (!rows.length) return [];

    const useRawTempo = useTempoRaw && hasTempoRaw;
    const safeArr = rows.map((r) => r.uplift);
    const polArr = rows.map((r) => policyUtility(r, w, useRawTempo));

    const [sMin, sMax] = safeMinMax(safeArr);
    const [pMin, pMax] = safeMinMax(polArr);

    return rows.map((r) => {
      const uSafeRaw = r.uplift;
      const uPolRaw = policyUtility(r, w, useRawTempo);

      const uSafeDisp = autoRescale ? rescale01(uSafeRaw, sMin, sMax) : uSafeRaw;
      const uPolDisp = autoRescale ? rescale01(uPolRaw, pMin, pMax) : uPolRaw;

      return {
        time_bin: r.time_bin,
        u_safe: Number(uSafeDisp.toFixed(3)),
        u_policy: Number(uPolDisp.toFixed(3)),
        u_safe_raw: Number(uSafeRaw.toFixed(3)),
        u_policy_raw: Number(uPolRaw.toFixed(3)),
        delta_raw: Number((uPolRaw - uSafeRaw).toFixed(3)),
      };
    });
  }, [rows, w, autoRescale, useTempoRaw, hasTempoRaw]);

  const decomp: DecompPoint[] = useMemo(() => {
    if (!rows.length) return [];
    const useRawTempo = useTempoRaw && hasTempoRaw;

    return rows.map((r) => {
      const attack = attackPart(r, w, useRawTempo);
      const risk = riskPart(r, w);
      const util = attack - risk;
      return {
        time_bin: r.time_bin,
        attack: Number(attack.toFixed(3)),
        risk: Number((-risk).toFixed(3)),
        util: Number(util.toFixed(3)),
      };
    });
  }, [rows, w, useTempoRaw, hasTempoRaw]);

  // verdict numbers (raw)
  const verdict = useMemo(() => {
    if (!rows.length) return null;
    const useRawTempo = useTempoRaw && hasTempoRaw;

    const safeAvg = mean(rows.map((r) => r.uplift));
    const polAvg = mean(rows.map((r) => policyUtility(r, w, useRawTempo)));
    const uplift = polAvg - safeAvg;

    const attackAvg = mean(rows.map((r) => attackPart(r, w, useRawTempo)));
    const riskAvg = mean(rows.map((r) => riskPart(r, w)));
    const net = attackAvg - riskAvg;

    return {
      uplift,
      net,
      risk: riskAvg,
      label: verdictLabelFrom(uplift, net) as VerdictLabel,
    };
  }, [rows, w, useTempoRaw, hasTempoRaw]);

  /** =========================
   * Candidate search (near-optimal, stability aware)
   *
   * IMPORTANT: We DO NOT present argmax of unregularized linear model as "the answer".
   * We compute candidates under a "stability penalty" (distance from baseW),
   * then show near-optimal region + Pareto trade-off.
   * ========================= */
  const candidates = useMemo(() => {
    if (!rows.length) return [] as Candidate[];
    const useRawTempo = useTempoRaw && hasTempoRaw;

    // build discrete grid for weights in [minWeight, 1] with step, but also keep it light.
    const step = clamp(gridStep, 0.05, 0.25);
    const minW = clamp(minWeight, 0, 0.2);
    const levels: number[] = [];
    for (let x = 0; x <= 1 + 1e-9; x += step) levels.push(Number(x.toFixed(2)));

    // helper to enforce "not too extreme" if user wants:
    function ok(v: number) {
      return v >= minW && v <= 1;
    }

    const out: Candidate[] = [];
    // We keep it simple: independent grid (not simplex sum=1), but add stability penalty.
    // This keeps interpretation aligned with your current sliders.
    for (const t of levels) {
      for (const p of levels) {
        for (const b of levels) {
          for (const d of levels) {
            if (!ok(t) || !ok(p) || !ok(b) || !ok(d)) continue;

            const wC: Weights = { tempo: t, pressure: p, buildup: b, downside: d };

            const safeAvg = mean(rows.map((r) => r.uplift));
            const polAvg = mean(rows.map((r) => policyUtility(r, wC, useRawTempo)));
            const uplift = polAvg - safeAvg;

            const attackAvg = mean(rows.map((r) => attackPart(r, wC, useRawTempo)));
            const riskAvg = mean(rows.map((r) => riskPart(r, wC)));
            const net = attackAvg - riskAvg;

            // regularized score: prefer not drifting too far from baseW
            const penalty = stabilityMode ? lambdaBase * l2sq(wC, baseW) : 0;
            const score = net - penalty;

            out.push({
              id: weightsToId(wC),
              w: wC,
              uplift,
              risk: riskAvg,
              net,
              score,
            });
          }
        }
      }
    }

    out.sort((a, b) => b.score - a.score);
    return out.slice(0, 200); // keep manageable for plots
  }, [rows, useTempoRaw, hasTempoRaw, gridStep, minWeight, stabilityMode, lambdaBase, baseW]);

  const currentCandidate = useMemo(() => {
    if (!rows.length) return null;
    const useRawTempo = useTempoRaw && hasTempoRaw;

    const safeAvg = mean(rows.map((r) => r.uplift));
    const polAvg = mean(rows.map((r) => policyUtility(r, w, useRawTempo)));
    const uplift = polAvg - safeAvg;

    const attackAvg = mean(rows.map((r) => attackPart(r, w, useRawTempo)));
    const riskAvg = mean(rows.map((r) => riskPart(r, w)));
    const net = attackAvg - riskAvg;

    const penalty = stabilityMode ? lambdaBase * l2sq(w, baseW) : 0;
    const score = net - penalty;

    return {
      id: "CURRENT",
      w,
      uplift,
      risk: riskAvg,
      net,
      score,
    } as Candidate;
  }, [rows, w, useTempoRaw, hasTempoRaw, stabilityMode, lambdaBase, baseW]);

  const baseCandidate = useMemo(() => {
    if (!rows.length) return null;
    const useRawTempo = useTempoRaw && hasTempoRaw;

    const safeAvg = mean(rows.map((r) => r.uplift));
    const polAvg = mean(rows.map((r) => policyUtility(r, baseW, useRawTempo)));
    const uplift = polAvg - safeAvg;

    const attackAvg = mean(rows.map((r) => attackPart(r, baseW, useRawTempo)));
    const riskAvg = mean(rows.map((r) => riskPart(r, baseW)));
    const net = attackAvg - riskAvg;

    const penalty = stabilityMode ? lambdaBase * l2sq(baseW, baseW) : 0;
    const score = net - penalty;

    return {
      id: "BASE",
      w: baseW,
      uplift,
      risk: riskAvg,
      net,
      score,
    } as Candidate;
  }, [rows, baseW, useTempoRaw, hasTempoRaw, stabilityMode, lambdaBase]);

  const deltaBarsRaw = useMemo(() => {
    return timeline.map((t) => ({ time_bin: t.time_bin, delta_raw: t.delta_raw }));
  }, [timeline]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b1220] text-white">
        <TopNav />
        <div className="p-8">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b1220] text-white w-full">
      <TopNav />

      <div className="w-full flex justify-center">
        <div className="w-full max-w-6xl px-4 py-8 space-y-6">
          {/* Header */}
          <div className="rounded-xl bg-white/5 border border-white/10 p-4">
            <div className="text-lg font-semibold">TACTICAL SHIFT — Impact Console</div>
            <div className="text-sm text-white/70">
              이 도구는 <b>승부 예측</b>이 아니라, 전술 개입(가정)이 <b>기대효용</b>과{" "}
              <b>리스크(Downside)</b>에 미치는 영향을 비교합니다.
            </div>
          </div>

          <div className="grid md:grid-cols-12 gap-4">
            {/* LEFT PANEL */}
            <div className="md:col-span-4 rounded-xl bg-white/5 border border-white/10 p-4 space-y-3">
              <div className="text-sm font-semibold">Match / Team</div>

              <MatchSelect value={matchId} matches={matches} onChange={setMatchId} />

              <select
                className="w-full bg-black/30 p-2 rounded border border-white/10"
                value={team}
                onChange={(e) => setTeam(e.target.value)}
              >
                {(matches.find((m) => m.match_id === matchId)?.teams ?? []).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>

              <div className="text-xs text-white/60">
                opponent: <span className="text-white/85">{opponent || "-"}</span>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2">
                <TeamBadge team={team} />
                <TeamBadge team={opponent} />
              </div>

              {/* paper weights hint */}
              <div className="rounded-lg bg-black/20 border border-white/10 px-3 py-2">
                <div className="text-xs text-white/70">Team cost-sensitivity (paper weights)</div>
                {teamCostRow ? (
                  <div className="mt-1 text-[11px] text-white/70 leading-relaxed">
                    wF {teamCostRow.wF.toFixed(3)} · wS {teamCostRow.wS.toFixed(3)} · wI{" "}
                    {teamCostRow.wI.toFixed(3)}
                    <div className="mt-2 flex gap-2">
                      <button
                        className="px-3 py-1 rounded-md text-xs border bg-white/5 border-white/15 hover:bg-white/10"
                        onClick={() => setWDownside(clamp(teamCostRow.wI, 0, 1))}
                        title="논문 cost-only의 wI(risk)를 downside penalty 기본값으로 적용"
                      >
                        Apply wI → Downside
                      </button>
                      <div className="text-[11px] text-white/45">(wF/wS는 현재 비용항 미구현)</div>
                    </div>
                    <div className="mt-2 text-[11px] text-white/55">
                      baseW.downside(참조): <span className="text-white/80">{baseW.downside.toFixed(2)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-[11px] text-white/45 mt-1">
                    /data/team_weights_cost_only_v4.json 없거나 팀명이 안 맞음.
                  </div>
                )}
              </div>

              {/* toggles */}
              <div className="mt-2 space-y-2">
                <div className="flex items-center justify-between rounded-lg bg-black/20 border border-white/10 px-3 py-2">
                  <div className="text-xs text-white/70 leading-tight">
                    Auto-rescale
                    <br />
                    <span className="text-white/50">(라인 “모양 비교용”)</span>
                  </div>
                  <button
                    className={
                      "px-3 py-1 rounded-md text-xs border " +
                      (autoRescale
                        ? "bg-green-500/20 border-green-400/40 text-green-200"
                        : "bg-white/5 border-white/15 text-white/70")
                    }
                    onClick={() => setAutoRescale((v) => !v)}
                  >
                    {autoRescale ? "ON" : "OFF"}
                  </button>
                </div>

                <div className="flex items-center justify-between rounded-lg bg-black/20 border border-white/10 px-3 py-2">
                  <div className="text-xs text-white/70 leading-tight">
                    Tempo source
                    <br />
                    <span className="text-white/50">
                      ({hasTempoRaw ? "tempo_raw available" : "tempo_raw not available"})
                    </span>
                  </div>
                  <button
                    className={
                      "px-3 py-1 rounded-md text-xs border " +
                      (useTempoRaw && hasTempoRaw
                        ? "bg-purple-500/20 border-purple-400/40 text-purple-200"
                        : "bg-white/5 border-white/15 text-white/70")
                    }
                    onClick={() => setUseTempoRaw((v) => !v)}
                    disabled={!hasTempoRaw}
                  >
                    {useTempoRaw && hasTempoRaw ? "RAW" : "BAND"}
                  </button>
                </div>
              </div>

              {/* sliders */}
              <div className="pt-2 text-sm font-semibold">Tactical sliders (What-if)</div>

              {tempoInactive && (
                <div className="rounded-lg bg-yellow-500/10 border border-yellow-400/20 px-3 py-2 text-xs text-yellow-100/90">
                  이 match/team에서는 <b>tempo 변화가 거의 없음</b>(range=0). <br />
                  → tempo weight를 바꿔도 영향이 작을 수 있어요.
                </div>
              )}

              <Slider
                label={`Tempo weight (${useTempoRaw && hasTempoRaw ? "tempo_raw" : "tempo band"})`}
                value={wTempo}
                base={DEFAULT_W.tempo}
                onChange={setWTempo}
                disabled={tempoInactive}
              />
              <Slider
                label="Pressure weight"
                value={wPressure}
                base={DEFAULT_W.pressure}
                onChange={setWPressure}
              />
              <Slider
                label="Build-up weight"
                value={wBuildup}
                base={DEFAULT_W.buildup}
                onChange={setWBuildup}
              />
              <Slider
                label="Downside penalty"
                value={wDownside}
                base={DEFAULT_W.downside}
                onChange={setWDownside}
              />

              <button
                className="w-full mt-2 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 py-2 text-sm"
                onClick={() => {
                  setWTempo(DEFAULT_W.tempo);
                  setWPressure(DEFAULT_W.pressure);
                  setWBuildup(DEFAULT_W.buildup);
                  setWDownside(baseW.downside); // baseline uses paper downside if available
                }}
              >
                Reset to baseline
              </button>

              {/* stability controls (prevents "extreme = best" misunderstanding) */}
              <div className="mt-2 rounded-xl bg-black/20 border border-white/10 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-white/70 font-semibold">Stability mode</div>
                  <button
                    className={
                      "px-3 py-1 rounded-md text-xs border " +
                      (stabilityMode
                        ? "bg-sky-500/20 border-sky-400/40 text-sky-200"
                        : "bg-white/5 border-white/15 text-white/70")
                    }
                    onClick={() => setStabilityMode((v) => !v)}
                    title="argmax 1개가 극단으로 튀는 오해를 막기 위해, baseline에서 너무 멀어지면 벌점을 줍니다."
                  >
                    {stabilityMode ? "ON" : "OFF"}
                  </button>
                </div>

                <div className="text-[11px] text-white/55 leading-relaxed">
                  ✅ 목적: “최적 1개”가 극단으로 보이는 문제를 줄이고, <b>거의 최적(near-optimal)</b> 후보군을 보여줍니다.
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-[11px] text-white/60 mb-1">grid step</div>
                    <select
                      className="w-full bg-black/30 p-2 rounded border border-white/10 text-xs"
                      value={gridStep}
                      onChange={(e) => setGridStep(Number(e.target.value))}
                    >
                      <option value={0.25}>0.25 (fast)</option>
                      <option value={0.2}>0.20</option>
                      <option value={0.1}>0.10 (recommended)</option>
                      <option value={0.05}>0.05 (heavy)</option>
                    </select>
                  </div>

                  <div>
                    <div className="text-[11px] text-white/60 mb-1">min weight</div>
                    <select
                      className="w-full bg-black/30 p-2 rounded border border-white/10 text-xs"
                      value={minWeight}
                      onChange={(e) => setMinWeight(Number(e.target.value))}
                      title="0.05로 두면 0/1 극단해가 거의 안 나옵니다."
                    >
                      <option value={0.0}>0.00 (allow)</option>
                      <option value={0.05}>0.05 (anti-extreme)</option>
                      <option value={0.1}>0.10 (strong)</option>
                    </select>
                  </div>
                </div>

                <Slider
                  label="λ (baseline distance penalty)"
                  value={lambdaBase}
                  base={0.8}
                  onChange={setLambdaBase}
                  min={0}
                  max={2}
                  step={0.05}
                />
              </div>
            </div>

            {/* RIGHT PANEL */}
            <div className="md:col-span-8 rounded-xl bg-white/5 border border-white/10 p-4 space-y-4">
              <div className="flex justify-between items-center">
                <div className="font-semibold">
                  Utility over phases (Observed vs What-if)
                  {autoRescale && <span className="ml-2 text-xs text-white/55">(rescaled for shape)</span>}
                </div>
              </div>

              {/* General guide */}
              <ReadingGuide autoRescale={autoRescale} />

              {/* Verdict */}
              {verdict && <VerdictStrip uplift={verdict.uplift} net={verdict.net} risk={verdict.risk} />}

              {/* Phase Heatbar */}
              {!!timeline.length && <PhaseHeatbar timeline={timeline} />}

              {/* Stability / Pareto / near-optimal */}
              {!!candidates.length && (
                <CandidatePanel
                  candidates={candidates}
                  current={currentCandidate}
                  base={baseCandidate}
                  onJump={(cw) => {
                    setWTempo(clamp(cw.tempo, 0, 1));
                    setWPressure(clamp(cw.pressure, 0, 1));
                    setWBuildup(clamp(cw.buildup, 0, 1));
                    setWDownside(clamp(cw.downside, 0, 1));
                  }}
                />
              )}

              {/* Line chart (shape) */}
              <div className="rounded-xl bg-black/20 border border-white/10 p-3">
                <div className="text-xs text-white/60 mb-2">
                  Line chart = {autoRescale ? "shape (rescaled)" : "raw"} · Tooltip은 raw 기준
                </div>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={timeline}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                      <XAxis dataKey="time_bin" />
                      <YAxis />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <ReferenceLine y={0} stroke="rgba(255,255,255,0.35)" />
                      <Line
                        dataKey="u_safe"
                        name="Observed (SAFE)"
                        stroke="#7dd3fc"
                        strokeWidth={2}
                        strokeDasharray="6 4"
                        dot={{ r: 3 }}
                        activeDot={{ r: 6 }}
                      />
                      <Line
                        dataKey="u_policy"
                        name="Policy (What-if)"
                        stroke="#34d399"
                        strokeWidth={3}
                        dot={{ r: 4 }}
                        activeDot={{ r: 7 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Phase-by-phase Δ(raw) bar */}
              {!!deltaBarsRaw.length && (
                <div className="rounded-xl bg-black/20 border border-white/10 p-3">
                  <div className="text-xs text-white/60 mb-2">Phase-by-phase Δ(raw)</div>
                  <div className="h-[160px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={deltaBarsRaw}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                        <XAxis dataKey="time_bin" />
                        <YAxis />
                        <Tooltip />
                        <ReferenceLine y={0} stroke="rgba(255,255,255,0.35)" />
                        <Bar dataKey="delta_raw" name="Δ(raw)">
                          {deltaBarsRaw.map((d, idx) => {
                            const v = d.delta_raw;
                            const fill =
                              v > EPS ? "#34d399" : v < -EPS ? "#fb7185" : "rgba(255,255,255,0.35)";
                            return <Cell key={idx} fill={fill} />;
                          })}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Utility decomposition */}
              {!!decomp.length && (
                <div className="rounded-xl bg-black/20 border border-white/10 p-3">
                  <div className="text-xs text-white/60 mb-2">Utility decomposition (Attack vs Risk)</div>
                  <div className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={decomp}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                        <XAxis dataKey="time_bin" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <ReferenceLine y={0} stroke="rgba(255,255,255,0.35)" />
                        <Bar dataKey="attack" name="Attack contribution" fill="#34d399" />
                        <Bar dataKey="risk" name="Risk penalty (-)" fill="#fb7185" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-2 text-[11px] text-white/55">
                    공격이 커도 리스크(Downside)가 더 커지면 NET이 줄어들 수 있어요.
                  </div>
                </div>
              )}

              {!timeline.length && (
                <div className="text-sm text-white/60">
                  선택한 match/team 조합의 phase 데이터가 없습니다. (state_summaries.json 생성/경로 확인)
                </div>
              )}
            </div>
          </div>

          {/* Footer note (super important to avoid "AI is wrong" interpretation) */}
          <div className="rounded-xl bg-white/5 border border-white/10 p-4 text-sm text-white/70 leading-relaxed">
            <b>중요 안내:</b> 이 화면의 “후보(near-optimal)”는 <b>전술 추천</b>이 아니라,{" "}
            <b>효용(Attack−Risk) 관점에서의 안정적 후보군</b>입니다. <br />
            제약 없는 선형 최적화는 원래 극단(0/1)로 쏠릴 수 있으므로, 본 UI는{" "}
            <b>Stability mode(벌점)</b> + <b>near-optimal</b> + <b>Pareto(UPLIFT↔RISK)</b>로 오해를 방지합니다.
          </div>
        </div>
      </div>
    </div>
  );
}
