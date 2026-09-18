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

Initial remote HTTP checks returned the app and 89 live instruments successfully. The geo edge function returned trusted country/subdivision data and ignored spoofed country headers. Public-data responses currently identify their source as `local`: this preview does not yet have shared persistence.

Vercel's environment export returned `[SENSITIVE]` placeholders, including for public values. Importing those placeholders exposed a Privy initialization crash in remote browser checks. The public app ID was recovered from the existing production site's public JavaScript; builder configuration came from the checked-in public defaults. Netlify's public configuration is corrected, and malformed app IDs now prevent the auth provider from mounting instead of crashing public pages. A regression test covers the placeholder. No private Vercel credentials were transferred.

The runtime configuration instructions now require Netlify API/CLI/UI variables: `netlify.toml` alone cannot set server function flags. ESLint excludes generated `.netlify` bundles. The browser feed fixture now intercepts only Leadgap's origin; its former broad `/api/**` matcher incorrectly replaced Privy's public SDK configuration when auth was enabled.

The corrected [immutable preview](https://6aad31bb475017a8e071cf1a--leadgap.netlify.app) builds successfully with public auth configured. All 24 unit checks, ESLint and TypeScript pass. A live browser check renders the email/Google/wallet login modal without uncaught page errors; Privy's analytics endpoint returns 403 on this preview origin. Account login and signing remain untested.

All ten applicable browser scenarios pass against that immutable deployment with real public auth configuration and deterministic Leadgap market fixtures. This includes axe, 375–1920 px/short viewports, compact result spacing, referral copy/attribution, order review and error states. History remains disabled on the preview, so its eleventh scenario is covered by the earlier local feature-enabled run only.

## Not yet verified

Cloudflare MCP can list Workers and D1 in the owner account, but subscription/billing access returns an authentication error. Wrangler CLI is not authenticated. Workers Free plan confirmation is pending before provisioning under the free-tier-only requirement. No Cloudflare database/collector or production soak was started. `workers/data/wrangler.jsonc` retains its placeholder D1 ID and disabled ingestion. Research/streaming/telemetry default off.

The 72-hour freshness/usage gate, production CPU/D1/Netlify quota measurements, real-history calibration and owner-controlled private trading/account checks remain outstanding. Saved-research persistence is tested at the authenticated service boundary; real Privy login on two devices remains an owner check. No funds, real orders or signatures were used for validation.

Follow [the rollout runbook](../operations/ROADMAP-ROLLOUT.md) to finish these gates and activate features in sequence.
