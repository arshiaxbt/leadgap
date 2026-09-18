import assert from "node:assert/strict";
import { test } from "node:test";
import { acceptStreamMessage, streamLevels } from "../../src/lib/stream-data";
test("stream rejects stale, duplicate, reordered and cross-instrument messages; reconnect can restart sequences", () => {
  const now = 1_800_000_000_000,
    event = { timestamp: now, sequence: 12, payload: { instrumentId: 1 } };
  assert.equal(acceptStreamMessage(event, 1, 11, now), true);
  assert.equal(acceptStreamMessage(event, 1, 12, now), false);
  assert.equal(acceptStreamMessage(event, 1, 13, now), false);
  assert.equal(acceptStreamMessage(event, 2, 11, now), false);
  assert.equal(acceptStreamMessage(event, 1, 11, now + 16_000), false);
  assert.equal(
    acceptStreamMessage({ ...event, timestamp: now + 6000 }, 1, 11, now),
    false,
  );
  assert.equal(
    acceptStreamMessage({ ...event, sequence: 1 }, 1, -1, now),
    true,
  );
});
test("full order-book snapshots replace levels and reject invalid prices or quantities", () => {
  const rows = [
    { price: "101", quantity: "2" },
    { price: "100", quantity: "1" },
    { price: "NaN", quantity: "1" },
    { price: "102", quantity: "0" },
  ];
  assert.deepEqual(streamLevels(rows, "bids"), [
    { price: 101, quantity: 2 },
    { price: 100, quantity: 1 },
  ]);
  assert.equal(streamLevels(rows, "asks")[0].price, 100);
  assert.deepEqual(streamLevels([], "bids"), []);
});
