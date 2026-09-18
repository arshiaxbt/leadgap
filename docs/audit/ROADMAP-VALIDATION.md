# Roadmap validation — 18 September 2026

Branch: `codex/leadgap-roadmap`, based on the original audit/redesign branch.

Implemented: compact spacing and sparse-results footer; referral links/disclosure/copy; Netlify adapter and trusted geo edge function; Cloudflare Worker/D1 collection, versioned history and retention; private saved research/in-app alerts; optional history and public book/ticker streams; frozen order review; export, calibration and soak tooling.

## Evidence

- ESLint and TypeScript pass.
- 23 unit/database checks pass. They exercise actual SQLite statements, transaction boundaries, account isolation, save limits, notification deduplication/cooldown, collector restart/duplicate handling, retention, per-source freshness, bounded request bodies, referral URLs, order request semantics, stream ordering and calibration chronology.
- The bundled Worker starts in workerd/Miniflare; D1 migration, authentication, disabled-ingestion behavior and account isolation pass.
- Netlify CLI offline preview build completes, including the Next.js server function, middleware and geo edge bundle. This validates packaging, not a remote deployment.
- Browser coverage includes 375, 768, 1024, 1440 and 1920 px plus 1440×720 and 375×667. Axe WCAG A/AA checks, no horizontal overflow, signal selection/filter restore, trading draft validation, order review, referral copy, history/error recovery and keyboard dismissal pass. Browser tests now fail on any uncaught page error; this caught and fixed the panel library's server-side localStorage access.
- Eleven browser scenarios pass across the main run and focused recheck. The 12-page secondary-surface scenario exceeded its 45-second budget while a production build competed for resources; it was rerun separately. No assertion was relaxed.
- A read-only live SDK probe received `perps.book` and `perps.tickers` messages with matching sequence `45419404505`, timestamp `1789732860202`, and approximately 154 ms observed age. This verifies the public message shape, not trading or a long-duration reconnect soak.
- `npm audit`: 23 moderate, zero high/critical at the recorded check. The remaining underlying advisories are the transitive `uuid` and `decode-uri-component` paths pulled through the auth SDK's `x402` dependency. No forced major transitive overrides were used.

Screenshots use deterministic public-market fixtures: [wide signals](roadmap-screenshots/compact-1920-1080.png), [short desktop](roadmap-screenshots/compact-1440-720.png), [mobile review](roadmap-screenshots/review-375-667.png), [history](roadmap-screenshots/signal-history.png).

## Remote rollout update

