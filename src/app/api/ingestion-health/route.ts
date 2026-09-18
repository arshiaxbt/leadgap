import { dataService } from "@/lib/data-service";
export async function GET(req: Request) {
  const secret = process.env.INGEST_HEALTH_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await dataService("/health"), {
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}
