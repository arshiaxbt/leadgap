import assert from "node:assert/strict";
import { test } from "node:test";
import { readHistoryPages } from "../../src/lib/history-pages";
import type { HistoryBatch } from "../../src/lib/research";
const batch = (t: number): HistoryBatch => ({ t, modelVersion: "m", marks: {}, odds: {}, links: {} });
const query = () => new URLSearchParams({ from: "0", to: "360", eventId: "1", symbol: "BTC-USD" });

test("history follows every page without skipping or duplicating observations", async () => {
  const data = await readHistoryPages(query(), async (path) => {
    const p = new URL(path, "https://data.test").searchParams;
    assert.equal(p.get("limit"), "100");
    const cursor = Number(p.get("cursor"));
    const rows = Array.from({ length: Math.min(100, 361 - cursor) }, (_, i) => batch(cursor + i));
    return { batches: rows, nextCursor: rows.length === 100 ? cursor + 100 : null };
  });
  assert.deepEqual(data.batches.map((b) => b.t), Array.from({ length: 361 }, (_, i) => i));
  assert.equal(data.nextCursor, null);
});

test("history rejects failed pages, overlapping observations and stuck cursors", async () => {
  await assert.rejects(readHistoryPages(query(), async () => { throw new Error("unavailable"); }), /unavailable/);
  await assert.rejects(readHistoryPages(query(), async () => ({ batches: [batch(1)], nextCursor: 0 })), /cursor/);
  await assert.rejects(readHistoryPages(query(), async () => ({ batches: [batch(1), batch(1)], nextCursor: null })), /observations/);
});
