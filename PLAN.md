# Leadgap audit and redesign plan

## Outcome

Understand the complete application, correct verified defects, redesign every user-facing route around the event → probability move → perp gap → trade workflow, and deliver evidence plus a prioritized product roadmap.

## 1. Discover and establish a baseline — complete

- [x] Locate GitHub source and Vercel production project; create isolated working branch.
- [x] Read repository instructions, product README, design guidelines, and requested skills.
- [x] Map routes, APIs, data ingestion, scoring, mapping, auth, wallets, order lifecycle, funding, observability, and deployment.
- [x] Inspect production routes, recent deployment/runtime evidence, dependencies, and configuration without disclosing secrets.
- [x] Run baseline typecheck, lint, build, and desktop/mobile browser review.

## 2. Repair verified defects

- [x] Record findings by severity, reproduction, affected flow, fix, and verification.
- [x] Prioritize incorrect/stale data, unsafe order inputs, auth/authorization, request validation, recovery states, and broken navigation.
- [x] Add focused regression tests for consequential logic; establish reproducible CI checks.
- [x] Distinguish defects from upstream/service/environment limitations and product decisions.

## 3. Design and implement

- [x] Complete product cognition and choose among three visual directions using the requested design skills.
- [x] Define shared tokens, typography, layout, density, accessible states, and mobile behavior; retain the recognizable gap identity.
- [x] Redesign Signals and inspector, Markets, Trade desk, Portfolio, Guide, global navigation, loading/error/empty states.
- [x] Use Figma MCP for useful exploration if the connection supports it; implement real interactions in the existing Next.js stack.

## 4. Verify and prepare delivery

- [x] Pass lint, typecheck, production build, and regression tests.
- [x] Exercise search/filter/select → event inspection → market desk, chart controls, portfolio/login entry, and failure recovery.
- [x] Verify 375/768/1024/1440px layouts, keyboard navigation, reduced motion, contrast, and accessible names with browser evidence.
- [x] Review the final diff, prepare a reviewable preview/branch, and document remaining limitations honestly.

## 5. Recommend next investments

- [x] Rank recommendations by user value, risk, effort, and dependencies, based on the audit.

## Delivery evidence

- [Audit and architecture](docs/audit/REPORT.md)
- [Validation and remaining verification](docs/audit/VALIDATION.md)
- [Prioritized recommendations](docs/audit/RECOMMENDATIONS.md)
- [Design brief](docs/frontend/BRIEF.md) and [Figma direction exploration](https://www.figma.com/design/zM6zNkiZI7nDwZGRQg6CC5)

## Scope notes

- No real order, cancellation, withdrawal, deposit, or account mutation is required to test this work. Use deterministic fixtures for these paths.
- Production service state and installed integrations are inspected before changes.
- “Fully checked” means the documented routes and workflows have evidence; no audit can promise that every possible defect has been found.
