# Screening MVP Tasks

Status: active execution document as of 2026-06-13.

Use this document as the concrete task board for independent LLM agents. Product
strategy lives in `docs/PRODUCT_STRATEGY.md`; this file turns that strategy into
sequenced implementation work.

Current mission:

> Address in -> documented preliminary building screening report out.

## Agent Startup Rule

Before working on any task in this file, read:

1. `docs/AGENT_STARTUP.md`
2. `docs/LLM_OPERATING_BRIEF.md`
3. `docs/PRODUCT_STRATEGY.md`
4. `docs/NOW_NEXT_LATER.md`
5. `AGENTS.md`
6. `CLAUDE.md`

Then answer the strategy preflight from `docs/AGENT_STARTUP.md`.

## Parallel Work Rule

Multiple agents may work in parallel only when their file scopes do not overlap.

- One agent per branch.
- One phase or subtask per PR.
- Merge one PR at a time.
- Rebase or restart dependent work after upstream merges.
- Never let two agents edit the same route, component, service, domain helper or
  protected file in parallel.

Recommended branch names:

- `codex/screening-ui-reframe`
- `claude/risk-taxonomy-plan`
- `codex/source-ledger-ui`
- `claude/report-service-boundary`

## Phase 0 - Product Surface Reframe

Goal: make the first journey clearly feel like preliminary professional
screening, not legal approval, design generation or permit preparation.

Recommended owner: Codex.

Primary labels:

- `screening-core`
- `reporting`
- `legal-wording-review`

Allowed files:

- `src/components/cockpit/sections/VerdiktSection.tsx`
- `src/components/cockpit/sections/NaesteStepSection.tsx`
- `src/components/cockpit/layout/CockpitHeader.tsx`
- `src/components/cockpit/layout/CockpitSidebar.tsx`
- `src/routes/projekt.start.tsx`
- `src/routes/index.tsx`
- focused UI tests for the changed components

Avoid:

- `src/lib/rule-engine/**`
- `src/lib/analysis-orchestrator.ts`
- `src/lib/project-store.ts`
- Supabase migrations
- `docs/archive/**`
- protected files unless explicitly approved

Tasks:

1. Reframe the verdict hero.
   - Replace binary/legal-sounding language such as "Du kan bygge her" or
     "Du kan ikke bygge her".
   - Use wording such as "Foreloebig screeningsstatus",
     "Ingen kritisk blokering fundet i de kontrollerede kilder" and
     "Kraever manuel kontrol".
2. Replace design CTAs.
   - Remove first-journey CTAs such as "Aabn plantegning" and
     "Byg paa plantegning".
   - Prefer "Se kildegrundlag", "Gennemgaa risici og ukendte forhold" and
     "Forbered screeningsrapport".
3. Reframe next steps.
   - First next steps must point to risks, sources, manual checks and report
     preparation.
   - Downstream design/permit tasks may be hidden, disabled or clearly marked
     as later scope.
4. Keep compliance authority out of UI.
   - UI may display existing typed results and flags.
   - UI must not invent new compliance policy or hard-stop thresholds.

Acceptance criteria:

- No primary cockpit hero or next-step CTA implies final legal approval.
- No primary CTA sends the user to floor-plan/design as the natural next step.
- Unknown/missing/manual-control language is visible when relevant.
- `bun run strategy:lint` passes.
- `git diff --check` passes.
- Run focused lint/type checks for touched files where practical.

## Phase 1 - Risk Taxonomy Foundation

Goal: stop treating every concern as a hard stop and introduce professional
risk categories.

Recommended owner: Claude Code.

Primary labels:

- `risk-register`
- `screening-core`
- `needs-architecture`
- `legal-wording-review`

Allowed analysis targets:

- `src/lib/compliance-flags.ts`
- `src/lib/compliance-view-model.ts`
- `src/lib/site-risk-classifier.ts`
- `src/lib/rule-engine/**`
- related tests

Implementation constraint:

Start with a short architecture plan before code. Do not rewrite the rule engine
or persistence model in the first pass.

Tasks:

1. Map existing compliance outputs to:
   - blocker
   - dispensation
   - manual review
   - cost risk
   - unknown
2. Identify current flags that overclaim legal blocking status.
3. Create or refine a pure helper/view model if needed.
4. Add representative tests for the mapping.

Acceptance criteria:

- SAVE, fredning, MAT protections, soil risk, radon, groundwater and missing
  data are not collapsed into one "blocker" bucket.
- Unknown remains visible as unknown.
- UI consumers can display the taxonomy without duplicating policy.
- No direct Supabase or Datafordeler calls are introduced.

