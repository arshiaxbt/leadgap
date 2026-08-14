import { NextResponse } from "next/server";
import { fetchCandles } from "@/lib/perps";
import type { KlineInterval } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const INTERVALS = new Set<KlineInterval>(["1m", "5m", "15m", "1h"]);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = Number(url.searchParams.get("instrumentId"));
  const interval = (url.searchParams.get("interval") ?? "5m") as KlineInterval;
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "instrumentId required" }, { status: 400 });
  }
  try {
    const candles = await fetchCandles(id, INTERVALS.has(interval) ? interval : "5m");
    return NextResponse.json({ candles });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "klines failed" },
      { status: 502 },
    );
  }
}
