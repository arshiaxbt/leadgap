import assert from "node:assert/strict";
import { test } from "node:test";
import { priceEligibility, eligibleMarket } from "../../src/lib/eligibility";
import {
  executionEvidence,
  summarizeBook,
  timingEvidence,
} from "../../src/lib/signal-evidence";
import { linkModel, impliedMove } from "../../src/lib/sensitivity";
import { isActionable } from "../../src/lib/score";
import { replaySnapshot, replayReport } from "../../src/lib/replay";
import { SIGNAL_POLICY } from "../../src/lib/signal-policy";
import { ANNUAL_VOL } from "../../src/lib/sensitivity";
import { currentSnapshot } from "../../src/lib/snapshot-upgrade";
import { gaps, instruments, events } from "../e2e/fixtures";
import type { HistoryBatch, ResearchSnapshot } from "../../src/lib/research";
import { WINDOWS } from "../../src/lib/research";
import type { PerpsTicker } from "../../src/lib/types";
const now = 1800000000000,
  endsAt = now + 7 * 86400000;

test("v5 rejects audited non-price links and cross-asset parent titles", () => {
  for (const [q, s] of [
    ["Will Google release Gemini 4.0 by December?", "GOOG-USD"],
    ["Will Erling Haaland be the most searched person on Google?", "GOOG-USD"],
    ["Will Trump say Qualcomm this week?", "QCOM-USD"],
    ["Will Bitcoin be the best performing asset in 2026?", "GOLD-USD"],
    ["Will the Strait of Hormuz reopen?", "CL-USD"],
    ["Will Bitcoin outperform gold above $100000?", "BTC-USD"],
    ["Will Bitcoin market cap reach $2 trillion?", "BTC-USD"],
    ["Will Ethereum reach $5000 and Bitcoin reach $100000?", "ETH-USD"],
  ])
    assert.equal(priceEligibility(q, s, 100, endsAt).eligible, false, q);
  assert.equal(
    priceEligibility(
      "Will Bitcoin be above $100000 on September 30?",
      "BTC-USD",
      100000,
      endsAt,
    ).eligible,
    true,
  );
  assert.equal(
    priceEligibility("Will Bitcoin be above $100000?", "BTC-USD", 100000, null)
      .eligible,
    false,
  );
});

test("selects an eligible child instead of the highest-volume unsupported question", () => {
  const base = {
    active: true,
    closed: false,
    outcomePrices: '["0.5","0.5"]',
    outcomes: '["Yes","No"]',
    clobTokenIds: '["1","2"]',
    endDate: new Date(endsAt).toISOString(),
  };
  const event = {
    id: "1",
    slug: "btc",
    title: "Bitcoin",
    markets: [
      {
        ...base,
        id: "bad",
        volume: "999999",
        question: "Will Bitcoin outperform gold?",
      },
      {
        ...base,
        id: "good",
        volume: "5000",
        question: "Will Bitcoin be above $100000 on September 30?",
      },
    ],
  };
  assert.equal(
    eligibleMarket(event, ["BTC-USD"], { "BTC-USD": 100000 }, now)?.id,
    "good",
  );
});

