import { NextResponse } from "next/server";
import { getSnapshot } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  const bearer = req.headers.get("authorization") === `Bearer ${secret}`;
  if (process.env.VERCEL) {
    if (!secret) return false;
    return bearer;
  }
  if (secret) return bearer;
  return true;
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
