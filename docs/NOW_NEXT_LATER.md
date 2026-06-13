# NOW / NEXT / LATER

Status: current active roadmap framing as of 2026-06-12.

This file exists so independent agents do not infer roadmap direction from old
plans, archived specs or partially built legacy features.

Concrete implementation tasks, file boundaries and acceptance criteria live in
`docs/SCREENING_MVP_TASKS.md`.

## NOW

Build the minimum credible B2B screening product:

- address-based screening flow
- professional screening-report structure
- source ledger / kildebog
- risk taxonomy:
  - blocker
  - dispensation
  - manual review
  - cost risk
  - unknown
- wording that avoids legal overclaiming
- local-plan extraction with citations, confidence and review state
- manual-control checklist for non-automated sources
- clearer source quality and degraded-state UI
- report export or print-ready report view
- B2B language across active docs and user-facing product surfaces

## NEXT

Deepen the screening platform after the basic report is credible:

- stronger BR18 evidence ledger
- better Plandata/local-plan coverage
- DK-Jord / GEUS / HIP / DHM / noise / climate data-source hardening
- servitude/Tingbog manual workflow
- better source freshness and cache semantics
- organization/team model if B2B validation requires it
- internal QA/evals for report quality and source citation accuracy

## LATER

Only after MVP validation:

- beliggenhedsplan as report appendix
- authority package
- floor-plan tools
- BIM or quantity workflows
- partner/public API
- tender and contract workflows
- deeper design iteration tooling

## PAUSED

Do not invest new work here unless explicitly revived:

- free design without plot
- AI house concepts as the main journey
- Hus-DNA as product core
- inspiration-image workflows as product core
- floor-plan generation as primary CTA
- one-click permit applications
- authority-grade drawing package as MVP scope
- tender/contract automation

## Decision Rule

If a task does not make the screening report more trustworthy, faster to produce
or easier for a professional to explain to a client, it is probably not NOW.
