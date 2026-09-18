import { timingSafeEqual } from "node:crypto";
import { collectorDatabase } from "@/lib/collector-database";
import { collect } from "../../../../workers/data/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Cloudflare schedules this route; Vercel's cron is not used for minute updates.
export async function POST(request: Request) {
  const secret = process.env.COLLECTOR_SECRET,
    origin = process.env.DATA_SERVICE_URL,
    supplied = Buffer.from(request.headers.get("authorization") ?? ""),
    expected = Buffer.from(`Bearer ${secret}`);
  if (
    !secret ||
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!origin || process.env.ENABLE_DURABLE_DATA !== "true")
    return Response.json({ error: "Collector disabled" }, { status: 503 });
  try {
    const result = await collect({
      DB: collectorDatabase(origin, secret),
      DATA_SERVICE_SECRET: "unused-by-collector",
    });
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error(
      "Collection failed",
      error instanceof Error ? error.message : "unknown",
    );
    return Response.json({ error: "Collection failed" }, { status: 503 });
  }
}
