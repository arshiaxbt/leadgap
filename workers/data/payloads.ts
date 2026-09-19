import { snapshotText } from "./snapshot-codec";
import type { Env } from "./db";
import { readRequestText } from "../../src/lib/request-body";

export const PAYLOAD_MAX_BYTES = 1_572_864;
export const RECENT_SQL = "SELECT json_object('t',json_extract(payload,'$.t'),'modelVersion',model,'marks',json_extract(payload,'$.marks'),'odds',json_extract(payload,'$.odds')) AS payload FROM snapshots WHERE t>=? AND t<=? ORDER BY t DESC LIMIT 61";
export const STARTUP_SQL = "SELECT key,value FROM meta WHERE key IN ('health','latest','instrumentsAt','catalog')";
export const PAYLOAD_WRITES = {
  latest: "INSERT INTO meta(key,value) VALUES('latest',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
  catalog: "INSERT INTO meta(key,value) VALUES('catalog',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
  snapshot: "INSERT OR IGNORE INTO snapshots(t,model,payload) VALUES(?,?,?)",
  mapping: "INSERT OR IGNORE INTO mappings(id,created,payload) VALUES(?,?,?)",
} as const;

export function rawJson(body: string, status = 200): Response {
  return new Response(body, { status, headers: {
    "content-type": "application/json", "cache-control": "no-store",
  } });
}

/** Caller authenticates COLLECTOR_SECRET. Payloads stay JSON text until Vercel. */
export async function payloadOperation(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const operation = url.pathname.slice("/internal/payload/".length);
  if (operation === "recent" && request.method === "GET") {
    const to=Number(url.searchParams.get("to")), from=Number(url.searchParams.get("from"));
    if(!url.searchParams.has("to")||!url.searchParams.has("from")||!Number.isSafeInteger(to)||!Number.isSafeInteger(from)||from<0||to<from||to-from>61*60000)
      return rawJson('{"error":"Invalid recent range"}',400);
    const data=await env.DB.prepare(RECENT_SQL).bind(from,to).all<{payload:string}>();
    return rawJson('['+data.results.map(r=>r.payload).reverse().join(',')+']');
  }
  if (operation === "startup" && request.method === "GET") {
    const data = await env.DB.prepare(STARTUP_SQL).all<{ key: string; value: string }>();
    if (url.searchParams.get("encoding") !== "gzip") {
      for (const row of data.results)
        if (row.key === "latest") row.value = await snapshotText(row.value);
    }
    return rawJson(`[${data.results.map((row) =>
      `{"key":${JSON.stringify(row.key)},"value":${row.value}}`).join(",")}]`);
  }
  if (!Object.hasOwn(PAYLOAD_WRITES, operation))
    return rawJson('{"error":"Unknown collector operation"}', 400);
  if (request.method !== "PUT") return rawJson('{"error":"Method not allowed"}', 405);
  const sql = PAYLOAD_WRITES[operation as keyof typeof PAYLOAD_WRITES];
  const params: unknown[] = [];
  if (operation === "snapshot" || operation === "mapping") {
    const t = Number(url.searchParams.get("t"));
    const model = url.searchParams.get("model") ?? "";
    if (!url.searchParams.has("t") || !Number.isSafeInteger(t) || t < 0 || !/^[a-f0-9]{64}$/.test(model))
      return rawJson('{"error":"Invalid archive metadata"}', 400);
    params.push(...(operation === "snapshot" ? [t, model] : [model, t]));
  }
  const body = await readRequestText(request, PAYLOAD_MAX_BYTES);
  // D1 validates/minifies the JSON; the Worker does not parse and re-encode it.
  const jsonSql = sql.replace(/\?(\))/, "json(?)$1");
  try {
    const result = await env.DB.prepare(jsonSql).bind(...params, body).run();
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && /malformed JSON/i.test(error.message))
      return rawJson('{"error":"Invalid JSON"}', 400);
    throw error;
  }
}
