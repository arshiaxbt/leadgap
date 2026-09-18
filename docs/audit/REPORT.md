# Leadgap audit · 18 September 2026

## Product and architecture

Leadgap maps binary Polymarket event outcomes to perpetual instruments, computes a heuristic implied move and residual, and offers charting, an order book, trading and portfolio management. The comparison model is not a tested causal model or a performance forecast.

- Next.js App Router / React / Tailwind; shared Radix primitives and Geist typography; lightweight-charts and resizable desk panels.
- Public data: Gamma discovery and profiles, CLOB midpoint/history, Polymarket Perps instruments/tickers/klines/book, three RSS feeds.
- Ingestion: demand-driven 20-second refresh with single-flight per process, local JSON history, 48-hour retention. Vercel uses ephemeral `/tmp`; a daily cron is a warm-up, not continuous ingestion.
- Mapping: named asset aliases and macro/sector cluster rules; confidence floor and duplicate-title filtering.
- Score: residual magnitude × movement/leadership heuristic × mapping confidence × liquidity × sanity factors. Magnitude comparisons do not prove temporal leadership.
- Auth/trading: Privy → wagmi Polygon signer → secure Polymarket client → delegated Perps session. Credentials scoped to sessionStorage; production-only builder signing secrets.
- Operations: Vercel hosting/cron, Sentry with redaction, Vercel Analytics and Speed Insights. CSP and per-isolate API limits.

## Surface and endpoint inventory

| Surface                                                                                             | Purpose                                           | Review / verification                                                                                  |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `/`                                                                                                 | Ranked signals, window/filter/search, inspector   | Redesigned; four viewport browser flows and axe                                                        |
| `/markets`                                                                                          | Category/search/sort and instrument navigation    | Redesigned; keyboard/filter/navigation and responsive checks                                           |
| `/markets/[symbol]`                                                                                 | Chart, order book, event context, ticket, blotter | Shared redesign; unauthenticated desk, chart controls, ticket validation; real execution not performed |
| `/portfolio`                                                                                        | Login, equity, positions/orders/fills/exposure    | Redesigned entry and authenticated shell; logged-out browser checks, source review of account actions  |
| `/about`, `/guide`                                                                                  | Guide and redirect                                | Rewritten hierarchy and model limitations; responsive axe checks                                       |
| `/events/[id]`                                                                                      | Resolve event to mapped desk                      | Source review; redirects retained                                                                      |
| error, loading, 404                                                                                 | Recovery                                          | Added error boundary; browser 404 coverage                                                             |
| `/api/gaps`, `/api/events`, `/api/markets`, `/api/assets/[symbol]`, `/api/events/[id]`, `/api/news` | Public aggregate reads                            | Ingestion, history, mapping and read-error review                                                      |
| `/api/book`, `/api/klines`, `/api/odds`                                                             | Chart/order-book reads                            | Positive integer IDs, bounded token IDs, polling-budget review                                         |
| `/api/profile`, `/api/perps/account`                                                                | Public account/profile reads                      | Bounded address fan-out; account probes parallelized                                                   |
| `/api/geo`                                                                                          | Fail-closed location decision                     | Trusted Vercel headers take precedence; unit regression                                                |
| `/api/ingest`                                                                                       | Authorized cron refresh                           | Secret gate inspected; no secret values accessed                                                       |
| `/api/builder/sign`, `/api/builder/status`                                                          | Remote builder HMAC                               | Input shape/size and exact preview-origin validation; existing bearer gate retained                    |

## Findings and changes

