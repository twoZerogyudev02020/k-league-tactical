/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

function exists(p) {
  try {
    fs.accessSync(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function readText(p) {
  return fs.readFileSync(p, "utf-8");
}

/** naive CSV parser (handles quotes) */
function parseCSV(text) {
  const rows = [];
  let cur = [];
  let val = "";
  let inQ = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQ) {
      if (ch === '"' && next === '"') {
        val += '"';
        i++;
      } else if (ch === '"') {
        inQ = false;
      } else {
        val += ch;
      }
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ",") {
        cur.push(val);
        val = "";
      } else if (ch === "\n") {
        cur.push(val);
        rows.push(cur);
        cur = [];
        val = "";
      } else if (ch === "\r") {
        // ignore
      } else {
        val += ch;
      }
    }
  }
  if (val.length || cur.length) {
    cur.push(val);
    rows.push(cur);
  }
  return rows;
}

function normKey(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[()]/g, "");
}

/** pick first matching column (case/space-insensitive) */
function pickCol(headers, candidates) {
  const H = headers.map((h) => normKey(h));
  for (const c of candidates) {
    const idx = H.indexOf(normKey(c));
    if (idx >= 0) return headers[idx];
  }
  return null;
}

function toNum(x, def = 0) {
  const v = Number(x);
  return Number.isFinite(v) ? v : def;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function zscoreWithinGroup(rows, keyFn, col) {
  const by = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(r);
  }
  for (const arr of by.values()) {
    let sum = 0,
      cnt = 0;
    for (const r of arr) {
      const v = r[col];
      if (Number.isFinite(v)) {
        sum += v;
        cnt++;
      }
    }
    const mu = cnt ? sum / cnt : 0;
    let s2 = 0;
    for (const r of arr) {
      const v = r[col];
      if (Number.isFinite(v)) s2 += (v - mu) * (v - mu);
    }
    const sd = cnt > 1 ? Math.sqrt(s2 / (cnt - 1)) : 1;
    for (const r of arr) {
      const v = r[col];
      r[col + "_z"] = Number.isFinite(v) ? (v - mu) / (sd || 1) : 0;
    }
  }
}

/** 0~75분 기준 P1~P5 */
function phaseBinFromAbsMinute(min) {
  if (!Number.isFinite(min)) return null;
  if (min >= 0 && min < 15) return "P1 (0–15)";
  if (min >= 15 && min < 30) return "P2 (15–30)";
  if (min >= 30 && min < 45) return "P3 (30–45)";
  if (min >= 45 && min < 60) return "P4 (45–60)";
  if (min >= 60 && min < 75) return "P5 (60–75)";
  return null;
}

