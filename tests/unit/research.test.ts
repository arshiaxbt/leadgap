import assert from "node:assert/strict";
import { test } from "node:test";
import { database } from "../helpers/database";
import worker, { handle } from "../../workers/data/index";
import { writeMeta } from "../../workers/data/db";
import { evaluateRules } from "../../workers/data/rules";
import { collect, prune } from "../../workers/data/ingest";
import {
  evaluateAlert,
  WINDOWS,
  type AlertRule,
  type ResearchSnapshot,
  type HistoryBatch,
} from "../../src/lib/research";
import { polymarketReferralUrl } from "../../src/lib/brand";
import { decisionForLocation, geoFromRequest } from "../../src/lib/geo";
import { valueAt } from "../../src/lib/divergence";
import { events, gaps, instruments } from "../e2e/fixtures";
const rule: AlertRule = {
  id: "btc",
  symbol: "BTC-USD",
  eventId: "1",
  window: "4h",
  minScore: 60,
  minGap: 0.01,
  muted: false,
};
const now = 1_800_000_000_000;
function snapshot(): ResearchSnapshot {
  return {
    asOf: now,
    modelVersion: "test",
    instruments,
    tickers: {},
    events,
    markHistory: {},
    oddsHistory: {},
    windows: Object.fromEntries(
      WINDOWS.map((w) => [w, [gaps[0]]]),
    ) as ResearchSnapshot["windows"],
    error: null,
    coverage: { startedAt: now, cadenceMs: 60_000 },
  };
}
function request(
  path: string,
  method = "GET",
  body?: unknown,
  owner = "did:privy:alice",
) {
  return new Request(`https://data.test${path}`, {
    method,
    headers: { authorization: "Bearer test-secret", "x-leadgap-user": owner },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
test("referrals preserve path, invite/query and fragment; external and deceptive hosts stay untouched", () => {
  const url = new URL(
    polymarketReferralUrl(
      "https://polymarket.com/event/abc?c=invite&via=old#market",
    ),
  );
  assert.equal(url.searchParams.get("via"), "arshia");
  assert.equal(url.searchParams.get("c"), "invite");
  assert.equal(url.pathname, "/event/abc");
  assert.equal(url.hash, "#market");
  for (const input of [
    "https://polymarket.com.evil.test/a",
    "https://evil.test",
    "http://polymarket.com/",
    "https://user@polymarket.com/",
  ])
    assert.equal(polymarketReferralUrl(input), input);
});
test("boundary jitter is accepted without admitting half-window data", () => {
  assert.equal(valueAt([{ t: now - 58_000, v: 1 }], 60_000, now), 1);
  assert.equal(valueAt([{ t: now - 30_000, v: 1 }], 60_000, now), null);
  assert.equal(valueAt([{ t: now + 1, v: 1 }], 0, now), null);
});
test("alerts fire once per crossing and preserve state during missing/stale data", () => {
  const first = evaluateAlert(
    rule,
    { matched: false, lastFired: 0 },
    gaps[0],
    now,
    now,
  );
  assert.equal(first.fire, true);
  assert.equal(
    evaluateAlert(rule, first.state, gaps[0], now + 60_000, now).fire,
    false,
  );
  assert.deepEqual(
    evaluateAlert(rule, first.state, undefined, now + 60_000, now).state,
    first.state,
  );
  assert.deepEqual(
    evaluateAlert(
      rule,
      first.state,
      { ...gaps[0], score: 0 },
      now + 100_000,
      now,
    ).state,
    first.state,
  );
  const below = evaluateAlert(
    rule,
    first.state,
    { ...gaps[0], score: 0 },
    now + 60_000,
    now + 60_000,
  );
  assert.equal(
    evaluateAlert(rule, below.state, gaps[0], now + 120_000, now + 120_000)
      .fire,
    false,
  );
  assert.equal(
    evaluateAlert(rule, below.state, gaps[0], now + 1800_000, now + 1800_000)
      .fire,
    true,
  );
});
test("saved research is private, limits are atomic, notifications deduplicate, and mute preserves cooldown", async () => {
  const { db, close } = database(),
    env = { DB: db, DATA_SERVICE_SECRET: "test-secret" };
  try {
    assert.equal(
      (await worker.fetch(new Request("https://data.test/account/rules"), env))
        .status,
      401,
    );
    assert.equal(
      (await handle(request("/account/rules", "PUT", rule), env)).status,
      200,
    );
    await evaluateRules(env, snapshot(), now);
    await evaluateRules(env, snapshot(), now);
    const own = await (
      await handle(request("/account/notifications"), env)
    ).json();
    assert.equal(own.items.length, 1);
    assert.deepEqual(
      (
        await (
          await handle(
            request(
              "/account/notifications",
              "GET",
              undefined,
              "did:privy:bob",
            ),
            env,
          )
        ).json()
      ).items,
      [],
    );
    await handle(
      request(
        `/account/notifications?id=${encodeURIComponent(own.items[0].id)}`,
        "PATCH",
        {},
        "did:privy:bob",
      ),
      env,
    );
    assert.equal(
      (await (await handle(request("/account/notifications"), env)).json())
        .items[0].read,
      false,
    );
    await handle(
      request("/account/rules", "PUT", { ...rule, muted: true }),
      env,
    );
    await handle(request("/account/rules", "PUT", rule), env);
    await evaluateRules(env, snapshot(), now + 60_000);
    assert.equal(
      (await (await handle(request("/account/notifications"), env)).json())
        .items.length,
      1,
    );
    for (let i = 1; i < 20; i++)
      assert.equal(
        (
          await handle(
            request("/account/rules", "PUT", { ...rule, id: `r${i}` }),
            env,
          )
        ).status,
        200,
      );
    assert.equal(
      (
        await handle(
          request("/account/rules", "PUT", { ...rule, id: "over-limit" }),
          env,
        )
      ).status,
      409,
    );
    assert.equal(
      (await handle(request("/account/rules", "PUT", rule), env)).status,
      200,
    );
    await handle(
      request("/account/rules?id=btc", "DELETE", undefined, "did:privy:bob"),
      env,
    );
    assert.equal(
      (await (await handle(request("/account/rules"), env)).json()).items
        .length,
      20,
    );
    await handle(request("/account/rules?id=btc", "DELETE"), env);
    assert.equal(
      await db.prepare("SELECT * FROM alert_state WHERE id='btc'").first(),
      null,
    );
  } finally {
    close();
  }
});
test("retention preserves recent minute data and older five-minute checkpoints", async () => {
  const { db, close } = database(),
    env = { DB: db, DATA_SERVICE_SECRET: "test-secret" };
  try {
    const old = Math.floor((now - 10 * 86400_000) / 300_000) * 300_000;
    const times = [now - 60_000, old, old + 60_000, now - 31 * 86400_000];
    for (const t of times)
      await db
        .prepare("INSERT INTO snapshots VALUES(?,?,?)")
        .bind(t, "v", "{}")
        .run();
    await prune(env, now);
    assert.deepEqual(
      (
        await db.prepare("SELECT t FROM snapshots ORDER BY t").all()
      ).results.map((r) => r.t),
      [old, now - 60_000],
    );
  } finally {
    close();
  }
});
test("collector survives restart, rejects duplicate minute writes and expires stale snapshots", async () => {
  const { db, close } = database(),
    env = { DB: db, DATA_SERVICE_SECRET: "test-secret" };
  const original = globalThis.fetch;
  let time = now;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/instruments"))
      return Response.json([
        {
          instrument_id: 1,
          symbol: "BTC-USD",
          base_asset: "BTC",
          quantity_decimals: 4,
          price_decimals: 2,
        },
      ]);
    if (url.includes("/tickers"))
      return Response.json([
        {
          instrument_id: 1,
          symbol: "BTC-USD",
          mark_price: "100",
          timestamp: time,
        },
      ]);
    if (url.includes("/public-search")) return Response.json({ events: [] });
    if (url.includes("/midpoints")) return Response.json({ "100": "0.65" });
    throw new Error(`Unexpected fetch ${url}`);
  };
  try {
    await writeMeta(db, "catalog", {
      cursor: 0,
      events: { "1": { seen: now, event: events[0] } },
    });
    await collect(env, time);
    assert.deepEqual(await collect(env, time + 1000), {
      skipped: "already-collected",
    });
    time += 58_000; // Same scheduled minute still cannot duplicate.
    assert.deepEqual(await collect(env, time), {
      skipped: "already-collected",
    });
    time = now + 61_000;
    await collect({ ...env }, time);
    const latest = await db
      .prepare("SELECT value FROM meta WHERE key='latest'")
      .first<{ value: string }>();
    const data = JSON.parse(latest!.value) as ResearchSnapshot;
    assert.equal(data.windows["1m"].length, 1);
    assert.equal(data.oddsHistory["1"].length >= 2, true);
    const rows = await db
      .prepare("SELECT payload FROM snapshots")
      .all<{ payload: string }>();
    assert.equal(rows.results.length, 2);
    const batch = JSON.parse(rows.results[0].payload) as HistoryBatch;
    assert.equal(batch.links["1"]["BTC-USD"], 1);
    assert.equal(batch.volumes?.["1"], events[0].volume);
    data.asOf = Date.now() - 100_000;
    await writeMeta(db, "latest", data);
    const stale = await (await handle(request("/snapshot"), env)).json();
    assert.equal(stale.windows["1m"].length, 0);
    assert.match(stale.error, /delayed/);
  } finally {
    globalThis.fetch = original;
    close();
  }
});
test("Netlify location must come from trusted edge context", () => {
  assert.equal(decisionForLocation("US", null, true).blocked, true);
  assert.equal(decisionForLocation("UA", "43", true).blocked, true);
  assert.equal(decisionForLocation("DE", null, true).blocked, false);
  assert.equal(decisionForLocation("XX", null, true).blocked, true);
  const prior = process.env.NETLIFY;
  process.env.NETLIFY = "true";
  try {
    assert.equal(
      geoFromRequest(
        new Request("https://test", {
          headers: { "cf-ipcountry": "DE", "x-vercel-ip-country": "DE" },
        }),
      ).blocked,
      true,
    );
  } finally {
    if (prior === undefined) delete process.env.NETLIFY;
    else process.env.NETLIFY = prior;
  }
});

test("cached snapshot rows expire with either source even while collection timestamp is fresh", async () => {
  const { freshResearchSnapshot } = await import("../../src/lib/research");
  const value = snapshot();
  value.tickers = {
    "BTC-USD": {
      instrumentId: 1,
      symbol: "BTC-USD",
      timestamp: now - 80_000,
      markPrice: 100,
      indexPrice: 100,
      lastPrice: 100,
      midPrice: 100,
      openInterest: 1,
      fundingRate: 0,
      nextFunding: now,
      change1h: null,
    },
  };
  value.oddsHistory = { "1": [{ t: now, v: 0.64 }] };
  assert.equal(freshResearchSnapshot(value, now).windows["4h"].length, 1);
  assert.equal(
    freshResearchSnapshot(value, now + 11_000).windows["4h"].length,
    0,
  );
  value.tickers["BTC-USD"].timestamp = now;
  value.oddsHistory["1"][0].t = now - 91_000;
  assert.equal(freshResearchSnapshot(value, now).windows["4h"].length, 0);
});

test("request limits apply to streamed bodies without Content-Length", async () => {
  const { readRequestText, RequestBodyTooLarge } =
    await import("../../src/lib/request-body");
  assert.equal(
    await readRequestText(
      new Request("https://test", { method: "POST", body: "ok" }),
      2,
    ),
    "ok",
  );
  await assert.rejects(
    readRequestText(
      new Request("https://test", { method: "POST", body: "too-large" }),
      2,
    ),
    RequestBodyTooLarge,
  );
});
