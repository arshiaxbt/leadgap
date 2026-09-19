import assert from "node:assert/strict";
import { test } from "node:test";
import { ASSET_MAP, CLUSTER_RULES } from "../../src/lib/mapping";
import { leadgapMetrics, scoreFactors } from "../../src/lib/score";
import {
  ANNUAL_VOL,
  eventDirection,
  eventImpact,
  gapScale,
  impliedMove,
  informative,
  mappedBeta,
  linkModel,
  localBeta,
  normInv,
  thresholdTerms,
} from "../../src/lib/sensitivity";
import { computeGaps, WINDOW_MS } from "../../src/lib/divergence";
import type { ResolvedEvent } from "../../src/lib/types";

const DAY = 86_400_000;
const now = 1_800_000_000_000;

test("inverse normal matches known quantiles", () => {
  assert.ok(Math.abs(normInv(0.5)) < 1e-9);
  assert.ok(Math.abs(normInv(0.975) - 1.959964) < 1e-5);
  assert.ok(Math.abs(normInv(0.025) + 1.959964) < 1e-5);
  assert.ok(Math.abs(normInv(0.001) + 3.090232) < 1e-4);
});

test("threshold questions are recognised with strike, kind and direction", () => {
  const eth = thresholdTerms("Will the price of Ethereum be above $2,600 on September 21?", 2640, "ETH-USD");
  assert.deepEqual(eth, { kind: "digital", direction: 1, strike: 2600 });
  assert.deepEqual(thresholdTerms("Will STRC hit $100 by September 30?", 97, "STRC-USD"), {
    kind: "touch",
    direction: 1,
    strike: 100,
  });
  assert.deepEqual(thresholdTerms("Will Bitcoin exceed $100,000 before month end?", 98_000, "BTC-USD"), {
    kind: "touch",
    direction: 1,
    strike: 100_000,
  });
  assert.deepEqual(thresholdTerms("Will Bitcoin dip to $45,000 in 2026?", 81_000, "BTC-USD"), {
    kind: "touch",
    direction: -1,
    strike: 45_000,
  });
  assert.deepEqual(thresholdTerms("Will the S&P 500 hit $5,200 (LOW) in September?", 5_800, "SP500-USD"), {
    kind: "touch",
    direction: -1,
    strike: 5_200,
  });
  assert.deepEqual(thresholdTerms("Will Bitcoin be above 110k on September 30?", 105_000, "BTC-USD"), {
    kind: "digital",
    direction: 1,
    strike: 110_000,
  });
  assert.deepEqual(thresholdTerms("Bitcoin Up or Down on September 19?", 81_000, "BTC-USD"), {
    kind: "digital",
    direction: 1,
    strike: 81_000,
  });
});

test("non-price thresholds and far strikes are not priced as options", () => {
  // Polymarket's "(HIGH)"/"(LOW)" tag can sit between the verb and the strike.
  assert.deepEqual(thresholdTerms("Will WTI Crude Oil (WTI) hit (HIGH) $110 in September?", 95.36, "WTIOIL-USD"), {
    kind: "touch",
    direction: 1,
    strike: 110,
  });
  assert.deepEqual(thresholdTerms("Will Gold (XAUUSD) hit (LOW) $4,000 in September?", 4_376.8, "GOLD-USD"), {
    kind: "touch",
    direction: -1,
    strike: 4_000,
  });
  // Comparison signs: "<" reads as below, ">" as above.
  assert.deepEqual(thresholdTerms("Will S&P 500 (SPX) close at <$6,000 in December?", 7_654.6, "SP500-USD"), {
    kind: "touch",
    direction: -1,
    strike: 6_000,
  });
  assert.deepEqual(thresholdTerms("Will Bitcoin close at >$90,000 on September 30?", 82_000, "BTC-USD"), {
    kind: "digital",
    direction: 1,
    strike: 90_000,
  });
  // Quantities are not the perp's price.
  assert.equal(thresholdTerms("Will US crude oil reserves fall to 280M by September 25, 2026?", 95.36, "WTIOIL-USD"), null);
  assert.equal(thresholdTerms("Will Nvidia's market cap be above $5T by December?", 180, "NVDA-USD"), null);
  assert.equal(thresholdTerms("Will Tesla deliveries be above 400k in Q3?", 250, "TSLA-USD"), null);
  // WTI strike mapped to GOLD through the oil cluster: not GOLD's price.
  assert.equal(thresholdTerms("Will WTI crude be above $80 on September 30?", 4_000, "GOLD-USD"), null);
  assert.equal(thresholdTerms("Will Bitcoin be above $100,000?", undefined, "BTC-USD"), null);
  assert.equal(
    thresholdTerms("Will Bitcoin be between $80,000 and $82,000 on September 20?", 81_000, "BTC-USD"),
    "range",
  );
  // kPEPE is quoted per 1000 tokens.
  assert.deepEqual(thresholdTerms("Will PEPE reach $0.00001 in September?", 0.0095, "KPEPE-USD"), {
    kind: "touch",
    direction: 1,
    strike: 0.01,
  });
});

