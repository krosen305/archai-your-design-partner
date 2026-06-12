---
name: LLM implementation task
about: Strategy-aligned task brief for independent LLM agents
title: "[LLM] "
labels: needs-strategy-review
assignees: ""
---

## Product Surface

Choose one:

- [ ] Screening
- [ ] Kildebog
- [ ] Risikoregister
- [ ] Rapport
- [ ] Needs strategy review

## Strategic Intent

What professional screening problem does this solve?

## User

Who benefits?

- [ ] Architect
- [ ] Building advisor
- [ ] Type-house company
- [ ] Contractor
- [ ] Small residential developer
- [ ] Internal operator

## Expected Outcome

What should be true after this task?

## Non-Goals

What must this task not do?

- [ ] Do not add design generation
- [ ] Do not make AI the compliance authority
- [ ] Do not present output as a legal ruling
- [ ] Do not revive floor-plan, BIM, authority-package or tender workflows
- [ ] Do not touch protected files unless explicitly approved

## Relevant Sources

Required:

- `docs/LLM_OPERATING_BRIEF.md`
- `docs/PRODUCT_STRATEGY.md`
- `AGENTS.md`
- `CLAUDE.md`

Task-specific files:

-

## Boundary And Data Contract

Does this cross a boundary?

- [ ] UI input
- [ ] server function
- [ ] Supabase JSONB/typed columns
- [ ] public register data
- [ ] cache payload
- [ ] AI response
- [ ] restored project state
- [ ] report export

Which schema or decoder validates it?

## Must Not Touch

List protected or risky files that are out of scope:

-

## Manual Review Needed

Mark yes if this touches compliance semantics, AI confidence, public register
integration, persistence/schema, protected files, legal wording or paused scope.

- [ ] Yes
- [ ] No

## Verification

Minimum:

- [ ] `bun run strategy:lint`
- [ ] `git diff --check`

Task-specific:

- [ ] `bunx tsc --noEmit`
- [ ] `bun test`
- [ ] `bunx eslint .`
- [ ] `bun run build`
- [ ] Playwright smoke

## Strategy Preflight Answer

1. Does this support `address -> documented preliminary building screening report`?
2. Which product surface owns it?
3. Is it source/evidence/risk/report related?
4. Does it revive a paused legacy track?
5. Could output be mistaken for a legal ruling or municipal decision?
