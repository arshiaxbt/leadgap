import { NextResponse } from "next/server";
import { getEvents } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const data = await getEvents();
  return NextResponse.json(data);
}
