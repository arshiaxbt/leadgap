import assert from "node:assert/strict";
import { test } from "node:test";
import { parseYesPrice, parseTokenIds, bestMarket } from "../../src/lib/gamma";
import { validateOrder, type OrderDraft } from "../../src/lib/order-validation";
import { formatOrderQty, formatCloseQty } from "../../src/lib/format";
import {
  leadgapMetrics,
  isActionable,
  scoreBreakdown,
} from "../../src/lib/score";
import { geoFromRequest } from "../../src/lib/geo";
import { allowRequest } from "../../src/lib/rate-limit";

const draft: OrderDraft = {
  quoteTimestamp: Date.now(),
  side: "BUY",
  tif: "GTC",
  quantity: 1,
  price: 100,
  limitPrice: "100",
  minNotional: 10,
  priceDecimals: 2,
  leverage: 2,
  maxLeverage: 10,
  takeProfit: "",
  stopLoss: "",
};

test("binary odds and tokens respect outcome order", () => {
  const market = {
    outcomes: '["No","Yes"]',
    outcomePrices: '["0.2","0.8"]',
    clobTokenIds: '["no-token","yes-token"]',
  };
  assert.equal(parseYesPrice(market), 0.8);
  assert.deepEqual(parseTokenIds(market), { yes: "yes-token", no: "no-token" });
});
test("malformed, nonbinary and out-of-range odds cannot become signals", () => {
  for (const m of [
    { outcomePrices: '{"0":"0.8"}' },
    { outcomePrices: '["NaN"]' },
    { outcomePrices: '["1.1"]' },
    { outcomes: '["A","B"]', outcomePrices: '["0.5","0.5"]' },
  ])
    assert.equal(parseYesPrice(m), null);
  assert.equal(parseYesPrice({ outcomePrices: '["0","1"]' }), 0);
});
test("closed and inactive markets are excluded from event selection", () => {
  const valid = { volume: 10, outcomePrices: '["0.4","0.6"]' };
  assert.equal(
    bestMarket({
      id: "1",
      slug: "a",
      title: "a",
      markets: [{ ...valid, volume: 100, active: false }, valid],
    }),
    valid,
  );
});
test("quantity is floored to the market step", () => {
  assert.equal(formatOrderQty(1.239, 2), "1.23");
  assert.equal(formatOrderQty(0.00001, 2), "0");
  assert.equal(formatOrderQty(Infinity, 2), "0");
  assert.equal(formatCloseQty("-1.239", 2), "1.23");
});
test("valid orders pass and malformed input cannot reach submission", () => {
  assert.equal(validateOrder(draft), null);
  for (const edit of [
    { quoteTimestamp: Date.now() - 100_000 },
    { quoteTimestamp: NaN },
    { quantity: 0 },
    { quantity: Infinity },
    { price: NaN },
    { price: 0 },
    { limitPrice: "" },
    { limitPrice: "-3" },
    { limitPrice: "1e2" },
    { limitPrice: "100.123" },
    { quantity: 0.01 },
    { leverage: 11 },
    { leverage: 1.5 },
    { takeProfit: "oops" },
    { takeProfit: "90" },
    { stopLoss: "110" },
  ])
    assert.ok(validateOrder({ ...draft, ...edit }), JSON.stringify(edit));
  assert.equal(validateOrder({ ...draft, tif: "IOC", limitPrice: "" }), null);
  assert.equal(
    validateOrder({
      ...draft,
      side: "SELL",
      takeProfit: "90",
      stopLoss: "110",
    }),
    null,
  );
  assert.ok(validateOrder({ ...draft, side: "SELL", takeProfit: "110" }));
});
test("model score is bounded and breakdown sums to the published score", () => {
  for (const oddsMove of [-0.3, -0.03, 0, 0.03, 0.3]) {
    const input = {
      oddsMove,
      perpMove: 0.002,
      signedBeta: 1,
      confidence: 0.8,
      volume: 100000,
    };
    const result = leadgapMetrics(input);
    assert.ok(result.score >= 0 && result.score <= 100);
    assert.equal(result.gap, result.expected - result.actual);
    assert.equal(
      scoreBreakdown({ ...input, ...result }).reduce((n, p) => n + p.points, 0),
      result.score,
    );
  }
  assert.equal(isActionable({ gap: 0.03, bias: "none", score: 90, catchup: 0 }), false);
  assert.equal(isActionable({ gap: 0.03, bias: "long", score: 90, catchup: 0.9 }), false);
});
test("Vercel geo decisions ignore untrusted Cloudflare headers", () => {
  const previous = process.env.VERCEL;
  process.env.VERCEL = "1";
  try {
    assert.equal(
      geoFromRequest(
        new Request("https://example.com", {
          headers: { "x-vercel-ip-country": "US", "cf-ipcountry": "DE" },
        }),
      ).blocked,
      true,
    );
    assert.equal(
      geoFromRequest(
        new Request("https://example.com", {
          headers: { "cf-ipcountry": "DE" },
        }),
      ).blocked,
      true,
    );
    assert.equal(
      geoFromRequest(
        new Request("https://example.com", {
          headers: { "x-vercel-ip-country": "DE" },
        }),
      ).blocked,
      false,
    );
  } finally {
    if (previous === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous;
  }
});
test("rate limit allows the budget and rejects the next request", () => {
  const key = `test-${Date.now()}`;
  assert.equal(allowRequest(key, 2), true);
  assert.equal(allowRequest(key, 2), true);
  assert.equal(allowRequest(key, 2), false);
});

test("window comparisons reject incomplete or arbitrarily old history", async () => {
  const { valueAt } = await import("../../src/lib/divergence");
  const now = 1_000_000;
  assert.equal(valueAt([{ t: now - 30_000, v: 1 }], 60_000, now), null);
  assert.equal(valueAt([{ t: now - 500_000, v: 1 }], 60_000, now), null);
  assert.equal(
    valueAt(
      [
        { t: now - 65_000, v: 1 },
        { t: now, v: 2 },
      ],
      60_000,
      now,
    ),
    1,
  );
  assert.equal(valueAt([{ t: now - 100_000, v: 1 }], 0, now), null);
});

test("execution validates first, applies leverage, and omits price for market orders", async () => {
  const { submitPerpOrder } = await import("../../src/lib/submit-order");
  const calls: { method: string; request: unknown }[] = [];
  const session = {
    updateLeverage: async (request: unknown) => {
      calls.push({ method: "leverage", request });
    },
    placeOrder: async (request: unknown) => {
      calls.push({ method: "order", request });
      return { order: { id: 1, status: "open" } };
    },
  } as unknown as Parameters<typeof submitPerpOrder>[0];
  const input = {
    ...draft,
    instrumentId: 1,
    quantityText: "1",
    reduceOnly: false,
    isolatedOnly: true,
  };
  await assert.rejects(() =>
    submitPerpOrder(session, { ...input, quantity: 0 }),
  );
  assert.equal(calls.length, 0);
  await submitPerpOrder(session, { ...input, tif: "IOC", limitPrice: "" });
  assert.deepEqual(
    calls.map((c) => c.method),
    ["leverage", "order"],
  );
  assert.deepEqual(calls[0].request, {
    instrumentId: 1,
    leverage: 2,
    crossMargin: false,
  });
  assert.equal("price" in (calls[1].request as object), false);
  calls.length = 0;
  await submitPerpOrder(session, {
    ...input,
    reduceOnly: true,
    takeProfit: "110",
    stopLoss: "90",
  });
  assert.deepEqual(
    calls.map((c) => c.method),
    ["order"],
  );
  assert.equal((calls.at(-1)!.request as { price: string }).price, "100");
});
