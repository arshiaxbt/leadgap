import assert from "node:assert/strict";
import { test } from "node:test";
import { researchSnapshot } from "../../src/lib/data-service";
import { WINDOWS } from "../../src/lib/research";
import { gaps } from "../e2e/fixtures";

test("raw snapshot reads still remove stale data on the Vercel boundary", async () => {
  const originalFetch = globalThis.fetch, originalNow = Date.now;
  const previousUrl = process.env.DATA_SERVICE_URL, previousSecret = process.env.DATA_SERVICE_SECRET;
  let now = 1_800_000_000_000;
  const asOf = now;
  process.env.DATA_SERVICE_URL = "https://data.test";
  process.env.DATA_SERVICE_SECRET = "test-secret";
  Date.now = () => now;
  globalThis.fetch = async (url) => {
    assert.equal(String(url), "https://data.test/snapshot/raw");
    return Response.json({ asOf, error: null,
      windows: Object.fromEntries(WINDOWS.map((w) => [w, [{ ...gaps[0], window: w }]])),
      tickers: { "BTC-USD": { timestamp: asOf } }, oddsHistory: { "1": [{ t: asOf }] },
    });
  };
  try {
    assert.equal((await researchSnapshot()).windows["1h"].length, 1);
    now += 95_000;
    const stale = await researchSnapshot();
    assert.equal(stale.error, "Data collection is delayed.");
    assert.ok(Object.values(stale.windows).every((rows) => rows.length === 0));
  } finally {
    globalThis.fetch = originalFetch; Date.now = originalNow;
    if (previousUrl === undefined) delete process.env.DATA_SERVICE_URL; else process.env.DATA_SERVICE_URL = previousUrl;
    if (previousSecret === undefined) delete process.env.DATA_SERVICE_SECRET; else process.env.DATA_SERVICE_SECRET = previousSecret;
  }
});
