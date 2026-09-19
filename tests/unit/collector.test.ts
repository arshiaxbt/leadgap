import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chunkQueries,
  collectorDatabase,
  GATEWAY_CHUNK_BYTES,
} from "../../src/lib/collector-database";
import { compactRow } from "../../workers/data/ingest";
import { gaps } from "../e2e/fixtures";

const GATEWAY_LIMIT = 524_288;

/** A collector write sized like production on 19 Sep 2026: ~62 rows per window, ~360 KB `latest`. */
function productionSizedWrites() {
  const row = { ...gaps[0]!, title: "x".repeat(60), question: "y".repeat(80) };
  const rows = Array.from({ length: 62 }, (_, i) => ({ ...row, eventId: String(i) }));
  const latest = JSON.stringify({
    windows: Object.fromEntries(
      ["1m", "5m", "15m", "30m", "1h", "4h", "12h", "1d"].map((w) => [w, rows]),
    ),
    instruments: Array.from({ length: 90 }, (_, i) => ({ symbol: `S${i}`, riskTiers: "z".repeat(600) })),
  });
  return [
    { sql: "INSERT OR IGNORE INTO snapshots(t,model,payload) VALUES(?,?,?)", params: [1, "m", "b".repeat(130_000)] },
    { sql: "INSERT OR IGNORE INTO mappings(id,created,payload) VALUES(?,?,?)", params: ["m", 1, "c".repeat(21_000)] },
    { sql: "INSERT INTO meta(key,value) VALUES('catalog',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params: ["d".repeat(40_000)] },
    { sql: "INSERT INTO meta(key,value) VALUES('latest',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params: [latest] },
  ];
}

test("collector writes are split into gateway-sized requests in order", async () => {
  const writes = productionSizedWrites();
  const total = JSON.stringify({ queries: writes }).length;
  const latestSize = JSON.stringify(writes.at(-1)).length;
  assert.ok(total > GATEWAY_LIMIT, `fixture must reproduce the 413 (got ${total})`);
  assert.ok(latestSize > 300_000 && latestSize < 450_000, `latest ${latestSize}`);
  const bodies: { queries: { sql: string }[] }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    const body = String(init?.body);
    assert.ok(body.length < 450_000, `request body ${body.length} bytes`);
    const parsed = JSON.parse(body) as { queries: { sql: string }[] };
    bodies.push(parsed);
    return Response.json(parsed.queries.map((_, i) => ({ results: [], meta: { changes: i } })));
  };
  try {
    const db = collectorDatabase("https://data.test", "collector-secret");
    const results = await db.batch(
      writes.map((w) => db.prepare(w.sql).bind(...w.params)),
    );
    assert.equal(results.length, writes.length);
    assert.ok(bodies.length >= 2);
    const order = bodies.flatMap((b) => b.queries.map((q) => q.sql));
    assert.deepEqual(order, writes.map((w) => w.sql));
    assert.match(order.at(-1)!, /'latest'/);
  } finally {
    globalThis.fetch = original;
  }
});

test("chunks respect the byte budget and the 32-statement cap", () => {
  const small = Array.from({ length: 70 }, (_, i) => ({ sql: "SELECT 1", params: [i] }));
  const chunks = chunkQueries(small);
  assert.deepEqual(chunks.map((c) => c.length), [32, 32, 6]);
  const big = [
    { sql: "A", params: ["x".repeat(GATEWAY_CHUNK_BYTES - 100)] },
    { sql: "B", params: ["y".repeat(1000)] },
  ];
  assert.deepEqual(chunkQueries(big).map((c) => c.map((q) => q.sql)), [["A"], ["B"]]);
});

test("compact rows keep six significant digits", () => {
  const row = compactRow({
    ...gaps[0]!,
    oddsMove: 0.0351234567,
    perpMove: 0.00412345678,
    gap: 0.0309999999,
    catchup: null,
  });
  assert.equal(row.oddsMove, 0.0351235);
  assert.equal(row.perpMove, 0.00412346);
  assert.equal(row.gap, 0.031);
  assert.equal(row.catchup, null);
  assert.equal(row.score, gaps[0]!.score);
});
