import assert from "node:assert/strict";
import { test } from "node:test";
import { pageMetadata } from "../../src/lib/seo";
import { marketSymbols } from "../../src/lib/mapping";

test("every page declares one canonical URL and its own og:url", () => {
  const m = pageMetadata({
    path: "/markets/BTC-USD",
    title: "BTC",
    description: "Bitcoin perpetual.",
  });
  assert.equal(m.alternates?.canonical, "/markets/BTC-USD");
  // Was the site root on every page, so shares of any page pointed home.
  assert.equal((m.openGraph as { url?: string }).url, "/markets/BTC-USD");
  assert.equal((m.openGraph as { title?: string }).title, "BTC · Leadgap");
  assert.equal(m.title, "BTC");
  // Indexable by default.
  assert.equal(m.robots, undefined);
});

test("pages that should stay out of the index say so but stay crawlable", () => {
  const m = pageMetadata({ path: "/watchlist", title: "Watchlist", index: false });
  assert.deepEqual(m.robots, { index: false, follow: true });
  assert.equal(m.alternates?.canonical, "/watchlist");
});

test("the home page keeps its own title instead of the suffix template", () => {
  const m = pageMetadata({ path: "/", absoluteTitle: "Leadgap — odds against perps" });
  assert.deepEqual(m.title, { absolute: "Leadgap — odds against perps" });
  assert.equal((m.openGraph as { title?: string }).title, "Leadgap — odds against perps");
});

test("the indexable desks are the mapped perpetuals", () => {
  const symbols = marketSymbols();
  assert.ok(symbols.length >= 30, `only ${symbols.length} mapped symbols`);
  assert.ok(symbols.includes("BTC-USD") && symbols.includes("NVDA-USD"));
  assert.equal(new Set(symbols).size, symbols.length, "duplicate symbols");
  for (const s of symbols) assert.match(s, /^[A-Z0-9.]+-USD$/);
});
