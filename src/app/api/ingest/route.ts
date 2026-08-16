import { NextResponse } from "next/server";
import { getSnapshot } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function cronAuthorized(req: Request): boolean {
  if (!process.env.VERCEL) return true;
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function ingest(req: Request) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const data = await getSnapshot();
  return NextResponse.json(data);
}

export async function GET(req: Request) {
  return ingest(req);
}

export async function POST(req: Request) {
  return ingest(req);
}