Netlify MCP and CLI now authenticate to the AGS Free team. The new `leadgap` site is linked locally; `.netlify/state.json` and generated bundles remain ignored. The draft preview is [roadmap--leadgap.netlify.app](https://roadmap--leadgap.netlify.app). No production domain changed.

Initial remote HTTP checks returned the app and 89 live instruments successfully. The geo edge function returned trusted country/subdivision data and ignored spoofed country headers. The initial preview used local data; the current preview returns `dataSource: shared` and reads the provisioned D1 service.

Vercel's environment export returned `[SENSITIVE]` placeholders, including for public values. Importing those placeholders exposed a Privy initialization crash in remote browser checks. The public app ID was recovered from the existing production site's public JavaScript; builder configuration came from the checked-in public defaults. Netlify's public configuration is corrected, and malformed app IDs now prevent the auth provider from mounting instead of crashing public pages. A regression test covers the placeholder. No private Vercel credentials were transferred.

The runtime configuration instructions now require Netlify API/CLI/UI variables: `netlify.toml` alone cannot set server function flags. ESLint excludes generated `.netlify` bundles. The browser feed fixture now intercepts only Leadgap's origin; its former broad `/api/**` matcher incorrectly replaced Privy's public SDK configuration when auth was enabled.

The corrected [immutable preview](https://6aad31bb475017a8e071cf1a--leadgap.netlify.app) builds successfully with public auth configured. All 24 unit checks, ESLint and TypeScript pass. A live browser check renders the email/Google/wallet login modal without uncaught page errors; Privy's analytics endpoint returns 403 on this preview origin. Account login and signing remain untested.

All ten applicable browser scenarios pass against that immutable deployment with real public auth configuration and deterministic Leadgap market fixtures. This includes axe, 375–1920 px/short viewports, compact result spacing, referral copy/attribution, order review and error states. History remains disabled on the preview, so its eleventh scenario is covered by the earlier local feature-enabled run only.

## Shared data deployment evidence

- [Current deployment](https://6aad380f1e08e175a09753cc--leadgap.netlify.app): dedicated Netlify collector plus Next.js app and trusted geo edge function. Server configuration includes both deploy-preview and branch-deploy contexts because the CLI alias uses branch-deploy at runtime. No production secrets or domain changes were required.
- Direct Worker collection used 26–47 ms CPU initially and 18–30 ms after batching, exceeding the 10 ms Free allowance. Collection/scoring now runs in Netlify; Cloudflare retains scheduling, authenticated data access and D1. One measured complete collection took about 2.3 seconds end-to-end.
- Cloudflare GraphQL reports the revised cron at about **0.52 ms CPU** and initial storage/health requests below **5.3 ms**, with no reported invocation errors in the sampled post-change interval. These are startup measurements, not proof of sustained quota headroom at a full catalog or growing history.
- Remote checks passed for unauthenticated rejection, disabled collection, minute-slot deduplication, cross-owner read/delete isolation, stale snapshot suppression, recovery, collector-credential separation and SQL allowlist rejection. Temporary owner-test rows were removed.
- Two independent gateway processes returned the same `asOf`, mapping version and coverage. Netlify market/gap endpoints report shared data; its authenticated health endpoint matches the Worker.
- All 24 unit/database checks, isolated generated Worker binding types, app TypeScript, lint and bundled workerd/D1 integration pass. The restart/idempotency test now exercises collection across the private HTTP storage bridge. Three focused remote browser scenarios rechecked mobile accessibility, referrals and wide/short order review after enabling shared data.
- Unattended cron collections are advancing the D1 snapshots. The **72-hour soak started September 18 at 13:11:55 UTC**, expected to finish September 21 at 13:11:55 UTC. The first three samples are fresh and healthy. Logs and the eventual report are in the ignored artifact paths recorded in the rollout runbook.
- The soak runner now takes a final sample at the deadline and uses a unique directory for each run, preventing a valid run from failing because its last sample was a minute short or mixed with a previous run. A short smoke run confirmed final-sample/report behavior; it correctly failed the 72-hour duration requirement.

## Not yet verified

The owner confirmed Workers Free. Cloudflare MCP provisioned `leadgap-data` and applied its D1 schema; the checked-in binding now contains the real database ID. A minute cron triggers the authenticated Netlify collector. Research/history/streaming/telemetry remain off on the preview. Billing access and Wrangler CLI authentication remain unavailable, but resource deployment and analytics work through MCP.

The 72-hour freshness/usage gate, production CPU/D1/Netlify quota measurements, real-history calibration and owner-controlled private trading/account checks remain outstanding. Saved-research persistence is tested at the authenticated service boundary; real Privy login on two devices remains an owner check. No funds, real orders or signatures were used for validation.

Follow [the rollout runbook](../operations/ROADMAP-ROLLOUT.md) to finish these gates and activate features in sequence.

## Vercel production release — 18 September 2026

The owner chose to keep Vercel and explicitly requested the latest version on `main`. Added the dedicated authenticated Node.js `/api/collect` route, moved the configured Cloudflare collector URL to the existing production domain, and removed the obsolete daily Vercel cron. Vercel production receives the shared-data service and separate collector/health credentials; existing private auth and builder settings are preserved. No DNS, paid-plan, signing or funding changes are included. The prior Netlify/Worker observations above remain historical evidence. A completed 72-hour soak and real owner account flows are still not claimed.
