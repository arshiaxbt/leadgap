import assert from "node:assert/strict";
import { test } from "node:test";
import { calibrationPairs, calibrationReport } from "../../src/lib/calibration";
import type { HistoryBatch } from "../../src/lib/research";
const start = 1_800_000_000_000;
function observations() {
  return Array.from({ length: 180 }, (_, i): HistoryBatch => ({
    t: start + i * 60_000,
    modelVersion: "v1",
    links: { "1": { "BTC-USD": 1 } },
    odds: { "1": [start + i * 60_000, 0.3 + i * 0.001, "yes"] },
    marks: { "BTC-USD": [start + i * 60_000, 100 + i * 0.02] },
  }));
}
test("calibration requires observed past and future boundaries and a consistent outcome/mapping", () => {
  const data = observations(),
    pairs = calibrationPairs(data);
  assert.equal(pairs[0].t, start + 15 * 60_000);
  assert.equal(pairs.at(-1)!.t, start + 150 * 60_000); // one-minute tolerance
  assert.equal(calibrationPairs(data.slice(0, 20)).length, 0);
  const changed = observations();
  changed[0].odds["1"][2] = "different";
  assert.equal(
    calibrationPairs(changed).some((p) => p.t === start + 15 * 60_000),
    false,
  );
  const mapping = observations();
  mapping[0].links["1"]["BTC-USD"] = 2;
  assert.equal(
    calibrationPairs(mapping).some((p) => p.t === start + 15 * 60_000),
    false,
  );
  const stale = observations();
  stale[15].marks["BTC-USD"][0] -= 180_000;
  assert.equal(
    calibrationPairs(stale).some((p) => p.t === start + 15 * 60_000),
    false,
  );
});
test("candidate fitting excludes held-out observations and reports insufficient evidence", () => {
  const pairs = calibrationPairs(observations());
  const first = calibrationReport(pairs);
  assert.equal(first.status, "insufficient-data");
  const modified = pairs.map((p) =>
    p.t >= first.split ? { ...p, perpMove: 999, futureMove: -999 } : p,
  );
  assert.deepEqual(
    calibrationReport(modified).candidateBetas,
    first.candidateBetas,
  );
});
