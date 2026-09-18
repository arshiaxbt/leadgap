# Leadgap

An event-to-perp research and trading workspace. Compare Polymarket probability changes with related perpetual markets, inspect the model residual, and open an eligible market's trading desk. Mappings and sensitivities are heuristic; a ranked signal does not establish causality or predict returns.

## Run locally

Use Node.js 24 (also configured for Vercel and CI).

```bash
git clone https://github.com/arshiaxbt/leadgap.git
cd leadgap
cp .env.example .env.local
npm ci
npm run dev
```

Open https://localhost:3000. For public-data UI work, `npm run dev:http` runs on http://localhost:3000. Initial ingestion can take roughly 30 seconds. Public routes work without login credentials; wallet features require Privy configuration and a secure origin.

## Configuration

See [.env.example](.env.example) for all variable names. Configure the public Privy app ID and allow the exact development/production origin in the Privy dashboard, including `https://www.leadgap.xyz`. Enable the required email, Google, wallet and embedded-wallet methods. Preview origins require their own allowlisting.

Keep `PRIVY_APP_SECRET`, builder signing credentials, `CRON_SECRET` and `SENTRY_DSN` server-only. Existing previews contain public identity values but no production signing secrets. Never add those secrets to `NEXT_PUBLIC_*` or version control.

The existing builder code is included in order requests. Venue-side attribution still needs verification against accepted trades because the installed SDK does not declare that field on its Perps order type.

## Verify

```bash
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Browser tests intercept API reads with deterministic fixtures. They do not submit orders or move funds. To test a running build, set `PLAYWRIGHT_BASE_URL`; otherwise Playwright starts the development server. CI runs the same checks on pushes and pull requests.

## Application map

- `/`: ranked signals, comparison windows, filters and event inspector.
- `/markets`: instruments, search and categories; `/markets/[symbol]`: chart, book, event context and order ticket.
- `/portfolio`: authenticated positions, orders, fills and funding entry points.
- `/about`: product guide; `/guide` redirects here.
- Public data routes read Gamma/CLOB/Perps sources through the ingestion store. Trading uses Privy, wagmi and delegated Polymarket sessions.

Production history uses shared Cloudflare D1 with `ENABLE_DURABLE_DATA=true`. Local development can use process memory and JSON files; these are not a durable production archive.

## Audit and design

- [Completed plan](PLAN.md), [audit](docs/audit/REPORT.md), [validation](docs/audit/VALIDATION.md), [recommendations](docs/audit/RECOMMENDATIONS.md).
- [Design system](DESIGN.md), [product brief](docs/frontend/BRIEF.md), [frontend quality rules](docs/frontend/FRONTEND_CONTRACT.md).
- [Figma direction board](https://www.figma.com/design/zM6zNkiZI7nDwZGRQg6CC5).


### Roadmap infrastructure and release gates

Production runs on Vercel with the existing `leadgap.xyz` domain. The shared
data service lives in `workers/data`; Cloudflare schedules the authenticated
Vercel `/api/collect` route once per minute. `netlify.toml` is retained for the
earlier optional preview. Watchlists, in-app alerts, signal history, telemetry and market
streaming have independent flags. See [the rollout runbook](docs/operations/ROADMAP-ROLLOUT.md)
for provider setup, private environment variables, validation, the 72-hour soak,
owner account checks and rollback. Local build/test success does not imply that
production migration or real-money execution has been verified.
