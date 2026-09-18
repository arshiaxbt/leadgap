import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync } from "node:fs";
import type { Database, Statement, Result } from "../../workers/data/db";
/** Exercises the actual SQLite statements, constraints and transaction boundaries. */
export function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync("workers/data/migrations/0001.sql", "utf8"));
  const operations = new WeakMap<Statement, () => Result>();
  const db: Database = {
    prepare(sql) {
      let params: SQLInputValue[] = [];
      const run = () => {
        const s = sqlite.prepare(sql);
        if (sql.trim().toUpperCase().startsWith("SELECT"))
          return { results: s.all(...params), meta: {} };
        const r = s.run(...params);
        return { results: [], meta: { changes: Number(r.changes) } };
      };
      const statement: Statement = {
        bind(...values) {
          params = values as SQLInputValue[];
          return statement;
        },
        async first<T>() {
          return (sqlite.prepare(sql).get(...params) ?? null) as T | null;
        },
        async all<T>() {
          return run() as Result<T>;
        },
        async run() {
          return run();
        },
      };
      operations.set(statement, run);
      return statement;
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map((s) => operations.get(s)!());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { db, close: () => sqlite.close() };
}
