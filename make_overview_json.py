import pandas as pd
from pathlib import Path

# ✅ 여기만 네 파일명에 맞게 바꿔줘
CSV_PATH = r"C:\시스템 반도체 공학과\대외활동(경진대회)\K리그 빅데이터 경진대회\csv 정리해둔것\data1~data3\team_TSS_SGP_PTI_master.csv"
OUT_JSON = Path("data") / "overview.json"

df = pd.read_csv(CSV_PATH)

# 팀명 컬럼 자동 탐색: TeamLabel / Team / team 순서로 찾기
for cand in ["TeamLabel", "Team", "team"]:
    if cand in df.columns:
        col_team = cand
        break
else:
    raise ValueError(f"팀 컬럼을 못 찾음. 현재 컬럼: {list(df.columns)}")


need = ["TSS", "SGP", "PTI"]
missing = [c for c in need if c not in df.columns]
if missing:
    raise ValueError(f"필요 컬럼 누락: {missing}. 현재 컬럼: {list(df.columns)}")

out = df[[col_team, "TSS", "SGP", "PTI"]].copy()
out = out.rename(columns={col_team: "team"})

# 숫자형으로 강제 변환 (문자 섞여 있으면 NaN 처리)
for c in ["TSS", "SGP", "PTI"]:
    out[c] = pd.to_numeric(out[c], errors="coerce")

out = out.dropna(subset=["TSS", "SGP", "PTI"])
out = out.sort_values("team")

OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
out.to_json(OUT_JSON, orient="records", force_ascii=False, indent=2)

print("✅ Saved:", OUT_JSON.resolve())
print("rows:", len(out))
print(out.head())
