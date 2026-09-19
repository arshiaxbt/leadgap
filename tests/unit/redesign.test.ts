import assert from "node:assert/strict";
import { test } from "node:test";
import { gapTrace, valueAtOrBefore, withTraces } from "../../src/lib/divergence";
import { leadgapMetrics, scoreFactors } from "../../src/lib/score";
import {
  leaderLabel,
  mappingExplanation,
  mappingLabel,
  scoreStanding,
} from "../../src/lib/signal";
import { deskHref, eventHref, signalHref } from "../../src/lib/links";
import { navItemActive, APP_NAV, isDeskPath } from "../../src/lib/nav";
import type { GapRow, Snapshot } from "../../src/lib/types";

const now = 10_000_000;
const minute = 60_000;

test("valueAtOrBefore returns the last observation at or before a time", () => {
  const series: Snapshot[] = [
    { t: 1, v: 10 },
    { t: 5, v: 20 },
    { t: 9, v: 30 },
  ];
  assert.equal(valueAtOrBefore(series, 0), null);
  assert.equal(valueAtOrBefore(series, 5), 20);
  assert.equal(valueAtOrBefore(series, 8), 20);
  assert.equal(valueAtOrBefore(series, 100), 30);
});

test("gapTrace starts at zero and ends exactly on the scored row", () => {
  const odds: Snapshot[] = Array.from({ length: 61 }, (_, i) => ({
    t: now - (60 - i) * minute,
    v: 0.5 + i * 0.001,
  }));
  const marks: Snapshot[] = Array.from({ length: 61 }, (_, i) => ({
    t: now - (60 - i) * minute,
    v: 100 + i * 0.01,
  }));
  const trace = gapTrace({
    odds,
    marks,
    signedBeta: 1,
    windowMs: 60 * minute,
    expected: 0.06,
    actual: 0.006,
    now,
    points: 7,
  });
  assert.ok(trace);
  assert.equal(trace.implied.length, 7);
  assert.equal(trace.implied[0], 0);
  assert.equal(trace.observed[0], 0);
  assert.equal(trace.implied.at(-1), 0.06);
  assert.equal(trace.observed.at(-1), 0.006);
  // Midpoint is sampled from history, not interpolated.
  assert.ok(Math.abs(trace.implied[3]! - 0.03) < 1e-9);
  assert.ok(trace.implied.every((v, i, a) => i === 0 || v >= a[i - 1]!));
});

test("gapTrace refuses to draw when the window start was never observed", () => {
  const odds: Snapshot[] = [{ t: now - minute, v: 0.5 }];
  const marks: Snapshot[] = [{ t: now - minute, v: 100 }];
  assert.equal(
    gapTrace({
      odds,
      marks,
      signedBeta: 1,
      windowMs: 60 * minute,
      expected: 0.01,
      actual: 0,
      now,
    }),
    null,
  );
});

test("gapTrace applies the signed beta to the implied path", () => {
  const odds: Snapshot[] = [
    { t: now - 10 * minute, v: 0.5 },
    { t: now - 5 * minute, v: 0.52 },
  ];
  const marks: Snapshot[] = [
    { t: now - 10 * minute, v: 100 },
    { t: now - 5 * minute, v: 100 },
  ];
  const trace = gapTrace({
    odds,
    marks,
    signedBeta: -2,
    windowMs: 10 * minute,
    expected: -0.04,
    actual: 0,
    now,
    points: 3,
  });
  assert.ok(trace);
  assert.ok(Math.abs(trace.implied[1]! - -0.04) < 1e-9);
});

const row: GapRow = {
  eventId: "1",
  title: "Bitcoin above $100,000?",
  question: "Will Bitcoin exceed $100,000?",
  slug: "btc",
  symbol: "BTC-USD",
  window: "1h",
  oddsMove: 0.035,
  perpMove: 0.004,
  signedBeta: 1,
  gap: 0.031,
  score: 70,
  confidence: 0.8,
  yesPrice: 0.64,
  markPrice: 98000,
  mappingReason: "Direct map BTC-USD via “Bitcoin”",
  mappingKind: "named",
  leader: "odds",
  expected: 0.035,
  actual: 0.004,
  bias: "long",
  catchup: 0.11,
  volume: 4_200_000,
};

