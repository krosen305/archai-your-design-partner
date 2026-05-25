# ArchAI ROADMAP2 - Architecture Hardening Round 2

Status: proposed implementation backlog for human review. Do not treat these
items as approved Linear tickets until the project owner has reviewed them.

Last updated: 2026-05-21

Purpose: this file is written as a handoff brief for another LLM/agent. It
contains the essential project context needed to implement the findings without
having the original review conversation.

---

## Essential project context for implementers

ArchAI is "The Builder's Cockpit": an AI-assisted platform for private
residential construction in Denmark. The stack is TanStack Start/React SSR on
Cloudflare Workers, Bun, Supabase, Datafordeler, deterministic rule-engine logic
and AI integrations.

### Non-negotiable domain rules

- Use the 4 canonical phases in new code and docs: `Sandkassen`, `Matriklen`,
  `Maskinrummet`, `Myndighed`.
- Pre-purchase due diligence is a primary use case. Compliance is not only a
  later design aid.
- DAWA/Dataforsyningen REST must not be used as compliance/register source.
  Allowed exceptions are address autocomplete through
  `api.dataforsyningen.dk/rest/gsearch/v2.0` and SDFI map tiles. Address,
  matrikel, BBR and area data must come from Datafordeler sources.
- Hard Stop logic is deterministic and must be sourced from the rule engine,
  especially `src/lib/rule-engine/rules/stop-rules.ts` and
  `src/lib/rule-engine/hard-stop-adapter.ts`.
- Server-side compliance gates must never trust client-provided values such as
  `hasHardStop`, `hasAbsoluteHardStop` or equivalent derived gate signals.
- Compliance values with typed columns must not live only in JSONB:
  `heritage_save_value`, `is_fredet`, `grundareal_m2`,
  `bebygget_areal_m2`, `hard_stop`, `hard_stop_reason`,
  `budget_estimate`.

### Non-negotiable codebase rules

- Do not edit `src/routeTree.gen.ts`.
- Do not edit `vite.config.ts` unless explicitly instructed.
- Do not delete `src/server.ts`.
- Do not edit `AGENTS.md` or `CLAUDE.md` unless the user explicitly asks.
- Server functions should follow this shape:
  `createServerFn` -> input schema -> `withAuth()` -> dynamic import -> service.
- Server modules must not be imported top-level from route files.
- Use `src/lib/env.ts` for env access. Do not use `process.env` directly.
- Use `logServerEvent()` for server pipeline logging. Do not leave new
  `console.warn`, `console.error` or `console.log` in production server code.
- Use repositories for Supabase persistence. Direct table/storage calls should
  be isolated in `src/integrations/supabase/repositories/*`.
- Cockpit data that must survive routes/reloads belongs in
  `src/lib/project-store.ts`; do not mirror durable project/compliance state in
  local `useState`.

### Verification commands

Run these before declaring an implementation done:

```bash
bunx tsc --noEmit
bun test
bunx eslint .
bun run build
```

Snapshot from the review that produced this roadmap:

- `bunx tsc --noEmit`: passed.
- `bun test`: failed with 16 failures. Main clusters:
  `src/lib/project-store.test.ts` could not find `reset` on test state, and
  `src/integrations/ai/billede-analyse.test.ts` timed out in mock flows.
- `bunx eslint .`: failed with 113 errors and 398 warnings. Some noise came
  from `.claude/worktrees`, but source files also had Prettier/type warnings.
- `bun run build`: passed after sandbox escalation, with large chunk warnings.

---

## Implementation order

Recommended order:

1. R2-000: restore green quality gates enough to protect refactors.
2. R2-001: close the server-side AI/compliance gate.
3. R2-002: make fresh cockpit analysis update typed compliance state.
4. R2-003 and R2-004: harden external/cache/runtime decoding.
5. R2-005 and R2-006: enforce repository and rule-engine boundaries.
6. R2-007: decompose cockpit components after behavior is covered.
7. R2-008 to R2-012: observability, env/fetch policy, docs, performance.

If a task touches a protected file from `AGENTS.md`, mention it clearly in the
PR/summary: `Rører beskyttet fil - kræver review`.

