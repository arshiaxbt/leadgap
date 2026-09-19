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
    // Bodies between the old 512 KB cap and 1.5 MB reach the handler; larger ones do not.
    const sized = (bytes: number) =>
      mf!.dispatchFetch("http://worker/internal/database", {
        method: "POST",
        headers: { authorization: "Bearer collector-secret" },
        body: "x".repeat(bytes),
      });
    assert.equal((await sized(700_000)).status, 400);
    assert.equal((await sized(1_700_000)).status, 413);
    assert.equal(
      (
        await mf.dispatchFetch("http://worker/health", {
          headers: { authorization: "Bearer read-secretX" },
        })
      ).status,
      401,
    );
    // Raw collector operations are private, bounded, validated by D1, and idempotent.
    const raw = (operation: string, body: string, secret = "collector-secret") =>
      mf!.dispatchFetch(`http://worker/internal/payload/${operation}`, {
        method: "PUT", headers: { authorization: `Bearer ${secret}` }, body,
      });
    for (const secret of ["read-secret", "test-secret"])
      assert.equal((await raw("catalog", "{}", secret)).status, 401);
    assert.equal((await raw("unknown", "{}")).status, 400);
    assert.equal((await raw("catalog", "broken")).status, 400);
    assert.equal((await raw("catalog", "x".repeat(1_700_000))).status, 413);
    assert.equal((await raw("catalog", JSON.stringify({ text: "🙂".repeat(160_000) }))).status, 200);
    const model = "a".repeat(64);
    assert.equal((await raw("snapshot?t=0&model=invalid", "{}")).status, 400);
    const makeBatch = (t: number) => ({ t, modelVersion: model,
      marks: { "BTC-USD": [t, 90000], "ETH-USD": [t, 3000] },
      odds: { "1": [t, .4, "token1"], "2": [t, .7, "token2"] },
      links: { "1": { "BTC-USD": 1, "ETH-USD": .5 }, "2": { "ETH-USD": 1 } },
      volumes: { "1": 1000, "2": 2000 },
    });
    for (let t = 0; t < 205; t++) {
      assert.equal((await raw(`snapshot?t=${t}&model=${model}`, JSON.stringify(makeBatch(t)))).status, 200);
    }
    assert.equal((await raw(`snapshot?t=0&model=${model}`, JSON.stringify(makeBatch(0)))).status, 200);
    assert.equal((await raw(`mapping?t=0&model=${model}`, JSON.stringify({ model }))).status, 200);
    const stale = { asOf: 1, windows: Object.fromEntries(["1m", "5m", "15m", "30m", "1h", "4h", "12h", "1d"].map((w) => [w, [{ symbol: "BTC-USD" }]])), tickers: {}, oddsHistory: {}, error: null };
    assert.equal((await raw("latest", JSON.stringify(stale))).status, 200);
    const rawSnapshot = await mf.dispatchFetch("http://worker/snapshot/raw", { headers: read });
    assert.equal(rawSnapshot.status, 200);
    assert.deepEqual(await rawSnapshot.json(), stale);
    assert.equal((await mf.dispatchFetch("http://worker/snapshot/raw")).status, 401);
    const filtered = await (await mf.dispatchFetch("http://worker/snapshot", { headers: read })).json() as typeof stale;
    assert.equal(filtered.error, "Data collection is delayed.");
    assert.ok(Object.values(filtered.windows).every((rows) => rows.length === 0));
    const readHistory = async (query: string) => {
      const response = await mf!.dispatchFetch(`http://worker/history?from=0&to=204&limit=100${query}`, { headers: read });
      assert.equal(response.status, 200);
      return await response.json() as { batches: ReturnType<typeof makeBatch>[]; nextCursor: number | null };
    };
    const first = await readHistory("&eventId=1&symbol=BTC-USD");
    assert.equal(first.batches.length, 100);
    assert.equal(first.nextCursor, 100);
    assert.deepEqual(first.batches[0], { ...makeBatch(0), marks: { "BTC-USD": [0, 90000] },
      odds: { "1": [0, .4, "token1"] }, links: { "1": { "BTC-USD": 1 } }, volumes: { "1": 1000 } });
    const second = await readHistory("&cursor=100&eventId=1&symbol=BTC-USD");
    const last = await readHistory("&cursor=200&eventId=1&symbol=BTC-USD");
    assert.equal(last.nextCursor, null);
    assert.deepEqual([...first.batches, ...second.batches, ...last.batches].map((b) => b.t), Array.from({ length: 205 }, (_, i) => i));
    const unfiltered = await readHistory("");
    assert.deepEqual(unfiltered.batches[0], makeBatch(0));
    assert.deepEqual((await readHistory("&eventId=999&symbol=UNKNOWN")).batches[0].links, {});
    assert.deepEqual((await readHistory("&eventId=1")).batches[0].links, { "1": makeBatch(0).links["1"] });
    assert.deepEqual((await readHistory("&symbol=BTC-USD")).batches[0].marks, { "BTC-USD": [0, 90000] });
    const startup = await mf.dispatchFetch("http://worker/internal/payload/startup", {
      headers: { authorization: "Bearer collector-secret" },
    });
    assert.equal(startup.status, 200);
    assert.equal((await startup.json() as { key: string; value: { text: string } }[]).find((r) => r.key === "catalog")?.value.text.length, 320_000);
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
