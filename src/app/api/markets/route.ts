import { NextResponse } from "next/server";
import { liveCache } from "@/lib/http-cache";
import { getMarkets } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const data = await getMarkets();
  return NextResponse.json(data, { headers: liveCache(data.asOf, Date.now()) });
}