function main() {
  const projectRoot = process.cwd();

  // ✅ 너희 실제 파일명 기준 (루트에 두는 것을 권장)
  const phasePath = path.join(projectRoot, "phase_kpi_dp_v6_final_dp.csv");
  const rawPath = path.join(projectRoot, "raw_data.csv");
  const outPath = path.join(projectRoot, "public", "data", "state_summaries.json");

  if (!exists(phasePath)) {
    console.error("❌ phase_kpi_dp_v6_final_dp.csv not found in project root:", phasePath);
    process.exit(1);
  }

  console.log("✅ phase:", phasePath);
  console.log("ℹ️ raw  :", exists(rawPath) ? rawPath : "(not found — tempo_raw enhancement skipped)");

  // ---------- 1) PHASE (WIDE → LONG) ----------
  const phaseText = readText(phasePath);
  const phaseRows = parseCSV(phaseText);
  const PH = phaseRows[0];
  const PR = phaseRows.slice(1).filter((r) => r.length && r.some((x) => String(x).trim() !== ""));

  const colGame = pickCol(PH, ["game_id", "match_id", "gameid"]);
  const colDate = pickCol(PH, ["game_date", "date"]);
  const colTeam = pickCol(PH, ["team_name_ko", "team"]);
  const colOpp = pickCol(PH, ["opp_team_name_ko", "opponent", "opp"]);

  if (!colGame || !colTeam) {
    console.error("❌ phase CSV missing required columns. Need game_id and team_name_ko");
    console.error("   Found:", { colGame, colTeam, colOpp, colDate });
    process.exit(1);
  }

  // phase columns that actually exist (your file has these)
  const phases = [
    { key: "P1", label: "P1 (0–15)" },
    { key: "P2", label: "P2 (15–30)" },
    { key: "P3", label: "P3 (30–45)" },
    { key: "P4", label: "P4 (45–60)" },
    { key: "P5", label: "P5 (60–75)" },
  ];

  function getCell(rowObj, name) {
    return rowObj[name] ?? "";
  }

  // ✅ long states 기본 생성 (tempo=SGP band, pressure=PTI band, buildup=TSS band)
  const states = [];
  for (const row of PR) {
    const obj = {};
    for (let i = 0; i < PH.length; i++) obj[PH[i]] = row[i] ?? "";

    const game_id = String(getCell(obj, colGame)).trim();
    const team = String(getCell(obj, colTeam)).trim();
    if (!game_id || !team) continue;

    const opponent = colOpp ? String(getCell(obj, colOpp)).trim() : "";
    const game_date = colDate ? String(getCell(obj, colDate)).trim() : "";

    for (const p of phases) {
      // uplift / “observed” proxy: 너희 파일에서 P*_sig가 존재
      const uplift = toNum(getCell(obj, `${p.key}_sig`), 0);

      // KPI 밴드(너희 파일에 있음)
      const tempo_band = toNum(getCell(obj, `${p.key}_l_SGP`), 0);
      const pressure = toNum(getCell(obj, `${p.key}_l_PTI`), 0);
      const buildup = toNum(getCell(obj, `${p.key}_l_TSS`), 0);

      // downside: 비용 기반이 더 논문/설명에 맞음 (inc + switch + fat)
      const inc_cost = toNum(getCell(obj, `${p.key}_inc_cost`), 0);
      const switch_cost = toNum(getCell(obj, `${p.key}_switch_cost`), 0);
      const fat_cost = toNum(getCell(obj, `${p.key}_fat_cost`), 0);
      const downside = inc_cost + switch_cost + fat_cost;

      // dp action (있으면)
      const dp_action = toNum(getCell(obj, `${p.key}_dp_a`), NaN);

      states.push({
        match_id: game_id,
        game_date,
        team,
        opponent,
        time_bin: p.label,

        uplift,
        pressure,
        buildup,
        downside,

        tempo: tempo_band,  // 기존 simulator 호환용 (band)
        tempo_raw: 0,       // raw_data로 보강할 예정
        dp_action: Number.isFinite(dp_action) ? dp_action : undefined,
      });
    }
  }

  console.log(`✅ phase rows expanded: ${states.length} states`);

  // ---------- 2) RAW_DATA로 tempo_raw 보강 ----------
  if (exists(rawPath)) {
    const rawText = readText(rawPath);
    const rawRows = parseCSV(rawText);
    const RH = rawRows[0];
    const RR = rawRows.slice(1).filter((r) => r.length && r.some((x) => String(x).trim() !== ""));

    const rGame = pickCol(RH, ["game_id", "match_id", "gameid"]);
    const rTeam = pickCol(RH, ["team_name_ko", "team"]);
    const rPeriod = pickCol(RH, ["period_id", "period", "half"]);
    const rSec = pickCol(RH, ["time_seconds", "sec", "time_sec"]);
    const rDX = pickCol(RH, ["dx"]);
    const rType = pickCol(RH, ["type_name", "event_type", "type"]);

    if (!rGame || !rTeam || !rPeriod || !rSec) {
      console.warn("⚠ raw_data.csv columns not sufficient for tempo enhancement. Skipping.");
      console.warn("   Found:", { rGame, rTeam, rPeriod, rSec, rDX, rType });
    } else {
      const agg = new Map(); // key -> {n, prog, passN, carryN}
      for (const r of RR) {
        const obj = {};
        for (let i = 0; i < RH.length; i++) obj[RH[i]] = r[i] ?? "";

        const game_id = String(obj[rGame] ?? "").trim();
        const team = String(obj[rTeam] ?? "").trim();
        if (!game_id || !team) continue;

        const period = toNum(obj[rPeriod], NaN);
        const sec = toNum(obj[rSec], NaN);
        if (!Number.isFinite(period) || !Number.isFinite(sec)) continue;

        const absMin = (period - 1) * 45 + sec / 60;
        const bin = phaseBinFromAbsMinute(absMin);
        if (!bin) continue;

        const key = `${game_id}|||${team}|||${bin}`;
        if (!agg.has(key)) agg.set(key, { n: 0, prog: 0, passN: 0, carryN: 0 });
        const a = agg.get(key);

        a.n += 1;

        const dx = rDX ? toNum(obj[rDX], NaN) : NaN;
        if (Number.isFinite(dx)) a.prog += Math.max(0, dx);

        const t = rType ? normKey(obj[rType]) : "";
        if (t.includes("pass")) a.passN += 1;
        if (t.includes("carry") || t.includes("dribble")) a.carryN += 1;
      }

      const tempoRows = [];
      for (const [key, a] of agg.entries()) {
        const [game_id, team, bin] = key.split("|||");
        // bin은 15분 단위로 고정
        tempoRows.push({
          match_id: game_id,
          team,
          time_bin: bin,
          eventsPerMin: a.n / 15,
          progPerMin: a.prog / 15,
          pcPerMin: (a.passN + a.carryN) / 15,
        });
      }

      const keyFn = (r) => `${r.match_id}|||${r.team}`;
      zscoreWithinGroup(tempoRows, keyFn, "eventsPerMin");
      zscoreWithinGroup(tempoRows, keyFn, "progPerMin");
      zscoreWithinGroup(tempoRows, keyFn, "pcPerMin");

      const tempoMap = new Map();
      for (const r of tempoRows) {
        // tempo_raw = z(events/min) + 0.5*z(progress/min) + 0.5*z(pass+carry/min)
        const tempo_raw =
          (r.eventsPerMin_z || 0) + 0.5 * (r.progPerMin_z || 0) + 0.5 * (r.pcPerMin_z || 0);
        tempoMap.set(`${r.match_id}|||${r.team}|||${r.time_bin}`, tempo_raw);
      }

      let applied = 0;
      for (const s of states) {
        const k = `${s.match_id}|||${s.team}|||${s.time_bin}`;
        if (tempoMap.has(k)) {
          s.tempo_raw = tempoMap.get(k);
          applied++;
        }
      }
      console.log(`✅ tempo_raw enhanced from raw_data: applied to ${applied} states`);
    }
  }

  // ---------- 3) OUTPUT JSON ----------
  const payload = {
    generatedAt: new Date().toISOString(),
    states: states.map((s) => ({
      match_id: s.match_id,
      game_date: s.game_date,
      team: s.team,
      opponent: s.opponent,
      time_bin: s.time_bin,

      // 기존 simulator 호환
      tempo: s.tempo,                 // band (-2..2), from phase KPI
      tempo_raw: Number((s.tempo_raw ?? 0).toFixed(6)), // continuous, from raw_data
      pressure: s.pressure,           // band
      buildup: s.buildup,             // band
      downside: Number((s.downside ?? 0).toFixed(6)),   // cost-based
      uplift: Number((s.uplift ?? 0).toFixed(6)),       // P*_sig

      dp_action: s.dp_action,
    })),
    meta: {
      phase_source: "phase_kpi_dp_v6_final_dp.csv (wide P1..P5 expanded)",
      tempo_source: exists(rawPath)
        ? "raw_data.csv (events/min + prog/min + pass/carry/min z-scored within match-team)"
        : "raw_data.csv missing (tempo_raw=0)",
      note:
        "tempo is band from phase KPI (P*_l_SGP). tempo_raw is an enhanced continuous proxy for in-match tempo variation.",
    },
  };

  ensureDir(path.dirname(outPath));
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf-8");
  console.log("✅ wrote:", outPath);
  console.log("✅ states:", payload.states.length);
}

main();
