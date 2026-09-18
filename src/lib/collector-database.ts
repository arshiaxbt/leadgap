import type { Database, Result, Statement } from "../../workers/data/db";

type Query = { sql: string; params: unknown[] };

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
    batch: (statements) =>
      execute(
        statements.map((statement) => {
          if (!(statement instanceof RemoteStatement))
            throw new Error("Invalid collector statement");
          return statement.query;
        }),
      ),
  };
}
