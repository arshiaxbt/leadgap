import { snapshotGzip, snapshotText } from "./snapshot-codec";
import { payloadOperation, PAYLOAD_MAX_BYTES, rawJson } from "./payloads";
import { historyResponse } from "./history";
import {
  readRequestText,
  RequestBodyTooLarge,
} from "../../src/lib/request-body";
import { INGEST_SQL } from "./ingest-sql";
import { readMeta, type Env } from "./db";
import {
  freshResearchSnapshot,
  validRule,
  validWatch,
  type ResearchSnapshot,
} from "../../src/lib/research";
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "cache-control": "no-store" } });
const encoder = new TextEncoder();
/** Constant-time bearer check: compares fixed-length digests, never the raw strings. */
async function bearerMatches(
  header: string | null,
  secret: string | undefined,
): Promise<boolean> {
  if (!secret || !header) return false;
  const [given, expected] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(header)),
    crypto.subtle.digest("SHA-256", encoder.encode(`Bearer ${secret}`)),
  ]);
  const a = new Uint8Array(given),
    b = new Uint8Array(expected);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
/** Collector gateway body cap: headroom over the collector's ~400 KB chunks. */
const GATEWAY_MAX_BYTES = 1_572_864;
/** Reads a preview deployment may make with DATA_READ_SECRET; nothing else. */
const READ_ONLY_PATHS = new Set(["/snapshot", "/snapshot/raw", "/history", "/mapping", "/health"]);
export async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url),
    path = url.pathname;
  if (path.startsWith("/internal/payload/")) {
    if (!(await bearerMatches(request.headers.get("authorization"), env.COLLECTOR_SECRET)))
      return json({ error: "Unauthorized" }, 401);
    return payloadOperation(request, env);
  }
  if (path === "/internal/database") {
    if (
      !(await bearerMatches(
        request.headers.get("authorization"),
        env.COLLECTOR_SECRET,
      ))
    )
      return json({ error: "Unauthorized" }, 401);
    if (request.method !== "POST")
      return json({ error: "Method not allowed" }, 405);
    // The collector chunks writes to ~400 KB; the headroom covers one oversized statement.
    const body = JSON.parse(await readRequestText(request, GATEWAY_MAX_BYTES)) as {
      queries?: { sql: string; params: unknown[] }[];
    };
    if (
      !body ||
      !Array.isArray(body.queries) ||
      !body.queries.length ||
      body.queries.length > 32 ||
      body.queries.some(
        (q) =>
          !q ||
          !INGEST_SQL.has(q.sql) ||
          !Array.isArray(q.params) ||
          q.params.length > 32 ||
          q.params.some(
            (p) =>
              p !== null &&
              typeof p !== "string" &&
              (typeof p !== "number" || !Number.isFinite(p)),
          ),
      )
    )
      return json({ error: "Invalid collector operation" }, 400);
    const results = await env.DB.batch(
      body.queries.map((q) => env.DB.prepare(q.sql).bind(...q.params)),
    );
    // Preserve legacy collector reads during rollback. Current collectors use
    // the compressed startup operation and inflate on Vercel instead.
    for (let i = 0; i < results.length; i++) {
      const query = body.queries[i];
      for (const row of results[i].results) {
        if (typeof row.value === "string" &&
            (row.key === "latest" || (query.sql === "SELECT value FROM meta WHERE key=?" && query.params[0] === "latest")))
          row.value = await snapshotText(row.value);
      }
    }
    return json(results);
  }
  const authorization = request.headers.get("authorization");
  const allowed =
    (await bearerMatches(authorization, env.DATA_SERVICE_SECRET)) ||
    (request.method === "GET" &&
      READ_ONLY_PATHS.has(path) &&
      (await bearerMatches(authorization, env.DATA_READ_SECRET)));
  if (!allowed) return json({ error: "Unauthorized" }, 401);
  if (request.method === "GET" && path === "/health")
    return json((await readMeta(env.DB, "health")) ?? { status: "warming" });
  if (request.method === "POST" && path === "/collect") {
    if (env.INGEST_ENABLED !== "true")
      return json({ error: "Ingestion disabled" }, 503);
    return triggerCollection(env);
  }
  // Vercel applies freshResearchSnapshot on every read, including cache hits.
  // Keep the legacy filtered route for old deployments and direct consumers.
  if (request.method === "GET" && path === "/snapshot/raw") {
    const row = await env.DB.prepare("SELECT value FROM meta WHERE key=?")
      .bind("latest").first<{ value: string }>();
    if (!row) return json({ error: "History is warming up" }, 503);
    const gzip = snapshotGzip(row.value);
    const compressedInit = {
      encodeBody: "manual" as const,
      headers: { "content-type": "application/json", "content-encoding": "gzip", "cache-control": "no-store" },
    };
    return gzip ? new Response(gzip, compressedInit) : rawJson(row.value);
  }
  if (request.method === "GET" && path === "/snapshot") {
    const snapshot = await readMeta<ResearchSnapshot>(env.DB, "latest");
    if (!snapshot) return json({ error: "History is warming up" }, 503);
    return json(freshResearchSnapshot(snapshot));
  }
  if (request.method === "GET" && path === "/history")
    return historyResponse(url, env.DB);
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
      const limit =
        new URL(request.url).pathname.startsWith("/internal/")
          ? PAYLOAD_MAX_BYTES
          : 16_384;
      if (Number(request.headers.get("content-length") ?? 0) > limit)
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
    if (env.INGEST_ENABLED === "true") await triggerCollection(env);
  },
};

export default worker;

async function triggerCollection(env: Env): Promise<Response> {
  if (!env.COLLECTOR_URL || !env.COLLECTOR_SECRET)
    throw new Error("Collector is not configured");
  const response = await fetch(env.COLLECTOR_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${env.COLLECTOR_SECRET}` },
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`Collector failed (${response.status})`);
  return response;
}
