import { NextResponse } from "next/server";
import { getGaps } from "@/lib/store";
import type { GapWindow } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const WINDOWS = new Set<GapWindow>(["1m", "5m", "15m", "1h"]);

export async function GET(req: Request) {
  const window = new URL(req.url).searchParams.get("window") ?? "15m";
  const w = WINDOWS.has(window as GapWindow) ? (window as GapWindow) : "15m";
  const data = await getGaps(w);
  return NextResponse.json(data);
}