function series(lag: number) {
  const model = linkModel({
    question: "Will Bitcoin be above $100000 on September 30?",
    symbol: "BTC-USD",
    mark: 100000,
    baseBeta: 1,
    mappingKind: "named",
    endsAt,
    now,
  });
  assert.notEqual(model.kind, "drop");
  if (model.kind === "drop") throw Error("model");
  const probabilities = Array.from(
    { length: 61 },
    (_, i) => 0.5 + 0.012 * Math.sin(i * 2.1) + 0.008 * Math.sin(i * i * 0.73),
  );
  const moves = probabilities.map((p, i) =>
    i
      ? impliedMove(
          model,
          probabilities[i - 1],
          p,
          now - (61 - i) * 60000,
          now - (60 - i) * 60000,
        )
      : 0,
  );
  let mark = 100000;
  const batches: HistoryBatch[] = probabilities.map((p, i) => {
    if (i) mark *= 1 + (moves[i - lag] ?? 0);
    const t = now - (60 - i) * 60000;
    return {
      t,
      modelVersion: "test",
      links: { "1": { "BTC-USD": 1 } },
      odds: { "1": [t, p, "token"] },
      marks: { "BTC-USD": [t, mark] },
    };
  });
  return { batches, model };
}
test("timing distinguishes odds-first, perp-first and simultaneous movement", () => {
  for (const [lag, status] of [
    [2, "odds-leads"],
    [-2, "perp-leads"],
    [0, "simultaneous"],
  ] as const) {
    const { batches, model } = series(lag),
      r = timingEvidence(batches, "1", "BTC-USD", "token", model, 3600000, now);
    assert.equal(r.status, status, JSON.stringify(r));
    assert.equal(r.lagMinutes, lag);
  }
});
test("timing rejects short, flat, sparse, future and token-switched history", () => {
  const { batches, model } = series(2);
  const timing = (b: HistoryBatch[], ms = 3600000) =>
    timingEvidence(b, "1", "BTC-USD", "token", model, ms, now);
  assert.equal(timing(batches, 300000).status, "unknown");
  assert.equal(timing(batches.filter((_, i) => i % 3 === 0)).status, "unknown");
  assert.equal(
    timing(batches.map((b) => ({ ...b, odds: { "1": [b.t, 0.5, "other"] } })))
      .status,
    "unknown",
  );
  assert.equal(
    timing(batches.map((b) => ({ ...b, marks: { "BTC-USD": [b.t + 1, 100] } })))
      .status,
    "unknown",
  );
  assert.equal(
    timing(batches.map((b) => ({ ...b, marks: { "BTC-USD": [b.t, 100] } })))
      .status,
    "unknown",
  );
  assert.deepEqual(
    timing([...batches, { ...batches[0], t: now + 60000 }]),
    timing(batches),
  );
});
const ticker = {
  timestamp: now,
  fundingRate: 0.001,
  nextFunding: now + 60000,
} as PerpsTicker;
const instrument = {
  ...instruments[0],
  quantityDecimals: 3,
  minNotional: "5",
  fundingInterval: "1h",
};
const book = {
  instrumentId: 1,
  timestamp: now,
  bids: [{ price: 99.9, quantity: 3 }],
  asks: [{ price: 100.1, quantity: 3 }],
};
const prior = { at: now - 1800000, bid: 0.49, ask: 0.5 },
  current = { at: now, bid: 0.54, ask: 0.55 };
