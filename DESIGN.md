# Leadgap — Analyst workspace

Leadgap is a probability-to-perp workstation. Ranked comparisons between Polymarket Yes probability changes and mapped perpetual moves. The residual is a heuristic comparison, not proof of causality or a forecast.

Source of truth for the visual design: the claude.ai/design project “Leadgap Redesign” (`Leadgap Redesign.dc.html`).

## Voice

Plain English. **Signals, Markets, Watchlist, Portfolio, Model, Guide.** Filters: Tradeable / Watching / All. Do not invent wire/brief/dispatch language in chrome. Mark illustrative examples as illustrative; never show fabricated performance.

## Identity

Lime path leads, bone path lags, the band between them is the gap. That is the mark, the row sparkline, the signal hero chart and the desk’s residual pane. Lime is data (Yes %, implied move, odds-led gap, primary action), bone is the perp (mark, observed move). Chrome is warm ink at varying lightness.

## Color

| Token           | Hex                  | Role                                      |
| --------------- | -------------------- | ----------------------------------------- |
| `--chrome`      | `#0E0E0C`            | header, instrument bar                    |
| `--bg`          | `#121210`            | page                                      |
| `--side`        | `#161613`            | book, ticket, blotter, sheets             |
| `--surface`     | `#191916`            | panels, cards, strips                     |
| `--raise`       | `#1C1C18`            | row dividers, ticket summary, skeletons   |
| `--elevated`    | `#22221D`            | chips, active nav pill, hairlines         |
| `--active`      | `#33332B`            | pressed segmented control                 |
| `--line-strong` | `#2C2C26`            | control borders                           |
| `--text`        | `#F2F1EC`            | text                                      |
| `--muted`       | `#A8A69C`            | secondary text (`text-subtle`)            |
| `--dim`         | `#8F8D83`            | labels, captions (`text-dim`)             |
| `--odds`        | `#CBF152`            | lime: Yes %, implied, gap, primary CTA    |
| `--mark`        | `#CFC3AE`            | bone: perp mark, observed                 |
| `--band`        | `rgba(203,241,82,.15)` | the gap band                            |
| `--long`        | `#4FD4A0`            | long, pnl+                                |
| `--short`       | `#F0745F`            | short, pnl−                               |
| `--warn`        | `#E0B341`            | stale / interrupted data                  |

Text on lime uses `--on-odds` (`#14160C`); on long, `--on-long`. Dark only.

## Type

Instrument Sans for UI (13–15px body, 32px workspace headings, weight 500). Instrument Serif for event questions and editorial headlines (24–52px). IBM Plex Mono for every comparable value and for small caps labels (`.kicker`: 10px, 0.1em tracking, uppercase, `--dim`).

## Shape

Panels and cards 10px, controls 7px, segmented children 5px, chips 4px. Grouped stats use a 1px `--line` gap on a bordered container rather than per-cell borders.

## Mark

`LogoMark`, viewBox 24: lime step `M2 17h9V7h11`, bone step `M2 21h13v-7h7`, stroke 2.4. Wordmark Instrument Sans 16px semibold.

## Motion

120ms hover/colour transitions only. Respect reduced motion. Freshness = a dot plus the time of the last good observation (`FRESH · hh:mm:ss`, `STALE · LAST UPDATE …`, `INTERRUPTED`, `CONNECTING…`). A clock alone never establishes freshness.

## Chrome

- Header (52px): mark + Leadgap, Signals / Markets / Watchlist / Portfolio / Model / Guide as pills, 260px search (⌘/Ctrl+K), Log in.
- < 768: 56px header with search; bottom tab bar Signals, Markets, Watch, Portfolio. On a desk the header and tab bar give way to the desk’s own back bar and a Long / Short bar.
- Workspace content uses a 24px desktop / 16px mobile rhythm.

## Surfaces

- `/` Signals — book strip (tradeable, watching, mapped events, window lens), filters, decision rows with the gap sparkline; mobile cards open a bottom sheet. First visit on desktop runs a 4-step walkthrough (`?tour=1` to replay).
- `/signals/[event]/[symbol]` Signal detail — serif question, residual hero chart, narrative, why linked / score breakdown / gap history, sticky decision rail with Watch and Alert me.
- `/markets` Markets — perp table with each instrument’s top live signal.
- `/markets/[symbol]` Trade desk — instrument bar, driving-event gap bar, chart with residual pane, book, blotter, three-step ticket with sticky summary.
- `/watchlist` Watchlist — saved signals and alert rules. Signed in (research on): synced to the account, checked every minute by the research service, with an alerts inbox. Signed out: stored in this browser and evaluated while Leadgap is open.
- `/portfolio` Portfolio — connect card and labelled illustrative preview when signed out; equity, positions, orders, fills, exposure when signed in.
- `/model` Model — live factor averages, score-band distribution, how odds become a move (model v3: threshold markets priced from strike, expiry and assumed volatility; other events worth about one day's typical move; bearish wording flips the sign), known limitations. No published calibration until the archive supports it.
- Share images — each signal has a generated 1200×630 card (question, odds, implied vs observed, gap band, direction) in the same palette; fonts are static TTFs in `src/assets/og`.
- `/events/[id]` Event view — every mapped perp ranked by gap.
- `/about` Guide.

## Primitives

- `GapTrace` / `RowTrace` — implied vs observed with the band; dashed when only the window’s endpoints are known.
- `ResidualChart` — the signal hero, drawn in real pixels.
- `DirectionChip` — Long / Short / No edge, optionally with the perp and score.
- `FeedStamp` — freshness dot, label and refresh.
- `.seg`, `.ctl`, `.chip`, `.kicker` in `globals.css` (components layer; Tailwind utilities override them).

Implementation and behavior contracts: [frontend brief](docs/frontend/BRIEF.md), [quality rules](docs/frontend/FRONTEND_CONTRACT.md). Numerical semantics and verified fixes: [audit](docs/audit/REPORT.md).