test("digital implied move matches a finite difference of the strike-fixed price", () => {
  const model = linkModel({
    question: "Will the price of Ethereum be above $2,600 on September 21?",
    symbol: "ETH-USD",
    baseBeta: 1,
    mappingKind: "named",
    mark: 2_640,
    endsAt: now + 2 * DAY,
    now,
  });
  assert.equal(model.kind, "threshold");
  if (model.kind !== "threshold") return;
  // Price implied by odds p with strike fixed: S = K·exp(σ√τ·Φ⁻¹(p)).
  const tau = (2 * DAY) / (365.25 * DAY);
  const price = (p: number) => 2_600 * Math.exp(0.65 * Math.sqrt(tau) * normInv(p));
  const expected = price(0.71) / price(0.65) - 1;
  const got = impliedMove(model, 0.65, 0.71, now, now);
  assert.ok(Math.abs(got - expected) < 1e-12, `${got} vs ${expected}`);
  // A 6-point move now implies well under 1%, not 6%.
  assert.ok(got > 0.003 && got < 0.01, `implied ${got}`);
  const beta = localBeta(model, 0.68, now);
  assert.ok(beta > 0.05 && beta < 0.2, `beta ${beta}`);
});

test("odds drifting with time to expiry are not read as a price move", () => {
  const model = linkModel({
    question: "Will Bitcoin be above $80,000 on September 20?",
    symbol: "BTC-USD",
    baseBeta: 1,
    mappingKind: "named",
    mark: 81_000,
    endsAt: now + DAY,
    now,
  });
  assert.equal(model.kind, "threshold");
  if (model.kind !== "threshold") return;
  // Hold the price fixed and let four hours pass: p rises for an in-the-money digital.
  const tau = (t: number) => (now + DAY - t) / (365.25 * DAY);
  const d = (t: number) => Math.log(81_000 / 80_000) / (0.5 * Math.sqrt(tau(t)));
  const cdf = (x: number) => 0.5 * (1 + Math.tanh(0.7978845608 * (x + 0.044715 * x ** 3)));
  const pThen = cdf(d(now - 4 * 3600_000));
  const pNow = cdf(d(now));
  assert.ok(pNow > pThen);
  const move = impliedMove(model, pThen, pNow, now - 4 * 3600_000, now);
  assert.ok(Math.abs(move) < 5e-4, `theta leak ${move}`);
});

test("touch markets and bearish thresholds carry the right sign", () => {
  const up = linkModel({
    question: "Will Hyperliquid reach $100 in September?",
    symbol: "HYPE-USD",
    baseBeta: 1,
    mappingKind: "named",
    mark: 55,
    endsAt: now + 11 * DAY,
    now,
  });
  const down = linkModel({
    question: "Will Bitcoin dip to $45,000 in 2026?",
    symbol: "BTC-USD",
    baseBeta: 1,
    mappingKind: "named",
    mark: 81_000,
    endsAt: now + 100 * DAY,
    now,
  });
  assert.equal(up.kind, "threshold");
  assert.equal(down.kind, "threshold");
  if (up.kind !== "threshold" || down.kind !== "threshold") return;
  assert.ok(impliedMove(up, 0.2, 0.25, now, now) > 0);
  // Yes rising on "dip to" means the price fell.
  assert.ok(impliedMove(down, 0.1, 0.15, now, now) < 0);
});

test("threshold rows without an expiry or about to resolve are held back", () => {
  const base = {
    question: "Will the price of Bitcoin be above $82,000 on September 20?",
    symbol: "BTC-USD",
    baseBeta: 1,
    mappingKind: "named" as const,
    mark: 81_000,
    now,
  };
  assert.equal(linkModel({ ...base, endsAt: null }).kind, "drop");
  assert.equal(linkModel({ ...base, endsAt: now + 10 * 60_000 }).kind, "drop");
  assert.equal(linkModel({ ...base, endsAt: now + DAY }).kind, "threshold");
});