| Severity            | Finding                                                                                        | Resolution                                                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Critical dependency | Next 16.3.0 affected by current security advisories                                            | Upgrade to 16.3.5; regenerate lockfile and verify build                                                              |
| High dependency     | Vulnerable sharp, ws, fast-uri, js-yaml dependency paths                                       | Compatible updates and ws 8.x override; high/critical audit count reduced to zero                                    |
| High                | Leverage control changed estimates but never updated venue settings                            | Validate draft, await updateLeverage, then place order; regression checks sequence and reduce-only behavior          |
| High                | Invalid size/limit/TP/SL fields could reach order submission                                   | Shared validation at UI and execution boundary, including quote freshness, field names and precision constraints                           |
| High                | Expired in-memory delegated sessions reused indefinitely                                       | Check session expiry before reuse; tolerate unavailable browser storage                                              |
| High                | Incomplete/stale history used as selected window; stale probability could be recorded as fresh | Bound historical sample age, reject stale scoring inputs, skip failed midpoint samples, backfill 5-minute marks      |
| High                | Outcome token change within an event mixed unrelated probability histories                     | Clear that event's old history before loading the new token                                                          |
| Medium              | Gamma parser assumed Yes was the first outcome                                                 | Resolve by outcome names; validate binary shape and probability bounds                                               |
| Medium              | Preview signing allowed any similarly named Vercel domain                                      | Match exact deployment/branch origin from platform-provided environment                                              |
| Medium              | Geo preferred user-supplied Cloudflare headers on Vercel                                       | Trust Vercel location headers in Vercel deployments; fail closed if unknown                                          |
| Medium              | Order book polled 50/min against 40/min limit                                                  | Poll at 24/min; retain last good response                                                                            |
| Medium              | Market network failures left loading forever; window changes could show previous window data   | React Query cancellation, keyed windows, retries, shared market cache, explicit error/retry and freshness states     |
| Medium              | Trading desk crashed without Privy/Wagmi configuration                                         | Separate public ticker view from authenticated position hooks                                                        |
| Medium              | Global keyboard listeners intercepted Enter/arrows on controls                                 | Native controls and local row navigation; semantic table links/buttons                                               |
| Medium              | Long and Short inspector links went to identical destinations                                  | Single explicit Open market desk action; side is chosen in ticket                                                    |
| Medium              | Hidden account-wide auto-cancel armed on every submitted order                                 | Remove undisclosed auto-cancel; explain actual limit-order lifetime                                                  |
| Medium              | One-click position close/cancel-all lacked confirmation and overstated execution completion    | Confirm destructive actions; say close order submitted rather than position closed                                   |
| Medium              | Unbounded profile/account probe fan-out and rate-limit map growth                              | Address cap and map expiry/size bound                                                                                |
| Medium UX           | Tiny dim copy, narrow inspector, clipped event titles, inconsistent actions                    | Shared palette with readable secondary text; new workspace hierarchy, rows, inspector, controls, Guide and Portfolio |
| Low                 | Missing landmarks/current navigation, table listbox misuse, reduced-motion handling            | Main/skip link, aria-current/pressed, semantic table controls, native selects, reduced motion CSS                    |
| Low                 | React hooks lint failures and no repeatable checks                                             | Fix render ref writes/derived states and add unit/browser tests plus CI                                              |

## Dependency evidence

Initial npm audit: 34 findings (1 critical, 4 high, 29 moderate). After compatible remediation: 27 moderate, zero high or critical. The remaining graph includes older uuid, decode-uri-component and stream-json under wallet/auth dependencies. These need upstream-compatible migration work; blanket major-version overrides would change APIs without adequate authenticated integration evidence.

Primary sources: [Next.js security advisories](https://github.com/vercel/next.js/security/advisories), [Next.js AVIF advisory](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4). SDK behavior was checked against installed `@polymarket/client` declarations; order execution is unit-tested with a spy, not real funds.

## Integration and deployment evidence

- GitHub: `arshiaxbt/leadgap`, main source cloned; branch `codex/leadgap-audit-redesign`. No open issues, PRs, or workflow runs returned at baseline.
- Vercel: existing Leadgap project; production was Ready, public domain `www.leadgap.xyz`. No error logs returned for the requested 24-hour window. This is limited historical evidence, not proof of zero errors.
- Vercel CLI works. MCP returned no teams and 403 for the known project; continued through CLI.
- Environment variable names/scopes inspected only. Production contains Privy/builder/cron/Sentry secrets; preview contains the public app ID and builder identity, without production signing secrets.
- [Figma direction board](https://www.figma.com/design/zM6zNkiZI7nDwZGRQg6CC5). Three directions compared; analyst workspace chosen. Existing brand dictated code-native visuals, so no generated raster assets or gallery component copying was needed.

## Limits and follow-up work

- No real order, position close, cancellation, withdrawal, deposit, wallet signature, or funded-account action was performed. Private authenticated portfolio and venue acceptance require an owner-controlled staging/funded-account check.
- Perps SDK declarations do not advertise `builderCode` on placeOrder. The existing attribution field is retained, but actual venue attribution must be verified against accepted trades; it is not proven by a request payload.
- Ephemeral `/tmp` and per-isolate memory are not shared durable history. Different Vercel instances can present different warm-up/history coverage. A durable ingestion service is the highest-priority infrastructure recommendation.
- Asset/event mappings and signed sensitivities are heuristics. They have not been empirically calibrated; no profitability claims or guaranteed lead-lag claims are made.
- Preview deployments intentionally lack production signing secrets and may require Vercel authentication and Privy origin allowlisting.
- Automated axe results do not certify complete WCAG conformance. Manual checks cover the documented workflows and viewport sizes.
