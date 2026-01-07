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

/** ✅ CSV 위치: public/data/ 아래에 두면 이 경로로 접근됩니다 */
const CSV_PATH =
  "/data/tactical_match_summary_with_professional_language_v3_with_outcomes_utf8sig.csv";

/** ---------------------------
 *  Logo mapping (public/logos)
 *  파일명은 스샷 그대로: /public/logos/<파일명>.png
 *  CSV의 team/opponent 문자열을 normalize해서 매핑합니다.
 *  --------------------------- */
function teamKey(name: string) {
  return String(name ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/[\u200B-\u200D\u2060]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ""); // 공백 제거
}

const TEAM_LOGO_MAP: Record<string, string> = {
  // ✅ 스샷에 있는 파일명 기준 (확장자 제외)
  [teamKey("fc서울")]: "fc서울",
  [teamKey("강원fc")]: "강원fc",
  [teamKey("광주fc")]: "광주fc",
  [teamKey("김천상무프로축구단")]: "김천상무",
  [teamKey("대구fc")]: "대구fc",
  [teamKey("대전하나시티즌")]: "대전하나시티즌",
  [teamKey("수원fc")]: "수원fc",
  [teamKey("울산HDfc")]: "울산HD",
  [teamKey("인천유나이티드")]: "인천유나이티드",
  [teamKey("전북현대모터스")]: "전북현대",
  [teamKey("제주skfc")]: "제주sk",
  [teamKey("포항스틸러스")]: "포항스틸러스",

  // 자주 나오는 표기 흔들림 대비(있으면 도움됨)
  [teamKey("fc 서울")]: "fc서울",
  [teamKey("울산 hd")]: "울산HD",
  [teamKey("제주 sk")]: "제주sk",
};

function logoSrc(teamName: string) {
  const k = teamKey(teamName);
  const file = TEAM_LOGO_MAP[k];
  return file ? `/logos/${file}.png` : null;
}

/** ---------------------------
 *  Sanitizers / robust CSV parser
 *  - quotes 안의 줄바꿈(\n)도 처리
 *  --------------------------- */
function cleanValue(v: any) {
  return String(v ?? "")
    .replace(/^\uFEFF/, "") // BOM
    .replace(/[\u200B-\u200D\u2060]/g, "") // zero-width
    .replace(/\u00A0/g, " ") // nbsp
    .trim();
}

function parseCSV(text: string) {
  // Robust CSV parser: commas, quotes, escaped quotes, AND newlines inside quotes.
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    if (ch === '"') {
      if (inQuotes && s[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if (ch === "\n" && !inQuotes) {
      row.push(field);
      field = "";
      if (row.length > 1 || (row.length === 1 && row[0].trim() !== "")) rows.push(row);
      row = [];
      continue;
    }

    field += ch;
  }

  row.push(field);
  if (row.length > 1 || (row.length === 1 && row[0].trim() !== "")) rows.push(row);

  if (rows.length < 2) return { headers: [] as string[], rows: [] as Record<string, string>[] };

  const headers = rows[0].map((h) => cleanValue(h));
  const out: Record<string, string>[] = [];

  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r];
    const obj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = cleanValue(cols[c] ?? "");
    }
    out.push(obj);
  }

  return { headers, rows: out };
}

