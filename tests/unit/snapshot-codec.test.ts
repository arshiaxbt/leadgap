import { decodeStoredSnapshot } from "../../src/lib/snapshot-storage";
import assert from "node:assert/strict";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import { snapshotText, SNAPSHOT_ENCODING, SNAPSHOT_MAX_BYTES } from "../../workers/data/snapshot-codec";
const encode = (value: string) => JSON.stringify({ _leadgapEncoding: SNAPSHOT_ENCODING, data: gzipSync(value).toString("base64") });

test("snapshot codec preserves legacy JSON and compressed Unicode exactly", async () => {
  const value = JSON.stringify({ asOf: 123, question: "Bitcoin won’t reach $100k? 🙂", windows: {} });
  assert.equal(await snapshotText(value), value);
  assert.equal(await snapshotText(encode(value)), value);
  assert.deepEqual(decodeStoredSnapshot(JSON.parse(encode(value))), JSON.parse(value));
  assert.deepEqual(decodeStoredSnapshot(JSON.parse(value)), JSON.parse(value));
});

test("compatibility inflation rejects oversized or corrupt snapshots", async () => {
  await assert.rejects(snapshotText(encode("x".repeat(SNAPSHOT_MAX_BYTES + 1))), /maximum size/);
  assert.throws(() => decodeStoredSnapshot(JSON.parse(encode("x".repeat(SNAPSHOT_MAX_BYTES + 1)))));
  await assert.rejects(snapshotText(JSON.stringify({ _leadgapEncoding: SNAPSHOT_ENCODING, data: "Y29ycnVwdA==" })));
});
