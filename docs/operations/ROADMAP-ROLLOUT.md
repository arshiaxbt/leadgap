# Leadgap roadmap rollout

Production target: `main` on Vercel, as explicitly requested by the owner on 18 September 2026. The earlier Netlify domain migration is cancelled. Keep `leadgap.xyz` and `www.leadgap.xyz` on Vercel. The owner requested deployment of the latest version before completion of the 72-hour soak; monitoring and owner account acceptance remain outstanding validation, not claims of completed testing.

## Release order and rollback

| Release | Included | Enable / rollback |
| --- | --- | --- |
| 1 · UI and referrals | Compact summary, narrower inspector, attached result footer, smaller desk rail/blotter, top-aligned portfolio, Guide disclosure and copy button; website links use `via=arshia` | Deploy UI on Vercel. Revert UI commit if needed. Referral helper never touches SDK or signing URLs. |
| 2 · Shared data | Minute cron, D1 lease and unique minute slot, bounded event discovery, synchronized raw observations, versioned mapping archive, health, retention and export | `ENABLE_DURABLE_DATA=true` on Vercel; Worker `INGEST_ENABLED=true`. Stop collection by setting Worker flag false. Keep the previous known-good shared Worker during rollback; local files are not a production fallback. |
| 3 · Research | Private watchlists and thresholds, in-app inbox, mute/delete/read, signal history, offline calibration | Independent `ENABLE_RESEARCH`, `NEXT_PUBLIC_ENABLE_RESEARCH`, `NEXT_PUBLIC_ENABLE_HISTORY`. Disable UI and server research flag together. No email/push delivery. |
| 4 · Streams and review | Public SDK book/ticker subscription, sequence/freshness guards, reconnect and REST fallback; frozen order-review draft, position/margin/cost disclosure | `NEXT_PUBLIC_ENABLE_STREAMING`. Review is always required in this release; roll back the reviewed code to remove it. Never bypass geo or venue validation. |
| 5 · Production evidence | Vercel deployment → API/browser checks → continued 72-hour monitoring and owner checks | Keep production DNS unchanged. Do not enable paid plans, recharge or overage billing. |

Public flags are baked into the client bundle: changing them requires a rebuild. Defaults keep research, history, telemetry and streams off. Local ingestion remains available for development.

## Free-tier infrastructure

Chosen architecture: **Vercel** runs Next.js and the authenticated Node.js collector at `/api/collect`; **Cloudflare Workers Free + D1 Free** provide the minute trigger and private storage. Direct collection on Workers exceeded its 10 ms Free CPU allowance during validation; the private D1 gateway keeps each Worker request small. Cloudflare calls the Vercel route once per minute with a dedicated credential. The obsolete daily Vercel ingestion cron is removed. Netlify files remain available for the previous preview but are not part of production.

