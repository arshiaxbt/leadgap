import type {} from "@netlify/functions";
import { timingSafeEqual } from "node:crypto";
import { collect } from "../../workers/data/ingest";
import { collectorDatabase } from "../../src/lib/collector-database";

export default async function collectRequest(request: Request) {
  const secret = Netlify.env.get("COLLECTOR_SECRET"),
    origin = Netlify.env.get("DATA_SERVICE_URL"),
    supplied = Buffer.from(request.headers.get("authorization") ?? ""),
    expected = Buffer.from(`Bearer ${secret}`);
  if (
    !secret ||
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (request.method !== "POST")
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  if (!origin || Netlify.env.get("ENABLE_DURABLE_DATA") !== "true")
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
