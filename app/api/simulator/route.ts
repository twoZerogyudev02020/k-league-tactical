import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

export async function GET() {
  const p = path.join(process.cwd(), "app", "data", "state_summaries.json");
  if (!fs.existsSync(p)) {
    return NextResponse.json(
      { ok: false, message: "state_summaries.json not found. Run scripts/build_state_summaries.ts first." },
      { status: 404 }
    );
  }
  const raw = fs.readFileSync(p, "utf-8");
  return new NextResponse(raw, {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