---

## R2-000: Restore green quality gates

**Title:** `[CI] - Restore green tests, lint and build gates`

**Why this matters architecturally:** The next tasks affect compliance,
persistence and AI gates. Refactoring those safely requires trustworthy tests and
lint output. Current failures make regressions harder to distinguish from
baseline noise.

**Essential context:**

- `bunx tsc --noEmit` passed during review.
- `bun test` failed in `src/lib/project-store.test.ts` and
  `src/integrations/ai/billede-analyse.test.ts`.
- `bunx eslint .` also linted `.claude/worktrees`, which should not be part of
  project quality gates.
- Do not "fix" failures by deleting tests or weakening assertions.

**Files to inspect first:**

- `src/lib/project-store.test.ts`
- `src/lib/project-store.ts`
- `src/integrations/ai/billede-analyse.test.ts`
- `src/integrations/ai/billede-analyse.ts`
- `eslint.config.js`
- `.gitignore`

**Implementation plan:**

1. Fix the project-store test setup so it uses the real store API shape and can
   call `reset`.
2. Make image-analysis mock tests deterministic. Ensure mock mode cannot fall
   through to a live/network path and every async path has a bounded timeout.
3. Exclude `.claude/worktrees` from linting.
4. Run Prettier or targeted formatting on source files reported by ESLint.

**Acceptance criteria:**

- `bun test` passes without skipped new tests.
- `bunx eslint .` does not lint `.claude/worktrees`.
- Remaining lint output is zero errors.
- `bun run build` still passes.

---

## R2-001: Close the server-side AI compliance gate

**Title:** `[Cockpit AI] - Server-side trusted rule gate for byggeanalyse`

**Why this matters architecturally:** AI output must never be generated from
untrusted client compliance state. In the current implementation,
`runByggeanalyse` accepts a broad client-supplied `ByggeanalyseInput`, validates
almost only the token, attempts to run the rule engine, catches errors as
non-critical, and still calls the AI analysis service.

**Critical files and lines from review:**

- `src/lib/cockpit.functions.ts`: weak validator around lines 35-38.
- `src/lib/cockpit.functions.ts`: rule engine failure is swallowed before AI
  call around lines 43-71.
- `src/integrations/ai/byggeanalyse.ts`: already has a good
  `ByggeanalyseSchema`; reuse this pattern.
- `src/lib/server-auth.ts`: use `withAuth()`.
- `src/lib/rule-engine/input-assembler.ts` and
  `src/lib/rule-engine/hard-stop-adapter.ts`: use canonical rule input and
  hard-stop interpretation.

**Implementation plan:**

1. Add a strict input schema for `runByggeanalyse`. Prefer `projectId`,
   `accessToken` and the minimum user intent fields. Do not accept trusted BBR,
   MAT, FBB or Hard Stop values from the client as authoritative.
2. Move business logic out of the server function into a service, e.g.
   `src/lib/byggeanalyse.server.ts` or a focused service under `src/lib/analysis`.
3. In the service, load trusted state from Supabase repositories:
   `projects`, `site_constraints`, and any required cached analysis payloads.
4. Assemble `RuleEngineInput` from trusted server data and the user's
   `byggeoenske`.
5. If `result.hardStops.length > 0`, return a typed blocked result and do not
   call the AI gateway.
6. If trusted data is missing, fail closed or return a typed "missing data"
   result. Do not silently continue with AI output.

**Before/after sketch:**

```ts
// Before: broad client payload becomes AI input
.inputValidator((data: ByggeanalyseInput & { token: string }) => data)
return ByggeanalyseService.analyse({ ...analysisInput, ruleEngineResult });
```

```ts
// After: client sends intent; server loads compliance truth
const input = runByggeanalyseInputSchema.parse(data);
return withAuth(input.accessToken, async (user) => {
  const context = await loadTrustedAnalysisContext(input.projectId, user.id);
  const ruleResult = runRuleEngine(assembleRuleEngineInput(context, input.byggeoenske));
  if (ruleResult.hardStops.length > 0) {
    return { status: "blocked", hardStops: ruleResult.hardStops };
  }
  return runByggeanalyseFromTrustedContext(context, input.byggeoenske, ruleResult);
});
```

