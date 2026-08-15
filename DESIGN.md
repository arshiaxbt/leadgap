# Leadgap — Wire desk

Leadgap is not a prediction-market site and not a perp DEX. It is a **wire for event probability** that prints into a **perp ticket**. Discover the question, read why the mark has not followed, execute the instrument.

## Why the current UI fails

Production is a dark SaaS dashboard with mint CTAs, a slogan H1, a featured card, pinging “Live,” and a table that repeats the card. Score competes with Yes %. The journey (discover → understand → execute) is three widgets, not one motion. Mint is used for brand, long, and Yes % at once. It looks generated.

Rejected directions we will not repeat: Bloomberg amber tape, Hyperliquid neon, Polymarket purple tiles, indigo “institutional terminal.”

## Philosophy

The product is a **causal chain**. Layout is the product.

1. **Wire** — ranked event questions. This is discovery.
2. **Brief** — Yes path, expected vs actual, gap, one thesis line. This is understanding.
3. **Desk** — mark, book, ticket. This is execution.

If a trader cannot see that chain in two seconds, the UI is wrong.

## Visual direction

Warm carbon, not cool navy. Event titles in a **serif** (questions are language). Numbers in **tabular mono**. One accent: **copper** for probability. Stone gray for the perp. Forest / brick only for long, short, and PnL.

| Token | Role |
| --- | --- |
| `--bg` `#100f0d` | page |
| `--surface` `#181614` | pane |
| `--line` `#2c2823` | hairline |
| `--text` `#f0ebe3` | ivory |
| `--muted` `#9a9388` | secondary |
| `--signal` `#c4a574` | Yes %, odds-led gap |
| `--perp` `#8e959e` | mark, book prices |
| `--long` `#3f8f6e` | buy / pnl+ |
| `--short` `#b85c4c` | sell / pnl− |

Radius 2px max. No pills-as-identity. No mint fill. No ping dots. No hero cards.

**Mark** — square, 2px radius, hairline. Copper step leads; stone step lags. The empty band between them is the gap. Same geometry as the residual spark. Not mint, not neon, not a letter.

## Component system

- `Panel` — hairline pane
- `Pill` — square outline, not rounded-full
- `Segmented` — inset, not white chip
- `LiveDot` — static copper
- `Metric` — 10px label / 15px value
- `SignalCard` — four-beat brief (event, Yes path, expected/actual/gap, thesis)

## Pages

- `/` **Wire** — list + inspector. Selecting a row is understanding. Opening desk is execution. On small screens the brief docks to the bottom so the chain stays on screen.
- `/markets/[symbol]` **Desk** — same brief in intel; chart Yes % in copper; ticket uses long/short only.
- `/markets` **Markets** — full-bleed instrument table, stone marks.
- `/portfolio` **Account** — equity, event exposure, blotter language.
- `/about` **About** — how to read Act / Lead / All, fees, the desk, and login.

Routes, APIs, scoring, Privy, session, and `placeOrder` stay as they are.
