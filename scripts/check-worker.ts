import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { execFileSync } from "node:child_process";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
async function main() {
  const out = await mkdtemp(join(tmpdir(), "leadgap-worker-"));
  let mf: Miniflare | undefined;
  try {
    execFileSync(
      process.execPath,
      [
        "node_modules/wrangler/bin/wrangler.js",
        "deploy",
        "--dry-run",
        "--config",
        "workers/data/wrangler.jsonc",
        "--outdir",
        out,
      ],
      { stdio: "pipe" },
    );
    mf = new Miniflare(
      convertV4MiniflareOptions({
        rootPath: out,
        modulesRoot: out,
        modules: true,
        scriptPath: join(out, "index.js"),
        compatibilityDate: "2026-09-18",
        d1Databases: ["DB"],
        bindings: {
          DATA_SERVICE_SECRET: "test-secret",
          INGEST_ENABLED: "false",
        },
      }),
    );
    const db = await mf.getD1Database("DB");
    await db.exec(await readFile("workers/data/migrations/0001.sql", "utf8"));
    assert.equal((await mf.dispatchFetch("http://worker/health")).status, 401);
    const headers = {
      authorization: "Bearer test-secret",
      "x-leadgap-user": "did:privy:alice",
    };
    assert.deepEqual(
      await (
        await mf.dispatchFetch("http://worker/health", { headers })
      ).json(),
      { status: "warming" },
    );
    assert.equal(
      (
        await mf.dispatchFetch("http://worker/collect", {
          method: "POST",
          headers,
        })
      ).status,
      503,
    );
    const item = {
      id: "btc",
      symbol: "BTC-USD",
      eventId: "1",
      label: "Bitcoin",
      window: "4h",
      filter: "all",
    };
    assert.equal(
      (
        await mf.dispatchFetch("http://worker/account/watchlist", {
          method: "PUT",
          headers,
          body: JSON.stringify(item),
        })
      ).status,
      200,
    );
    assert.deepEqual(
      await (
        await mf.dispatchFetch("http://worker/account/watchlist", { headers })
      ).json(),
      { items: [item] },
    );
    assert.deepEqual(
      await (
        await mf.dispatchFetch("http://worker/account/watchlist", {
          headers: { ...headers, "x-leadgap-user": "did:privy:bob" },
        })
      ).json(),
      { items: [] },
    );
    console.log(
      "Worker runtime, D1 migration, authorization and account isolation passed.",
    );
  } finally {
    await mf?.dispose();
    await rm(out, { recursive: true, force: true });
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
