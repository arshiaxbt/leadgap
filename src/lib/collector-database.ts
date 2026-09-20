import { gzipSync } from "node:zlib";
import { decodeStoredSnapshot } from "./snapshot-storage";
import { SNAPSHOT_ENCODING } from "../../workers/data/snapshot-codec";
import { PAYLOAD_MAX_BYTES, PAYLOAD_WRITES, STARTUP_SQL, RECENT_SQL } from "../../workers/data/payloads";
import type { Database, Result, Statement } from "../../workers/data/db";

type Query = { sql: string; params: unknown[] };

/** Complete JSON envelope budget for small operations; large writes use raw payloads. */
export const GATEWAY_CHUNK_BYTES = 400_000;
const GATEWAY_MAX_STATEMENTS = 32;
const encoder = new TextEncoder();

/**
 * Split a batch into gateway-sized requests, preserving order. Collector
 * writes are idempotent upserts, so a partial failure is retried next minute.
 */
export function chunkQueries(queries: Query[]): Query[][] {
  const chunks: Query[][] = [];
  let current: Query[] = [];
  const envelopeBytes = encoder.encode(JSON.stringify({ queries: [] })).length;
  let bytes = envelopeBytes;
  for (const query of queries) {
    const size = encoder.encode(JSON.stringify(query)).length;
    if (size + envelopeBytes > GATEWAY_CHUNK_BYTES)
      throw new Error("Collector operation exceeds gateway byte budget");
    if (
      current.length &&
      (bytes + size + 1 > GATEWAY_CHUNK_BYTES ||
        current.length >= GATEWAY_MAX_STATEMENTS)
    ) {
      chunks.push(current);
      current = [];
      bytes = envelopeBytes;
    }
    bytes += size + (current.length ? 1 : 0);
    current.push(query);
  }
  if (current.length) chunks.push(current);
  return chunks;
}

/** Private, allowlisted D1 bridge for the Node.js collector. */
export function collectorDatabase(origin: string, secret: string): Database {
  async function executeLegacy(queries: Query[]): Promise<Result[]> {
    const response = await fetch(new URL("/internal/database", origin), {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ queries }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok)
      throw new Error(`Collector storage unavailable (${response.status})`);
    return response.json() as Promise<Result[]>;
  }
  async function payload(url: URL, body?: string): Promise<unknown> {
    if (body !== undefined && encoder.encode(body).length > PAYLOAD_MAX_BYTES)
      throw new Error("Collector payload exceeds storage byte budget");
    const response = await fetch(url, {
      method: body === undefined ? "GET" : "PUT",
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body,
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error(`Collector storage unavailable (${response.status})`);
    return response.json();
  }
  async function execute(queries: Query[]): Promise<Result[]> {
    const results: Result[] = [];
    let pending: Query[] = [];
    async function flush() {
      for (const chunk of chunkQueries(pending)) results.push(...await executeLegacy(chunk));
      pending = [];
    }
    for (const query of queries) {
      if(query.sql === RECENT_SQL) {
        await flush();
        const url=new URL('/internal/payload/recent',origin);
        url.searchParams.set('from',String(query.params[0]));url.searchParams.set('to',String(query.params[1]));
        const rows=await payload(url) as unknown[];
        results.push({results:rows.map(value=>({payload:JSON.stringify(value)})),meta:{}});
        continue;
      }
      const operation = Object.entries(PAYLOAD_WRITES).find(([, sql]) => sql === query.sql)?.[0];
      if (!operation && query.sql !== STARTUP_SQL) { pending.push(query); continue; }
      await flush();
      const url = new URL(`/internal/payload/${operation ?? "startup"}`, origin);
      if (!operation) {
        url.searchParams.set("encoding", "gzip");
        const rows = await payload(url) as { key: string; value: unknown }[];
        results.push({ results: rows.map((r) => {
          const value = JSON.stringify(r.key === "latest" ? decodeStoredSnapshot(r.value) : r.value);
          return { key: r.key, value };
        }), meta: {} });
      } else {
        if (operation === "snapshot" || operation === "mapping") {
          const [first, second] = query.params;
          url.searchParams.set("t", String(operation === "snapshot" ? first : second));
          url.searchParams.set("model", String(operation === "snapshot" ? second : first));
        }
        const body = query.params.at(-1);
        if (typeof body !== "string") throw new Error("Invalid collector payload");
        if (encoder.encode(body).length > PAYLOAD_MAX_BYTES)
          throw new Error("Collector payload exceeds storage byte budget");
        const encoded = operation === "latest"
          ? JSON.stringify({ _leadgapEncoding: SNAPSHOT_ENCODING, data: gzipSync(body).toString("base64") })
          : body;
        results.push(await payload(url, encoded) as Result);
      }
    }
    await flush();
    return results;
  }
  class RemoteStatement implements Statement {
    constructor(readonly query: Query) {}
    bind(...params: unknown[]): RemoteStatement {
      return new RemoteStatement({ ...this.query, params });
    }
    async first<T = Record<string, unknown>>(
      column?: string,
    ): Promise<T | null> {
      const [result] = await execute([this.query]);
      const row = result.results[0];
      return (row ? (column ? row[column] : row) : null) as T | null;
    }
    async all<T = Record<string, unknown>>(): Promise<Result<T>> {
      return (await execute([this.query]))[0] as Result<T>;
    }
    async run(): Promise<Result> {
      return (await execute([this.query]))[0];
    }
  }
  return {
    prepare: (sql) => new RemoteStatement({ sql, params: [] }),
    batch: async (statements) => {
      const queries = statements.map((statement) => {
        if (!(statement instanceof RemoteStatement))
          throw new Error("Invalid collector statement");
        return statement.query;
      });
      return execute(queries);
    },
  };
}
