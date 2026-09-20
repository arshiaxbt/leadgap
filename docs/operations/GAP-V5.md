# Gap model v5 rollout

The app remains on Vercel and Cloudflare Workers Free. Production activation is gated on a full 24-hour shadow run. No model update places orders, signs transactions or changes saved alert thresholds.

## Changed behavior

- Only supported price thresholds naming the underlying in the selected child question enter scoring. News, mentions, macro outcomes, relative performance, ranges and ambiguous conditions are excluded. Child selection ranks eligible markets, not just event volume.
- `heuristic-v5` fingerprints eligibility, timing, cost policy, volatility assumptions and selected market identity. The original v4 implementation is preserved under `src/lib/models/v4` for replay.
- Timing pairs minute returns at lags −5 through +5 over the selected window, capped at 60 minutes. Positive lag means odds preceded the perp. Qualification requires 12 pairs, 80% coverage, correlation ≥0.4, and ≥0.1 separation from zero and opposite lags. Missing, flat, stale, future and token-switched observations do not qualify. The 1m and 5m windows cannot supply enough evidence.
- A $100 **notional**, 30-minute research benchmark checks both sides of perp depth, quantity precision, minimum notional, public category-specific taker fees and adverse funding. Prediction spreads must be ≤2 points at both boundaries and the move must exceed combined half-spread uncertainty. Missing category fees remain unknown; another category's fee is never substituted.
- Enrichment covers at most 20 events and 12 instruments with four concurrent requests and a 10-second shared deadline. Public perp depth accepts 100 levels; archives retain at most eight levels per side sufficient for twice the benchmark quantity. No account credentials are used for quotes.
- Candidates require the existing score/direction/catch-up rules **and** measured odds leadership, passing quote checks and a gross gap above estimated costs. Everything else supported stays under Divergences. A candidate is research, not a forecast or guaranteed fill.
- Discovery still rotates 58 queries, one per minute, three search results each and a 60-event catalog. UI coverage text makes these limits visible.
- Archived observations carry optional schema-2 quote evidence and evaluation time. A private collector-only endpoint returns at most 61 projected observations; filtered history exposes only requested evidence. Existing readers and compressed transport continue to work.
- Historical boundary selection uses actual observation timestamps so a change in cron timing cannot erase otherwise valid comparisons.
- Existing server and browser alert state is baselined on model transition. Saved settings and cooldowns remain intact.

## Replay and evidence

`npm run research:calibrate -- <export.json>` verifies the export checksum and dispatches to archived v4/v5 semantics. Unknown versions or mismatched v5 policies are reported as unavailable. Features use only observations available at evaluation. Forward exits use the first recorded mark at or after 30 minutes (within 90 seconds); net estimates need archived fees, sufficient exit depth for the original quantity, and historical funding observations. No current quote can fill missing historical inputs.

Reports use a chronological 70/30 split, a 60-minute purge on each side and one non-overlapping position per asset. Less than 14 days or 200 net-evaluable holdout positions is `insufficient-data`. Even adequate data is research-only; there is no automatic promotion. The legacy raw-beta module is retained as a historical experiment and is no longer used by the calibration CLI.

## Deployment sequence

1. Pass unit/integration tests, Worker runtime checks, TypeScript, lint, production build and responsive/accessibility browser tests.
2. Deploy the backward-compatible Worker content (private recent endpoint, new boundary query allowlist and evidence projections). Preserve bindings, secrets, cron and 10% observability sampling. Existing v4 production remains compatible.
3. Publish a draft PR and Vercel preview. Reading v4 data in the preview applies strict eligibility and reports timing/costs unknown. It does not mutate the production archive.
4. Run `node --env-file=<private-env> --import tsx scripts/shadow-v5.ts 24` with Node 24. The script seeds public observations through authenticated **GET** requests, then writes only local SQLite. It does not call production collection, account, alert or telemetry mutations. Run metadata, samples and report live under ignored `artifacts/shadow-v5/`.
5. Require 24 hours, ≥99% healthy samples, no sample gap ≥3 minutes, zero unsupported rows/replay mismatches, projected D1 storage ≤350 MB, and Worker CPU P99 <8 ms with a provider quota review. A short smoke run deliberately cannot pass. If interrupted or scoring code changes, start a fresh 24-hour run.
6. Only after the gate passes, merge/deploy the approved app revision to `main`. Confirm the live model is v5, eligibility/evidence behavior and alert baselines. Keep the existing production soak running during shadow; start a **fresh 72-hour** soak after activation, with ≥99% healthy observations and no three-minute collection gaps.

The monitor writes a report and does not merge or deploy automatically. Pending elapsed-time gates must be reported as pending, not passed. A monitor depends on this workspace process remaining alive.

## Rollback

Roll Vercel back to the previous v4 deployment. The Worker retains the old boundary query and schema compatibility, so no database rollback or deletion is needed. Preserve v5 archives and their model mappings for analysis. Pause collection only if a storage/quota or ingestion incident requires it; do not disable Vercel protections or upgrade a plan to mask failures.

## Validation on 19 September 2026

- 82 unit/integration tests, Worker runtime/D1 checks, TypeScript, lint and production build passed. All 21 browser scenarios passed, including 375–1440 px layouts, accessibility, unknown evidence and browser alert migration.
- Live local shadow smoke runs reproduced 67–77 supported comparisons with zero replay mismatches. They are smoke checks, not the 24-hour gate.
- Backward-compatible Worker content was deployed; current version `dddd4446-7159-45bf-a664-00eee9f20584`. Previous version: `d11b2200-101b-4101-a26b-fbb1dccd27c5`. All 24 paced recent/history probes returned HTTP 200; production collection stayed healthy. Sampled invocation CPU was at most 5 ms. Recheck full-period P99 and quotas after shadow; these short samples do not replace that gate. Observability sampling was restored to 10%.
- Production remains on v4 while the draft v5 release is validated. The existing production soak process remains running independently.

A subsequent multi-minute shadow check exposed a valid ticker arriving after the cron-start timestamp. Evaluation now advances to the completion of observation reads, preserving strict rejection of genuinely future data. Regression coverage injects this timing offset. The read-only v4 preview similarly accounts for already-published source timestamps within five seconds. Legacy alerts with no prior evaluation state, including temporarily absent server rows, are also baselined without firing.

Draft release: https://github.com/arshiaxbt/leadgap/pull/18. The final shadow run must be restarted on this timing correction; use `artifacts/shadow-v5/active-monitor.json` for its exact revision, PID and deadline. Superseded and short runs remain historical evidence and cannot authorize activation.

Freshness checks also demote a candidate when its order-book evidence expires, independently of its mark/midpoint timestamps. The recorded evidence stays unchanged for replay.
