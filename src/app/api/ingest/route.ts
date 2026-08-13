import { NextResponse } from "next/server";
import { getSnapshot } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const data = await getSnapshot();
  return NextResponse.json(data);
}

export async function POST() {
  const data = await getSnapshot();
  return NextResponse.json(data);
}
