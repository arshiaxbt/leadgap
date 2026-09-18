# Leadgap — Analyst workspace

Leadgap is a probability-to-perp workstation. Ranked comparisons between Polymarket Yes probability changes and mapped perpetual moves. The residual is a heuristic comparison, not proof of causality or a forecast.

## Voice

Plain English. **Signals, Markets, Trade, Portfolio, Guide.** Filters: Tradeable / Watching / All. Do not invent wire/brief/dispatch language in chrome.

## Identity

Ice path leads, stone path lags, the empty band is the gap. That is the GapMark and the Yes% overlay. Not a DEX. Not Polymarket tiles. Not a newspaper.

Interactive chrome is white at varying opacity. Ice is data (Yes %, odds-led gap, selected-row inset), never nav underline.

## Color

| Token         | Hex       | Role                         |
| ------------- | --------- | ---------------------------- |
| `--bg`        | `#090D12` | ink / page                   |
| `--surface`   | `#10161E` | panel                        |
| `--elevated`  | `#18212C` | raise                        |
| `--line`      | `#26313E` | rare hairline                |
| `--text`      | `#EDF2F8` | ash                          |
| `--muted`     | `#A4AFBF` | mute text                    |
| `--dim`       | `#929FB0` | dim text                     |
| `--odds`      | `#9ED7FF` | Yes %, overlay, odds-led gap |
| `--odds-deep` | `#4E86AE` | search / control focus       |
| `--mark`      | `#B4BDCA` | perp mark, book prices       |
| `--long`      | `#3ECF8E` | buy / pnl+                   |
| `--short`     | `#FF8179` | sell / pnl−                  |
| `--warn`      | `#d4a017` | warnings                     |

`--signal` and `--perp` are aliases of `--odds` and `--mark` so mixed pages keep working during the rebuild.

Focus ring is `--odds` at 40% on controls. Dark only. No light theme.

## Type

Geist Sans for UI and event titles. Geist Mono for numbers. Scale: 13–14px body and table copy, 12px secondary labels, 18–24px section headings, 32px workspace headings. Dense chart annotations may use 11px. Labels are sentence case, not 10px uppercase tracking.

## Shape

Panels 8px, controls 6px, chips 4px, table cells 0. Depth from a 1px surface shift, not a grid of borders.

## Mark

GapMark, viewBox 24. Ice stroke leads, stone stroke lags, 16% ice fill in the band. Wordmark Geist 15px, not italic. The empty band is the gap.

## Motion

120ms hover. 80ms row flash on live print. No ping dots. Data status = a static square + update timestamp, with explicit delayed and interrupted states. A live clock alone does not establish feed freshness.

## Chrome

- Header: GapMark + Leadgap, Signals / Markets / Portfolio / Guide. Trade is not a nav item.
- Cmd/Ctrl+K searches events and instruments.
- No marketing sentence on app chrome. 24px status strip: live clock, not financial advice (md+), Created by 0xarshia.eth, GitHub and X logos. Guide footer repeats the credit. Mobile strip sits above the tab bar. Workspace content uses a 24px desktop / 16px mobile rhythm.
- < 768: bottom nav Signals, Markets, Trade (when on a symbol), Portfolio; Guide appears when outside a trading desk.

## Surfaces

- `/` Signals — flexible ranked monitor + 360px inspector
- `/markets` Markets — instrument table
- `/markets/[symbol]` Trade — chart beside book, blotter under that cluster, EventRail then ticket
- `/portfolio` Portfolio — equity, positions, fund
- `/about` Guide — short product guide

## Primitives

- `OddsFigure` — Yes% in `--odds`, signed delta beside it
- `GapMeter` — expected (ice tick) vs actual (stone tick); the band is the residual
- `DataTable` — sentence-case headers, selected ice inset, 80ms print flash, column-faithful skeleton
- Buttons: ghost chrome, filled long (`--long`), filled short (`--short`)

Implementation and behavior contracts: [frontend brief](docs/frontend/BRIEF.md), [quality rules](docs/frontend/FRONTEND_CONTRACT.md). Numerical semantics and verified fixes: [audit](docs/audit/REPORT.md).
