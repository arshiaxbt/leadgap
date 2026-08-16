# Leadgap — Causal Split

Leadgap is a probability-to-perp workstation. Ranked Polymarket events whose Yes odds moved before the mapped perpetual. The residual is the product. The perp is the trade.

## Voice

Plain English. **Signals, Markets, Trade, Portfolio, Guide.** Filters: Tradeable / Watching / All. Do not invent wire/brief/dispatch language in chrome.

## Identity

Ice path leads, stone path lags, the empty band is the gap. That is the GapMark and the Yes% overlay. Not a DEX. Not Polymarket tiles. Not a newspaper.

Interactive chrome is white at varying opacity. Ice is data (Yes %, odds-led gap, selected-row inset), never nav underline.

## Color

| Token | Hex | Role |
| --- | --- | --- |
| `--bg` | `#07090C` | ink / page |
| `--surface` | `#0B0E14` | panel |
| `--elevated` | `#10141B` | raise |
| `--line` | `#191E27` | rare hairline |
| `--text` | `#E4E8EF` | ash |
| `--muted` | `#79818F` | mute text |
| `--dim` | `#535B69` | dim text |
| `--odds` | `#8FC9F2` | Yes %, overlay, odds-led gap |
| `--odds-deep` | `#4E86AE` | search / control focus |
| `--mark` | `#8A909B` | perp mark, book prices |
| `--long` | `#3ECF8E` | buy / pnl+ |
| `--short` | `#F0564E` | sell / pnl− |
| `--warn` | `#d4a017` | warnings |

`--signal` and `--perp` are aliases of `--odds` and `--mark` so mixed pages keep working during the rebuild.

Focus ring is `--odds` at 40% on controls. Dark only. No light theme.

## Type

Geist Sans for UI and event titles. Geist Mono for numbers. Scale: 12/13 body, 15/18/22 titles, 11 secondary. Labels are sentence case, not 10px uppercase tracking.

## Shape

Panels 8px, controls 6px, chips 4px, table cells 0. Depth from a 1px surface shift, not a grid of borders.

## Mark

GapMark, viewBox 24. Ice stroke leads, stone stroke lags, 16% ice fill in the band. Wordmark Geist 15px, not italic. The empty band is the gap.

## Motion

120ms hover. 80ms row flash on live print. No ping dots. Live = a static 6px ice square + timestamp.

## Chrome

- Header: GapMark + Leadgap, Signals / Markets / Portfolio / Guide. Trade is not a nav item.
- Cmd/Ctrl+K searches events and instruments.
- No marketing sentence on app chrome. 24px status strip: live clock, not financial advice (md+), Created by 0xarshia.eth, GitHub and X logos. Guide footer repeats the credit. Mobile strip sits above the tab bar.
- < 768: bottom nav Signals, Markets, Trade (when on a symbol), Portfolio.

## Surfaces

- `/` Signals — 62/38 ranked monitor + inspector
- `/markets` Markets — instrument table
- `/markets/[symbol]` Trade — chart beside book, blotter under that cluster, EventRail then ticket
- `/portfolio` Portfolio — equity, positions, fund
- `/about` Guide — short product guide

## Primitives

- `OddsFigure` — Yes% in `--odds`, signed delta beside it
- `GapMeter` — expected (ice tick) vs actual (stone tick); the band is the residual
- `DataTable` — sentence-case headers, selected ice inset, 80ms print flash, column-faithful skeleton
- Buttons: ghost chrome, filled long (`--long`), filled short (`--short`)

Routes, APIs, scoring, Privy, session, and `placeOrder` stay as they are.
