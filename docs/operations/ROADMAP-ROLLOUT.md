# Leadgap roadmap rollout

Implementation branch: `codex/leadgap-roadmap`. This document supersedes the Vercel-only launch assumptions in the original audit. **Code ready for validation is not a completed production migration.** Provider provisioning, the production soak, and owner account checks remain release gates.

## Release order and rollback

| Release | Included | Enable / rollback |
| --- | --- | --- |
| 1 · UI and referrals | Compact summary, narrower inspector, attached result footer, smaller desk rail/blotter, top-aligned portfolio, Guide disclosure and copy button; website links use `via=arshia` | Deploy UI on the commercial-use host. Revert UI commit if needed. Referral helper never touches SDK or signing URLs. |
| 2 · Shared data | Minute cron, D1 lease and unique minute slot, bounded event discovery, synchronized raw observations, versioned mapping archive, health, retention and export | `ENABLE_DURABLE_DATA=true` on Netlify; Worker `INGEST_ENABLED=true`. Stop collection by setting Worker flag false. Keep the previous known-good shared Worker during rollback; local files are not a production fallback. |
| 3 · Research | Private watchlists and thresholds, in-app inbox, mute/delete/read, signal history, offline calibration | Independent `ENABLE_RESEARCH`, `NEXT_PUBLIC_ENABLE_RESEARCH`, `NEXT_PUBLIC_ENABLE_HISTORY`. Disable UI and server research flag together. No email/push delivery. |
| 4 · Streams and review | Public SDK book/ticker subscription, sequence/freshness guards, reconnect and REST fallback; frozen order-review draft, position/margin/cost disclosure | `NEXT_PUBLIC_ENABLE_STREAMING`. Review is always required in this release; roll back the reviewed code to remove it. Never bypass geo or venue validation. |
| 5 · Production evidence | Netlify preview → owner checks → 72-hour Worker soak → domain switch | Keep production DNS unchanged until these gates pass. Do not enable paid plans, recharge or overage billing. |

Public flags are baked into the client bundle: changing them requires a rebuild. Defaults keep research, history, telemetry and streams off. Local ingestion remains available for development.

## Free-tier infrastructure

Chosen architecture: **Netlify Free** runs the Next.js app and trusted geo edge function; **Cloudflare Workers Free + D1 Free** provide the minute trigger and private storage. A small Netlify Function runs collection and scoring. Direct collection on Workers exceeded its 10 ms Free CPU allowance during deployment; the private D1 gateway keeps each Worker request small. No Vercel Analytics/Speed Insights dependency remains. Existing Vercel deployments are not deleted automatically.

Confirm the actual account plans before provisioning. Netlify's current Free plan is credit-limited and supports commercial projects ([Netlify Free](https://www.netlify.com/blog/introducing-netlify-free-plan/), [pricing](https://www.netlify.com/pricing/)). Workers Free has a 10 ms CPU request budget and D1 has daily read/write and storage caps ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)). Local checks cannot prove production quota headroom.

The collector caps discovery at 60 events, rotates one search query per minute, bulk-fetches odds, loads only eight comparison boundaries, and pauses near 350 MB database size. It keeps minute snapshots for seven days and five-minute checkpoints through day 30. Alerts are limited to 20 rules and watchlists to 100 items per account. These bounds reduce usage; they do not guarantee arbitrary traffic will fit the free tier. Provider hard limits and disabled paid billing are the cost boundary. Measure CPU at the intended event/rule count before enabling general access.

## Provision and configure