test("$100 benchmark accounts for both sides, taker fees and adverse funding", () => {
  const q = summarizeBook(book, instrument, ticker, 0.0004, now);
  assert.equal(q.quantity, 1);
  assert.equal(q.notional, 100);
  const r = executionEvidence(q, current, prior, 0.05, "long", now);
  assert.equal(r.status, "pass");
  assert.ok(Math.abs(r.totalCost! - 0.0038) < 1e-10);
  assert.equal(
    executionEvidence(q, current, prior, 0.05, "short", now).fundingCost,
    0,
  );
  assert.equal(
    executionEvidence(q, current, prior, 0.001, "long", now).status,
    "fail",
  );
  assert.equal(
    executionEvidence(
      { ...q, takerFee: null },
      current,
      prior,
      0.05,
      "long",
      now,
    ).status,
    "unknown",
  );
  assert.equal(
    executionEvidence(q, current, undefined, 0.05, "long", now).status,
    "unknown",
  );
  assert.equal(
    executionEvidence({ ...q, buy: null }, current, prior, 0.05, "long", now)
      .status,
    "fail",
  );
  assert.equal(
    executionEvidence(q, { ...current, ask: 0.58 }, prior, 0.05, "long", now)
      .status,
    "fail",
  );
  assert.equal(
    executionEvidence({ ...q, at: now + 1 }, current, prior, 0.05, "long", now)
      .status,
    "unknown",
  );
  assert.equal(
    summarizeBook(
      book,
      { ...instrument, minNotional: "101" },
      ticker,
      0.0004,
      now,
    ).valid,
    false,
  );
});
test("large gaps never qualify with unknown or failed evidence", () => {
  const row = {
    ...gaps[0],
    score: 90,
    bias: "long" as const,
    gap: 0.03,
    catchup: 0.1,
  };
  assert.equal(isActionable(row), true);
  assert.equal(isActionable({ ...row, timing: undefined }), false);
  assert.equal(isActionable({ ...row, eligibility: undefined }), false);
  assert.equal(
    isActionable({
      ...row,
      execution: { ...row.execution!, status: "unknown" },
    }),
    false,
  );
  assert.equal(isActionable({ ...row, gap: 0.0001 }), false);
});
test("v5 replay preserves unknown evidence and refuses policy mismatch", () => {
  const { batches } = series(2),
    current = batches.at(-1)!;
  const mapping = {
    scoreVersion: "heuristic-v5",
    events: [
      {
        ...events[0],
        question: "Will Bitcoin be above $100000 on September 30?",
        endsAt,
        yesTokenId: "token",
      },
    ],
    policy: SIGNAL_POLICY,
    annualVol: ANNUAL_VOL,
  };
  const replay = replaySnapshot(current, batches.slice(0, -1), mapping);
  assert.ok(replay.windows["30m"].length);
  assert.equal(replay.windows["30m"][0].execution?.status, "unknown");
  assert.throws(
    () => replaySnapshot(current, batches, { ...mapping, policy: {} }),
    /policy/,
  );
  assert.equal(
    replayReport({ batches, mappings: { test: mapping } }).status,
    "insufficient-data",
  );
});
test("legacy snapshots are read with strict eligibility and cannot inherit candidate status", () => {
  const s: ResearchSnapshot = {
    asOf: now,
    modelVersion: "v4",
    events: [{ ...events[0], question: "Will Google release Gemini?" }],
    instruments: [],
    tickers: {},
    markHistory: {},
    oddsHistory: {},
    error: null,
    coverage: { startedAt: now, cadenceMs: 60000 },
    windows: Object.fromEntries(
      WINDOWS.map((w) => [w, [gaps[0]]]),
    ) as ResearchSnapshot["windows"],
  };
  const upgraded = currentSnapshot(s);
  assert.equal(upgraded.events.length, 0);
  assert.equal(upgraded.windows["4h"].length, 0);
  assert.equal(s.windows["4h"].length, 1);
});

