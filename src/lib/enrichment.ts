import { SIGNAL_POLICY } from "./signal-policy";
import {
  executionEvidence,
  summarizeBook,
  timingEvidence,
  type QuoteEvidence,
  type OddsQuote,
} from "./signal-evidence";
import { linkModel } from "./sensitivity";
import { WINDOW_MS } from "./divergence";
import type { HistoryBatch, ResearchSnapshot } from "./research";
import type { PerpsBook } from "./types";

type Fees = {
  instrument_type: string;
  category: string;
  taker_fee_rate: string;
};
/** Public data only. One shared deadline; missing enrichment never fails collection. */
export async function collectEvidence(
  s: ResearchSnapshot,
): Promise<QuoteEvidence> {
  const p = SIGNAL_POLICY.execution,
    signal = AbortSignal.timeout(p.deadlineMs);
  const evidence: QuoteEvidence = { odds: {}, perps: {} };
  const ranked = Object.values(s.windows)
    .flat()
    .sort((a, b) => b.score - a.score || a.eventId.localeCompare(b.eventId));
  const eventIds = [...new Set(ranked.map((r) => r.eventId))].slice(
    0,
    p.maxMarkets,
  );
  const symbols = [...new Set(ranked.map((r) => r.symbol))].slice(
    0,
    p.maxInstruments,
  );
  async function json(url: string, init: RequestInit = {}) {
    const r = await fetch(url, { ...init, signal, cache: "no-store" });
    if (!r.ok) throw Error(`Quote HTTP ${r.status}`);
    return r.json();
  }
  let fees: Fees[] = [];
  const feeTask = json("https://api.perpetuals.polymarket.com/v1/info/fees")
    .then((d) => {
      fees = Array.isArray(d.fee_schedule) ? d.fee_schedule : [];
    })
    .catch(() => {});
  const jobs: (() => Promise<void>)[] = [
    async () => {
      const events = s.events.filter(
        (e) => eventIds.includes(e.id) && e.yesTokenId,
      );
      const books: {
        asset_id: string;
        timestamp: string;
        bids: { price: string; size: string }[];
        asks: { price: string; size: string }[];
      }[] = await json("https://clob.polymarket.com/books", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(events.map((e) => ({ token_id: e.yesTokenId }))),
      });
      for (const b of books) {
        const event = events.find((e) => e.yesTokenId === b.asset_id);
        if (!event) continue;
        const bids = b.bids.map((l) => Number(l.price)),
          asks = b.asks.map((l) => Number(l.price));
        const q: OddsQuote = {
          at: Number(b.timestamp),
          bid: Math.max(...bids),
          ask: Math.min(...asks),
        };
        if (
          [q.at, q.bid, q.ask].every(Number.isFinite) &&
          q.at <= Date.now() &&
          Date.now() - q.at <= 90000
        )
          evidence.odds[event.id] = q;
      }
    },
    ...symbols.map((symbol) => async () => {
      const instrument = s.instruments.find((i) => i.symbol === symbol),
        ticker = s.tickers[symbol];
      if (!instrument || !ticker) return;
      const b = await json(
        `https://api.perpetuals.polymarket.com/v1/info/book?instrument_id=${instrument.instrumentId}&depth=100`,
      );
      await feeTask;
      const fee = fees.find(
        (f) =>
          f.instrument_type === instrument.instrumentType &&
          f.category === instrument.category,
      );
      const book: PerpsBook = {
        instrumentId: instrument.instrumentId,
        timestamp: Number(b.timestamp),
        bids: (b.bids ?? []).map(([price, quantity]: string[]) => ({
          price: Number(price),
          quantity: Number(quantity),
        })),
        asks: (b.asks ?? []).map(([price, quantity]: string[]) => ({
          price: Number(price),
          quantity: Number(quantity),
        })),
      };
      evidence.perps[symbol] = summarizeBook(
        book,
        instrument,
        ticker,
        fee ? Number(fee.taker_fee_rate) : null,
        Date.now(),
      );
    }),
  ];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: p.concurrency - 1 }, async () => {
      while (cursor < jobs.length && !signal.aborted) {
        const job = jobs[cursor++];
        await job().catch(() => {});
      }
    }),
  );
  await feeTask;
  return evidence;
}

/** Pure counterpart used by collection, shadow runs and version-aware replay. */
export function attachEvidence(
  s: ResearchSnapshot,
  recent: HistoryBatch[],
  evidence: QuoteEvidence,
  now = s.asOf,
): ResearchSnapshot {
  const batches = [...recent]
    .filter((b) => b.t <= s.asOf)
    .sort((a, b) => a.t - b.t);
  for (const [window, rows] of Object.entries(s.windows))
    for (const row of rows) {
      const event = s.events.find((e) => e.id === row.eventId)!;
      const model = linkModel({
        question: event.question,
        symbol: row.symbol,
        baseBeta: event.perps.find((p) => p.symbol === row.symbol)!.signedBeta,
        mappingKind: row.mappingKind,
        mark: row.markPrice,
        endsAt: event.endsAt,
        now: s.asOf,
      });
      if (model.kind === "drop") continue;
      row.timing = timingEvidence(
        batches,
        row.eventId,
        row.symbol,
        event.yesTokenId!,
        model,
        WINDOW_MS[row.window],
        s.asOf,
      );
      const target = s.asOf - WINDOW_MS[row.window];
      const prior = batches
        .filter(
          (b) =>
            b.t <= target + 12000 &&
            Math.abs(b.t - target) <=
              Math.max(30000, Math.min(600000, WINDOW_MS[row.window] * 0.2)) &&
            b.odds[row.eventId]?.[2] === event.yesTokenId,
        )
        .sort((a, b) => Math.abs(a.t - target) - Math.abs(b.t - target))[0];
      const old = prior?.evidence?.odds[row.eventId];
      const validOld =
        old &&
        prior &&
        old.at <= (prior.evaluatedAt ?? prior.t) &&
        prior.t - old.at <= 90000
          ? old
          : undefined;
      row.execution = executionEvidence(
        evidence.perps[row.symbol],
        evidence.odds[row.eventId],
        validOld,
        row.oddsMove,
        row.bias,
        now,
      );
      row.candidateReasons = [
        ...(row.score < 28 ? ["below-score-threshold"] : []),
        ...(row.bias === "none" ? ["no-direction"] : []),
        ...(row.catchup != null && row.catchup >= 0.85
          ? ["already-caught-up"]
          : []),
        ...(row.timing.status !== "odds-leads"
          ? [row.timing.reason ?? row.timing.status]
          : []),
        ...row.execution.reasons,
        ...(row.execution.totalCost != null &&
        Math.abs(row.gap) <= row.execution.totalCost
          ? ["gap-below-cost"]
          : []),
      ];
      void window;
    }
  return { ...s, evidence };
}
