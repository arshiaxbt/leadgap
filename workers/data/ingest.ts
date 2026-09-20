import { compactRow } from "../../src/lib/snapshot-row";
export { compactRow } from "../../src/lib/snapshot-row";
import { eligibleMarket, priceEligibility } from "../../src/lib/eligibility";
import { collectEvidence, attachEvidence } from "../../src/lib/enrichment";
import { SIGNAL_POLICY } from "../../src/lib/signal-policy";
import { ANNUAL_VOL } from "../../src/lib/sensitivity";
import { RECENT_SQL } from "./payloads";
import { fingerprintModel } from "../../src/lib/model-version";
import { SCORE_MODEL_VERSION } from "../../src/lib/score";
import {
  ASSET_MAP,
  allGammaQueries,
  linksForSearchHit,
  selectLinkedPerps,
  MAP_REVISION,
} from "../../src/lib/mapping";
import {
  fetchGammaEvent,
  parseEndsAt,
  parseTokenIds,
  parseYesPrice,
  searchGammaEvents,
} from "../../src/lib/gamma";
import { fetchInstruments, fetchTickers } from "../../src/lib/perps";
import {
  computeGaps,
  uniqueGapRows,
  WINDOW_MS,
} from "../../src/lib/divergence";
import {
  WINDOWS,
  type HistoryBatch,
  type ResearchSnapshot,
} from "../../src/lib/research";
import type { PerpsTicker, ResolvedEvent, Snapshot } from "../../src/lib/types";
import { writeMeta, type Env } from "./db";
import { evaluateRules } from "./rules";
type Catalog = {
  revision?: number;
  cursor: number;
  events: Record<string, { event: ResolvedEvent; seen: number }>;
};
export async function collect(
  env: Env,
  now = Date.now(),
  options: { enrich?: boolean; evaluateAlerts?: boolean } = {},
) {
  const wallStarted = Date.now();
  const owner = crypto.randomUUID();
  const db = env.DB;
  const slot = Math.floor(now / 60_000) * 60_000;
  // One D1 round trip for the lease and startup reads. Each separate binding
  // request has CPU overhead that matters on Workers Free.
  const [acquired, metadata, existing, earliest] = await db.batch([
    db
      .prepare(
        "INSERT INTO leases(key,owner,expires) VALUES('ingest',?,?) ON CONFLICT(key) DO UPDATE SET owner=excluded.owner,expires=excluded.expires WHERE leases.expires < ?",
      )
      .bind(owner, now + 55_000, now),
    db.prepare(
      "SELECT key,value FROM meta WHERE key IN ('health','latest','instrumentsAt','catalog')",
    ),
    db.prepare("SELECT t FROM snapshots WHERE t=?").bind(slot),
    db.prepare("SELECT MIN(t) AS t FROM snapshots"),
  ]);
  if (!acquired.meta.changes) return { skipped: "lease" };
  const values = new Map(
    metadata.results.map((r) => [String(r.key), String(r.value)]),
  );
  const meta = <T>(key: string): T | null => {
    const value = values.get(key);
    return value ? (JSON.parse(value) as T) : null;
  };
  const health = meta<{ size: number; asOf?: number }>("health");
  let released = false;
  try {
    if ((health?.size ?? 0) > 350_000_000) {
      const results = await prune(env, now);
      await writeMeta(db, "health", {
        ...health,
        size: results.at(-1)?.meta.size_after ?? health?.size,
        status: "quota-paused",
        attemptedAt: now,
      });
      return { skipped: "storage-budget" };
    }
    if (existing.results.length) return { skipped: "already-collected" };
    const previous = meta<ResearchSnapshot>("latest");
    const instruments =
      !previous || now - (meta<number>("instrumentsAt") ?? 0) > 3600_000
        ? await fetchInstruments()
        : previous.instruments;
    const rawTickers = await fetchTickers();
    const marks = Object.fromEntries(
      rawTickers.map((t) => [t.symbol, t.markPrice]),
    );
    const excluded: Record<string, number> = {};
    const exclude = (reason: string) => {
      excluded[reason] = (excluded[reason] ?? 0) + 1;
    };
    let catalog = meta<Catalog>("catalog") ?? {
      cursor: 0,
      events: {},
    };
    if (catalog.revision !== undefined && catalog.revision !== MAP_REVISION)
      catalog = { cursor: 0, events: {} };
    catalog.revision = MAP_REVISION;
    const queries = allGammaQueries();
    const discovery = await Promise.allSettled(
      Array.from({ length: 1 }, (_, i) => {
        const q = queries[(catalog.cursor + i) % queries.length];
        return searchGammaEvents(q.query, 3).then((events) => ({ q, events }));
      }),
    );
    for (const result of discovery) {
      if (result.status !== "fulfilled") continue;
      const { q, events } = result.value;
      for (const event of events) {
        const market = eligibleMarket(
          event,
          ASSET_MAP.map((a) => a.symbol),
          marks,
          now,
        );
        if (!market) {
          exclude("no-eligible-child-market");
          continue;
        }
        const yesPrice = parseYesPrice(market),
          tokens = parseTokenIds(market);
        if (
          yesPrice == null ||
          !tokens.yes ||
          yesPrice <= 0.02 ||
          yesPrice >= 0.98
        )
          continue;
        const volume = Number(market.volume ?? 0);
        if (!Number.isFinite(volume) || volume < 500) continue;
        const question = market.question ?? event.title;
        const old = catalog.events[event.id]?.event;
        const links = ASSET_MAP.flatMap((a) =>
          linksForSearchHit({
            hay: question,
            source: "asset",
            id: a.symbol,
            query: q.query,
          }),
        );
        const perps = selectLinkedPerps(`${event.title} ${question}`, [
          ...new Map(
            [
              ...(old?.yesTokenId === tokens.yes ? old.perps : []),
              ...links,
            ].map((p) => [p.symbol, p]),
          ).values(),
        ]);
        if (!perps.length) continue;
        catalog.events[event.id] = {
          seen: now,
          event: {
            id: String(event.id),
            marketId: market.id,
            slug: event.slug,
            title: event.title,
            question,
            yesPrice,
            yesTokenId: tokens.yes,
            noTokenId: tokens.no,
            volume,
            liquidityScore: Math.min(1, Math.log10(Math.max(volume, 10)) / 6),
            perps,
            endsAt: parseEndsAt(market, event) ?? old?.endsAt ?? null,
          },
        };
      }
    }
    catalog.cursor = (catalog.cursor + 1) % queries.length;
    // Rotate one query per minute; parsing discovery payloads dominates CPU.
    // Bound the catalog while every mapped event still refreshes each minute.
    for (const [id, entry] of Object.entries(catalog.events)) {
      entry.event.perps = entry.event.perps.filter((p) => {
        const result = priceEligibility(
          entry.event.question,
          p.symbol,
          marks[p.symbol],
          entry.event.endsAt,
        );
        if (!result.eligible) exclude(result.reason);
        return result.eligible;
      });
      if (!entry.event.perps.length) delete catalog.events[id];
    }
    let events = Object.values(catalog.events)
      .filter((e) => now - e.seen < 4 * 3600_000)
      .sort((a, b) => b.event.volume - a.event.volume)
      .slice(0, 60)
      .map((e) => e.event);
    catalog.events = Object.fromEntries(
      events.map((e) => [e.id, catalog.events[e.id]]),
    );
    let mids: Record<string, string> = {};
    let oddsError = false;
    if (events.length) {
      try {
        const r = await fetch("https://clob.polymarket.com/midpoints", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(events.map((e) => ({ token_id: e.yesTokenId }))),
          signal: AbortSignal.timeout(10_000),
        });
        if (!r.ok) throw new Error("odds");
        mids = await r.json();
      } catch {
        oddsError = true;
      }
    }
    // A settled market disappears from CLOB before the discovery cache expires.
    // Confirm closure before evicting it; missing prices alone are not proof.
    // Bound these extra lookups even during a widespread upstream outage.
    if (!oddsError) {
      const missing = events
        .filter((e) => mids[e.yesTokenId!] == null)
        .slice(0, 5);
      const closed = new Set<string>();
      await Promise.allSettled(
        missing.map(async (event) => {
          const current = await fetchGammaEvent(event.id);
          const market = current?.markets?.find(
            (m) => parseTokenIds(m).yes === event.yesTokenId,
          );
          if (current?.closed === true || market?.closed === true)
            closed.add(event.id);
        }),
      );
      for (const id of closed) delete catalog.events[id];
      events = events.filter((event) => !closed.has(event.id));
    }
    // Threshold markets are priced from their expiry. Backfill it for events
    // cataloged before end dates were recorded, a few per minute.
    const undated = events.filter((e) => e.endsAt == null).slice(0, 3);
    await Promise.allSettled(
      undated.map(async (event) => {
        const current = await fetchGammaEvent(event.id);
        const market = current?.markets?.find(
          (m) => parseTokenIds(m).yes === event.yesTokenId,
        );
        const endsAt = parseEndsAt(market, current);
        if (endsAt == null) return;
        event.endsAt = endsAt;
        const entry = catalog.events[event.id];
        if (entry) entry.event.endsAt = endsAt;
      }),
    );
    // Score at observation time: fetched tickers can legitimately arrive after
    // the cron began. Preserve injected clocks in replay/integration tests.
    now += Date.now() - wallStarted;
    const modelVersion = await fingerprintModel(events);
    const batch: HistoryBatch = {
      schema: 2,
      volumes: Object.fromEntries(events.map((e) => [e.id, e.volume])),
      t: now,
      modelVersion,
      links: Object.fromEntries(
        events.map((e) => [
          e.id,
          Object.fromEntries(e.perps.map((p) => [p.symbol, p.signedBeta])),
        ]),
      ),
      marks: {},
      odds: {},
    };
    const tickers: Record<string, PerpsTicker> = {};
    for (const ticker of rawTickers) {
      if (!Number.isFinite(ticker.markPrice) || ticker.markPrice <= 0) continue;
      tickers[ticker.symbol] = { ...ticker, change1h: null };
      if (ticker.timestamp <= now && now - ticker.timestamp <= 90_000)
        batch.marks[ticker.symbol] = [ticker.timestamp, ticker.markPrice];
    }
    for (const e of events) {
      const raw = mids[e.yesTokenId!];
      const value = raw == null ? NaN : Number(raw);
      if (Number.isFinite(value) && value >= 0 && value <= 1) {
        e.yesPrice = value;
        batch.odds[e.id] = [now, value, e.yesTokenId!];
      } else oddsError = true;
    }
    // Fetch only comparison boundaries, never deserialize the entire archive in a Worker.
    const boundaries = await db.batch(
      WINDOWS.map((window) =>
        db
          .prepare(
            "SELECT payload FROM snapshots WHERE t>=? AND t<=? AND json_extract(payload,'$.t')<=? ORDER BY ABS(json_extract(payload,'$.t')-?) LIMIT 1",
          )
          .bind(
            now -
              60000 -
              WINDOW_MS[window] -
              Math.max(30_000, Math.min(600_000, WINDOW_MS[window] * 0.2)),
            now - WINDOW_MS[window] + 12000,
            now - WINDOW_MS[window] + 12000,
            now - WINDOW_MS[window],
          ),
      ),
    );
    const batches = [
      ...boundaries.flatMap((r) =>
        r.results.map((v) => JSON.parse(String(v.payload)) as HistoryBatch),
      ),
      batch,
    ].sort((a, b) => a.t - b.t);
    const markHistory: Record<string, Snapshot[]> = {},
      oddsHistory: Record<string, Snapshot[]> = {};
    for (const b of batches) {
      for (const [symbol, [t, v]] of Object.entries(b.marks))
        (markHistory[symbol] ??= []).push({ t, v });
      for (const [id, [t, v, token]] of Object.entries(b.odds)) {
        if (events.find((e) => e.id === id)?.yesTokenId === token)
          (oddsHistory[id] ??= []).push({ t, v });
      }
    }
    for (const t of Object.values(tickers)) {
      const before = markHistory[t.symbol]?.findLast(
        (s) => s.t <= now - 3600_000,
      );
      t.change1h = before ? (t.markPrice - before.v) / before.v : null;
    }
    const windows = Object.fromEntries(
      WINDOWS.map((window) => [
        window,
        uniqueGapRows(
          computeGaps({
            events,
            tickers,
            markHistory,
            oddsHistory,
            window,
            now,
          }),
        ).map(compactRow),
      ]),
    ) as ResearchSnapshot["windows"];
    const firstAt = earliest.results[0]?.t;
    let snapshot: ResearchSnapshot = {
      scoreVersion: SCORE_MODEL_VERSION,
      asOf: now,
      modelVersion,
      instruments,
      tickers,
      events,
      markHistory,
      oddsHistory,
      windows,
      error: oddsError
        ? "Some event odds could not refresh."
        : discovery.some((r) => r.status === "rejected")
          ? "Event discovery is partially delayed."
          : !events.length
            ? "Discovering mapped events."
            : null,
      coverage: {
        startedAt: typeof firstAt === "number" ? firstAt : now,
        cadenceMs: 60_000,
        queryCount: queries.length,
        discoveryCycleMs: queries.length * 60000,
        catalogLimit: 60,
        excluded,
      },
    };
    if (options.enrich !== false) {
      let recent: HistoryBatch[] = [];
      try {
        const r = await db
          .prepare(RECENT_SQL)
          .bind(slot - 60 * 60000, slot - 1)
          .all<{ payload: string }>();
        recent = r.results.map((r) => JSON.parse(r.payload) as HistoryBatch);
      } catch {
        /* No timing evidence is safer than failing ordinary collection. */
      }
      const evidence = await collectEvidence(snapshot);
      batch.evidence = evidence;
      batch.evaluatedAt = Date.now();
      const all = new Map([...recent, ...batches, batch].map((b) => [b.t, b]));
      snapshot = attachEvidence(
        snapshot,
        [...all.values()],
        evidence,
        batch.evaluatedAt,
      );
    }
    // Keep every gateway request small: skip the unchanged mapping archive
    // row and write the published snapshot last, after what it depends on.
    const writes = await db.batch([
      db
        .prepare(
          "INSERT OR IGNORE INTO snapshots(t,model,payload) VALUES(?,?,?)",
        )
        .bind(
          Math.floor(now / 60_000) * 60_000,
          modelVersion,
          JSON.stringify(batch),
        ),
      ...(modelVersion !== previous?.modelVersion
        ? [
            db
              .prepare(
                "INSERT OR IGNORE INTO mappings(id,created,payload) VALUES(?,?,?)",
              )
              .bind(
                modelVersion,
                now,
                JSON.stringify({
                  mappingRevision: MAP_REVISION,
                  policy: SIGNAL_POLICY,
                  annualVol: ANNUAL_VOL,
                  scoreVersion: SCORE_MODEL_VERSION,
                  events: events.map((e) => ({
                    id: e.id,
                    marketId: e.marketId,
                    title: e.title,
                    question: e.question,
                    endsAt: e.endsAt ?? null,
                    volume: e.volume,
                    yesTokenId: e.yesTokenId,
                    perps: e.perps,
                  })),
                }),
              ),
          ]
        : []),
      db
        .prepare(
          "INSERT INTO meta(key,value) VALUES('catalog',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        )
        .bind(JSON.stringify(catalog)),
      ...(instruments !== previous?.instruments
        ? [
            db
              .prepare(
                "INSERT INTO meta(key,value) VALUES('instrumentsAt',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
              )
              .bind(JSON.stringify(now)),
          ]
        : []),
      db
        .prepare(
          "INSERT INTO meta(key,value) VALUES('latest',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        )
        .bind(JSON.stringify(snapshot)),
    ]);
    if (options.evaluateAlerts !== false)
      await evaluateRules(
        env,
        snapshot,
        now,
        previous?.scoreVersion !== snapshot.scoreVersion,
      );
    if (Math.floor(now / 60_000) % 60 === 0) await prune(env, now);
    const nextHealth = {
      status: snapshot.error ? "degraded" : "healthy",
      asOf: now,
      attemptedAt: now,
      size: writes[0]?.meta.size_after ?? 0,
      events: events.length,
      instruments: instruments.length,
      discoveryCursor: catalog.cursor,
      discoveryQueries: queries.length,
    };
    await db.batch([
      db
        .prepare(
          "INSERT INTO meta(key,value) VALUES('health',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        )
        .bind(JSON.stringify(nextHealth)),
      db
        .prepare("DELETE FROM leases WHERE key='ingest' AND owner=?")
        .bind(owner),
    ]);
    released = true;
    return { asOf: now };
  } catch (error) {
    await writeMeta(db, "health", {
      ...health,
      status: "failed",
      attemptedAt: now,
      message:
        error instanceof Error
          ? error.message.slice(0, 160)
          : "Ingestion failed",
    });
    throw error;
  } finally {
    if (!released)
      await db
        .prepare("DELETE FROM leases WHERE key='ingest' AND owner=?")
        .bind(owner)
        .run();
  }
}
export async function prune(env: Env, now: number) {
  return env.DB.batch([
    env.DB.prepare(
      "DELETE FROM snapshots WHERE t IN (SELECT t FROM snapshots WHERE t<? OR (t<? AND t%300000<>0) LIMIT 2000)",
    ).bind(now - 30 * 86400_000, now - 7 * 86400_000),
    env.DB.prepare("DELETE FROM notifications WHERE created<?").bind(
      now - 30 * 86400_000,
    ),
    env.DB.prepare(
      "DELETE FROM mappings WHERE created<? AND id NOT IN (SELECT model FROM snapshots)",
    ).bind(now - 30 * 86400_000),
    env.DB.prepare("DELETE FROM telemetry WHERE day<?").bind(
      new Date(now - 30 * 86400_000).toISOString().slice(0, 10),
    ),
  ]);
}