test("bounded recent history is collector-only and filtered history isolates evidence", async () => {
  const { database } = await import("../helpers/database");
  const { handle } = await import("../../workers/data/index");
  const { db, close } = database();
  const env = {
    DB: db,
    DATA_SERVICE_SECRET: "app",
    COLLECTOR_SECRET: "collector",
  };
  try {
    for (let i = 0; i < 65; i++)
      await db
        .prepare("INSERT INTO snapshots(t,model,payload) VALUES(?,?,?)")
        .bind(
          i * 60000,
          "m",
          JSON.stringify({
            t: i * 60000,
            modelVersion: "m",
            marks: { "BTC-USD": [i * 60000, 100] },
            odds: { "1": [i * 60000, 0.5, "token"] },
            links: { "1": { "BTC-USD": 1 } },
            evidence: {
              odds: { "1": prior, "2": current },
              perps: { "BTC-USD": { valid: true }, "ETH-USD": { valid: true } },
            },
          }),
        )
        .run();
    const request = (path: string, secret: string) =>
      new Request("https://data.test" + path, {
        headers: { authorization: `Bearer ${secret}` },
      });
    assert.equal(
      (
        await handle(
          request("/internal/payload/recent?from=0&to=3660000", "app"),
          env,
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await handle(
          request("/internal/payload/recent?from=0&to=9999999", "collector"),
          env,
        )
      ).status,
      400,
    );
    const recent = await (
      await handle(
        request("/internal/payload/recent?from=0&to=3660000", "collector"),
        env,
      )
    ).json();
    assert.equal(recent.length, 61);
    assert.equal(recent[0].t, 60000);
    assert.equal(recent[0].evidence, undefined);
    const page = await (
      await handle(
        request("/history?from=0&to=60000&symbol=BTC-USD&eventId=1", "app"),
        env,
      )
    ).json();
    assert.deepEqual(Object.keys(page.batches[0].evidence.odds), ["1"]);
    assert.deepEqual(Object.keys(page.batches[0].evidence.perps), ["BTC-USD"]);
  } finally {
    close();
  }
});

test("a model transition baselines server alerts without changing saved rules or cooldown", async () => {
  const { database } = await import("../helpers/database");
  const { evaluateRules } = await import("../../workers/data/rules");
  const { db, close } = database();
  const rule = {
    id: "r",
    symbol: "BTC-USD",
    eventId: "1",
    window: "4h",
    minScore: 20,
    minGap: 0.001,
    muted: false,
  };
  try {
    await db
      .prepare(
        "INSERT INTO account_items(owner,kind,id,payload) VALUES(?,?,?,?)",
      )
      .bind("owner", "rules", "r", JSON.stringify(rule))
      .run();
    const s = {
      asOf: now,
      windows: { "4h": [gaps[0]] },
    } as unknown as ResearchSnapshot;
    await evaluateRules({ DB: db, DATA_SERVICE_SECRET: "s" }, { ...s, windows: { "4h": [] } } as unknown as ResearchSnapshot, now, true);
    await evaluateRules({ DB: db, DATA_SERVICE_SECRET: "s" }, s, now + 1000);
    await evaluateRules({ DB: db, DATA_SERVICE_SECRET: "s" }, s, now, true);
    assert.equal(
      (await db.prepare("SELECT * FROM notifications").all()).results.length,
      0,
    );
    assert.equal(
      (await db.prepare("SELECT * FROM alert_state").all()).results[0]
        .last_fired,
      0,
    );
    await evaluateRules({ DB: db, DATA_SERVICE_SECRET: "s" }, s, now + 60000);
    assert.equal(
      (await db.prepare("SELECT * FROM notifications").all()).results.length,
      0,
    );
    assert.equal(
      (await db.prepare("SELECT payload FROM account_items").all()).results[0]
        .payload,
      JSON.stringify(rule),
    );
  } finally {
    close();
  }
});

test("quote enrichment uses supported public depth and never borrows another category’s fee", async () => {
  const { collectEvidence } = await import("../../src/lib/enrichment");
  const original = globalThis.fetch,
    at = Date.now();
  const instrument = {
    ...instruments[0],
    instrumentType: "perpetual",
    category: "crypto",
    fundingInterval: "1h",
    minNotional: "5",
  };
  let bookCalls = 0;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/fees"))
      return Response.json({
        fee_schedule: [
          {
            instrument_type: "perpetual",
            category: "equity",
            taker_fee_rate: "0.0004",
          },
        ],
      });
    if (url.includes("/info/book?")) {
      assert.ok(url.endsWith("&depth=100"));
      bookCalls++;
      return Response.json({
        timestamp: at,
        bids: [["99.9", "10"]],
        asks: [["100.1", "10"]],
      });
    }
    return Response.json([]);
  };
  try {
    const s = {
      windows: { "30m": [{ ...gaps[0], symbol: instrument.symbol }] },
      events: [events[0]],
      instruments: [instrument],
      tickers: {
        [instrument.symbol]: {
          ...ticker,
          timestamp: at,
          nextFunding: at + 3600000,
        },
      },
    } as unknown as ResearchSnapshot;
    const evidence = await collectEvidence(s);
    assert.equal(bookCalls, 1);
    assert.equal(evidence.perps[instrument.symbol].valid, true);
    assert.equal(evidence.perps[instrument.symbol].takerFee, null);
  } finally {
    globalThis.fetch = original;
  }
});

