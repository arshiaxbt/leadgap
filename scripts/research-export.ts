import { writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import type { HistoryBatch } from "../src/lib/research";
/** Credentials stay in the environment; exports contain public market observations only. */
async function main() {
  const origin = process.env.DATA_SERVICE_URL,
    secret = process.env.DATA_SERVICE_SECRET;
  if (!origin || !secret)
    throw new Error(
      "Configure DATA_SERVICE_URL and DATA_SERVICE_SECRET in the shell.",
    );
  const days = Number(process.argv[2] ?? 7);
  if (!Number.isFinite(days) || days <= 0 || days > 30)
    throw new Error("Choose 1–30 days.");
  const to = Date.now(),
    from = to - days * 86400_000;
  let cursor: number | null = from;
  const batches: HistoryBatch[] = [];
  async function read(path: string) {
    const r = await fetch(new URL(path, origin), {
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) throw new Error(`Data export failed (${r.status})`);
    return r.json();
  }
  while (cursor !== null) {
    const page = await read(`/history?from=${from}&to=${to}&cursor=${cursor}&limit=100`);
    batches.push(...page.batches);
    if (page.nextCursor !== null && page.nextCursor <= cursor)
      throw new Error("History cursor did not advance");
    cursor = page.nextCursor;
  }
  const mappings: Record<string, unknown> = {};
  for (const id of new Set(batches.map((b) => b.modelVersion)))
    mappings[id] = await read(`/mapping?id=${encodeURIComponent(id)}`);
  const body = JSON.stringify({
    schema: 1,
    exportedAt: to,
    from,
    to,
    batches,
    mappings,
  });
  const hash = createHash("sha256").update(body).digest("hex");
  await mkdir("artifacts/research", { recursive: true });
  const file = `artifacts/research/history-${to}.json`;
  await writeFile(file, body, { flag: "wx", mode: 0o600 });
  await writeFile(`${file}.sha256`, hash + "\n");
  console.log(`${batches.length} observations exported to ${file}`);
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
