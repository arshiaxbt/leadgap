import assert from "node:assert/strict";
import { test } from "node:test";
import { liveCache, publicCache, snapshotTtl } from "../../src/lib/http-cache";

test("public market data is cacheable by the CDN but revalidated by browsers", () => {
  const h = publicCache(20);
  assert.match(h["cache-control"]!, /^public, max-age=0, must-revalidate, s-maxage=20, stale-while-revalidate=40$/);
  assert.equal(h["cdn-cache-control"], "max-age=20, stale-while-revalidate=40");
});

test("a snapshot is reused until the next collection is due", () => {
  const asOf = 1_800_000_000_000;
  // Just collected: hold it for most of the minute, capped at 25s.
  assert.equal(snapshotTtl(asOf, asOf + 1_000), 25_000);
  assert.equal(snapshotTtl(asOf, asOf + 40_000), 20_000);
  // Next snapshot almost due, then overdue: poll again quickly so recovery is fast.
  assert.equal(snapshotTtl(asOf, asOf + 55_000), 8_000);
  assert.equal(snapshotTtl(asOf, asOf + 120_000), 8_000);
  // Never long enough to serve rows past the 90s staleness cutoff.
  for (const age of [0, 10_000, 30_000, 59_000])
    assert.ok(age + snapshotTtl(asOf, asOf + age) < 90_000, `age ${age}`);
  assert.equal(snapshotTtl(0, asOf), 8_000);
  assert.equal(snapshotTtl(Number.NaN, asOf), 8_000);
});

test("a live feed is cached only until the next collection lands", () => {
  const asOf = 1_800_000_000_000;
  const seconds = (h: Record<string, string>) =>
    Number(/s-maxage=(\d+)/.exec(h["cache-control"]!)![1]);
  // Fresh snapshot: capped, not held for the whole minute.
  assert.equal(seconds(liveCache(asOf, asOf + 5_000)), 20);
  // Late in the cycle: only until the next one is due, with a small floor.
  assert.equal(seconds(liveCache(asOf, asOf + 45_000)), 15);
  assert.equal(seconds(liveCache(asOf, asOf + 58_000)), 5);
  assert.equal(seconds(liveCache(asOf, asOf + 120_000)), 5);
  assert.equal(seconds(liveCache(0, asOf)), 5);
  // Served age stays clear of the 90s cutoff: cached lifetime plus the
  // stale-while-revalidate window can never age a response that far.
  for (let age = 0; age < 60_000; age += 1_000) {
    const h = liveCache(asOf, asOf + age);
    assert.ok(age / 1_000 + seconds(h) + 5 <= 70, `age ${age}`);
    assert.match(h["cdn-cache-control"]!, /stale-while-revalidate=5$/);
  }
});
