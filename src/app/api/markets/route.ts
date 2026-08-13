import { NextResponse } from "next/server";
import { getMarkets } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const data = await getMarkets();
  return NextResponse.json(data);
}
