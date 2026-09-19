import type { Database } from "./db";
import { rawJson } from "./payloads";

/** Project in D1, before large archive documents reach the Worker isolate. */
export async function historyResponse(url: URL, db: Database): Promise<Response> {
  const p = url.searchParams;
  const from = Number(p.get("from")), to = Number(p.get("to"));
  const cursor = Number(p.get("cursor") ?? from);
  const symbol = p.get("symbol"), event = p.get("eventId");
  // Legacy callers read one page of up to 500; updated consumers request 100.
  const limit = Number(p.get("limit") ?? 500);
  if (!p.has("from") || !p.has("to") || !Number.isSafeInteger(from) ||
      !Number.isSafeInteger(to) || from < 0 || to <= from || to - from > 31 * 86400_000 ||
      !Number.isSafeInteger(cursor) || cursor < from || ![100, 500].includes(limit) ||
      (symbol !== null && !/^[A-Z0-9._-]{1,40}$/.test(symbol)) ||
      (event !== null && !/^\d{1,80}$/.test(event)))
    return rawJson('{"error":"Invalid history query"}', 400);
  const params: unknown[] = [];
  const projections: string[] = [];
  if (symbol) {
    projections.push("'$.marks', json((SELECT json_group_object(key,json(value)) FROM json_each(payload,'$.marks') WHERE key=?))");
    params.push(symbol);
  }
  if (event) {
    for (const field of ["odds", "volumes"]) {
      projections.push(`'$.${field}', json((SELECT json_group_object(key,value) FROM json_each(payload,'$.${field}') WHERE key=?))`);
      // Arrays need json(value), whereas volume is a scalar.
      if (field === "odds") projections[projections.length - 1] = projections.at(-1)!.replace("key,value", "key,json(value)");
      params.push(event);
    }
  }
  if (symbol || event) {
    projections.push(`'$.links', json((SELECT json_group_object(e.key, json(${symbol
      ? "(SELECT json_group_object(s.key,s.value) FROM json_each(e.value) s WHERE s.key=?)"
      : "e.value"})) FROM json_each(payload,'$.links') e ${event ? "WHERE e.key=?" : ""}))`);
    if (symbol) params.push(symbol);
    if (event) params.push(event);
  }
  const value = projections.length ? `json_set(payload,${projections.join(",")})` : "payload";
  const result = await db.prepare(
    `SELECT t,${value} AS payload FROM snapshots WHERE t>=? AND t<=? ORDER BY t LIMIT ?`,
  ).bind(...params, Math.max(from, cursor), to, limit).all<{ t: number; payload: string }>();
  const next = result.results.length === limit ? result.results.at(-1)!.t + 1 : null;
  return rawJson(`{"batches":[${result.results.map((r) => r.payload).join(",")}],"nextCursor":${next}}`);
}
