import type { HistoryBatch } from "./research";

export type HistoryPage = { batches: HistoryBatch[]; nextCursor: number | null };

/** Fail closed on a broken/incomplete page; never render a truncated six-hour chart. */
export async function readHistoryPages(
  query: URLSearchParams,
  read: (path: string) => Promise<HistoryPage>,
): Promise<HistoryPage> {
  const p = new URLSearchParams(query);
  p.set("limit", "100");
  let cursor = Number(p.get("from"));
  const to = Number(p.get("to"));
  const batches: HistoryBatch[] = [];
  // Six hours at minute cadence is at most 361 observations, plus boundary headroom.
  for (let page = 0; page < 10; page++) {
    p.set("cursor", String(cursor));
    const data = await read(`/history?${p}`);
    if (!Array.isArray(data.batches)) throw new Error("Invalid history page");
    for (const batch of data.batches) {
      if (!Number.isFinite(batch.t) || batch.t < cursor || batch.t > to ||
          (batches.length && batch.t <= batches.at(-1)!.t))
        throw new Error("History observations did not advance");
      batches.push(batch);
    }
    if (data.nextCursor === null) return { batches, nextCursor: null };
    if (!Number.isSafeInteger(data.nextCursor) || data.nextCursor <= cursor ||
        !data.batches.length || data.nextCursor <= data.batches.at(-1)!.t)
      throw new Error("History cursor did not advance");
    if (data.nextCursor > to) return { batches, nextCursor: null };
    cursor = data.nextCursor;
  }
  throw new Error("History page limit exceeded");
}
