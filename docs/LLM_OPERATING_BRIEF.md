# LLM Operating Brief

Status: current brief as of 2026-06-12.

Read this before doing independent work in ArchAI.

For concrete startup prompts and multi-agent coordination, read
`docs/AGENT_STARTUP.md`.

For the active MVP execution tasks, read `docs/SCREENING_MVP_TASKS.md`.

## Mission

Current mission:

> Address in -> documented preliminary building screening report out.

ArchAI is a B2B feasibility and due-diligence platform for Danish villa and
residential projects.

## User

Build for professional users:

- architects
- building advisors
- type-house companies
- contractors
- small residential developers

The user is trying to qualify a property or project before expensive design,
purchase, demolition or engineering work begins.

## Current Product Surfaces

Use these surfaces when classifying work:

| Surface | Purpose |
| --- | --- |
| `Screening` | Address, property profile, plot and public-data collection. |
| `Kildebog` | Source ledger, timestamps, status, confidence and links. |
| `Risikoregister` | Blockers, dispensations, manual review, cost risks and unknowns. |
| `Rapport` | Professional preliminary screening report with caveats. |

## Must Preserve

- Show sources.
- Show confidence.
- Show unknowns.
- Show degraded/missing data.
- Mark manual professional checks.
- Separate blocker, dispensation, manual review, cost risk and unknown.
- Say preliminary screening, not legal ruling.

## Stop List

Do not start new work in these areas unless the user explicitly revives scope:

- free design without plot
- AI house concepts as the main journey
- Hus-DNA or inspiration-image workflows as core product
- floor-plan generation as primary CTA
- BIM generation
- one-click permit applications
- authority-grade drawing packages as MVP scope
- tender/contract workflows

## AI Rule

AI may extract, summarize and explain.

AI must not decide compliance, invent legal truth or turn missing source data
into a positive/negative fact.

## Output Rule

Any user-facing analysis should answer:

1. What do we know?
2. Which source supports it?
3. How confident is the system?
4. What is unknown?
5. What must a professional check manually?
6. What is the next advisory action?

## Independent-Agent Rule

If a task does not clearly support `Screening`, `Kildebog`, `Risikoregister` or
`Rapport`, pause and ask for strategy review before implementing.

## Archive Rule

Files under `docs/archive/**` are historical context only. They are never current
implementation instructions unless a current canonical document explicitly
revives that scope.
