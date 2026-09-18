import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../../src/app/api/collect/route";

test("collector route fails closed before touching the data service", async () => {
  const previous = { ...process.env };
  try {
    delete process.env.COLLECTOR_SECRET;
    assert.equal((await POST(new Request("https://leadgap.xyz/api/collect", {
      method: "POST", headers: { authorization: "Bearer undefined" },
    }))).status, 401);

    process.env.COLLECTOR_SECRET = "collector-test-credential";
    process.env.DATA_SERVICE_URL = "https://must-not-be-contacted.invalid";
    process.env.ENABLE_DURABLE_DATA = "true";
    assert.equal((await POST(new Request("https://leadgap.xyz/api/collect", {
      method: "POST", headers: { authorization: "Bearer incorrect-credential!" },
    }))).status, 401);

    process.env.ENABLE_DURABLE_DATA = "false";
    assert.equal((await POST(new Request("https://leadgap.xyz/api/collect", {
      method: "POST", headers: { authorization: "Bearer collector-test-credential" },
    }))).status, 503);
  } finally {
    for (const key of ["COLLECTOR_SECRET", "DATA_SERVICE_URL", "ENABLE_DURABLE_DATA"]) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
