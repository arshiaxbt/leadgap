import {
  readRequestText,
  RequestBodyTooLarge,
} from "../../src/lib/request-body";
import { collect } from "./ingest";
import { readMeta, type Env } from "./db";
import {
  freshResearchSnapshot,
  validRule,
  validWatch,
  type HistoryBatch,
  type ResearchSnapshot,
} from "../../src/lib/research";
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "cache-control": "no-store" } });
export async function handle(request: Request, env: Env): Promise<Response> {
  if (
    !env.DATA_SERVICE_SECRET ||
    request.headers.get("authorization") !== `Bearer ${env.DATA_SERVICE_SECRET}`
  )
    return json({ error: "Unauthorized" }, 401);
  const url = new URL(request.url),
    path = url.pathname;
  if (request.method === "GET" && path === "/health")
    return json((await readMeta(env.DB, "health")) ?? { status: "warming" });
  if (request.method === "POST" && path === "/collect") {
    if (env.INGEST_ENABLED !== "true")
      return json({ error: "Ingestion disabled" }, 503);
    return json(await collect(env));
  }
  if (request.method === "GET" && path === "/snapshot") {
    const snapshot = await readMeta<ResearchSnapshot>(env.DB, "latest");
    if (!snapshot) return json({ error: "History is warming up" }, 503);
    return json(freshResearchSnapshot(snapshot));
  }
  if (request.method === "GET" && path === "/history") {
    const from = Number(url.searchParams.get("from")),
      to = Number(url.searchParams.get("to")),
      symbol = url.searchParams.get("symbol"),
      eventId = url.searchParams.get("eventId");
    if (
      !Number.isFinite(from) ||
      !Number.isFinite(to) ||
      from < 0 ||
      to <= from ||
      to - from > 31 * 86400_000
    )
      return json({ error: "Invalid history range" }, 400);
    const cursor = Number(url.searchParams.get("cursor") ?? from);
    if (!Number.isFinite(cursor)) return json({ error: "Invalid cursor" }, 400);
    const result = await env.DB.prepare(
      "SELECT t,payload FROM snapshots WHERE t>=? AND t<=? ORDER BY t LIMIT 500",
    )
      .bind(Math.max(from, cursor), to)
      .all<{ t: number; payload: string }>();
    const batches = result.results.map((row) => {
      const b = JSON.parse(row.payload) as HistoryBatch;
      return {
        ...b,
        marks: symbol
          ? Object.fromEntries(
              Object.entries(b.marks).filter(([k]) => k === symbol),
            )
          : b.marks,
        odds: eventId
          ? Object.fromEntries(
              Object.entries(b.odds).filter(([k]) => k === eventId),
            )
          : b.odds,
      };
    });
    return json({
      batches,
      nextCursor:
        result.results.length === 500 ? result.results.at(-1)!.t + 1 : null,
    });
  }
  if (request.method === "GET" && path === "/mapping") {
    const row = await env.DB.prepare("SELECT payload FROM mappings WHERE id=?")
      .bind(url.searchParams.get("id"))
      .first<{ payload: string }>();
    return row
      ? json(JSON.parse(row.payload))
      : json({ error: "Not found" }, 404);
  }
  if (path === "/telemetry" && request.method === "POST") {
    const body = JSON.parse(await readRequestText(request, 16_384)) as {
      name: string;
      placement: string;
    };
    if (
      ![
        "referral_click",
        "referral_copy",
        "view_gap",
        "open_market",
        "connect_wallet",
        "open_ticket",
        "submit_order",
        "close_position",
      ].includes(body.name) ||
      !["guide", "workspace"].includes(body.placement)
    )
      return json({ error: "Invalid event" }, 400);
    await env.DB.prepare(
      "INSERT INTO telemetry(day,event,placement,count) VALUES(?,?,?,1) ON CONFLICT(day,event,placement) DO UPDATE SET count=count+1",
    )
      .bind(new Date().toISOString().slice(0, 10), body.name, body.placement)
      .run();
    return json({ ok: true });
  }
  const match = path.match(/^\/account\/(watchlist|rules|notifications)$/);
  if (!match) return json({ error: "Not found" }, 404);
  const owner = request.headers.get("x-leadgap-user");
  if (!owner || !owner.startsWith("did:privy:") || owner.length > 150)
    return json({ error: "Unauthorized" }, 401);
  const kind = match[1];
  const id = url.searchParams.get("id");
  if (request.method === "GET") {
    if (kind === "notifications") {
      const r = await env.DB.prepare(
        "SELECT id,rule_id,created,is_read,payload FROM notifications WHERE owner=? ORDER BY created DESC LIMIT 100",
      )
        .bind(owner)
        .all<{
          id: string;
          rule_id: string;
          created: number;
          is_read: number;
          payload: string;
        }>();
      return json({
        items: r.results.map((r) => ({
          ...JSON.parse(r.payload),
          id: r.id,
          ruleId: r.rule_id,
          createdAt: r.created,
          read: !!r.is_read,
        })),
      });
    }
    const r = await env.DB.prepare(
      "SELECT payload FROM account_items WHERE owner=? AND kind=? ORDER BY id",
    )
      .bind(owner, kind)
      .all<{ payload: string }>();
    return json({ items: r.results.map((r) => JSON.parse(r.payload)) });
  }
  if (request.method === "DELETE" && id) {
    if (kind === "notifications")
      await env.DB.prepare("DELETE FROM notifications WHERE owner=? AND id=?")
        .bind(owner, id)
        .run();
    else
      await env.DB.batch([
        env.DB.prepare(
          "DELETE FROM account_items WHERE owner=? AND kind=? AND id=?",
        ).bind(owner, kind, id),
        ...(kind === "rules"
          ? [
              env.DB.prepare(
                "DELETE FROM alert_state WHERE owner=? AND id=?",
              ).bind(owner, id),
            ]
          : []),
      ]);
    return json({ ok: true });
  }
  if (kind === "notifications" && request.method === "PATCH" && id) {
    await env.DB.prepare(
      "UPDATE notifications SET is_read=1 WHERE owner=? AND id=?",
    )
      .bind(owner, id)
      .run();
    return json({ ok: true });
  }
  if (kind !== "notifications" && request.method === "PUT") {
    const body: unknown = JSON.parse(await readRequestText(request, 16_384));
    if (!(kind === "rules" ? validRule(body) : validWatch(body)))
      return json({ error: "Invalid saved item" }, 400);
    const item = body as { id: string };
    // Atomic count guard; updates of existing items remain allowed at the limit.
    const result = await env.DB.prepare(
      "INSERT INTO account_items(owner,kind,id,payload) SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM account_items WHERE owner=? AND kind=?) < ? OR EXISTS(SELECT 1 FROM account_items WHERE owner=? AND kind=? AND id=?) ON CONFLICT(owner,kind,id) DO UPDATE SET payload=excluded.payload",
    )
      .bind(
        owner,
        kind,
        item.id,
        JSON.stringify(body),
        owner,
        kind,
        kind === "rules" ? 20 : 100,
        owner,
        kind,
        item.id,
      )
      .run();
    if (!result.meta.changes)
      return json({ error: "Saved-item limit reached" }, 409);
    // Preserve crossing/cooldown state across edits and mute/resume.
    return json({ ok: true });
  }
  return json({ error: "Method not allowed" }, 405);
}
const worker = {
  async fetch(request: Request, env: Env) {
    try {
      if (Number(request.headers.get("content-length") ?? 0) > 16_384)
        return json({ error: "Request too large" }, 413);
      return await handle(request, env);
    } catch (error) {
      if (error instanceof RequestBodyTooLarge)
        return json({ error: "Request too large" }, 413);
      if (error instanceof SyntaxError)
        return json({ error: "Invalid JSON" }, 400);
      console.error(
        "data-service",
        error instanceof Error ? error.message : "failed",
      );
      return json({ error: "Data service unavailable" }, 503);
    }
  },
  async scheduled(_event: unknown, env: Env) {
    if (env.INGEST_ENABLED === "true") await collect(env);
  },
};

export default worker;