test("question wording signs the relationship or declines to guess", () => {
  assert.equal(eventDirection("US recession by end of 2026?", "SP500-USD"), -1);
  assert.equal(eventDirection("US recession by end of 2026?", "GOLD-USD"), 1);
  assert.equal(eventDirection("Will MicroStrategy be margin called?", "MSTR-USD"), -1);
  assert.equal(eventDirection("Will MSTR be delisted from MSCI?", "MSTR-USD"), -1);
  assert.equal(eventDirection("Will the Fed hike rates in October?", "NAS100-USD"), -1);
  assert.equal(eventDirection("Will the Fed cut rates in September?", "SP500-USD"), 1);
  assert.equal(eventDirection("Will Bitcoin outperform Gold in 2026?", "GOLD-USD"), -1);
  assert.equal(eventDirection("Will Bitcoin outperform Gold in 2026?", "BTC-USD"), 1);
  assert.equal(eventDirection("Will there be no change in Fed rates in September?", "SP500-USD"), null);
  assert.equal(eventDirection("Will the US avoid a recession in 2026?", "SP500-USD"), null);
  assert.equal(eventDirection("Will CPI be above 3% in August?", "SP500-USD"), null);
  // "Fall" in a quantity question is not the perp's price falling; the Fed is still signable.
  assert.equal(eventDirection("Will US crude oil reserves fall to 280M by September 25, 2026?", "WTIOIL-USD"), null);
  assert.equal(eventDirection("Will the Federal Reserve cut rates in October?", "SP500-USD"), 1);
  assert.equal(eventDirection("Will the US create a Strategic Bitcoin Reserve?", "BTC-USD"), 1);
  // Word boundaries: "bank" is not "ban".
  assert.equal(eventDirection("Will the bank of Japan cut rates?", "SP500-USD"), 1);
  const cluster = linkModel({
    question: "Will CPI be above 3% in August?",
    symbol: "SP500-USD",
    baseBeta: 1,
    mappingKind: "cluster",
    mark: 5_800,
    endsAt: now + DAY,
    now,
  });
  assert.equal(cluster.kind, "drop");
  const bearish = linkModel({
    question: "US recession by end of 2026?",
    symbol: "NAS100-USD",
    baseBeta: 1,
    mappingKind: "cluster",
    mark: 20_000,
    endsAt: now + 100 * DAY,
    now,
  });
  assert.deepEqual(bearish, {
    kind: "linear",
    beta: -eventImpact("NAS100-USD"),
    source: "direction",
  });
});

test("non-threshold events are worth about one day's typical move, not 1:1", () => {
  // ~σ/√365: ETH ≈ 3.4%, oil ≈ 1.8%, S&P ≈ 0.9%.
  assert.ok(Math.abs(eventImpact("ETH-USD") - 0.034) < 0.001);
  assert.ok(Math.abs(eventImpact("WTIOIL-USD") - 0.0183) < 0.001);
  assert.ok(Math.abs(eventImpact("SP500-USD") - 0.0089) < 0.001);
  assert.equal(mappedBeta({ symbol: "WTIOIL-USD", signedBeta: -1 }), -eventImpact("WTIOIL-USD"));
  const event: ResolvedEvent = {
    id: "7",
    slug: "saudi-pipeline",
    title: "Saudi Oil Pipeline (East-West) restarts by September 30?",
    question: "Saudi Oil Pipeline (East-West) restarts by September 30?",
    volume: 500_000,
    yesTokenId: "t",
    noTokenId: "n",
    yesPrice: 0.3,
    liquidityScore: 1,
    endsAt: now + 11 * DAY,
    perps: [
      {
        symbol: "WTIOIL-USD",
        signedBeta: 1,
        confidence: 0.88,
        cluster: "oil",
        mappingReason: "Cluster oil",
        mappingKind: "named",
      },
    ],
  };
  const rows = computeGaps({
    events: [event],
    tickers: {
      "WTIOIL-USD": {
        instrumentId: 9,
        symbol: "WTIOIL-USD",
        indexPrice: 70,
        markPrice: 70.08,
        lastPrice: 70.08,
        midPrice: 70.08,
        openInterest: 1,
        fundingRate: 0,
        nextFunding: 0,
        timestamp: now,
        change1h: null,
      },
    },
    oddsHistory: { "7": [{ t: now - WINDOW_MS["4h"], v: 0.4 }, { t: now, v: 0.3 }] },
    markHistory: { "WTIOIL-USD": [{ t: now - WINDOW_MS["4h"], v: 70 }, { t: now, v: 70.08 }] },
    window: "4h",
    now,
  });
  assert.equal(rows.length, 1);
  const row = rows[0]!;
  // v1 read −10 pts as a −10% oil move and scored it 45 Short.
  assert.equal(row.betaSource, "mapping");
  assert.ok(Math.abs(row.expected + 0.1 * eventImpact("WTIOIL-USD")) < 1e-9, `expected ${row.expected}`);
  assert.ok(row.score < 28, `score ${row.score}`);
  assert.ok(Math.abs(row.oddsMove * row.signedBeta - row.expected) < 1e-12);
});