**Acceptance criteria:**

- No AI call is made when trusted server data has a Hard Stop.
- Client-provided BBR/MAT/FBB/compliance fields cannot bypass the gate.
- Rule-engine failure does not fall through to AI generation.
- The server function follows `withAuth + dynamic import + delegate`.

**Tests to add:**

- Client sends fake non-blocking BBR while DB/site constraints contain a Hard
  Stop: AI gateway is not called.
- Missing `site_constraints` for a project returns a typed missing-data result.
- SAVE 1-3, fredet and MAT protection all block.
- Invalid input schema rejects before service execution.

---

## R2-002: Sync typed compliance state after fresh analysis

**Title:** `[Project State] - Update typed compliance fields immediately after analysis`

**Why this matters architecturally:** `projects` has typed compliance columns,
and `project-store` mirrors them. But after a fresh cockpit analysis the UI can
temporarily depend on JSONB-like result payloads until restore/persistence
reloads typed values. This creates inconsistent Hard Stop display and AI gating.

**Critical files and lines from review:**

- `src/hooks/useCockpitAnalysis.ts`: `deriveComplianceFlags(...)` is called
  without `ruleEngine` and `fbbData` around line 209.
- `src/hooks/useCockpitAnalysis.ts`: `syncPatch(...)` sends rich analysis
  payloads around lines 221-239 but local typed fields are not updated in the
  same path.
- `src/lib/project-store.ts`: typed fields exist and should be used:
  `heritageSaveValue`, `isFredet`, `hardStop`, `hardStopReason`.
- `src/lib/project-update-builder.ts`: server persistence already writes typed
  columns from patch data.

**Implementation plan:**

1. Ensure the analysis result exposes enough canonical compliance data:
   `fbbData`, `ruleEngine`, MAT flags, BBR areas and computed hard-stop summary.
2. Update `deriveComplianceFlags(...)` call sites so full analysis includes
   `result.ruleEngine` and `result.fbbData`.
3. Immediately update Zustand typed fields after successful analysis:
   `heritageSaveValue`, `isFredet`, `hardStop`, `hardStopReason`.
4. Use `evaluateHardStop()` or a shared server-returned summary. Do not
   duplicate thresholds in the hook.
5. Keep persistence via `syncPatch`, but do not wait for reload to make the UI
   consistent.

**Acceptance criteria:**

- A fresh analysis with SAVE 3 shows Hard Stop without page refresh.
- A fresh analysis with fredning sets `isFredet` and blocks relevant AI actions.
- `AiDesignHero` and `HardStopBanner` read the same state.
- No local `useState` mirror is introduced for durable compliance fields.

**Tests to add:**

- Hook/unit test for SAVE 3 analysis result -> store has `hardStop === true`.
- Hook/unit test for SAVE 4 -> warning flag, no absolute hard stop.
- UI test/smoke test proving design generation button is blocked after analysis
  result, before restore.

---

## R2-003: Add runtime decoders for Datafordeler and WFS clients

**Title:** `[Datafordeler] - Decode external GraphQL and WFS payloads at boundary`

**Why this matters architecturally:** External public registries are the highest
risk boundary in the system. TypeScript generics do not validate runtime JSON.
The review found unchecked `JSON.parse`, `as T`, `any[]` nodes and broad WFS
casts in Datafordeler, VUR, MAT and Plandata clients.

**Critical files from review:**

- `src/integrations/datafordeler/graphql-client.ts`
- `src/integrations/vur/client.ts`
- `src/integrations/mat/grundareal-resolver.ts`
- `src/integrations/plandata/client.ts`
- `src/integrations/gsearch/client.ts` as a positive example of Zod response
  decoding for autocomplete.

**Implementation plan:**

1. Change the shared GraphQL helper to accept a Zod schema:
   `datafordelerGraphqlFetch(schema, query, variables)`.
2. Define narrow response schemas per integration. Decode transport envelope
   first, then map to domain type.
