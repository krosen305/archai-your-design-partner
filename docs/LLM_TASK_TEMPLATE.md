# LLM Task Template

Use this template for Linear issues, GitHub issues, PRDs and handoffs to
independent LLM agents.

## Product Surface

Choose one:

- `Screening`
- `Kildebog`
- `Risikoregister`
- `Rapport`

If none fits, mark `needs-strategy-review` before implementation.

## Strategic Intent

What user problem does this solve for professional building screening?

Write the answer in one or two sentences.

## User

Who benefits?

- architect
- building advisor
- type-house company
- contractor
- small residential developer
- internal operator

## Expected Outcome

What should be true after the task is done?

## Non-Goals

Explicitly list what this task must not do.

Examples:

- Do not add design generation.
- Do not make AI the compliance authority.
- Do not change protected files.
- Do not present output as a legal ruling.
- Do not revive floor-plan, BIM, authority-package or tender workflows.

## Relevant Sources

List source files or docs the agent must read first.

Required by default:

- `docs/LLM_OPERATING_BRIEF.md`
- `docs/PRODUCT_STRATEGY.md`
- `AGENTS.md`
- `CLAUDE.md`

## Boundary And Data Contract

Does this cross a boundary?

- UI input
- server function
- Supabase JSONB/typed columns
- public register data
- cache payload
- AI response
- restored project state
- report export

Which schema or decoder validates it?

## Must Not Touch

List protected or risky files that are out of scope.

## Manual Review Needed

Mark yes if the task touches:

- compliance semantics
- AI output used for user confidence
- public register integration
- persistence/schema
- protected files
- legal/disclaimer wording
- archived/paused product scope

## Verification

Minimum expected verification:

- `bun run strategy:lint`
- `git diff --check`

Add task-specific checks as needed:

- `bunx tsc --noEmit`
- `bun test`
- `bunx eslint .`
- `bun run build`
- Playwright smoke

## Strategy Preflight Answer

The agent must answer:

1. Does this support `address -> documented preliminary building screening report`?
2. Which product surface owns it?
3. Is it source/evidence/risk/report related?
4. Does it revive a paused legacy track?
5. Could output be mistaken for a legal ruling or municipal decision?
