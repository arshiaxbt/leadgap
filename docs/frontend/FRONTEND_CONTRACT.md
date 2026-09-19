# Frontend quality rules

Use the existing Next.js / Tailwind / Radix stack and tokens in `src/app/globals.css`. Follow [DESIGN.md](../../DESIGN.md) and the [product brief](BRIEF.md).

- Preserve the flow: select a signal → understand event/mapping/residual → open the correct instrument → deliberately configure an order.
- Keep probabilities, percentage-point changes, price returns, leverage and model scores distinct. Mark illustrative examples and heuristic estimates explicitly.
- Retain last successful data on refresh failures; show interruption/age and a recovery action. Never relabel a failed or stale observation as current.
- Validate at both the form and execution boundary. Show errors beside the action, keep submitted-order language distinct from filled/closed-position language, and confirm destructive account actions.
- Use native links, buttons and selects; scoped keyboard handlers; visible focus; semantic tables; current/pressed states; labels for all inputs. Do not intercept keys globally except documented command search.
- Keep signal details reachable on mobile through a bottom sheet with focus management; on desktop a signal opens its own page. Desktop sidebars should not squeeze ticket controls below a usable width.
- Provide loading, empty, stale, error, disabled and unauthenticated states. Respect reduced motion. Verify document overflow at 375, 768, 1024 and 1440px.
- Use Instrument Sans for language, Instrument Serif for event questions and headlines, and IBM Plex Mono for comparable values. Use lime (odds, implied) and bone (mark, observed) for the compared data, green/red for signed values and trade sides, and readable muted text.
- For meaningful changes, run lint/typecheck/build and relevant regression/browser checks. Use axe plus visual/keyboard review; a clean automated report is not a full accessibility certification.
- No real funded-account actions in automated tests. Use mocked reads and an SDK spy, then document any owner-controlled integration verification separately.