3. Add GeoJSON/WFS schemas for Plandata features used by the app.
4. Replace `any[]`, `Promise<any>`, `as T` and unchecked `JSON.parse` in these
   clients.
5. Return typed degraded results or throw integration-specific errors with
   structured logging. Do not partially trust malformed data.

**Acceptance criteria:**

- No production `any` remains in the listed clients.
- Malformed Datafordeler/WFS payloads do not reach domain state.
- Error messages include source name and operation.

**Tests to add:**

- Valid and invalid GraphQL envelope fixtures.
- Missing `nodes`, wrong field type and empty response cases.
- Plandata WFS feature with missing PDF/url fields.

---

## R2-004: Harden JSONB, cache and project patch validation

**Title:** `[Runtime Integrity] - Replace shallow JSONB and ProjectPatch casts with schemas`

**Why this matters architecturally:** The project has typed columns for domain
truth, but JSONB archives and cache payloads still flow through broad casts. That
can poison restore, analysis and UI state with shapes TypeScript cannot see.

**Critical files from review:**

- `src/lib/project-sync.ts`: `projectPatchSchema` validates only top-level
  fields and uses `z.record(...unknown)` for nested payloads.
- `src/types/project-state.ts`: `parseComplianceData` performs shallow checks
  and then casts.
- `src/integrations/cache/client.ts`
- `src/integrations/cache/decoders.ts`
- `src/hooks/useCockpitRestore.ts`
- `src/integrations/supabase/repositories/projects.repository.ts`

**Implementation plan:**

1. Create reusable schemas for `Address`, `ComplianceFlag`, `BbrKompliantData`,
   `FbbData`, `Lokalplan`, `HusDna`, and other persisted payloads.
2. Use these schemas in `projectPatchSchema`, restore, cache reads and
   repository mapping.
3. Keep unknown fields only where explicitly needed for archive/debug payloads.
   Domain-critical fields must be typed or rejected.
4. Preserve JSONB as archive, not source of truth. Typed columns still win.

**Acceptance criteria:**

- Invalid nested `syncPatch` payloads are rejected before persistence.
- Restore cannot cast malformed `compliance_data` into domain state.
- Cache decoders validate envelope and payload.
- No new compliance value is added only to JSONB.

**Tests to add:**

- Invalid nested project patch rejected.
- Malformed cached compliance result ignored or degraded safely.
- Restore prefers typed columns over JSONB when both exist.

---

## R2-005: Enforce Supabase repository and storage boundaries

**Title:** `[Supabase] - Move direct table and storage calls behind repositories`

**Why this matters architecturally:** The project has repository patterns, but
newer and older code still performs direct `.from(...)` and storage calls inside
server functions or orchestration files. That scatters auth, ownership,
side-effect and error handling.

**Critical files from review:**

- `src/lib/ai-design.functions.ts`
- `src/lib/billede-analyse.functions.ts`
- `src/lib/projekt-service.ts`
- `src/integrations/supabase/project-persistence.ts`
- Existing repository examples:
  `src/integrations/supabase/repositories/projects.repository.ts`,
  `site-constraints.repository.ts`, `building-tasks.repository.ts`,
  `project-storage.repository.ts`.

**Implementation plan:**

1. Add missing repositories where needed:
   `design-iterations.repository.ts`, `project-images.repository.ts`,
   `hard-stop.repository.ts` or equivalent focused modules.
2. Refactor server functions to validate input, call `withAuth()`, dynamically
   import a service, and let that service call repositories.
3. Move project ownership checks into shared repository/service helpers.
4. Move inline deletes in `project-persistence.ts` to repositories.

**Acceptance criteria:**

- No direct `supabaseAdmin.from(...)` or storage calls remain in server function
  handlers.
- `project-persistence.ts` is a thin facade over repositories and pure builders.
- Unauthorized users cannot upload/delete/analyze another user's project files.

**Tests to add:**

- Unauthorized project access rejected.
- Storage upload failure returns typed error and does not write partial state.
- Delete project delegates to design iteration and building task repositories.

---

