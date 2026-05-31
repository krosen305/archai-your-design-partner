# ArchAI Testing Strategy

## Philosophy

Tests must earn their place. We do not write tests for coverage metrics.
A test is worth writing if it would catch a real regression that TypeScript
cannot catch — in compliance logic, in server-side auth gating, or in a
critical user journey.

## Three Tiers

### Tier 1 — Domain & pure functions (bun:test)

Location: `src/lib/rule-engine/`, `src/integrations/supabase/repositories/*.derivation.ts`, `src/lib/`

These are the compliance brain of ArchAI. They are pure TypeScript with no
network or DOM dependencies. A failure here means wrong compliance output
for users — potentially expensive decisions made on bad data.

Examples of tests that belong here:

- `evaluateHardStop` with SAVE 3 → blocked
- `deriveSoilContaminationStatus` with v2Kortlagt=true → "contaminated"
- `deriveSiteConstraintsPatch` with null addressId → null
- `deriveAutoTasks` with strandbeskyttelse=true → STRANDBESKYTTELSE task

Run: `bun test src/lib/rule-engine src/integrations/supabase/repositories`

### Tier 2 — Application service & server function handlers (bun:test)

Location: `src/lib/analysis-orchestrator.test.ts`, `src/lib/cockpit.functions.test.ts`

Test the server-side logic that orchestrates compliance: auth gating,
rule engine execution before AI, rejection of client-sent hard-stop signals.
Use dependency injection (`createAnalysisOrchestrator(deps)`) — never
`mock.module` on orchestrators.

Key invariants to test:

- Cache hit bypasses `fetchBbrWithMat`
- `handleRunByggeanalyse` runs `runRuleEngine` before calling AI service
- Client-provided `hasHardStop` in raw payload is ignored
- Invalid token is rejected before analysis runs

Run: `bun test src/lib`

### Tier 3 — Playwright acceptance (3-6 tests max)

Location: `tests/*.spec.ts`

Tests critical user journeys against the production build. Not for edge
cases — for proving the app works end-to-end for a real user.

Current accepted specs:

- `cockpit-data.spec.ts` — authenticated address flow → cockpit shell
- `floor-plan-editor.spec.ts` — authenticated project → interactive floor-plan editor
- `production-smoke.spec.ts` — production build renders project start

Playwright runs against `bun run build && bun run preview` in CI. It is
slow. Do not add Playwright specs for things unit tests can cover.
Specs that require a real user skip unless `PLAYWRIGHT_TEST_EMAIL` and
`PLAYWRIGHT_TEST_PASSWORD` are present in the environment.

Run: `bunx playwright test`

## React UI Tests

Use sparingly. Only for components where Zustand state logic is non-trivial
and would be expensive to test only via Playwright.

Rules:

- Use real Zustand store via `renderWithProject()` from `src/testing/render-with-project.tsx`
- Reset store in `beforeEach` via `useProject.getState().reset()`
- Never `mock.module("@/lib/project-store", ...)` — this leaks between test files
- Each React test must import `@/testing/react-test-setup` explicitly at the top

Current React tests:

- `src/components/cockpit/StatusStripe.test.tsx`
- `src/hooks/useCockpitRestore.react.test.tsx`

## Live Integration Tests

Location: `tests/live/`

Require `RUN_LIVE_SUPABASE_TESTS=true` env flag. Only run manually or via
dedicated CI job (`workflow_dispatch`). Never run in the standard `bun test src` job.

## What Not To Test

- CSS, layout, visual design
- React components where TypeScript already guarantees the output
- Trivial getters, setters, pass-through functions
- Every permutation — test boundary values and representative cases

## Lovable Exclusion

Lovable generates React components. It must never write or modify test files.

- `bunfig.toml` restricts `bun test` to `src/` — Lovable does not touch tests
- `tests/` is Claude Code territory
- Rule: never ask Lovable to write, update, or review a test

## CI Structure

| Job                 | Command                | Credentials                         |
| ------------------- | ---------------------- | ----------------------------------- |
| Unit + lint + build | `bun test src`         | `DATAFORDELER_API_KEY` only         |
| E2E acceptance      | `bunx playwright test` | Supabase publishable key            |
| Live integration    | `bun test tests/live`  | Service role (manual dispatch only) |
