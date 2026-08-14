import { NextResponse } from "next/server";
import { fetchOddsHistory } from "@/lib/gamma";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const tokenId = new URL(req.url).searchParams.get("tokenId") ?? "";
  if (!tokenId) return NextResponse.json({ error: "tokenId required" }, { status: 400 });
  const odds = await fetchOddsHistory(tokenId);
  return NextResponse.json({ odds });
}