## R2-006: Make compliance flags and UI risk categories rule-engine driven

**Title:** `[Compliance] - Remove duplicated thresholds and regex risk classification`

**Why this matters architecturally:** The rule engine is intended to be the
single source of truth, but UI and analysis helpers still duplicate thresholds,
source labels and category inference. That can create different answers in
pre-check, full analysis, restore and cockpit display.

**Critical files from review:**

- `src/lib/rule-engine/rules/stop-rules.ts`
- `src/lib/rule-engine/hard-stop-adapter.ts`
- `src/lib/pre-check-flags.ts`
- `src/lib/compliance-flags.ts`
- `src/lib/analysis/hard-stop-gate.ts`
- `src/components/cockpit/EjendomPanel.tsx`
- `src/components/cockpit/RiskOverview.tsx`
- `src/components/cockpit/RisikoFeed.tsx`

**Implementation plan:**

1. Create a shared domain helper for risk/category presentation, e.g.
   `src/lib/compliance/risk-classification.ts`, if it can remain pure and
   client-safe.
2. Replace UI `saveValue <= 3` / `saveValue === 4` checks with
   `isSaveDispensationRequired()` and `isSaveWarning()`.
3. Replace regex-based risk classification with typed category/source fields
   where available.
4. Ensure `pre-check-flags` and `compliance-flags` use the same rule-engine
   adapter and correct source labels (`fbb`, `mat`, `bbr`, etc.).
5. Rename local non-domain blockers, e.g. map placement blockers, so they do not
   look like canonical Hard Stops.

**Acceptance criteria:**

- Static search finds no hardcoded SAVE thresholds outside rule-engine modules
  and tests.
- SAVE, fredning and MAT protection produce consistent flags in pre-check and
  full analysis.
- UI components do not infer compliance category from free-text labels.

**Tests to add:**

- Golden tests for SAVE 1, 3, 4 and null.
- MAT strandbeskyttelse/fredskov/klitfredning flag tests.
- UI helper tests for category/source mapping.

---

## R2-007: Decompose Cockpit God components

**Title:** `[Cockpit UI] - Split large cockpit components into hooks, panels and pure helpers`

**Why this matters architecturally:** Cockpit files are carrying too much at
once: presentation, orchestration, domain calculations, persistence sync, map
logic and AI actions. This makes new features likely to become spaghetti.

**Largest files from review:**

- `src/components/cockpit/index.tsx` - about 1069 lines.
- `src/components/cockpit/AnalyseTab.tsx` - about 790 lines.
- `src/components/cockpit/AiDesignHero.tsx` - about 578 lines.
- `src/components/cockpit/MatrikelMap.tsx` - about 568 lines.
- `src/components/cockpit/EjendomPanel.tsx` - about 525 lines.

**Implementation plan:**

1. Do not start with visual redesign. Preserve behavior first.
2. Extract pure helpers:
   `budget-summary.ts`, `compliance-summary.ts`, `risk-sections.ts`,
   `matrikel-geometry.ts`.
3. Extract orchestration hooks:
   `useAiDesignHero`, `useImageAnalysisUpload`, `useMatrikelMap`.
4. Keep components mostly presentational and fed by typed props.
5. Use Zustand only for durable project state. Keep local `useState` for true
   ephemeral UI state such as selected tab, drawer open state and upload
   progress.

**Acceptance criteria:**

- No single cockpit component owns UI, server calls, domain calculations and
  sync logic together.
- Existing user flows still work.
- New helper functions are unit-testable without React or Supabase.
- No new durable compliance/project mirror state is introduced in local
  component state.

**Tests to add:**

- Pure helper tests for budget/compliance summaries.
- Hook tests for image upload/analyse/generate flows with mocked server
  functions.
- Smoke test for cockpit render with restored project state.

---

## R2-008: Standardize server logging and degraded states

**Title:** `[Observability] - Replace console logging with structured server events`

**Why this matters architecturally:** Compliance analysis depends on many public
data sources. Degraded source behavior must be visible and consistent; otherwise
users can receive partial due diligence without maintainers seeing why.

