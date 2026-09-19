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
          COLLECTOR_SECRET: "collector-secret",
          DATA_READ_SECRET: "read-secret",
          INGEST_ENABLED: "false",
        },
      }),
    );
    const db = await mf.getD1Database("DB");
    await db.exec(await readFile("workers/data/migrations/0001.sql", "utf8"));
    const storage = (secret: string, sql: string) =>
      mf!.dispatchFetch("http://worker/internal/database", {
        method: "POST",
        headers: { authorization: `Bearer ${secret}` },
        body: JSON.stringify({ queries: [{ sql, params: [] }] }),
      });
    assert.equal(
      (await storage("test-secret", "SELECT MIN(t) AS t FROM snapshots"))
        .status,
      401,
    );
    assert.equal(
      (await storage("collector-secret", "DROP TABLE snapshots")).status,
      400,
    );
    const storageRead = await storage(
      "collector-secret",
      "SELECT MIN(t) AS t FROM snapshots",
    );
    assert.equal(storageRead.status, 200);
    assert.deepEqual(
      ((await storageRead.json()) as { results: unknown[] }[])[0].results,
      [{ t: null }],
    );
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
    // The preview read key may only read published data.
    const read = { authorization: "Bearer read-secret" };
    assert.deepEqual(
      await (await mf.dispatchFetch("http://worker/health", { headers: read })).json(),
      { status: "warming" },
    );
    assert.equal(
      (await mf.dispatchFetch("http://worker/snapshot", { headers: read })).status,
      503,
    );
    assert.equal(
      (
        await mf.dispatchFetch(
          `http://worker/history?from=0&to=${60_000}`,
          { headers: read },
        )
      ).status,
      200,
    );
    for (const [path, method] of [
      ["/account/watchlist", "GET"],
      ["/account/rules", "PUT"],
      ["/collect", "POST"],
      ["/telemetry", "POST"],
      ["/health", "POST"],
    ] as const)
      assert.equal(
        (
          await mf.dispatchFetch(`http://worker${path}`, {
            method,
            headers: { ...read, "x-leadgap-user": "did:privy:alice" },
            ...(method === "GET" ? {} : { body: "{}" }),
          })
        ).status,
        401,
        `${method} ${path} must reject the read key`,
      );
    assert.equal((await storage("read-secret", "SELECT 1")).status, 401);
    assert.equal(
      (
        await mf.dispatchFetch("http://worker/health", {
          headers: { authorization: "Bearer read-secretX" },
        })
      ).status,
      401,
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
      "Worker runtime, D1 migration, authorization, read-only key and account isolation passed.",
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
