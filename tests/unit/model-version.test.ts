import assert from "node:assert/strict";
import { test } from "node:test";
import { fingerprintModel } from "../../src/lib/model-version";
import { events } from "../e2e/fixtures";

test("model fingerprints track semantics but ignore catalog order and live odds", async () => {
  const original = await fingerprintModel(events);
  assert.equal(await fingerprintModel([...events].reverse()), original);
  assert.equal(await fingerprintModel(events.map((e) => ({ ...e, yesPrice: .1 }))), original);
  assert.notEqual(await fingerprintModel(events, "heuristic-v3"), original);
  assert.notEqual(await fingerprintModel(events.map((e) => ({ ...e, question: `not ${e.question}` }))), original);
  const linked = [{ ...events[0], perps: [...events[0].perps, ...events[1].perps] }];
  assert.equal(await fingerprintModel(linked), await fingerprintModel([{ ...linked[0], perps: [...linked[0].perps].reverse() }]));
});
