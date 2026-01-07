import json
import os
import pandas as pd

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(PROJECT_ROOT, "data")

# ✅ 너가 준 실제 경로(절대경로)
CSV_PATH = r"C:\시스템 반도체 공학과\대외활동(경진대회)\K리그 빅데이터 경진대회\csv 정리해둔것\data5\matchup_long_team_perspective.csv"
OUT_PATH = os.path.join(DATA_DIR, "team_timeseries.json")

def pick_col(cols, candidates):
    cols_lower = {c.lower(): c for c in cols}
    for cand in candidates:
        if cand.lower() in cols_lower:
            return cols_lower[cand.lower()]
    for cand in candidates:
        for c in cols:
            if cand.lower() in c.lower():
                return c
    return None

def normalize_team_name(x: str) -> str:
    return str(x).strip()

if not os.path.exists(CSV_PATH):
    raise FileNotFoundError(f"CSV를 찾을 수 없음: {CSV_PATH}")

try:
    df = pd.read_csv(CSV_PATH, encoding="utf-8-sig")
except UnicodeDecodeError:
    df = pd.read_csv(CSV_PATH, encoding="cp949")

team_col = pick_col(df.columns, ["team", "teamname", "team_name", "teamlabel", "team_name_ko", "club", "Team"])
opp_col  = pick_col(df.columns, ["opp", "opponent", "opp_team", "opp_team_name", "opp_team_name_ko"])
date_col = pick_col(df.columns, ["date", "game_date", "match_date"])
gid_col  = pick_col(df.columns, ["match_id", "game_id", "fixture_id", "id"])
rnd_col  = pick_col(df.columns, ["round", "matchday", "md", "gw"])
tss_col  = pick_col(df.columns, ["tss", "TSS"])
sgp_col  = pick_col(df.columns, ["sgp", "SGP"])
pti_col  = pick_col(df.columns, ["pti", "PTI"])
gf_col   = pick_col(df.columns, ["gf", "goals_for", "team_goals"])
ga_col   = pick_col(df.columns, ["ga", "goals_against", "opp_goals"])
res_col  = pick_col(df.columns, ["result", "wl", "wld", "outcome"])

missing = [("team", team_col), ("TSS", tss_col), ("SGP", sgp_col), ("PTI", pti_col)]
missing = [name for name, col in missing if col is None]
if missing:
    raise ValueError(
        f"필수 컬럼을 못 찾음: {missing}\n"
        f"현재 컬럼 목록: {list(df.columns)}"
    )

df = df.copy()
df[team_col] = df[team_col].apply(normalize_team_name)
if opp_col:
    df[opp_col] = df[opp_col].apply(normalize_team_name)

if date_col:
    df[date_col] = pd.to_datetime(df[date_col], errors="coerce")

for col in [tss_col, sgp_col, pti_col, gf_col, ga_col]:
    if col:
        df[col] = pd.to_numeric(df[col], errors="coerce")

sort_keys = []
if date_col: sort_keys.append(date_col)
if gid_col:  sort_keys.append(gid_col)
if not sort_keys:
    df["_order"] = range(len(df))
    sort_keys = ["_order"]

df = df.sort_values(by=[team_col] + sort_keys, ascending=True).reset_index(drop=True)

if rnd_col is None:
    df["_round"] = df.groupby(team_col).cumcount() + 1
    rnd_col = "_round"
else:
    df[rnd_col] = pd.to_numeric(df[rnd_col], errors="coerce")
    df[rnd_col] = df[rnd_col].fillna(df.groupby(team_col).cumcount() + 1).astype(int)

records = []
for _, r in df.iterrows():
    team = r[team_col]
    rec = {
        "team": team,
        "round": int(r[rnd_col]),
        "TSS": float(r[tss_col]) if pd.notna(r[tss_col]) else None,
        "SGP": float(r[sgp_col]) if pd.notna(r[sgp_col]) else None,
        "PTI": float(r[pti_col]) if pd.notna(r[pti_col]) else None,
    }
    if date_col and pd.notna(r[date_col]):
        rec["date"] = r[date_col].strftime("%Y-%m-%d")
    if gid_col and pd.notna(r[gid_col]):
        rec["match_id"] = str(r[gid_col])
    if opp_col and pd.notna(r[opp_col]):
        rec["opponent"] = r[opp_col]
    if res_col and pd.notna(r[res_col]):
        rec["result"] = str(r[res_col])
    if gf_col and pd.notna(r[gf_col]):
        rec["gf"] = float(r[gf_col])
    if ga_col and pd.notna(r[ga_col]):
        rec["ga"] = float(r[ga_col])

    records.append(rec)

os.makedirs(DATA_DIR, exist_ok=True)
with open(OUT_PATH, "w", encoding="utf-8") as f:
    json.dump(records, f, ensure_ascii=False, indent=2)

print("✅ DONE")
print(f"- rows: {len(records)}")
print(f"- output: {OUT_PATH}")
print("샘플 3개:")
for x in records[:3]:
    print(x)