test("every mapped perp has an assumed volatility", () => {
  const symbols = new Set([
    ...ASSET_MAP.map((row) => row.symbol),
    ...CLUSTER_RULES.flatMap((rule) => rule.members.map((m) => m.symbol)),
  ]);
  const missing = [...symbols].filter((s) => ANNUAL_VOL[s] == null);
  assert.deepEqual(missing, []);
});

test("gap scale follows volatility and window, within bounds", () => {
  assert.equal(gapScale("BTC-USD", WINDOW_MS["1m"]), 0.003);
  const eth4h = gapScale("ETH-USD", WINDOW_MS["4h"]);
  assert.ok(eth4h > 0.01 && eth4h < 0.02, `${eth4h}`);
  assert.equal(gapScale("PUMP-USD", 365 * DAY), 0.04);
});

test("leader compares the implied move with the perp move", () => {
  // Odds moved 6 points but only imply +0.8%; the perp moved 1.2%: the perp led.
  const f = scoreFactors({
    oddsMove: 0.06,
    perpMove: 0.012,
    signedBeta: 0.135,
    confidence: 0.88,
    volume: 1e6,
    expected: 0.0081,
    scale: gapScale("ETH-USD", WINDOW_MS["4h"]),
  });
  assert.equal(f.leader, "perp");
  // With β = 1 the result is the same as comparing odds points directly.
  assert.equal(
    scoreFactors({ oddsMove: 0.035, perpMove: 0.004, signedBeta: 1, confidence: 0.8, volume: 1e5 }).leader,
    "odds",
  );
});

test("v2 scores threshold rows on the perp's own scale", () => {
  const scale = gapScale("ETH-USD", WINDOW_MS["4h"]);
  const metrics = leadgapMetrics({
    oddsMove: 0.06,
    perpMove: 0.0034,
    signedBeta: 0.135,
    confidence: 0.88,
    volume: 2e6,
    expected: 0.0081,
    scale,
  });
  // v1 scored this 60 by reading +6%; v2 sees a 0.47% gap, a fraction of a typical 4h move.
  assert.ok(metrics.score < 28, `score ${metrics.score}`);
  assert.ok(metrics.gap > 0.004 && metrics.gap < 0.005);
});

test("computeGaps prices a threshold market from its strike and expiry", () => {
  const event: ResolvedEvent = {
    id: "9",
    slug: "eth-above",
    title: "Ethereum above ___ on September 21?",
    question: "Will the price of Ethereum be above $2,600 on September 21?",
    volume: 2_000_000,
    yesTokenId: "t",
    noTokenId: "n",
    yesPrice: 0.71,
    liquidityScore: 1,
    endsAt: now + 2 * DAY,
    perps: [
      {
        symbol: "ETH-USD",
        signedBeta: 1,
        confidence: 0.88,
        cluster: "crypto-spot",
        mappingReason: "Direct map ETH-USD via “Ethereum above”",
        mappingKind: "named",
      },
    ],
  };
  const rows = computeGaps({
    events: [event],
    tickers: {
      "ETH-USD": {
        instrumentId: 2,
        symbol: "ETH-USD",
        indexPrice: 2_640,
        markPrice: 2_640,
        lastPrice: 2_640,
        midPrice: 2_640,
        openInterest: 1,
        fundingRate: 0,
        nextFunding: 0,
        timestamp: now,
        change1h: null,
      },
    },
    oddsHistory: { "9": [{ t: now - WINDOW_MS["4h"], v: 0.65 }, { t: now, v: 0.71 }] },
    markHistory: { "ETH-USD": [{ t: now - WINDOW_MS["4h"], v: 2_631 }, { t: now, v: 2_640 }] },
    window: "4h",
    now,
  });
  assert.equal(rows.length, 1);
  const row = rows[0]!;
  assert.equal(row.betaSource, "threshold");
  assert.ok(row.expected > 0.003 && row.expected < 0.01, `expected ${row.expected}`);
  assert.ok(Math.abs(row.oddsMove * row.signedBeta - row.expected) < 1e-12);
  assert.ok(row.score < 28);
});