function toNumLoose(v: any) {
  const s = cleanValue(v);
  if (!s) return NaN;
  const cleaned = s.replace(/,/g, "").replace(/[^\d+\-eE.]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

/** ---------------------------
 *  Column detection helpers
 *  --------------------------- */
function pickCol(headers: string[], candidates: string[]) {
  const set = new Set(headers);
  for (const c of candidates) if (set.has(c)) return c;
  return null;
}
function pickColFuzzy(headers: string[], keywords: string[]) {
  const lower = headers.map((h) => ({ h, l: h.toLowerCase() }));
  for (const kw of keywords) {
    const k = kw.toLowerCase();
    const eq = lower.find((x) => x.l === k);
    if (eq) return eq.h;
  }
  for (const kw of keywords) {
    const k = kw.toLowerCase();
    const hit = lower.find((x) => x.l.includes(k));
    if (hit) return hit.h;
  }
  return null;
}

/** ---------------------------
 *  Domain logic
 *  --------------------------- */
type Outcome = "W" | "D" | "L" | "U";
type Outcome3 = "W" | "D" | "L";
type Stance = "Advantage" | "Neutral" | "Disadvantage";

function parseOutcome(v: any): Outcome {
  const raw = cleanValue(v);
  if (!raw) return "U";

  const num = Number(raw.replace(/,/g, ""));
  if (Number.isFinite(num)) {
    if (num === 1 || num === 3) return "W";
    if (num === 0) return "D";
    if (num === -1) return "L";
  }

  const t = raw.toLowerCase();
  if (t === "w" || t.startsWith("win") || t.includes("won") || t.includes("victory")) return "W";
  if (t === "d" || t.startsWith("draw") || t.includes("tie")) return "D";
  if (t === "l" || t.startsWith("loss") || t.includes("lost") || t.includes("defeat")) return "L";

  if (t.includes("승")) return "W";
  if (t.includes("무")) return "D";
  if (t.includes("패")) return "L";

  if (t.includes("w")) return "W";
  if (t.includes("d")) return "D";
  if (t.includes("l")) return "L";
  return "U";
}

function stanceFromUplift(u: number, neutralBand = 0): Stance {
  if (!Number.isFinite(u)) return "Neutral";
  if (Math.abs(u) <= neutralBand) return "Neutral";
  return u > 0 ? "Advantage" : "Disadvantage";
}

function parseActionSeq(s: string) {
  const t = cleanValue(s).replace(/\s/g, "");
  const m = t.match(/^\[(.*)\]$/);
  if (!m) return null;
  const parts = m[1].split(",").map((x) => Number(x));
  if (parts.some((x) => Number.isNaN(x))) return null;
  return parts;
}
function actionLabel(seqStr: string) {
  const arr = parseActionSeq(seqStr);
  if (!arr) return seqStr || "NA";
  if (arr.every((v) => v === 0)) return "SAFE (No-Intervention)";
  const tags: string[] = [];
  arr.forEach((v, i) => {
    if (v !== 0) tags.push(`A${i + 1}${v > 0 ? "↑" : "↓"}`);
  });
  return tags.join("+") || seqStr;
}
function interventionIntensity(seqStr: string) {
  const arr = parseActionSeq(seqStr);
  if (!arr) return 0;
  return arr.reduce((s, v) => s + (v !== 0 ? 1 : 0), 0);
}
function isSafe(seqStr: string) {
  const arr = parseActionSeq(seqStr);
  if (!arr) return false;
  return arr.every((v) => v === 0);
}

/** ---------------------------
 *  Color helpers (red/green tint)
 *  --------------------------- */
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
function tintByUplift(meanUplift: number) {
  if (!Number.isFinite(meanUplift)) return "rgba(255,255,255,0.04)";
  const t = clamp01(Math.abs(meanUplift) / 3); // 3pp 기준
  if (meanUplift > 0) return `rgba(46, 204, 113, ${0.06 + 0.18 * t})`; // green
  if (meanUplift < 0) return `rgba(231, 76, 60, ${0.06 + 0.18 * t})`; // red
  return "rgba(255,255,255,0.05)";
}

/** ---------------------------
 *  Types
 *  --------------------------- */
type Row = {
  id: string;
  game_id: string;
  team: string;
  opponent: string;
  dp_action_seq: string;
  uplift: number;
  stance: Stance;
  result: Outcome;
  professional_summary: string;
  tactical_summary: string;
};

export default function ValidationPage() {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [neutralBand, setNeutralBand] = useState(0);
  const [selectedCell, setSelectedCell] = useState<{ stance: Stance; outcome: Outcome3 } | null>(
    null
  );
  const [selectedPair, setSelectedPair] = useState<{ team: string; opponent: string } | null>(
    null
  );
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [binMode, setBinMode] = useState<"default" | "tight">("default");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(CSV_PATH, { cache: "no-store" });
        if (!res.ok) throw new Error(`CSV fetch failed: ${res.status}`);
        const text = await res.text();
        const parsed = parseCSV(text);
        setHeaders(parsed.headers);
        setRawRows(parsed.rows);
      } catch (e: any) {
        setErr(e?.message ?? "Unknown error");
      }
    })();
  }, []);

  const col = useMemo(() => {
    const game_id = pickCol(headers, ["game_id"]) ?? pickColFuzzy(headers, ["game"]);
    const team = pickCol(headers, ["team"]) ?? pickColFuzzy(headers, ["team"]);
    const opponent = pickCol(headers, ["opponent"]) ?? pickColFuzzy(headers, ["opponent", "opp"]);
    const dp_action_seq = pickCol(headers, ["dp_action_seq"]) ?? pickColFuzzy(headers, ["action", "seq"]);

    const uplift =
      pickCol(headers, ["uplift_vs_balance_pp", "uplift_pp", "uplift"]) ?? pickColFuzzy(headers, ["uplift"]);

    const result = pickCol(headers, ["result"]) ?? pickColFuzzy(headers, ["result", "outcome"]);

    const professional_summary =
      pickCol(headers, ["professional_summary"]) ?? pickColFuzzy(headers, ["professional", "pro_summary"]);
    const tactical_summary =
      pickCol(headers, ["tactical_summary"]) ?? pickColFuzzy(headers, ["tactical", "tactics"]);

    return { game_id, team, opponent, dp_action_seq, uplift, result, professional_summary, tactical_summary };
  }, [headers]);

  const missingCore = useMemo(() => {
    const miss: string[] = [];
    if (!col.game_id) miss.push("game_id");
    if (!col.team) miss.push("team");
    if (!col.opponent) miss.push("opponent");
    if (!col.dp_action_seq) miss.push("dp_action_seq");
    if (!col.uplift) miss.push("uplift");
    if (!col.result) miss.push("result");
    return miss;
  }, [col]);

  const rows: Row[] = useMemo(() => {
    if (!rawRows.length) return [];
    if (missingCore.length) return [];

    return rawRows.map((r, idx) => {
      const game_id = cleanValue(r[col.game_id!]);
      const team = cleanValue(r[col.team!]);
      const opponent = cleanValue(r[col.opponent!]);
      const dp_action_seq = cleanValue(r[col.dp_action_seq!]);

      const uplift = toNumLoose(r[col.uplift!]);
      const stance = stanceFromUplift(uplift, neutralBand);
      const result = parseOutcome(r[col.result!]);

      const professional_summary = col.professional_summary ? cleanValue(r[col.professional_summary]) : "";
      const tactical_summary = col.tactical_summary ? cleanValue(r[col.tactical_summary]) : "";

      return {
        id: `${game_id || "row"}_${idx}`,
        game_id,
        team,
        opponent,
        dp_action_seq,
        uplift,
        stance,
        result,
        professional_summary,
        tactical_summary,
      };
    });
  }, [rawRows, col, missingCore.length, neutralBand]);

  const debugStats = useMemo(() => {
    const total = rows.length;
    const byRes: Record<string, number> = { W: 0, D: 0, L: 0, U: 0 };
    const upliftOk = rows.filter((r) => Number.isFinite(r.uplift)).length;
    rows.forEach((r) => (byRes[r.result] = (byRes[r.result] ?? 0) + 1));
    return { total, upliftOk, byRes };
  }, [rows]);

  /** ---------- A: uplift bins -> winrate ---------- */
  function binLabel(u: number, mode: "default" | "tight") {
    if (!Number.isFinite(u)) return "NA";
    if (mode === "tight") {
      if (u < -2) return "< -2";
      if (u < -1) return "-2 ~ -1";
      if (u < 0) return "-1 ~ 0";
      if (u < 1) return "0 ~ 1";
      if (u < 2) return "1 ~ 2";
      return ">= 2";
    } else {
      if (u < 0) return "< 0";
      if (u < 1) return "0 ~ 1";
      if (u < 2) return "1 ~ 2";
      return ">= 2";
    }
  }

  const upliftBins = useMemo(() => {
    const usable = rows.filter((r) => r.result !== "U" && Number.isFinite(r.uplift));
    const groups = new Map<string, Row[]>();
    for (const r of usable) {
      const k = binLabel(r.uplift, binMode);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(r);
    }

    const orderDefault = ["< 0", "0 ~ 1", "1 ~ 2", ">= 2"];
    const orderTight = ["< -2", "-2 ~ -1", "-1 ~ 0", "0 ~ 1", "1 ~ 2", ">= 2"];
    const order = binMode === "tight" ? orderTight : orderDefault;

    return order
      .filter((k) => groups.has(k))
      .map((k) => {
        const arr = groups.get(k)!;
        const n = arr.length;
        const w = arr.filter((x) => x.result === "W").length;
        const winRate = n ? w / n : 0;
        return { bin: k, n, winRate };
      });
  }, [rows, binMode]);

  /** ---------- B: SAFE vs Policy (uplift > 0 only) ---------- */
  const interVsSafe = useMemo(() => {
    const usable = rows.filter((r) => r.result !== "U");
    const safe = usable.filter((r) => isSafe(r.dp_action_seq));

    // ✅ "Policy" = SAFE가 아니면서 uplift > 0인 개입만
    const policy = usable.filter(
      (r) =>
        !isSafe(r.dp_action_seq) &&
        Number.isFinite(r.uplift) &&
        r.uplift > 0
    );

    const stat = (arr: Row[]) => {
      const n = arr.length;
      const w = arr.filter((x) => x.result === "W").length;
      const winRate = n ? w / n : 0;
      return { n, winRate };
    };

    const s = stat(safe);
    const p = stat(policy);

    // Recharts에서 같은 row에 서로 다른 key로 bar 2개 찍기 위해 분리
    return [
      { group: "SAFE (No-Intervention)", winRate_safe: s.winRate, n_safe: s.n, winRate_policy: 0, n_policy: 0 },
      { group: "Policy (uplift > 0)", winRate_safe: 0, n_safe: 0, winRate_policy: p.winRate, n_policy: p.n },
    ];
  }, [rows]);

  /** ---------- 3×3 matrix counts ---------- */
  const outcomes3: Outcome3[] = ["W", "D", "L"];
  const stances: Stance[] = ["Advantage", "Neutral", "Disadvantage"];

  const matrix = useMemo(() => {
    const m: Record<Stance, Record<Outcome3, number>> = {
      Advantage: { W: 0, D: 0, L: 0 },
      Neutral: { W: 0, D: 0, L: 0 },
      Disadvantage: { W: 0, D: 0, L: 0 },
    };
    for (const r of rows) {
      if (r.result === "U") continue;
      m[r.stance][r.result as Outcome3] += 1;
    }
    return m;
  }, [rows]);

  /** ---------- Top 12 teams + 12×12 team-opponent matrix ---------- */
  const topTeams = useMemo(() => {
    const freq = new Map<string, number>();
    for (const r of rows) {
      if (r.team) freq.set(r.team, (freq.get(r.team) ?? 0) + 1);
      if (r.opponent) freq.set(r.opponent, (freq.get(r.opponent) ?? 0) + 1);
    }
    return Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([t]) => t);
  }, [rows]);

  type PairCell = {
    team: string;
    opponent: string;
    n: number;
    winRate: number;
    meanUplift: number;
  };

  const pairMatrix = useMemo(() => {
    const set12 = new Set(topTeams);
    const key = (a: string, b: string) => `${a}__vs__${b}`;

    const groups = new Map<string, Row[]>();
    for (const r of rows) {
      if (!set12.has(r.team) || !set12.has(r.opponent)) continue;
      const k = key(r.team, r.opponent);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(r);
    }

    const getCell = (a: string, b: string): PairCell => {
      const arr = groups.get(key(a, b)) ?? [];
      const n = arr.length;

      const usable = arr.filter((x) => x.result !== "U");
      const n2 = usable.length;
      const w = usable.filter((x) => x.result === "W").length;
      const winRate = n2 ? w / n2 : 0;

      const ups = arr.map((x) => x.uplift).filter((v) => Number.isFinite(v));
      const meanUplift = ups.length ? ups.reduce((s, v) => s + v, 0) / ups.length : 0;

      return { team: a, opponent: b, n, winRate, meanUplift };
    };

    return topTeams.map((a) => topTeams.map((b) => getCell(a, b)));
  }, [rows, topTeams]);

  /** ---------- filtered list (selectedCell + selectedPair + search) ---------- */
  const filtered = useMemo(() => {
    let arr = rows.slice();

    if (selectedCell) {
      arr = arr.filter((r) => r.stance === selectedCell.stance && r.result === selectedCell.outcome);
    }
    if (selectedPair) {
      arr = arr.filter((r) => r.team === selectedPair.team && r.opponent === selectedPair.opponent);
    }

    const q = query.trim().toLowerCase();
    if (q) {
      arr = arr.filter((r) => {
        const hay = `${r.team} ${r.opponent} ${r.game_id} ${r.dp_action_seq} ${r.professional_summary} ${r.tactical_summary}`.toLowerCase();
        return hay.includes(q);
      });
    }

    // 기본: uplift 절대값 큰 순
    arr.sort((a, b) => (Math.abs(b.uplift || 0) as any) - (Math.abs(a.uplift || 0) as any));
    return arr;
  }, [rows, selectedCell, selectedPair, query]);

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return rows.find((r) => r.id === selectedId) ?? null;
  }, [rows, selectedId]);

  /** ---------- styles ---------- */
  const pageBg = "#070A12";
  const card: React.CSSProperties = {
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.05)",
    padding: 16,
  };
  const subtle: React.CSSProperties = { opacity: 0.8, fontSize: 12 };

  function cellStyle(active: boolean): React.CSSProperties {
    return {
      borderRadius: 12,
      border: active ? "1px solid rgba(255,255,255,0.45)" : "1px solid rgba(255,255,255,0.12)",
      background: active ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)",
      padding: 12,
      cursor: "pointer",
      userSelect: "none",
    };
  }

  function TeamPill({ name }: { name: string }) {
    const src = logoSrc(name);
    return (
      <div
        title={name}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          justifyContent: "center",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {src ? (
          <img
            src={src}
            alt={name}
            style={{ width: 18, height: 18, borderRadius: 6 }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : null}
        <span style={{ fontWeight: 950, fontSize: 12 }}>{name}</span>
      </div>
    );
  }

  if (err) {
    return (
      <div style={{ minHeight: "100vh", background: pageBg, color: "white" }}>
        <TopNav />
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 20px" }}>
          <div style={{ ...card, border: "1px solid rgba(255,80,80,0.45)", background: "rgba(255,80,80,0.12)" }}>
            <div style={{ fontWeight: 950 }}>CSV 로드 오류</div>
            <div style={{ marginTop: 8 }}>{err}</div>
            <div style={{ marginTop: 10, ...subtle }}>
              CSV는 <b>public/data/</b>에 두고 경로 확인: <b>{CSV_PATH}</b>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!rawRows.length) {
    return (
      <div style={{ minHeight: "100vh", background: pageBg, color: "white" }}>
        <TopNav />
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 20px", opacity: 0.85 }}>Loading…</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: pageBg, color: "white" }}>
      <TopNav />

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 20px" }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 22, fontWeight: 950 }}>
            6️⃣ Validation — WinRate Uplift + SAFE vs Policy + Matrix + Team-vs-Team Drill-down
          </div>
          <div style={{ marginTop: 6, ...subtle }}>
            (조건부 확률 기반) 상단 그래프 → 3×3 매트릭스 → 12×12 팀vs팀 → 경기 클릭 시 상세 전술 패널
          </div>
        </div>

        {/* Controls + Debug */}
        <div style={{ ...card, marginBottom: 16, background: "rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ fontWeight: 950 }}>Neutral band</div>
              <input
                type="number"
                value={neutralBand}
                onChange={(e) => setNeutralBand(Math.max(0, Number(e.target.value) || 0))}
                style={{
                  width: 110,
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.18)",
                  background: "rgba(0,0,0,0.25)",
                  color: "white",
                  outline: "none",
                }}
              />
              <div style={subtle}>|uplift| ≤ band → Neutral</div>

              <div style={{ marginLeft: 14, fontWeight: 950 }}>Bins</div>
              <select
                value={binMode}
                onChange={(e) => setBinMode(e.target.value as any)}
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.18)",
                  background: "rgba(0,0,0,0.25)",
                  color: "white",
                  outline: "none",
                }}
              >
                <option value="default">default</option>
                <option value="tight">tight</option>
              </select>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <input
                placeholder="Search team/opponent/game_id/summary…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{
                  width: 360,
                  maxWidth: "80vw",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.18)",
                  background: "rgba(0,0,0,0.25)",
                  color: "white",
                  outline: "none",
                }}
              />
              <button
                onClick={() => {
                  setSelectedCell(null);
                  setSelectedPair(null);
                  setQuery("");
                  setSelectedId(null);
                }}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.16)",
                  background: "rgba(255,255,255,0.08)",
                  color: "white",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                Reset
              </button>
            </div>
          </div>

          <div style={{ marginTop: 10, ...subtle }}>
            rows: <b>{rawRows.length}</b> / cols: <b>{headers.length}</b> · missing core:{" "}
            <b>{missingCore.length ? missingCore.join(", ") : "None ✅"}</b>
          </div>
          <div style={{ marginTop: 8, ...subtle }}>
            parsed stats → total: <b>{debugStats.total}</b>, uplift finite: <b>{debugStats.upliftOk}</b>, result counts:{" "}
            <b>W {debugStats.byRes.W} / D {debugStats.byRes.D} / L {debugStats.byRes.L} / U {debugStats.byRes.U}</b>
          </div>
        </div>

        {missingCore.length > 0 ? (
          <div style={{ ...card, border: "1px solid rgba(255,210,80,0.35)", background: "rgba(255,210,80,0.10)" }}>
            <div style={{ fontWeight: 950 }}>필수 컬럼을 못 찾았습니다</div>
            <div style={{ marginTop: 8, ...subtle }}>
              Missing: <b>{missingCore.join(", ")}</b>
              <div style={{ marginTop: 8 }}>
                헤더 미리보기: {headers.slice(0, 40).join(", ")}{headers.length > 40 ? " …" : ""}
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* ✅ (1) Graphs FIRST */}
            <div style={{ ...card, marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 950 }}>A. uplift 구간별 승률(bar)</div>
              <div style={{ marginTop: 6, ...subtle }}>
                uplift 구간에 따라 실제 승률(조건부)이 어떻게 달라지는지 확인.
              </div>
              {upliftBins.length === 0 ? (
                <div style={{ marginTop: 12, ...subtle }}>
                  ⚠ upliftBins가 비었습니다. (uplift 파싱 실패/결과 U만 존재 등) 위 parsed stats 확인.
                </div>
              ) : (
                <div style={{ height: 300, marginTop: 12 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={upliftBins} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="bin" tick={{ fill: "rgba(255,255,255,0.72)" }} />
                      <YAxis domain={[0, 1]} tick={{ fill: "rgba(255,255,255,0.72)" }} />
                      <Tooltip
                        formatter={(v: any, name: any, props: any) => {
                          const d = props?.payload as any;
                          if (name === "winRate") return [`${(Number(v) * 100).toFixed(1)}%`, `winRate (n=${d.n})`];
                          return [String(v), name];
                        }}
                      />
                      <Legend />
                      <ReferenceLine y={0.5} strokeDasharray="4 4" />
                      <Bar dataKey="winRate" name="winRate" fill="rgba(120,180,255,0.85)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div style={{ ...card, marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 950 }}>B. 개입 vs 억제(safe) 비교(bar)</div>
              <div style={{ marginTop: 6, ...subtle }}>
                SAFE([0,0,0,0,0]) vs Policy(개입) — Policy는 <b>uplift &gt; 0</b>인 개입만 포함.
              </div>
              <div style={{ height: 300, marginTop: 12 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={interVsSafe} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="group" tick={{ fill: "rgba(255,255,255,0.72)" }} />
                    <YAxis domain={[0, 1]} tick={{ fill: "rgba(255,255,255,0.72)" }} />
                    <Tooltip
                      formatter={(v: any, name: any, props: any) => {
                        const d = props?.payload as any;
                        if (String(name).includes("winRate")) {
                          // n을 같이 표시
                          const n =
                            name === "SAFE winRate" ? d.n_safe : d.n_policy;
                          return [`${(Number(v) * 100).toFixed(1)}%`, `${name} (n=${n})`];
                        }
                        return [String(v), name];
                      }}
                    />
                    <Legend />
                    <Bar dataKey="winRate_safe" name="SAFE winRate" fill="rgba(180,180,180,0.85)" />
                    <Bar dataKey="winRate_policy" name="Policy winRate" fill="rgba(46, 204, 113, 0.85)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* ✅ (2) 3×3 Matrix */}
            <div style={{ ...card, marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 950 }}>상단: 3×3 매트릭스 — (모델 판단) × (실제 결과)</div>
              <div style={{ marginTop: 6, ...subtle }}>
                모델 판단: uplift 부호(Advantage/Neutral/Disadvantage) · 실제 결과: W/D/L · 칸 클릭 → 아래 필터
              </div>

              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "160px repeat(3, 1fr)", gap: 10 }}>
                <div style={{ ...subtle, padding: "10px 12px" }} />
                {outcomes3.map((o) => (
                  <div key={`col-${o}`} style={{ ...subtle, padding: "10px 12px", fontWeight: 950, opacity: 0.95 }}>
                    Outcome: {o}
                  </div>
                ))}

                {stances.map((s) => (
                  <div key={`row-${s}`} style={{ display: "contents" }}>
                    <div style={{ ...subtle, padding: "10px 12px", fontWeight: 950, opacity: 0.95 }}>
                      Model: {s}
                    </div>
                    {outcomes3.map((o) => {
                      const count = matrix[s][o] ?? 0;
                      const active = !!selectedCell && selectedCell.stance === s && selectedCell.outcome === o;
                      return (
                        <div
                          key={`${s}-${o}`}
                          style={cellStyle(active)}
                          onClick={() => {
                            setSelectedCell({ stance: s, outcome: o });
                            setSelectedId(null);
                          }}
                        >
                          <div style={{ fontWeight: 950, fontSize: 18 }}>{count}</div>
                          <div style={{ ...subtle, marginTop: 4 }}>
                            {s} × {o}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* ✅ (3) 12×12 Team vs Team Matrix */}
            <div style={{ ...card, marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 950 }}>팀 vs 팀 매트릭스 (Top 12) — 셀 클릭 → 해당 매치업만 보기</div>
              <div style={{ marginTop: 6, ...subtle }}>
                셀 표시: <b>n</b> / <b>WR</b> / <b>μ uplift(pp)</b> · 배경색: μ uplift(+초록 / -빨강)
              </div>

              {selectedPair && (
                <div style={{ marginTop: 10, ...subtle }}>
                  선택됨: <b>{selectedPair.team}</b> vs <b>{selectedPair.opponent}</b>{" "}
                  <button
                    onClick={() => setSelectedPair(null)}
                    style={{
                      marginLeft: 10,
                      padding: "6px 10px",
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.16)",
                      background: "rgba(255,255,255,0.07)",
                      color: "white",
                      fontWeight: 900,
                      cursor: "pointer",
                    }}
                  >
                    해제
                  </button>
                </div>
              )}

              <div style={{ marginTop: 12, overflowX: "auto" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: `200px repeat(${topTeams.length}, minmax(120px, 1fr))`,
                    gap: 8,
                    alignItems: "stretch",
                    minWidth: 920,
                  }}
                >
                  <div style={{ ...subtle, padding: 10, fontWeight: 950 }}>TEAM \\ OPP</div>

                  {topTeams.map((t) => (
                    <div
                      key={`col-${t}`}
                      style={{
                        padding: 10,
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,0.10)",
                        background: "rgba(255,255,255,0.04)",
                      }}
                    >
                      <TeamPill name={t} />
                    </div>
                  ))}

                  {topTeams.map((rowTeam, i) => (
                    <div key={`row-${rowTeam}`} style={{ display: "contents" }}>
                      <div
                        style={{
                          padding: 10,
                          borderRadius: 12,
                          border: "1px solid rgba(255,255,255,0.10)",
                          background: "rgba(255,255,255,0.04)",
                        }}
                      >
                        <TeamPill name={rowTeam} />
                      </div>

                      {pairMatrix[i].map((cell, j) => {
                        const active =
                          selectedPair?.team === cell.team && selectedPair?.opponent === cell.opponent;

                        const hasData = cell.n > 0;
                        const border = active
                          ? "1px solid rgba(255,255,255,0.45)"
                          : "1px solid rgba(255,255,255,0.10)";

                        const bg = active
                          ? "rgba(255,255,255,0.12)"
                          : hasData
                          ? tintByUplift(cell.meanUplift)
                          : "rgba(255,255,255,0.02)";

                        return (
                          <div
                            key={`cell-${i}-${j}`}
                            onClick={() => {
                              if (!hasData) return;
                              setSelectedPair({ team: cell.team, opponent: cell.opponent });
                              setSelectedId(null);
                            }}
                            style={{
                              padding: 10,
                              borderRadius: 12,
                              border,
                              background: bg,
                              cursor: hasData ? "pointer" : "default",
                              userSelect: "none",
                              textAlign: "center",
                            }}
                            title={`${cell.team} vs ${cell.opponent}\nGames: ${cell.n}\nWinRate: ${(cell.winRate*100).toFixed(1)}%\nMean uplift: ${cell.meanUplift.toFixed(2)} pp`}
                          >
                            <div style={{ fontWeight: 950, fontSize: 14 }}>{cell.n}</div>
                            <div style={{ fontSize: 11, opacity: 0.88 }}>
                              WR {(cell.winRate * 100).toFixed(0)}%
                            </div>
                            <div style={{ fontSize: 11, opacity: 0.78 }}>
                              μ {cell.meanUplift.toFixed(1)}pp
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 10, ...subtle }}>
                  * Top 12는 데이터 등장 빈도 기준입니다. (필요하면 고정 12팀 목록으로도 바꿀 수 있어)
                </div>
              </div>
            </div>

            {/* ✅ (4) List + Detail */}
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 16, alignItems: "start" }}>
              <div style={card}>
                <div style={{ fontSize: 15, fontWeight: 950 }}>경기 리스트 — 카드형(덜 피곤하게)</div>
                <div style={{ marginTop: 6, ...subtle }}>
                  필터:{" "}
                  <b>
                    {selectedCell ? `${selectedCell.stance}×${selectedCell.outcome}` : "stance/result 없음"}
                  </b>{" "}
                  ·{" "}
                  <b>{selectedPair ? `${selectedPair.team} vs ${selectedPair.opponent}` : "team-vs-team 없음"}</b>{" "}
                  · 표본: <b>{filtered.length}</b>
                </div>

                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                  {filtered.slice(0, 120).map((r) => {
                    const active = selectedId === r.id;
                    const teamLogo = logoSrc(r.team);
                    const oppLogo = logoSrc(r.opponent);

                    return (
                      <div
                        key={r.id}
                        style={{
                          borderRadius: 14,
                          border: active ? "1px solid rgba(255,255,255,0.35)" : "1px solid rgba(255,255,255,0.10)",
                          background: active ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.04)",
                          padding: 12,
                          cursor: "pointer",
                        }}
                        onClick={() => setSelectedId(r.id)}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                          <div>
                            <div style={{ fontWeight: 950, display: "flex", alignItems: "center", gap: 8 }}>
                              {teamLogo ? (
                                <img
                                  src={teamLogo}
                                  alt={r.team}
                                  style={{ width: 18, height: 18, borderRadius: 6 }}
                                  onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                                />
                              ) : null}
                              <span>{r.team}</span>
                              <span style={{ opacity: 0.8 }}>vs</span>
                              {oppLogo ? (
                                <img
                                  src={oppLogo}
                                  alt={r.opponent}
                                  style={{ width: 18, height: 18, borderRadius: 6 }}
                                  onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                                />
                              ) : null}
                              <span>{r.opponent}</span>
                            </div>
                            <div style={{ opacity: 0.75, fontSize: 12 }}>{r.game_id}</div>
                          </div>

                          <div style={{ display: "flex", gap: 12, alignItems: "center", opacity: 0.9, fontSize: 12 }}>
                            <span><b>{r.stance}</b></span>
                            <span>R: <b>{r.result}</b></span>
                            <span>uplift: <b>{Number.isFinite(r.uplift) ? r.uplift.toFixed(2) : "NA"}pp</b></span>
                            <span>policy: <b>{actionLabel(r.dp_action_seq)}</b></span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ marginTop: 6, opacity: 0.7, fontSize: 12 }}>
                    리스트는 120개까지만 표시(성능). 검색/필터로 좁혀주세요.
                  </div>
                </div>
              </div>

              <div style={{ ...card, position: "sticky", top: 80 }}>
                <div style={{ fontSize: 15, fontWeight: 950 }}>상세 전술 패널</div>

                {!selected ? (
                  <div style={{ marginTop: 10, ...subtle }}>왼쪽 리스트에서 경기를 클릭하세요.</div>
                ) : (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontWeight: 950, fontSize: 16, display: "flex", alignItems: "center", gap: 10 }}>
                      {logoSrc(selected.team) ? (
                        <img
                          src={logoSrc(selected.team)!}
                          alt={selected.team}
                          style={{ width: 22, height: 22, borderRadius: 7 }}
                          onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                        />
                      ) : null}
                      <span>{selected.team}</span>
                      <span style={{ opacity: 0.75 }}>vs</span>
                      {logoSrc(selected.opponent) ? (
                        <img
                          src={logoSrc(selected.opponent)!}
                          alt={selected.opponent}
                          style={{ width: 22, height: 22, borderRadius: 7 }}
                          onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                        />
                      ) : null}
                      <span>{selected.opponent}</span>
                    </div>

                    <div style={{ marginTop: 4, ...subtle }}>
                      game_id: <b>{selected.game_id}</b> · stance: <b>{selected.stance}</b> · result:{" "}
                      <b>{selected.result}</b>
                    </div>

                    <div style={{ marginTop: 10, ...card, padding: 12, background: "rgba(0,0,0,0.20)" }}>
                      <div style={{ fontWeight: 950 }}>dp_action_seq</div>
                      <div style={{ marginTop: 6, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontSize: 12, opacity: 0.9 }}>
                        {selected.dp_action_seq}
                      </div>
                      <div style={{ marginTop: 6, ...subtle }}>
                        Label: <b>{actionLabel(selected.dp_action_seq)}</b> · Intensity:{" "}
                        <b>{interventionIntensity(selected.dp_action_seq)}</b>
                      </div>
                    </div>

                    <div style={{ marginTop: 10, ...card, padding: 12, background: "rgba(255,255,255,0.06)" }}>
                      <div style={subtle}>Uplift (pp)</div>
                      <div style={{ fontWeight: 950, marginTop: 4 }}>
                        {Number.isFinite(selected.uplift) ? selected.uplift.toFixed(2) : "NA"}
                      </div>
                    </div>

                    <div style={{ marginTop: 12, ...card, padding: 12, background: "rgba(255,255,255,0.06)" }}>
                      <div style={{ fontWeight: 950 }}>Baseline vs Policy (비교 텍스트)</div>
                      <div style={{ marginTop: 8, ...subtle }}>
                        <b>Baseline(기존):</b> 개입 없이 기본 운영(보수적/리스크 최소화).
                      </div>
                      <div style={{ marginTop: 8, ...subtle }}>
                        <b>Policy(모델):</b>{" "}
                        {selected.tactical_summary
                          ? selected.tactical_summary
                          : "(tactical_summary 없음 — 해당 컬럼이 있는 CSV로 바꾸면 자동 표시됩니다.)"}
                      </div>
                    </div>

                    <div style={{ marginTop: 12, ...card, padding: 12, background: "rgba(255,255,255,0.06)" }}>
                      <div style={{ fontWeight: 950 }}>Professional Summary</div>
                      <div style={{ marginTop: 8, ...subtle }}>
                        {selected.professional_summary || "(professional_summary 없음)"}
                      </div>
                    </div>

                    <div style={{ marginTop: 12, ...card, padding: 12, background: "rgba(255,255,255,0.06)" }}>
                      <div style={{ fontWeight: 950 }}>Tactical Summary</div>
                      <div style={{ marginTop: 8, ...subtle }}>
                        {selected.tactical_summary || "(tactical_summary 없음)"}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
