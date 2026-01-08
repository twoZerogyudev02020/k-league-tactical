"use client";

import { useState } from "react";

/** public/logos/{team}.png */
function logo(team: string) {
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
  return `/logos/${map[team] ?? team}.png`;
}

export type MatchItem = {
  match_id: string;
  label: string;
  teams: string[];
};

export default function MatchSelect({
  value,
  onChange,
  matches,
}: {
  value: string;
  onChange: (id: string) => void;
  matches: MatchItem[];
}) {
  const [open, setOpen] = useState(false);
  const current = matches.find((m) => m.match_id === value);

  return (
    <div className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between rounded-lg
                   bg-black/30 border border-white/15 px-3 py-2
                   hover:bg-black/40"
      >
        <div className="flex items-center gap-2">
          {current?.teams.map((t) => (
            <img
              key={t}
              src={logo(t)}
              alt={t}
              className="w-5 h-5 rounded-sm"
              onError={(e) =>
                ((e.currentTarget as HTMLImageElement).style.display = "none")
              }
            />
          ))}
          <span className="text-sm text-white/85">
            {current?.label ?? "Select match"}
          </span>
        </div>
        <span className="text-white/60 text-xs">▼</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute z-50 mt-2 w-full rounded-xl
                     bg-[#0b1220] border border-white/15 shadow-xl"
        >
          {matches.map((m) => (
            <button
              key={m.match_id}
              onClick={() => {
                onChange(m.match_id);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2
                         hover:bg-white/10 text-left"
            >
              {m.teams.map((t) => (
                <img
                  key={t}
                  src={logo(t)}
                  alt={t}
                  className="w-5 h-5 rounded-sm"
                  onError={(e) =>
                    ((e.currentTarget as HTMLImageElement).style.display = "none")
                  }
                />
              ))}
              <span className="text-sm text-white/80">{m.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
