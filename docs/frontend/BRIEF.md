# Leadgap redesign brief

> The visual direction below (ice/stone, Geist) was superseded in September 2026 by the lime/bone identity in [DESIGN.md](../../DESIGN.md). The product cognition, journey and risks still apply.

## Project cognition and thinking gate

- Stage: working product, with reliability and UX gaps. Surface: trading workbench and financial analytics.
- Users: eligible Polymarket perp traders evaluating event-linked moves.
- Objects: events, binary Yes probabilities, mappings, perpetual instruments, residual signals, orders, positions, wallets.
- Journey: Signals or Markets → inspect a mapped event → compare implied and actual move → open instrument → configure/review order → manage position in Portfolio.
- First decision: which signal merits inspection, over which lookback window.
- Success: understand the mapping, data age, and model limitations, then deliberately open the correct market and side.
- Recovery: retain last good data with explicit stale/error state; retry failed reads; clear empty filters; browse markets when no signals qualify.
- Mobile priority: scan signals, inspect one in a sheet, then switch the desk to Trade; keep primary navigation reachable.
- Temperament: calm, precise analyst workspace. Use Signals, Markets, Trade, Portfolio, Guide.
- Keep implementation internals, raw upstream errors, fake live badges, fabricated performance, and unexplained scoring claims out of primary UI.
- Foundation: existing Next.js App Router, React, Tailwind, Radix primitives, Lucide, lightweight-charts. Retain real SDK and wallet integrations.
- References: existing gap identity, trading workstation information density, accessible Radix behavior. No gallery component copying.
- Risks: page-wide keyboard interception; tiny dim labels; incorrect table ARIA; stale feeds presented as live; narrow inspector; hidden login failures; order side/price/leverage mismatch.
- Verification: type/lint/build, consequential unit regressions, deterministic browser states, production read-only smoke, axe checks, 375/768/1024/1440 widths, keyboard and reduced motion.

## Directions considered

1. Editorial research: larger narrative sections and spacious layouts. Good for Guide, too slow for scanning live signals.
2. Industrial execution terminal: maximal density, very small type, hard dividers. Good data capacity, worsens existing legibility and mobile issues.
3. Analyst workspace — selected: clear page heading, a compact data summary, generous rows, persistent inspector and a restrained dark palette. Best balance of scan speed, comprehension, and trade continuity.

## Visual direction

Preserve the existing ice-blue odds / stone perp identity, Geist Sans and Geist Mono. Lift dark surfaces slightly, make muted text readable, strengthen focus and surface boundaries. Introduce a disciplined 24px page rhythm, 32px headings, 13–14px table copy, 12px supporting labels, and 36–44px controls. Signature: paired implied/actual values with the residual band between them, visible in both the list and the inspector. A selected signal should read like an analytical decision, with its probability, mapping, model estimate, observed move, and next action together.

Motion is limited to hover, selection and loading feedback; respect reduced motion. No decorative raster visuals: the established product identity dictates a code-native, data-first answer. Figma is used for a direction exploration board; browser screenshots validate the implemented product.

## Skill synthesis

ui-ux-pro-max returned useful data-dense/drill-down, filtering, row feedback, readable numeric typography and accessibility guidance. Its unrelated horizontal marketing journey and luxury-font matches were rejected as unsuitable. Existing Geist typography and the established brand palette take precedence over generic suggested palettes. Dark-only is intentional; no unused light mode is added.