## Phase 2 - Source Ledger / Kildebog

Goal: make trust visible through source status, confidence and degraded states.

Recommended owner: Codex for UI, Claude Code for data contract changes.

Primary labels:

- `source-ledger`
- `data-quality`
- `reporting`

Allowed files for UI pass:

- `src/components/cockpit/sections/DatakilderSection.tsx`
- `src/components/cockpit/DataSourceStatus.tsx`
- `src/components/cockpit/DatakildeCard.tsx`
- focused view-model helpers and tests

Tasks:

1. Display source name, status, timestamp, confidence and link where available.
2. Make mock/cache/error/skipped/degraded states explicit.
3. Group sources by screening relevance:
   - property/profile
   - planning
   - protection/environment
   - manual-control gaps
4. Surface missing critical sources in report preparation.

Acceptance criteria:

- A professional user can see why the screening is trustworthy or limited.
- Mock/degraded/missing data cannot look like confirmed facts.
- Source ledger wording supports "preliminary screening", not legal certainty.

## Phase 3 - Screening Report MVP

Goal: produce the first demo-ready B2B output.

Recommended owners:

- Claude Code: service/data boundary and report DTO plan.
- Codex: report UI/print view after boundary is clear.

Primary labels:

- `reporting`
- `screening-core`
- `source-ledger`
- `risk-register`

Initial non-goal:

Do not build a perfect PDF engine first. A print-friendly route or view is
acceptable for MVP validation.

Tasks:

1. Define report sections:
   - property profile
   - planning profile
   - building-rights baseline
   - risk register
   - source ledger
   - manual-control checklist
   - disclaimer
2. Define report DTO from existing trusted data.
3. Build a report preview or print-friendly view.
4. Ensure disclaimer and source confidence are present.

Acceptance criteria:

- Report is useful in a meeting with an architect/type-house company/advisor.
- Report clearly says preliminary screening, not legal advice or municipal
  decision.
- Report includes unknowns and manual controls, not only positive findings.

## Phase 4 - Local Plan Citations

Goal: make local-plan extraction credible for professional use.

Recommended owner: Claude Code.

Primary labels:

- `localplan-screening`
- `source-ledger`
- `data-quality`
- `needs-architecture`

Tasks:

1. Audit current `PdfExtractorService` output.
2. Propose citation fields:
   - document URL
   - page
   - section/title
   - short quote or paraphrased evidence
   - extracted field
   - confidence
   - manual review required
3. Implement only after boundary/schema plan is accepted.

Acceptance criteria:

- AI-extracted planning claims are marked as extracted, not authority.
- Missing citation means manual review, not confident truth.
- Source links are preserved for professional verification.

## Phase 5 - Manual-Control Checklist

Goal: turn known data gaps into professional next actions.

Recommended owner: Codex for UI, Claude Code for task derivation logic.

Primary labels:

- `manual-control`
- `data-quality`
- `reporting`

Tasks:

1. List manual checks for:
   - Tingbog/servitudes
   - municipal building archive
   - land survey/boundary certainty
   - geotechnical report
   - soil contamination documentation
   - sewer/utilities
   - noise/climate/coastal risks where automated data is missing
   - specialist BR18 review where relevant
2. Connect checklist items to source gaps and risk findings.
3. Show checklist in cockpit and report.

Acceptance criteria:

- Missing automation becomes explicit professional guidance.
- Manual checks are not presented as completed.
- Checklist can be used in a client/advisor meeting.

## Suggested Agent Allocation

Safe parallel split after this document exists:

| Agent | Task | Branch | File overlap risk |
| --- | --- | --- | --- |
| Codex | Phase 0 UI reframe | `codex/screening-ui-reframe` | Low |
| Claude Code | Phase 1 risk taxonomy plan | `claude/risk-taxonomy-plan` | Medium; analysis-first |
| Codex | Phase 2 source-ledger UI | `codex/source-ledger-ui` | Low after Phase 0 |
| Claude Code | Phase 3 report DTO plan | `claude/report-service-boundary` | Medium; architecture-first |

Do not run Phase 0 and Phase 2 in parallel if both edit the same cockpit
sections. Do not run Phase 1 and Phase 3 implementation in parallel until the
risk taxonomy boundary is stable.

## Minimum Verification For Every PR

Always run:

```bash
bun run strategy:lint
git diff --check
```

Add relevant checks:

```bash
bunx tsc --noEmit
bun test
bunx eslint .
bun run build
```

For frontend-visible work, also perform a local smoke check when practical.
