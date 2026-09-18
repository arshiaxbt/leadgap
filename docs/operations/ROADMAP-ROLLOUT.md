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

Chosen architecture: **Netlify Free** runs the Next.js app and trusted geo edge function; **Cloudflare Workers Free + D1 Free** run collection and private storage. No Vercel Analytics/Speed Insights dependency remains. Existing Vercel deployments are not deleted automatically.

Confirm the actual account plans before provisioning. Netlify's current Free plan is credit-limited and supports commercial projects ([Netlify Free](https://www.netlify.com/blog/introducing-netlify-free-plan/), [pricing](https://www.netlify.com/pricing/)). Workers Free has a 10 ms CPU request budget and D1 has daily read/write and storage caps ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)). Local checks cannot prove production quota headroom.

The collector caps discovery at 120 events, rotates four search queries per minute, bulk-fetches odds, loads only eight comparison boundaries, and pauses near 350 MB database size. It keeps minute snapshots for seven days and five-minute checkpoints through day 30. Alerts are limited to 20 rules and watchlists to 100 items per account. These bounds reduce usage; they do not guarantee arbitrary traffic will fit the free tier. Provider hard limits and disabled paid billing are the cost boundary. Measure CPU at the intended event/rule count before enabling general access.

## Provision and configure

1. Authenticate `wrangler login` and Netlify CLI/integration in the owner account. Do not paste secrets into chat or commit `.dev.vars`, local env files or CLI auth files.
2. Confirm Workers/D1 and Netlify are on Free with paid add-ons and recharge disabled. Existing access to GitHub/Vercel does not grant access to these providers.
3. Run `npx wrangler d1 create leadgap-data`. Replace the all-zero `database_id` in `workers/data/wrangler.jsonc` with the returned ID, leaving `INGEST_ENABLED=false` initially.
4. Run `npx wrangler d1 migrations apply leadgap-data --remote --config workers/data/wrangler.jsonc`.
5. Generate a random 32-byte service secret in a local secret manager. Set it through `npx wrangler secret put DATA_SERVICE_SECRET --config workers/data/wrangler.jsonc`. Set the same value as a **server-only production** Netlify variable. The Worker accepts no unauthenticated reads or account writes.
6. Run `npx wrangler deploy --config workers/data/wrangler.jsonc`. Set Netlify `DATA_SERVICE_URL` to that exact HTTPS Worker origin. Set `DATA_SERVICE_SECRET`, `INGEST_HEALTH_SECRET`, Privy and builder credentials from `.env.example` in the correct production context. Never copy builder credentials into preview contexts.
7. Deploy a Netlify preview with `netlify deploy --build`. The checked-in adapter and geo edge function are built together. Use the owner's Netlify connection to link/create the site on Free.
8. Allowlist exact Netlify/custom origins in Privy. `allowedBuilderOrigin` accepts exact site/deploy URLs; arbitrary `*.netlify.app` origins are not allowed. `/api/geo` must be served by the edge function using trusted `context.geo`, with unknown location blocked. Direct Next fallback fails closed on Netlify.
9. Enable collection and redeploy the Worker. Let each lookback warm naturally; do not synthesize 24-hour history from shorter observations. Enable app shared data with `ENABLE_DURABLE_DATA=true` (already set for Netlify production in `netlify.toml`).
10. After all gates below, deploy Netlify production and switch the existing domain. Retain the old deployment for rollback; disable its ingestion cron when migration completes.

## Verify and soak

Local commands (Node 24):

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

With server credentials loaded into the shell, run `npm run research:soak -- 72`. It writes credential-free health samples to `artifacts/soak/` and reports fresh/healthy coverage and missing-monitor intervals. An interrupted run leaves samples for investigation; start a full 72-hour run for release approval. Passing requires at least 71.99 hours, 99% fresh/healthy samples and no monitoring gap over three minutes. Additionally verify:

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
