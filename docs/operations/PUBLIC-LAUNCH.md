# Public launch review — 20 September 2026

What a public audience meets first, and what is still unresolved. Written against production at `7a60b9d` plus the shared-cache change in PR #20. Live checks were read-only.

## 1. Hosting terms conflict with monetization — owner decision

The Vercel team `arshiags-projects` is on the **hobby** plan (verified with `vercel teams ls`). Vercel's Hobby plan is for personal, non-commercial projects ([plans/hobby](https://vercel.com/docs/plans/hobby)). Leadgap ships Polymarket referral links (`via=arshia`, the Guide's "Support Leadgap" panel) and carries builder attribution credentials, so a publicised Leadgap is not obviously non-commercial, even though the Guide states there is no Leadgap builder fee.

Three ways out, and only the owner can pick:

1. **Publish without monetization.** Remove the referral panel and builder attribution, stay on Hobby, stay free. Cheapest, gives up revenue.
2. **Move the app to Cloudflare's free Workers platform.** Collection, D1 and the data service already run there, and Cloudflare's free plan carries no equivalent non-commercial clause that could be found in its developer docs — confirm against Cloudflare's own terms before relying on it. Requires porting Next.js to Workers (`vinext` or OpenNext) and revalidating; it is a real migration, not a config switch.
3. **Upgrade to Vercel Pro.** Removes the conflict immediately, but is not free (~$20/month), and no billing change is authorized today.

Nothing here was changed. Until it is resolved, treat wide publicity as carrying a platform-terms risk.

## 2. Free-tier headroom after PR #20

| Budget | Current | Limit | Notes |
| --- | --- | --- | --- |
| Worker CPU per invocation | p99 4.5 ms, p999 6.9 ms (v5, 3 h) | 10 ms Workers Free | Internal gate is 8 ms; full-period recheck still pending |
| Worker requests | ~17 K/day | 100 K/day | Collection and the two local monitors dominate |
| D1 rows read / written | 151 K / 7.4 K per day | 5 M / 100 K | 3 % and 7 % |
| D1 storage | 39 MB | 5 GB | v5 projects 231 MB at steady state |
| Vercel | Hobby limits | — | Shared CDN caching keeps repeat reads off the functions |

Before PR #20 every visitor poll reached the origin, so Worker and D1 use scaled with visitors. With `s-maxage` on the public read routes, one origin read serves everyone for a few seconds and load scales with data, not traffic. Verified on preview: repeat requests return `x-vercel-cache: HIT`.

## 3. What a first-time visitor sees

Live production at the time of writing: 11–13 rows per window, 0–3 with a direction, top score 52 on the 4 h window. **An empty board is a correct outcome** under v5's strict eligibility, and the feed says so: "Nothing passes the model's thresholds across N mapped events on the {window} window. That's a normal state, not an error." Do not weaken eligibility, timing or cost checks to make the board look busier.

## 4. Disclosures present, and the gap

Present in the Guide: "This is not financial advice", venue fees/funding/liquidation warnings, "No Leadgap builder fee", scores and liquidation prices described as approximations, illustrative portfolio data labelled as such, and the referral disclosure next to the referral link.

**Missing:** any statement of what Leadgap stores about a visitor. The app has a Privy login (email or wallet), keeps watchlists and alert rules (in the browser signed out, in the account signed in), and — as of 20 September — records aggregate, per-day counters of eight product events with no identifiers. A short "What Leadgap stores" section in the Guide would cover it. Not legal advice; this is a transparency gap, not a compliance opinion.

## 5. Still unverified before going public

- **Owner account checks.** Sign in on two devices and confirm the watchlist, alert rules and inbox match; then confirm a second account cannot see the first account's items. Automated checks cannot establish this.
- **Funded order flow.** No wallet transaction or funded order has ever been exercised. Review-screen contents, fees, fills and funding receipts remain unverified against a real account.
- **Elapsed-time gates.** The v5 shadow run ends 20 September 22:50 UTC and the production soak 23 September 08:54 UTC. Both are pending, not passed, and both depend on this workspace staying alive.
- **Soak revision.** The owner chose to merge improvements as they are ready, so each deploy restarts the clock for the deployed revision. Decide at launch whether to run a fresh soak against the exact launch revision or to accept partial coverage, and record which.
