import { NextResponse } from "next/server";
import { getNews } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const data = await getNews({
    symbol: url.searchParams.get("symbol") ?? undefined,
    eventId: url.searchParams.get("eventId") ?? undefined,
  });
  return NextResponse.json(data);
}
