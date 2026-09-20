import { NextResponse } from "next/server";
import { publicCache } from "@/lib/http-cache";
import { getAsset } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await ctx.params;
  const data = await getAsset(symbol.toUpperCase());
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(data, { headers: publicCache(20) });
}