test('candidate qualification rejects non-finite cost, gap and score',()=>{
  assert.equal(isActionable({...gaps[0],gap:NaN}),false);
  assert.equal(isActionable({...gaps[0],score:Infinity}),false);
  assert.equal(isActionable({...gaps[0],execution:{...gaps[0].execution!,totalCost:NaN}}),false);
});

test('v5 boundary selection survives a collection offset changing within the minute',async()=>{
  const {database}=await import('../helpers/database');const {INGEST_SQL}=await import('../../workers/data/ingest-sql');
  const {db,close}=database();const sql=[...INGEST_SQL].find(s=>s.includes("json_extract(payload,'$.t')<=?"))!;
  try{
    for(const t of [42000,102000])await db.prepare('INSERT INTO snapshots(t,model,payload) VALUES(?,?,?)').bind(Math.floor(t/60000)*60000,'m',JSON.stringify({t})).run();
    const result=await db.prepare(sql).bind(0,74000,74000,62000).first<{payload:string}>();
    assert.equal(JSON.parse(result!.payload).t,42000,'reject later-in-the-minute sample, preserve a valid earlier observation');
  }finally{close();}
});

test('replay counts non-overlapping asset positions and leaves absent historical costs unknown',()=>{
  const batches:HistoryBatch[]=Array.from({length:240},(_,i)=>{
    const t=now+i*60000,mark=100000+i*2;
    return {t,modelVersion:'legacy',links:{'1':{'BTC-USD':1}},volumes:{'1':2000000},marks:{'BTC-USD':[t,mark]},odds:{'1':[t,.25+(i%40)*.015,'token']},
      evidence:{odds:{},perps:{'BTC-USD':{at:t,bid:mark-.5,ask:mark+.5,buy:mark+.5,sell:mark-.5,quantity:.001,notional:100,takerFee:.0004,fundingRate:0,nextFunding:now+86400000,fundingIntervalMs:3600000,valid:true,levels:{bids:[[mark-.5,1]],asks:[[mark+.5,1]]}}}}};
  });
  const mappings={legacy:{scoreVersion:'heuristic-v4',events:[{...events[0],volume:2000000,endsAt,yesTokenId:'token',question:'Will Bitcoin be above $100000 on September 30?'}]}};
  const report=replayReport({batches,mappings});
  assert.ok(report.observations.length>1);assert.ok(report.observations.some(o=>o.net!==null));
  for(let i=1;i<report.observations.length;i++)assert.ok(report.observations[i].t-report.observations[i-1].t>=1800000);
  assert.equal(report.purgeMs,3600000);assert.equal(report.status,'insufficient-data');
  const missing=replayReport({batches:batches.map(b=>({...b,evidence:undefined})),mappings});
  assert.ok(missing.observations.every(o=>o.net===null));
  assert.equal(missing.observations.length,report.observations.length);
});

test('quote evidence expires independently of fresh mark and midpoint data',async()=>{
  const {freshResearchSnapshot}=await import('../../src/lib/research');
  const s={asOf:now,scoreVersion:'heuristic-v5',tickers:{'BTC-USD':{timestamp:now}},oddsHistory:{'1':[{t:now,v:.6}]},evidence:{odds:{'1':{at:now-80000,bid:.59,ask:.6}},perps:{}},windows:Object.fromEntries(WINDOWS.map(w=>[w,[{...gaps[0],execution:{...gaps[0].execution!,at:now}}]])),error:null} as unknown as ResearchSnapshot;
  assert.equal(isActionable(freshResearchSnapshot(s,now).windows['4h'][0]),true);
  const expired=freshResearchSnapshot(s,now+11000).windows['4h'][0];
  assert.equal(expired.execution?.status,'unknown');assert.equal(isActionable(expired),false);
  assert.equal(s.windows['4h'][0].execution?.status,'pass');
});