**Critical files from review:**

- `src/lib/compliance-layer1.ts`
- `src/lib/analysis/layer1-analysis.ts`
- `src/lib/pre-check-adresse.ts`
- `src/integrations/plandata/client.ts`
- `src/lib/server-logger.ts`

**Implementation plan:**

1. Replace production `console.warn/error` in server pipeline with
   `logServerEvent()`.
2. Use consistent fields: `module`, `operation`, `severity`, `message`, `error`,
   `trace`.
3. Make "source failed", "source empty" and "source skipped" distinct states.
4. Ensure user-facing flags distinguish unknown from negative findings.

**Acceptance criteria:**

- No production server-pipeline `console.warn/error` remains.
- Each external source failure creates a structured event.
- Degraded results are explicit in returned analysis state.

**Tests to add:**

- Simulated BBR/MAT/Plandata failure logs a structured degraded event.
- Missing source data does not become a false "no risk" result.

---

## R2-009: Normalize env validation and fetch policy

**Title:** `[Runtime Config] - Remove import-time env side effects and add fetch timeouts`

**Why this matters architecturally:** Import-time env validation can crash tests,
SSR imports or unrelated tooling. Raw fetches without timeout/retry can hang
tests and production requests.

**Critical files from review:**

- `src/lib/analysis-orchestrator.ts` has top-level `validateEnv()`.
- `src/integrations/ai/pdf-extractor.ts` fetches PDFs directly.
- `src/integrations/ai/hus-dna-generator.ts` fetches user images directly.
- `src/integrations/gsearch/client.ts`
- `src/integrations/plandata/client.ts`
- `src/lib/env.ts`

**Implementation plan:**

1. Move env validation into service entrypoints/factories, not top-level module
   imports.
2. Add a small shared server fetch helper with timeout, abort and optional retry
   policy for external non-AI sources.
3. Keep AI gateway retry policy centralized in `src/integrations/ai/gateway.ts`.
4. Ensure tests can force mock mode without live network access.

**Acceptance criteria:**

- Importing analysis modules in tests does not validate unrelated env vars.
- External fetches have bounded timeout.
- Mock tests cannot accidentally call live services.

**Tests to add:**

- Import-only test for analysis modules without env.
- Timeout test for PDF/image fetch helper.
- Mock mode test for image analysis.

---

## R2-010: Align domain terminology and AI instructions

**Title:** `[Docs] - Align phase terminology and future-agent guardrails`

**Why this matters architecturally:** The docs correctly define the 4 phases, but
some state/navigation code still reflects older phase terms. Future AI agents
need stricter rules to avoid reintroducing God Objects, weak types and boundary
violations.

**Critical files from review:**

- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `docs/domain/journey-demolition-new-build.md`
- `src/lib/project-store.ts`

**Implementation plan:**

1. Do not edit `AGENTS.md` or `CLAUDE.md` unless explicitly requested by the
   user.
2. Propose or implement a migration plan for old phase ids in
   `project-store.ts`. Avoid breaking persisted projects blindly.
3. Update public docs after code behavior is clear.
4. Add rules for future agents:
   - no broad `any`/unchecked `JSON.parse` at external boundaries;
   - no new server function business logic inline;
   - no durable project state in local React state;
   - no direct Supabase writes outside repositories;
   - no AI generation from client-supplied compliance truth;
   - no extending cockpit God components without extraction.

**Acceptance criteria:**

- Code and docs use the same phase vocabulary or provide an explicit legacy
  mapping.
- AI instruction updates are reviewed by the project owner.
- Future-agent rules mention the exact files/patterns to avoid.

---

## R2-011: Review documentation inventory

**Title:** `[Docs] - Archive tactical plans and refresh active documentation`

**Why this matters architecturally:** Stale tactical plans can mislead future
agents more than missing documentation. Active docs should be normative; old
implementation notes should be clearly archived.

**Inventory decisions from review:**

