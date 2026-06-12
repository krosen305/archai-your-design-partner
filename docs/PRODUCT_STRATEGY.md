# ArchAI Product Strategy

Status: current product strategy as of 2026-06-12.

## North Star

ArchAI will become Denmark's best automated building screening and feasibility
platform for villa and residential projects.

The product serves professional users:

- architects
- building advisors
- type-house companies
- contractors
- small residential developers

The primary use case is early feasibility and pre-purchase due diligence:

> A professional enters an address and receives a documented preliminary
> screening of whether a project appears feasible, what risks exist, which
> sources support the result and what still requires manual control.

## What ArchAI Is

ArchAI is a source-driven decision cockpit for early residential construction
screening in Denmark.

It helps professionals understand:

- property and plot facts
- planning status and local-plan constraints
- building-rights indicators
- register and environmental risks
- source quality and confidence
- missing data and manual checks
- next advisory actions

The first commercial product is a professional screening report, not a design
tool.

## What ArchAI Is Not

ArchAI is not:

- a legal ruling
- a municipal decision
- a replacement for an architect, lawyer, land surveyor or engineer
- a CAD tool
- an AI image/design toy
- a building permit generator in the MVP

The system must never imply that a project is finally approved or legally
settled. It may say that a preliminary screening found no obvious blocker, but
it must also show sources, assumptions, confidence and manual checks.

## Trust Principles

1. Documentation beats automation.
2. Source quality must be visible.
3. Unknown is a valid result.
4. AI may explain and extract; AI must not decide compliance.
5. A missing source must not be converted into a negative or positive fact.
6. Legal blockers, dispensations, technical risks, cost risks and unknowns are
   different categories.
7. Professional users must be able to see what should be checked manually before
   advising a client.

## MVP

The MVP is:

> Address in -> preliminary screening report out.

The report should include:

1. Property profile from BBR, MAT, VUR, FBB and related sources.
2. Planning profile from Plandata, local plans and kommuneplanrammer.
3. Building-rights screening for area, height, storeys and core constraints
   where data quality allows it.
4. Risk register with categories:
   - blocker
   - dispensation
   - manual review
   - cost risk
   - unknown
5. Source ledger with source, timestamp, status, confidence, mock/cache/error
   state and link when available.
6. Manual-control checklist for servitudes, municipal archive, land survey,
   soil/geotechnics, utilities, noise/climate and other unavailable sources.
7. Professional disclaimer: preliminary screening, not legal advice or a
   municipal decision.

MVP success means a professional user says:

> This saves the first 1-2 hours of desk research and gives me a trustworthy
> checklist for the client conversation.

## Stop Now

Do not invest new product work in:

- free design without plot
- AI-generated house concepts as the main journey
- inspiration image workflows as a core feature
- floor-plan generation as primary CTA
- BIM generation
- tender/contract workflows
- one-click permit applications
- authority-grade drawing packages as MVP scope

These areas may remain in code as legacy or future assets, but they must not
drive product direction.

## Build Next

Prioritize:

- screening-report UI and export
- risk taxonomy and wording that avoids legal overclaiming
- source ledger and confidence UX
- local-plan extraction with citations and review state
- better distinction between blocker, dispensation, review and unknown
- B2B terminology throughout user-facing and agent-facing docs
- manual-control checklist for non-automated sources
- data-source gap closure for the most commercially relevant risks

## Build Later

Only after MVP validation:

- deeper BR18 evidence ledger
- authority package
- beliggenhedsplan as report appendix
- floor-plan tools
- organization/team accounts
- public/partner API
- tender and contract workflows

## Documentation Rule

When in doubt, current documentation should optimize for:

- product-market fit
- credibility
- validation speed
- source transparency
- risk reduction

Do not optimize the roadmap around technical elegance, AI spectacle or downstream
construction artifacts before the screening product is trusted.