test("withTraces leaves rows without history untouched", () => {
  const [out] = withTraces([row], {
    oddsHistory: {},
    markHistory: {},
    window: "1h",
    now,
  });
  assert.equal(out!.trace, undefined);
  assert.equal(out!.score, 70);
});

test("score factors multiply to exactly the published score", () => {
  for (const args of [
    { oddsMove: 0.035, perpMove: 0.004, signedBeta: 1, confidence: 0.88, volume: 4.2e6 },
    { oddsMove: -0.041, perpMove: -0.002, signedBeta: 0.62, confidence: 0.78, volume: 1.14e7 },
    { oddsMove: 0.019, perpMove: 0.03, signedBeta: 1, confidence: 0.7, volume: 640_000 },
    { oddsMove: 0.3, perpMove: 0, signedBeta: 1, confidence: 0.9, volume: 1e6 },
  ]) {
    const f = scoreFactors(args);
    const product =
      100 * f.magnitude * f.lead * f.confidence * f.liquidity * f.movement * f.sanity;
    assert.equal(
      leadgapMetrics(args).score,
      Math.round(Math.max(0, Math.min(100, product))),
    );
    for (const key of ["magnitude", "lead", "liquidity", "movement", "sanity"] as const)
      assert.ok(f[key] >= 0 && f[key] <= 1, key);
  }
});

test("mapping and leader copy stays plain", () => {
  assert.equal(mappingLabel(row), "Direct event link");
  assert.equal(
    mappingLabel({
      mappingKind: "cluster",
      mappingReason: "Cluster macro topic via “Fed rate cut”",
    }),
    "Fed/macro cluster",
  );
  assert.equal(
    mappingLabel({ mappingKind: "cluster", mappingReason: "Something else" }),
    "Related event",
  );
  assert.match(mappingExplanation(row), /names BTC/);
  assert.match(
    mappingExplanation({ ...row, signedBeta: -1 }),
    /rising Yes probability implies a falling mark/,
  );
  assert.equal(leaderLabel("odds"), "Odds led");
  assert.equal(leaderLabel("perp"), "Perp led");
  assert.equal(leaderLabel("flat"), "In line");
});

test("score standing compares against live peers", () => {
  const peers = [5, 10, 12, 20, 25, 30, 33, 40, 45, 70];
  assert.equal(scoreStanding(70, peers), "Leadgap score · top decile of live signals");
  assert.equal(scoreStanding(45, peers), "Leadgap score · top quartile of live signals");
  assert.equal(scoreStanding(40, peers), "Leadgap score · above the live median");
  assert.equal(scoreStanding(5, peers), "Leadgap score · below the live median");
  assert.equal(scoreStanding(70, [70]), "Leadgap score");
});

test("links encode the signal identity and window", () => {
  assert.equal(
    signalHref({ eventId: "1", symbol: "BTC-USD", window: "1h" }),
    "/signals/1/BTC-USD?window=1h",
  );
  assert.equal(
    deskHref({ eventId: "1", symbol: "BTC-USD", window: "4h" }),
    "/markets/BTC-USD?event=1&window=4h",
  );
  assert.equal(eventHref("a b"), "/events/a%20b");
});

test("navigation marks the right section active", () => {
  const signals = APP_NAV.find((i) => i.label === "Signals")!;
  const markets = APP_NAV.find((i) => i.label === "Markets")!;
  assert.ok(navItemActive("/", signals));
  assert.ok(navItemActive("/signals/1/BTC-USD", signals));
  assert.ok(navItemActive("/events/1", signals));
  assert.ok(!navItemActive("/markets", signals));
  assert.ok(navItemActive("/markets/BTC-USD", markets));
  assert.ok(isDeskPath("/markets/BTC-USD"));
  assert.ok(!isDeskPath("/markets"));
});