| File or glob                                           | Suggested status                    | Reason                                                         |
| ------------------------------------------------------ | ----------------------------------- | -------------------------------------------------------------- |
| `AGENTS.md`, `CLAUDE.md`                               | Update only with explicit user task | Agent rules are important and protected.                       |
| `README.md`, `docs/DOCUMENTATION.md`                   | Update                              | Should reflect current architecture and verification status.   |
| `ROADMAP.md`                                           | Keep                                | Round 1 context is still useful.                               |
| `docs/CI_CD.md`                                        | Update                              | Quality gates currently fail and lint should ignore worktrees. |
| `docs/INTEGRATIONS.md`                                 | Update                              | Needs decoder/fetch/Datafordeler-only rules.                   |
| `docs/data-ingestion-contract.md`                      | Update                              | Should define runtime decoding contracts.                      |
| `docs/rule-engine-impact-analysis.md`                  | Update                              | Should mention remaining UI/flag duplication.                  |
| `docs/testing-architecture-implementation-tickets.md`  | Update                              | Should match current test failures and strategy.               |
| `docs/domain/journey-demolition-new-build.md`          | Update                              | Align with 4 phases and state naming.                          |
| `docs/datapunkt-bibel-api-kald.md`                     | Keep as snapshot                    | Add last verified date/status.                                 |
| `docs/datapunkter-hasselvej-48.md`                     | Keep as snapshot                    | Add last verified date/status.                                 |
| `docs/offentlige-datakilder-gap-analyse.md`            | Update                              | Align with current Datafordeler-only rule.                     |
| `agent/README.md`, `evals/README.md`                   | Update                              | Clarify current agent/eval contracts.                          |
| `docs/superpowers/specs/*`, `docs/superpowers/plans/*` | Archive                             | Tactical plans should not be normative after implementation.   |

**Acceptance criteria:**

- Active docs distinguish normative rules from historical plans.
- Archived docs are moved or clearly marked; they are not deleted without owner
  approval.
- No doc claims quality gates pass unless they do.

---

## R2-012: Reduce cockpit bundle size

**Title:** `[Performance] - Code-split cockpit, maps and AI-heavy panels`

**Why this matters architecturally:** Build succeeds, but large chunks increase
initial load and make cockpit changes riskier. OpenLayers/map code and AI design
flows are good candidates for lazy loading because they are not always needed on
first interaction.

**Review snapshot:**

- Cockpit client chunk was about 533 kB.
- Main index client chunk was about 738 kB.
- SSR cockpit/worker chunks were above 1 MB.

**Implementation plan:**

1. Lazy-load OpenLayers map implementation behind the map panel.
2. Lazy-load AI design/image analysis panels where route UX allows it.
3. Avoid moving domain logic into lazy UI modules; keep pure helpers shared.
4. Re-run build and compare chunk output.

**Acceptance criteria:**

- `bun run build` passes.
- Cockpit/map/AI chunks are separated where practical.
- No server-only module is pulled into client bundle.

---

## Cross-cutting test strategy

Use these as guiding tests across the roadmap:

- Rule engine: pure table tests for SAVE 1-4, fredning, strandbeskyttelse,
  fredskov and klitfredning.
- Persistence: repository tests for typed columns, JSONB archive behavior,
  ownership and secondary sync failures.
- Datafordeler/WFS: fixture tests for valid, malformed, empty and partial
  payloads.
- AI parsing/gating: AI gateway is not called when Hard Stop or missing trusted
  compliance data exists.
- UI state: fresh analysis updates Zustand typed compliance state immediately;
  restore prefers typed columns over JSONB.
- Cockpit helpers: budget, risk sections and compliance summaries testable
  without React/Supabase.

---

## Patterns to stop now

Future work should reject these patterns during review:

- New God Objects that own transport, business logic, persistence and UI.
- `any`, `as any`, `as never`, `as unknown as DomainType` at external or
  persistence boundaries.
- `JSON.parse(...) as SomeType` without schema validation.
- Direct Supabase writes outside repositories.
- Server functions that contain business logic rather than delegating to
  services.
- Client-supplied compliance gate values used as server authority.
- Regex or free-text matching for compliance categories.
- New local React state for durable project/compliance data.
- New docs that conflict with the 4 canonical phases.