test("tail odds and markets resolving within the window are left out", () => {
  const model = linkModel({
    question: "Will the price of Solana be above $95 on September 25?",
    symbol: "SOL-USD",
    baseBeta: 1,
    mappingKind: "named",
    mark: 110,
    endsAt: now + 6 * DAY,
    now,
  });
  if (model.kind !== "threshold") throw new Error(`expected threshold, got ${model.kind}`);
  const h1 = WINDOW_MS["1h"];
  // Production case: 97.0% → 97.8% read as a +1.3% SOL move and scored 56.
  assert.equal(informative(model, 0.97, 0.978, h1, now), false);
  assert.equal(informative(model, 0.034, 0.018, h1, now), false);
  assert.equal(informative(model, 0.65, 0.625, h1, now), true);
  assert.equal(informative(model, 0.05, 0.95, h1, now), true);
  // Resolving in 2.2h: fine for 1h, time decay dominates a 4h window.
  const soon = { ...model, endsAt: now + 2.2 * 3_600_000 };
  assert.equal(informative(soon, 0.3, 0.25, h1, now), true);
  assert.equal(informative(soon, 0.3, 0.25, WINDOW_MS["4h"], now), false);
  // Linear links are never filtered here.
  assert.equal(
    informative({ kind: "linear", beta: 1, source: "mapping" }, 0.99, 0.999, h1, now),
    true,
  );
});

test("negated thresholds use complement probabilities for upper/lower digital/touch conditions", () => {
  for (const [positive, negative] of [
    ["Will Bitcoin be above $100,000 on September 30?", "Will Bitcoin not be above $100,000 on September 30?"],
    ["Will Bitcoin be below $100,000 on September 30?", "Will Bitcoin be not below $100,000 on September 30?"],
    ["Will Bitcoin reach $100,000 by December 31?", "Will Bitcoin not reach $100,000 by December 31?"],
    ["Bitcoin will hit $100,000 by December 31?", "Bitcoin won’t hit $100,000 by December 31?"],
    ["Bitcoin will dip to $80,000 by December 31?", "Bitcoin will never dip to $80,000 by December 31?"],
  ]) {
    const args = { symbol: "BTC-USD", baseBeta: 1, mappingKind: "named" as const, mark: 90000, endsAt: now + 90 * DAY, now };
    const affirmative = linkModel({ ...args, question: positive });
    const complement = linkModel({ ...args, question: negative });
    assert.equal(affirmative.kind, "threshold", positive);
    assert.equal(complement.kind, "threshold", negative);
    if (affirmative.kind !== "threshold" || complement.kind !== "threshold") continue;
    assert.equal(complement.terms.complemented, true);
    assert.ok(Math.abs(impliedMove(complement, .2, .35, now - DAY, now) - impliedMove(affirmative, .8, .65, now - DAY, now)) < 1e-12);
    assert.ok(Math.abs(localBeta(complement, .3, now) + localBeta(affirmative, .7, now)) < 1e-10);
    assert.equal(informative(complement, .01, .5, 3600000, now), false);
    assert.equal(informative(complement, .5, .6, 91 * DAY, now), false);
  }
});

test("ambiguous price conditions cannot fall through to a named or cluster model", () => {
  for (const question of [
    "Will Bitcoin not never reach $100,000 by December 31?",
    "Will Bitcoin reach $100,000 and fall below $80,000?",
    "Will Bitcoin reach $100,000 if Ethereum rallies?",
    "Will Bitcoin avoid reaching $100,000?",
    "Will Bitcoin not touch $100,000?",
    "Bitcoin cannot reach $100,000?",
    "Bitcoin couldn’t reach $100,000?",
    "Will Bitcoin hit (HIGH) $100,000 (LOW)?",
  ]) for (const mappingKind of ["named", "cluster"] as const)
    assert.deepEqual(linkModel({ question, symbol: "BTC-USD", baseBeta: 1, mappingKind, mark: 90000, endsAt: now + 90 * DAY, now }), { kind: "drop" }, question);
});

test("a negative threshold with no usable mark cannot become an affirmative linear model", () => {
  for (const mark of [undefined, 0, 100])
    assert.deepEqual(linkModel({ question: "Will Bitcoin not reach $100,000 by December 31?", symbol: "BTC-USD", baseBeta: 1, mappingKind: "named", mark, endsAt: now + 90 * DAY, now }), { kind: "drop" });
});
