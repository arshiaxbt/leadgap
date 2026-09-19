import type { Database, Result, Statement } from "../../workers/data/db";

type Query = { sql: string; params: unknown[] };

/** The data-service gateway rejects bodies over 512 KB and batches over 32 statements. */
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
  let bytes = 0;
  for (const query of queries) {
    const size = encoder.encode(JSON.stringify(query)).length;
    if (
      current.length &&
      (bytes + size > GATEWAY_CHUNK_BYTES ||
        current.length >= GATEWAY_MAX_STATEMENTS)
    ) {
      chunks.push(current);
      current = [];
      bytes = 0;
    }
    current.push(query);
    bytes += size;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

/** Private, allowlisted D1 bridge for the Node.js collector. */
export function collectorDatabase(origin: string, secret: string): Database {
  async function execute(queries: Query[]): Promise<Result[]> {
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
      const results: Result[] = [];
      for (const chunk of chunkQueries(queries))
        results.push(...(await execute(chunk)));
      return results;
    },
  };
}