The owner confirmed Workers Free. Vercel Hobby restricts use to personal, non-commercial projects; monetization may require a plan change ([Vercel Hobby](https://vercel.com/docs/plans/hobby)). No paid plan or billing change is authorized. Vercel function quotas still apply when an external scheduler invokes them. Workers Free has a 10 ms CPU request budget and D1 has daily read/write and storage caps ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)). Local checks cannot prove production quota headroom.

The collector caps discovery at 60 events, rotates one search query per minute, bulk-fetches odds, loads only eight comparison boundaries, and pauses near 350 MB database size. It keeps minute snapshots for seven days and five-minute checkpoints through day 30. Alerts are limited to 20 rules and watchlists to 100 items per account. These bounds reduce usage; they do not guarantee arbitrary traffic will fit the free tier. Provider hard limits and disabled paid billing are the cost boundary. Measure CPU at the intended event/rule count before enabling general access.

## Provision and configure

1. Use the existing Vercel project `prj_iEXihYZ2IMf7YjvrDApmHWFhMume` and Cloudflare Worker/database recorded below. Do not create replacement infrastructure or change DNS.
2. Keep `DATA_SERVICE_SECRET` for app reads/private account operations and independent `COLLECTOR_SECRET` for collection and the SQL allowlist gateway. The data-service credential cannot access the collector gateway. Only statements in `workers/data/ingest-sql.ts` are accepted; no arbitrary SQL/schema mutation is exposed.
3. Configure Vercel production server variables: `DATA_SERVICE_URL`, `DATA_SERVICE_SECRET`, `COLLECTOR_SECRET`, `INGEST_HEALTH_SECRET`, `ENABLE_DURABLE_DATA=true`. Preserve existing Privy, builder, Sentry and public auth variables. Never transfer `[SENSITIVE]` CLI placeholders as real values.
4. Validate and merge the audit and roadmap changes to `main`, then deploy that exact revision to Vercel production. Keep research, history, telemetry and streaming flags off until their respective acceptance checks pass.
5. Verify unauthenticated `POST /api/collect` returns 401, GET returns 405, and authenticated POST succeeds. It uses the Node.js runtime with a 60-second maximum. Verify shared `/api/markets`, `/api/gaps` and protected health responses.
6. Only after the Vercel route is healthy, update Worker `COLLECTOR_URL` to `https://www.leadgap.xyz/api/collect`, preserving its D1 binding and secrets. Keep `INGEST_ENABLED=true`. Confirm a scheduled run advances data without a manual request. The D1 lease and unique minute slot prevent overlap during the switch.
7. `/api/geo` uses Vercel's trusted geo headers; unknown location remains blocked. Keep exact production origins allowlisted in Privy and builder routes. No signing/funding/order execution is part of automated deployment checks.
8. Continue a fresh 72-hour monitor after the collector host changes. Preserve earlier samples as historical evidence; do not count a partial run as passed. Roll back by redeploying a compatible known-good app/collector, or pause Worker ingestion while repairing it. Do not fall back to local serverless files for production data.

## Verify and soak

Local commands (Node 24; `typecheck` also generates and checks isolated Worker binding types):

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run test:worker
npm run test:e2e
npm run build
```

`test:worker` bundles the real Worker, starts workerd through Miniflare, applies the migration and exercises auth/private storage. SQLite unit tests also cover duplicate collection, restart boundaries, alert deduplication/cooldown, retention and user isolation. Tests use fixtures and do not place orders.

With server credentials loaded into the shell, run `npm run research:soak -- 72`. It writes credential-free health samples and a report into a separate timestamped directory under `artifacts/soak/` and reports fresh/healthy coverage and missing-monitor intervals. An interrupted run leaves samples for investigation; start a full 72-hour run for release approval. Passing requires at least 71.99 hours, 99% fresh/healthy samples and no monitoring gap over three minutes. Additionally verify:

- Two independent cold app instances return the same `asOf`, mapping version and coverage.
- Stop the collector: after 90 seconds, no stale signals/alerts are manufactured. Restore it and verify recovery without duplicate minute rows or notifications.
- Review actual Worker CPU, exceptions, D1 rows read/written/storage, and Vercel function usage. Keep projected use below free allowances with headroom. If not, reduce load or pause features; do not silently upgrade billing.
- Exercise the Vercel production deployment at 375, 768, 1024, 1440 and 1920 px, including short viewports, empty/error states and keyboard navigation.

## Owner account acceptance

Use an eligible owner-controlled account. Read-only automated checks cannot establish these outcomes:

- Login/logout and wallet switching; expired delegation and reconnect; correct linked trading address.
- Review matches the actual request: instrument, side, size/step, IOC/GTC, price, leverage, isolated/cross, reduce-only and TP/SL.
- Venue fee, fill/slippage and funding receipts are reconciled against account balances/positions. Review labels unknown fees and estimates explicitly.
- Minimum-size order, rejection, partial fill, cancellation, and any funding path approved by the owner. Never claim these are verified from public market fixtures.
- Builder attribution confirmed from venue receipts; website referral attribution independently checked in Polymarket's dashboard. A URL parameter does not prove a credited referral.
- Watchlists and alerts survive login on another device; a second account cannot read or modify the first account's items.

## Research exports and calibration

`npm run research:export -- 7` exports up to 30 days of public synchronized observations plus their exact mapping versions. Files are checksummed and ignored by git. `npm run research:calibrate -- artifacts/research/history-<timestamp>.json` creates a separate report; existing reports are not overwritten.

The initial baseline uses a 15-minute comparison and 30-minute forward horizon with bounded sampling tolerance, a chronological 70/30 split and purged boundary. Candidate coefficients fit training observations only. Reports include held-out errors, directional outcomes, coverage/sample counts and per-symbol summaries. Overlapping samples, discovery bias and omitted costs are explicit limitations. Small archives are marked `insufficient-data`. **No candidate is promoted automatically and no profitability claim is made.** Accumulate broader history and independent event samples before considering model changes.

## Known dependency exception

The current auth SDK still pulls an older wallet dependency tree through `x402`. `npm audit` reports moderate `uuid` and `decode-uri-component` findings along that tree. Direct auth/server packages are updated, and high/critical findings are absent at the recorded check. Do not force incompatible transitive overrides or downgrade the auth SDK merely to turn the audit green. Track the upstream fix and repeat authenticated regression checks on upgrade.

## Resources and historical validation — 18 September 2026

- Owner confirmed **Workers Free**. Netlify AGS team reports **Free**. No billing settings, paid plans or recharge settings were changed.
- Cloudflare account: `1a69a630c48d035334a6d9e7e42c92f1`; Worker: `leadgap-data`; D1: `a48564f0-511b-4718-9738-e146fde2d2f9`. Initial migration was applied through the authenticated MCP API.
- Data service: `https://leadgap-data.arshiaxbt.workers.dev` (authenticated). Cron: `* * * * *`. Logs and traces sample 10% of requests.
- Netlify site: `b31da5b2-1841-40c5-9bbc-b83ffd8c959e`; [preview](https://roadmap--leadgap.netlify.app); [collector deployment](https://app.netlify.com/projects/leadgap/deploys/6aad380f1e08e175a09753cc). Runtime uses shared D1 data.
- The initial 72-hour monitor started **2026-09-18 13:11:55 UTC**, with expected completion **2026-09-21 13:11:55 UTC**. Local process metadata is in ignored `artifacts/soak/active-monitor.json`; results go to `artifacts/soak/2026-09-18T13-11-55.537Z/`. The workspace process must remain running; an interruption requires a fresh full soak. This is a running test, not a passed release gate.
- `leadgap.xyz` DNS remains on Vercel. The latest app is being released to the existing Vercel production project; the earlier Netlify preview is retained as historical validation evidence.

## 19 September 2026 — collector fix, model v2, research on

- **Collector 413 (fixed, PR #10).** From about 02:40 UTC the single `/internal/database` write reached the Worker's 524,288-byte body cap and failed every other minute. `batch()` now sends sequential chunks of ≤ 400 KB (every write is an idempotent upsert), writes `latest` last, skips unchanged mapping archives and rounds row floats to six significant digits. The Worker cap is raised to 1.5 MB for headroom once the Worker is redeployed. The soak running since 18 September 17:22 UTC was about 78 % healthy before the fix, so it **cannot pass the 99 % gate**; restarting a full 72-hour soak is the owner's call.
- **Scoring model v2** (`heuristic-v2`). Price-threshold markets ("above $X on …", "reach $X by …") are priced from strike, expiry and an assumed per-symbol volatility instead of a flat β = 1; bearish wording flips the sign; ambiguous or range markets are dropped. Threshold rows score against a volatility-scaled gap. Scoring runs in the Vercel collector, so rollback is a Vercel rollback. A 12-hour replay cut actionable counts per snapshot roughly in half on 1h/4h windows (for example 4.2 → 2.1 on 1h); mapping-β rows are unchanged. Existing alert rules on threshold markets may fire less often.
- **Research enabled in production.** `ENABLE_RESEARCH`, `NEXT_PUBLIC_ENABLE_RESEARCH` and `NEXT_PUBLIC_ENABLE_HISTORY` are `true` in Production. Signed-in users' watchlists, rules and inbox live in the account; rules are evaluated every minute by the collector. Browser-saved items are moved once via `/api/research/import` (never overwriting server copies; items past the 100/20 limits stay local). Roll back by setting the three flags to `false` and redeploying — no code change. The two-device / second-account owner check above is still outstanding.
- **Share images.** `/signals/[event]/[symbol]/opengraph-image` and `twitter-image` render the live 4h row (fallback card when missing) and are cached for 5 minutes.
- **Preview read key.** The Worker accepts an optional `DATA_READ_SECRET`, valid only for `GET /snapshot`, `/history`, `/mapping` and `/health` (constant-time comparison). Preview deployments use it as their `DATA_SERVICE_SECRET` with `ENABLE_DURABLE_DATA=true`, so previews show real data but cannot touch accounts, collection, telemetry or the SQL gateway. Deploy the Worker from a clean checkout of `main` so the SQL allowlist matches the collector. Revoke by deleting the Worker secret.
- **Worker deployed 19 September 14:54 UTC** through the Cloudflare API: a content-only upload from `main` at `f28868c`, leaving bindings, secrets and cron untouched. Version `4752e66e` is live; roll back by deploying the previous version `c9ff68c8`. `DATA_READ_SECRET` is set, and Preview uses it with `DATA_SERVICE_URL`, `ENABLE_DURABLE_DATA=true` and `NEXT_PUBLIC_ENABLE_HISTORY=true`. Verified: the read key can read `/health`, `/snapshot`, `/history` and `/mapping`, and gets 401 on accounts, collect, telemetry, POST and the gateway.
- **Gateway cap.** The Worker's outer `fetch` guard still capped `/internal/database` at 512 KB, so the 1.5 MB read limit had no effect. Both now use `GATEWAY_MAX_BYTES`. This needs a Worker redeploy after merge.
- **Tails and near-expiry (PR #11).** Threshold rows need both odds readings within 5–95 % and at least one window of life left; otherwise a one-tick wobble or time decay read as a 1 %+ move (e.g. "Solana above $95" 97.0 → 97.8 % scored 56 Long).
- **Model v3 (`heuristic-v3`).** Non-threshold events assumed worth about one day's typical move of the perp (σ/√365) instead of a flat β = 1, which read −10 pts on a pipeline question as a −10 % oil move. All rows now score against the volatility-scaled gap. 12-hour replay, actionable per snapshot v1 → v3: 15m 2.9 → 0.5, 1h 4.5 → 0.6, 4h 4.3 → 0.2 — the feed becomes sparse because most earlier signals came from the 1:1 assumption. The impact size (`EVENT_IMPACT_DAYS`) is an assumption, not an estimate.
