import { readHistoryPages } from "@/lib/history-pages";
import { dataService } from "@/lib/data-service";
export async function GET(req: Request) {
  if (process.env.ENABLE_DURABLE_DATA !== "true")
    return Response.json(
      { error: "History is not available yet." },
      { status: 503 },
    );
  const p = new URL(req.url).searchParams;
  const symbol = p.get("symbol"),
    eventId = p.get("eventId");
  if (
    !symbol ||
    !/^[A-Z0-9._-]{1,40}$/.test(symbol) ||
    !eventId ||
    !/^\d{1,80}$/.test(eventId)
  )
    return Response.json(
      { error: "Select an event and market." },
      { status: 400 },
    );
  const now = Date.now();
  const query = new URLSearchParams({
    symbol,
    eventId,
    from: String(now - 6 * 3600_000),
    to: String(now),
  });
  try {
    const data = await readHistoryPages(query, (path) => dataService(path));
    // Each archived batch carries every event's links and volumes; send only this signal's.
    const batches = data.batches.map((b) => ({
      ...b,
      links: b.links?.[eventId]
        ? { [eventId]: { [symbol]: b.links[eventId][symbol]! } }
        : {},
      volumes: undefined,
    }));
    return Response.json(
      { ...data, batches },
      { headers: { "cache-control": "public, max-age=30" } },
    );
  } catch {
    return Response.json(
      { error: "History is temporarily unavailable." },
      { status: 503 },
    );
  }
}
