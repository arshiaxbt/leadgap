export type Result<T = Record<string, unknown>> = {
  results: T[];
  meta: {
    changes?: number;
    rows_read?: number;
    rows_written?: number;
    size_after?: number;
  };
};
export type Statement = {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<Result<T>>;
  run(): Promise<Result>;
};
export type Database = {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<Result[]>;
};
export type Env = {
  DB: Database;
  DATA_SERVICE_SECRET: string;
  INGEST_ENABLED?: string;
};
export async function readMeta<T>(
  db: Database,
  key: string,
): Promise<T | null> {
  const row = await db
    .prepare("SELECT value FROM meta WHERE key=?")
    .bind(key)
    .first<{ value: string }>();
  return row ? (JSON.parse(row.value) as T) : null;
}
export async function writeMeta(db: Database, key: string, value: unknown) {
  return db
    .prepare(
      "INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    )
    .bind(key, JSON.stringify(value))
    .run();
}