1. Authenticate Cloudflare MCP (or `wrangler login`) and Netlify CLI/integration in the owner account. Do not paste secrets into chat or commit `.dev.vars`, local env files or CLI auth files.
2. Confirm Workers/D1 and Netlify are on Free with paid add-ons and recharge disabled. Existing access to GitHub/Vercel does not grant access to these providers.
3. The existing `leadgap-data` database is configured in `workers/data/wrangler.jsonc`. Reuse it; do not create a duplicate. For a new environment, create its own D1 database and update its binding, with `INGEST_ENABLED=false` initially.
4. Run `npx wrangler d1 migrations apply leadgap-data --remote --config workers/data/wrangler.jsonc`.
5. Keep two independent random 32-byte secrets: `DATA_SERVICE_SECRET` for app reads/private account operations, and `COLLECTOR_SECRET` for collection and the SQL allowlist gateway. Configure them as Worker secrets and server-only Netlify variables. The data-service credential cannot access the collector gateway. No generic SQL or schema mutations are accepted there; its statements are listed in `workers/data/ingest-sql.ts`.
6. Deploy the Worker using authenticated MCP or `npx wrangler deploy --config workers/data/wrangler.jsonc`. Set Netlify `DATA_SERVICE_URL` to that exact HTTPS Worker origin. Set `DATA_SERVICE_SECRET`, `COLLECTOR_SECRET`, `INGEST_HEALTH_SECRET` and `ENABLE_DURABLE_DATA` through the Netlify API/CLI/UI in the intended runtime contexts. Keep private Privy/builder credentials in production only. The current preview uses public auth configuration; private account acceptance is still pending.
7. Deploy a Netlify preview with `netlify deploy --context deploy-preview --alias roadmap`. This builds the Next.js adapter, geo edge function and dedicated `collect` function. A CLI alias has **branch-deploy runtime context**, even when its build uses `deploy-preview`; configure server values for both contexts as needed. Point Worker `COLLECTOR_URL` at the exact `https://<host>/.netlify/functions/collect` URL. It requires the collector credential and accepts POST only.
8. Allowlist exact Netlify/custom origins in Privy. `allowedBuilderOrigin` accepts exact site/deploy URLs; arbitrary `*.netlify.app` origins are not allowed. `/api/geo` must be served by the edge function using trusted `context.geo`, with unknown location blocked. Direct Next fallback fails closed on Netlify.
9. Verify the Netlify collector and D1 gateway before enabling Worker `INGEST_ENABLED=true`. The minute cron calls the authenticated Netlify function; it does not perform scoring inside the Worker. Let each lookback warm naturally; do not synthesize 24-hour history from shorter observations. Set `ENABLE_DURABLE_DATA=true` through Netlify's environment API, CLI or UI in the production context, then redeploy. `netlify.toml` variables are build-only and do not configure function runtime. Set server research flags through the same mechanism. Public feature flags still require a rebuild.
10. After all gates below, configure production server variables, deploy Netlify production, update `COLLECTOR_URL` to its stable production origin, and switch the existing domain. Retain the old deployment for rollback; disable its ingestion cron when migration completes.

## Verify and soak

Local commands (Node 24; `typecheck` also generates and checks isolated Worker binding types):

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run test:worker
npm run test:e2e
npx netlify-cli build --offline --context deploy-preview
```

`test:worker` bundles the real Worker, starts workerd through Miniflare, applies the migration and exercises auth/private storage. SQLite unit tests also cover duplicate collection, restart boundaries, alert deduplication/cooldown, retention and user isolation. Tests use fixtures and do not place orders.

With server credentials loaded into the shell, run `npm run research:soak -- 72`. It writes credential-free health samples and a report into a separate timestamped directory under `artifacts/soak/` and reports fresh/healthy coverage and missing-monitor intervals. An interrupted run leaves samples for investigation; start a full 72-hour run for release approval. Passing requires at least 71.99 hours, 99% fresh/healthy samples and no monitoring gap over three minutes. Additionally verify:

- Two independent cold app instances return the same `asOf`, mapping version and coverage.
- Stop the collector: after 90 seconds, no stale signals/alerts are manufactured. Restore it and verify recovery without duplicate minute rows or notifications.
- Review actual Worker CPU, exceptions, D1 rows read/written/storage, and Netlify credit consumption. Keep projected use below free allowances with headroom. If not, reduce load or pause features; do not silently upgrade billing.
- Exercise the Netlify preview at 375, 768, 1024, 1440 and 1920 px, including short viewports, empty/error states and keyboard navigation.

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

## Deployed resources — 18 September 2026

- Owner confirmed **Workers Free**. Netlify AGS team reports **Free**. No billing settings, paid plans or recharge settings were changed.
- Cloudflare account: `1a69a630c48d035334a6d9e7e42c92f1`; Worker: `leadgap-data`; D1: `a48564f0-511b-4718-9738-e146fde2d2f9`. Initial migration was applied through the authenticated MCP API.
- Data service: `https://leadgap-data.arshiaxbt.workers.dev` (authenticated). Cron: `* * * * *`. Logs and traces sample 10% of requests.
- Netlify site: `b31da5b2-1841-40c5-9bbc-b83ffd8c959e`; [preview](https://roadmap--leadgap.netlify.app); [collector deployment](https://app.netlify.com/projects/leadgap/deploys/6aad380f1e08e175a09753cc). Runtime uses shared D1 data.
- The initial 72-hour monitor started **2026-09-18 13:11:55 UTC**, with expected completion **2026-09-21 13:11:55 UTC**. Local process metadata is in ignored `artifacts/soak/active-monitor.json`; results go to `artifacts/soak/2026-09-18T13-11-55.537Z/`. The workspace process must remain running; an interruption requires a fresh full soak. This is a running test, not a passed release gate.
- `leadgap.xyz` DNS and the existing Vercel deployment remain unchanged.
