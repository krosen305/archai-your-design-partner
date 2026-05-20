# ArchAI Refactoring Roadmap

Status: proposed architecture backlog. Do not treat these items as Linear tickets
until they have been reviewed and approved by the project owner.

Last updated: 2026-05-19

## Review Round 1: Backend Architecture Sanitation

Scope: modules that either persist domain truth, orchestrate external data sources,
or define shared cache/state contracts.

| Priority | Module                                              | Finding                                                                                                                     | Architectural Risk                                                                         | Proposed Task |
| -------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------- |
| P0       | `src/integrations/supabase/project-persistence.ts`  | God Object: auth, DB writes, JSON merge, hard-stop logic, site constraints, task generation and storage cleanup in one file | Business rules drift from rule engine; hard to test without Supabase; weak type boundaries | ROADMAP-001   |
| P0       | `src/lib/rule-engine/` + persistence/pre-check      | Hard-stop thresholds and consequences are interpreted in multiple places                                                    | Users can see different blockers depending on entry path; future rules will diverge        | ROADMAP-002   |
| P0       | `src/integrations/cache/client.ts` + Supabase types | `address_source_results` uses `supabaseAdmin.from as any`; cached JSON is trusted without parsing                           | Runtime cache shape errors bypass TypeScript and can poison the pipeline                   | ROADMAP-003   |
| P0       | `src/integrations/plandata/client.ts`               | Pure selector `selectPrimaryLokalplanForPdf` lives inside WFS client with server-only dependencies                          | Client routes can accidentally pull server-only imports and break TanStack build           | ROADMAP-004   |
| P1       | `src/lib/analysis-orchestrator.ts`                  | God Object pipeline: cache, tracing, dynamic imports, fallback policy and result assembly in one function                   | Changes to one source can regress unrelated layers; low unit-testability                   | ROADMAP-005   |
| P1       | `src/lib/pre-check-adresse.ts`                      | createServerFn handler, orchestration and pure flag generation are mixed                                                    | Address gate can drift from full analysis and rule engine                                  | ROADMAP-006   |
| P1       | `src/integrations/bbr/client.ts`                    | Code lists, GraphQL transport, canonical building selection and output mapping are coupled                                  | Hard to test canonical selection and hard to update BBR code lists safely                  | ROADMAP-007   |
| P1       | `src/lib/project-store.ts`                          | Zustand store also owns domain types consumed by server modules                                                             | Server/client coupling and accidental imports across boundaries                            | ROADMAP-008   |
| P2       | Cross-cutting logging/error handling                | `console.warn` is scattered through server pipeline                                                                         | Non-fatal failures are inconsistent and hard to observe                                    | ROADMAP-009   |

---

## ROADMAP-001: `project-persistence` - Split persistence into repositories and pure domain policies

**Title:** `project-persistence` - Split God Object into repositories and pure policies

**Description:**
`project-persistence.ts` currently owns too many responsibilities: token auth,
project CRUD, JSONB archive merging, typed compliance-column mapping,
`site_constraints` sync, `building_tasks` generation, hard-stop reasoning,
storage cleanup and tracing. This violates Single Responsibility Principle and
makes the database writer a hidden domain engine. The module should become a thin
application service that delegates business decisions to pure functions and
database access to repositories.

**Acceptance Criteria:**

- `saveProject()` delegates update construction to a pure `buildProjectUpdate()`
  function that can be unit-tested without Supabase.
- `projects.repository.ts`, `site-constraints.repository.ts`,
  `building-tasks.repository.ts` and `project-storage.repository.ts` own all
  Supabase calls for their tables/storage buckets.
- `project-persistence.ts` no longer contains `deriveAutoTasks`,
  `deriveHardStopReason` or `deriveSiteConstraintsPatch`.
- No `(update as Record<string, unknown>)` casts remain in
  `project-persistence.ts`.
- Unit tests cover at least: partial compliance patch merge, typed column
  extraction, owner guard, and non-blocking secondary sync behavior.

**Dependencies:**

- ROADMAP-003 should be completed first or in parallel, so generated Supabase
  types include all active tables/columns.
- ROADMAP-002 should define the canonical hard-stop output consumed by this task.

---

## ROADMAP-002: `rule-engine` - Make hard-stop logic the single source of truth

**Title:** `rule-engine` - Centralize hard-stop decisions and downstream consequences

**Description:**
Hard-stop semantics currently appear in the rule engine, persistence, pre-check
flag generation and task generation. That creates a high-risk divergence: a SAVE
value or MAT flag can block in one path but only warn in another. The rule engine
must own the canonical severity, authority and reason; persistence and UI should
map that result, not reinterpret thresholds.

**Acceptance Criteria:**

- Hard-stop thresholds exist only in `src/lib/rule-engine/rules/stop-rules.ts`
  and shared domain constants/types.
- Persistence derives `hard_stop`, `hard_stop_reason` and related task triggers
  from `RuleEngineResult` or a typed adapter around it.
- Pre-check flags use the same rule-engine adapter as full analysis.
- Add unit tests proving SAVE 1-3, SAVE 4, fredet, strandbeskyttelse,
  fredskov and klitfredning produce consistent results across pre-check,
  persistence and full analysis.
- Static search shows no duplicated threshold checks like `saveValue <= 3`
  outside the rule-engine domain module/test fixtures.

**Dependencies:**

- None, but ROADMAP-001 and ROADMAP-006 should consume the new adapter.

---

## ROADMAP-003: `cache`/Supabase types - Remove untyped cache access and parse cached JSON

**Title:** `cache` - Type `address_source_results` and validate cached payloads

**Description:**
`src/integrations/cache/client.ts` currently uses
`(supabaseAdmin.from as any)("address_source_results")` because generated
Supabase types do not expose the table. It also returns cached JSON as trusted
domain objects. That weakens the type system exactly at the boundary where stale
or malformed data is most likely.

**Acceptance Criteria:**

- Supabase `Database` types include `address_source_results` and all active
  `projects` columns used by persistence.
- `cache/client.ts` contains no `any` or `as unknown as ComplianceResult`
  casts for cache payloads.
- Add Zod schemas or typed decoders for cached `ComplianceResult`,
  `LokalplanExtract`, `TinglysningResult` and `SourceResult<T>` envelopes.
- TTL values move to a named config module, e.g. `src/lib/cache-policy.ts`.
- Unit tests cover expired cache, PDF URL invalidation, malformed payload and
  `address_source_results` round-trip.

**Dependencies:**

- Requires Supabase type generation/update after migration
  `20260519120000_address_source_results.sql`.

---

## ROADMAP-004: `plandata` - Split pure selectors from WFS client

**Title:** `plandata` - Move client-safe selectors out of server WFS client

**Description:**
`selectPrimaryLokalplanForPdf()` is a pure selector but currently lives in
`src/integrations/plandata/client.ts`, which imports WFS/fetch infrastructure.
When client routes import this selector, they can pull server-only dependencies
into the client build. This already matches the observed build failure pattern
around TanStack import protection.

**Acceptance Criteria:**

- Create `src/integrations/plandata/selectors.ts` or
  `src/lib/plandata/selectors.ts` with pure functions only.
- Route/components and persistence import selectors from the pure selector
  module, not from `plandata/client.ts`.
- `plandata/client.ts` owns WFS transport only.
- Add unit tests for primary lokalplan selection, including missing PDF links
  and multiple plans.
- `bun run build` no longer fails due to client import of server-only Supabase
  or tracing modules through Plandata.

**Dependencies:**

- None. This is a high-leverage quick win.

---

## ROADMAP-005: `analysis-orchestrator` - Decompose pipeline into layer services

**Title:** `analysis-orchestrator` - Split full analysis pipeline into typed layer services

**Description:**
`analyseAddressWithTrace()` owns address enrichment, cache reads/writes, Layer 1
fetching, PDF extraction, servitut extraction, expensive Layer 4 policy, dynamic
imports, service-state construction and final result assembly. It is difficult
to reason about and difficult to test without many mocks. It should become an
application-level coordinator over focused layer modules.

**Acceptance Criteria:**

- Extract focused modules: `address-enrichment.ts`, `layer1-analysis.ts`,
  `lokalplan-extraction-step.ts`, `servitut-step.ts`, `geo-risk-step.ts` and
  `analysis-result-assembler.ts`.
- Orchestrator no longer imports types from `project-store`; shared pipeline
  state types move to a server/client-neutral domain module.
- Cached payloads are parsed through ROADMAP-003 decoders.
- Expensive-layer skip policy is a pure function with unit tests.
- `analyseAddressWithTrace()` is reduced to orchestration of named steps and has
  no inline dynamic-import business logic.

**Dependencies:**

- ROADMAP-003 for typed cache decoders.
- ROADMAP-008 for shared pipeline state types.

---

## ROADMAP-006: `pre-check-adresse` - Align pre-check with full analysis and rule engine

**Title:** `pre-check-adresse` - Extract pre-check policy and remove duplicated flag logic

**Description:**
`pre-check-adresse.ts` mixes `createServerFn`, Layer 1 orchestration, FBB lookup,
metrics calculation and `ComplianceFlag` generation. The flag logic duplicates
hard-stop interpretation and contains stale comments around BBR Public. This
route must remain fast, but its business output should be derived from the same
domain policies as full analysis.

**Acceptance Criteria:**

- Extract `buildPreCheckFlags()` into a pure domain module that consumes the
  rule-engine adapter from ROADMAP-002.
- Remove stale BBR Public wording and document that FBB candidates are
  Datafordeler/FBB-derived.
- `preCheckAdresse` handler only validates input, calls a pre-check service and
  returns the result.
- Unit tests cover pre-check output for: no BBR, SAVE 3, SAVE 4, fredet,
  MAT protection flags and missing coordinates.
- No `console.warn` remains after ROADMAP-009 logging adapter is available.

**Dependencies:**

- ROADMAP-002 should land first.
- ROADMAP-009 can be parallel.

---

## ROADMAP-007: `bbr/client` - Extract code lists and canonical building selection

**Title:** `bbr/client` - Separate BBR transport, code lists and canonical selection

**Description:**
`BbrService` currently combines GraphQL transport, BBR code-list labels,
canonical building selection and output mapping. The code lists are hardcoded
inside the client, and selection logic is not clearly isolated as a pure domain
function. This makes it harder to validate the core "which building did we
choose?" behavior without network mocks.

**Acceptance Criteria:**

- Move BBR code lists to `src/domain/bbr/code-lists.ts` or equivalent.
- Move canonical building selection to a pure module with typed input/output.
- Add unit tests for canonical building selection: single building,
  multiple primary buildings, secondary-only buildings and missing areas.
- Add a typed parser/decoder for raw BBR GraphQL nodes before mapping to
  `BbrKompliantData`.
- Remove stale comments that mention grundareal coming from a DAWA layer.

**Dependencies:**

- None, but this improves ROADMAP-005 and ROADMAP-006 testability.

---

## ROADMAP-008: `project-store` - Move shared domain types out of Zustand store

**Title:** `project-store` - Split domain types from client state container

**Description:**
`project-store.ts` is both a Zustand store and a source of domain types such as
`DataSourceKind`, `PipelineServiceState`, `Byggeoenske`, `ComplianceFlag` and
project phase metadata. Server modules importing types from the store increase
the risk of server/client boundary leakage. Domain types should live in neutral
type modules; Zustand should own only client state and setters.

**Acceptance Criteria:**

- Move shared domain/pipeline types to `src/types/building-platform.ts` or a new
  `src/types/project-state.ts`.
- Server modules import shared types from type modules, never from
  `project-store.ts`.
- `project-store.ts` is reduced to initial state, selectors and actions.
- Add type-level tests or compile checks for moved exports.
- No runtime imports from server code to `project-store.ts`.

**Dependencies:**

- Coordinate with ROADMAP-005 because orchestrator currently references
  project-store pipeline types.

---

## ROADMAP-009: Cross-cutting - Centralize logging and non-fatal error policy

**Title:** `logging` - Replace scattered `console.warn` with typed logger/error policy

**Description:**
Server modules use `console.warn` for non-fatal failures in analysis,
pre-check, cache and persistence. That makes error severity inconsistent and
hard to trace. ArchAI already has tracing concepts; logging should be explicit
about whether a failure is fatal, degraded or ignored.

**Acceptance Criteria:**

- Define a small server logging/error helper that records module, operation,
  severity and optional trace context.
- Replace `console.warn` in `analysis-orchestrator.ts`,
  `pre-check-adresse.ts`, `project-persistence.ts` and cache modules.
- Non-fatal failures return typed degraded states where appropriate.
- Tests cover at least one non-fatal persistence sync failure and one degraded
  external-source failure.

**Dependencies:**

- None.

---

## Review Round 2: Route Boundaries, Client State and Server Actions

Scope: route files, client/server boundary modules, frontend-owned orchestration
and security gates around AI generation.

| Priority | Module                                            | Finding                                                                                                      | Architectural Risk                                                                             | Proposed Task |
| -------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ------------- |
| P0       | `src/routes/projekt.$id.cockpit.tsx`              | 1600+ line route owns server functions, restore, analysis flow, local mirrors and UI composition             | Route changes can break data integrity, auth, build boundaries and UI at once                  | ROADMAP-010   |
| P0       | `src/lib/ai-design.functions.ts` + `AiDesignHero` | Server trusts client-supplied `hasHardStop` to gate AI design generation                                     | Hard-stop gate can be bypassed by direct endpoint calls                                        | ROADMAP-011   |
| P1       | `src/lib/project-sync.ts`                         | Server functions accept typed objects without runtime schemas and sync writes are ad hoc                     | Invalid patches can cross the server boundary; save ordering and failure semantics are unclear | ROADMAP-012   |
| P1       | `src/routes/projekt.adresse.tsx`                  | Address route mixes autocomplete server functions, pre-check orchestration, gate logic and UI event handling | Address gate behavior becomes hard to test and can drift from full analysis                    | ROADMAP-013   |
| P1       | `src/lib/reactive-compliance.ts`                  | Pure compute imports `deriveComplianceFlags` from Zustand store module                                       | Client state container becomes part of domain computation and server/shared code coupling      | ROADMAP-014   |
| P1       | `src/integrations/gsearch/client.ts`              | Raw GSearch JSON is cast directly; coordinate conversion is duplicated from DAR                              | Bad API responses can become valid suggestions; geometry helpers drift                         | ROADMAP-015   |
| P1       | `createServerFn` usage across routes/libs         | Auth checks, token parsing and Zod patterns are duplicated per server function                               | Inconsistent authorization and validation across boundary endpoints                            | ROADMAP-016   |
| P2       | `src/lib/feature-flags.ts` + `src/lib/env.ts`     | Feature flags are hardcoded constants; optional env usage is not fully modeled                               | Runtime behavior cannot be safely changed per environment and docs can drift                   | ROADMAP-017   |

---

## ROADMAP-010: `projekt.$id.cockpit` - Split route God Object into server actions, hooks and shell components

**Title:** `projekt.$id.cockpit` - Decompose cockpit route into maintainable slices

**Description:**
`src/routes/projekt.$id.cockpit.tsx` is currently a route, server-action module,
restore coordinator, analysis runner, local-state mirror and UI shell in one
file. At more than 1600 lines it is too expensive to reason about and too easy
to break. The route should only bind URL params/search state to a small cockpit
container; data restore and analysis should live in tested hooks/services.

**Acceptance Criteria:**

- Move `fetchCompliance` and `runByggeanalyse` to a dedicated server-action
  module, e.g. `src/lib/cockpit.functions.ts`.
- Extract restore logic into `useCockpitRestore()`.
- Extract full-analysis trigger logic into `useCockpitAnalysis()`.
- Extract free-design cockpit into its own component/module.
- Route file is reduced to route definition, auth wrapper and high-level shell
  composition; target under 400 lines.
- Remove local mirrors for data already owned by `useProject()` unless a local UI
  state is strictly transient.
- Add focused tests for restore decision logic and "do not auto-refetch when
  restored data is present".

**Dependencies:**

- ROADMAP-004 should land first to avoid selector/server import issues.
- ROADMAP-005 and ROADMAP-008 make the extracted hooks cleaner but are not hard
  blockers.

---

## ROADMAP-011: `ai-design` - Revalidate hard-stop gate server-side

**Title:** `ai-design` - Replace client-supplied hard-stop gate with server-side validation

**Description:**
`generateDesignProposals` currently accepts `hasHardStop` from the client. The
UI computes this from local compliance flags, but a direct call can pass
`false`. Because AI design generation is explicitly forbidden before
constraint-checking, the server action must load trusted project/address
constraints and run the gate itself.

**Acceptance Criteria:**

- Remove `hasHardStop` from the public input schema as an authorization/gate
  signal.
- Require a trusted `projectId` or `addressId` plus access token/session context.
- Server action loads the relevant typed project/site-constraint data and runs
  the rule-engine gate or ROADMAP-002 adapter before generation.
- Add tests proving direct calls cannot generate designs for a known hard-stop
  project.
- UI may still disable the button client-side, but server remains authoritative.

**Dependencies:**

- ROADMAP-002 for the canonical hard-stop adapter.
- ROADMAP-016 for shared authenticated server-action utilities.

---

## ROADMAP-012: `project-sync` - Add runtime schemas and deterministic mutation flow

**Title:** `project-sync` - Type and validate project mutations across the server boundary

**Description:**
`project-sync.ts` defines create/load/save/delete server functions, but the
input validators currently trust TypeScript shapes at runtime. `syncPatch()` is
also used from many UI places without a clear mutation queue, conflict policy or
failure surface. This is risky because `ProjectPatch` can include JSONB archive
payloads and typed compliance fields.

**Acceptance Criteria:**

- Add Zod schemas or domain decoders for all server function inputs, including
  `ProjectPatch`.
- Split client sync facade from server actions if needed, so browser code never
  imports server persistence types at runtime.
- Define a mutation policy: fire-and-forget, awaited critical writes and retry
  behavior are explicit.
- Add a per-project in-flight save queue or documented last-write-wins policy.
- Unit tests cover invalid patch rejection, missing token behavior and
  overlapping save calls.

**Dependencies:**

- ROADMAP-003 for typed JSON/cache payloads.
- ROADMAP-001 for a cleaner persistence write contract.

---

## ROADMAP-013: `projekt.adresse` - Extract address search and gate controller

**Title:** `projekt.adresse` - Split autocomplete, address enrichment and pre-check gate

**Description:**
The address route owns GSearch server actions, DAR detail fetch, debounced
autocomplete, address selection, Supabase sync, pre-check invocation, blocker
dialog state and rendered UI. This makes the first compliance gate hard to test.
The route should delegate search and pre-check flow to focused hooks and pure
gate helpers.

**Acceptance Criteria:**

- Move `searchAddresses` and `fetchAddressDetails` server functions to a
  dedicated address functions module.
- Extract `useAddressSearch()` for debounced autocomplete.
- Extract `useAddressSelectionPrecheck()` or equivalent controller for
  select/enrich/pre-check/sync flow.
- Replace React event `any` usages with typed events.
- Move `flagIcon()` and hard/soft blocker grouping into pure helpers tested with
  representative flags.
- Remove stale comments that imply BBR Public is active.

**Dependencies:**

- ROADMAP-006 for shared pre-check flag policy.
- ROADMAP-015 for typed GSearch response parsing.

---

## ROADMAP-014: `reactive-compliance` - Move compliance flag derivation out of Zustand

**Title:** `reactive-compliance` - Make client-side compliance compute fully domain-pure

**Description:**
`computePartialUpdate()` is intended to be a client-safe pure computation, but it
imports `deriveComplianceFlags` and `Byggeoenske`/`ComplianceFlag` from
`project-store.ts`. That makes Zustand part of the domain layer and complicates
reuse in server-side policies and tests.

**Acceptance Criteria:**

- Move `deriveComplianceFlags` to a pure domain module, e.g.
  `src/lib/compliance-flags.ts`.
- Move `Byggeoenske` and `ComplianceFlag` types to shared type modules.
- `reactive-compliance.ts` imports no symbols from `project-store.ts`.
- Add unit tests for `computePartialUpdate()` using plain input objects and no
  Zustand setup.
- `project-store.ts` imports the pure flag/types module instead of defining the
  logic inline.

**Dependencies:**

- ROADMAP-008 should land first or in the same PR.
- ROADMAP-002 should provide canonical hard-stop mapping.

---

## ROADMAP-015: `gsearch` - Decode GSearch responses and centralize coordinate conversion

**Title:** `gsearch` - Add response schema and shared EPSG:25832 conversion

**Description:**
`GsearchService` casts `await res.json()` directly to `GsearchResult[]` and
contains its own EPSG:25832 to WGS84 conversion, mirroring DAR. This makes API
shape drift and coordinate conversion drift likely. GSearch is UX-only, but bad
suggestions feed the first project state and pre-check input.

**Acceptance Criteria:**

- Add a Zod schema or decoder for GSearch API responses.
- Centralize EPSG:25832 -> WGS84 conversion in a shared geo utility used by DAR
  and GSearch.
- Replace `{ lat: 0, lng: 0 }` fallback with `null` or a typed
  `coordinatesMissing` state; do not create fake Denmark coordinates.
- Make result limit and endpoint configurable through a typed config.
- Unit tests cover valid response, malformed geometry, empty response and token
  query parameter behavior.

**Dependencies:**

- ROADMAP-017 if config/env handling is centralized first.

---

## ROADMAP-016: `server-functions` - Standardize authenticated server actions

**Title:** `server-functions` - Create shared auth and validation wrappers for createServerFn

**Description:**
Several route/server modules repeat the same pattern: accept a token, call
`supabaseAdmin.auth.getUser()`, throw `401`, then dynamically import a server
service. This duplicates security-sensitive code and makes validation quality
uneven across endpoints.

**Acceptance Criteria:**

- Create a shared helper for authenticated `createServerFn` handlers that
  validates input, resolves `userId`, and normalizes unauthorized errors.
- Migrate cockpit, project-sync and address server functions to the shared
  helper.
- Add tests for missing token, invalid token and valid token pathways using a
  mocked auth adapter.
- Server functions expose domain-specific input schemas rather than raw
  pass-through TypeScript types.

**Dependencies:**

- None, but it supports ROADMAP-010, ROADMAP-011, ROADMAP-012 and ROADMAP-013.

---

## ROADMAP-017: `runtime-config` - Replace hardcoded feature flags with typed runtime config

**Title:** `runtime-config` - Make feature flags and optional env vars typed and environment-aware

**Description:**
`FEATURE_FLAGS` is a hardcoded object and `env.ts` models only a subset of
optional variables. This makes integration behavior difficult to change safely
between local, preview and production. Feature flags are infrastructure policy
and should be validated once, then consumed as typed config.

**Acceptance Criteria:**

- Introduce a typed runtime config module that reads env once and exposes
  feature flags plus integration endpoints/tokens.
- Include optional variables currently used outside the explicit optional list,
  such as `DATAFORSYNINGEN_TOKEN` and Datafordeler endpoint overrides.
- Document defaults for local, preview and production.
- Services consume `runtimeConfig` rather than reading env/feature flags
  directly.
- Add tests for missing required env, optional fallback and feature flag parsing.

**Dependencies:**

- None.

---

## Review Round 3: Domain, integration clients, UI components and AI governance

| Severity | Module                                                                          | Finding                                                                                                                                                                     | Roadmap     |
| -------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Critical | `src/types/building-platform.ts`                                                | Domain types include hard-stop helper logic and ad-hoc JSON parsing that duplicate the rule engine.                                                                         | ROADMAP-018 |
| Critical | `src/integrations/{dar,bbr,mat,ebr,plandata}`                                   | Datafordeler clients repeat GraphQL transport, use `any`/`Promise<any>`, and parse raw nodes without shared schemas.                                                        | ROADMAP-019 |
| Medium   | `src/integrations/ai/*`                                                         | Anthropic calls, JSON extraction and fallback handling are duplicated across AI services with uneven type safety.                                                           | ROADMAP-020 |
| Medium   | `src/components/cockpit/index.tsx`                                              | Cockpit UI remains a large coordination component mixing upload flow, Supabase sync, reactive compute and presentation.                                                     | ROADMAP-021 |
| Medium   | `src/components/cockpit/MatrikelMap.tsx`                                        | OpenLayers integration, geometry calculations, server sync and UI state are coupled and rely heavily on `any`.                                                              | ROADMAP-022 |
| Medium   | `src/lib/rule-engine/input-assembler.ts`                                        | Input assembly contains many embedded parsers, mapper heuristics and imports from Zustand-owned types.                                                                      | ROADMAP-023 |
| Medium   | `src/lib/datacheck.ts`                                                          | Static datapoint definitions, scoring logic and persistence-oriented status shapes live in one large module.                                                                | ROADMAP-024 |
| Medium   | `src/lib/analysis-tracing.ts`, `src/routes/debug.analyse.tsx`, regression tests | Debug/tracing code bypasses typed Supabase access and tests duplicate loose fetch/mock setup.                                                                               | ROADMAP-025 |
| Critical | AI-facing `.md` instructions                                                    | Agent instructions must be updated as architecture patterns land, otherwise future AI-generated code will keep recreating route God Objects and mixed infra/domain modules. | ROADMAP-026 |

---

## ROADMAP-018: `building-platform` - Keep domain types free of rule decisions

**Title:** `building-platform` - Remove duplicate hard-stop decisions from shared domain types

**Description:**
`src/types/building-platform.ts` should describe the domain, not decide
compliance outcomes. It currently contains helpers such as `hasAbsoluteHardStop`
and `getSaveHardStop`, while canonical thresholds live in the rule engine. That
creates a long-term risk that UI, persistence and AI flows evaluate different
versions of the same legal constraint.

**Acceptance Criteria:**

- Move hard-stop helper behavior behind a rule-engine adapter or pure domain
  policy that imports canonical rule thresholds.
- `building-platform.ts` exports types, enums, constants and narrow helpers only;
  no independent hard-stop decision trees.
- Replace ad-hoc `Record<string, unknown>` parsing for design iteration payloads
  with a runtime schema.
- Add tests proving SAVE, fredning and MAT flags produce the same result through
  both persistence and client-safe adapters.
- Remove duplicate threshold comments from non-rule files and link to the
  canonical module instead.

**Dependencies:**

- ROADMAP-002 should define the canonical rule-engine boundary first.
- ROADMAP-008 should move shared domain types out of Zustand first or in the same
  PR.

---

## ROADMAP-019: `datafordeler-clients` - Share GraphQL transport and typed decoders

**Title:** `datafordeler-clients` - Replace loose Datafordeler parsing with typed client contracts

**Description:**
DAR, BBR, MAT, EBR and Plandata clients repeat transport setup, endpoint
handling, logging and raw JSON parsing. Several functions expose `Promise<any>`
or map GraphQL nodes through `any`, which means register shape drift only appears
at runtime. Datafordeler is the compliance backbone, so this needs a shared
contract layer.

**Acceptance Criteria:**

- Introduce a shared `datafordelerGraphqlFetch<T>()` transport with timeout,
  retry, endpoint, auth and normalized error handling.
- Add schemas or typed decoders for the GraphQL response shapes used by DAR, BBR,
  MAT, EBR and Plandata.
- Remove `Promise<any>`, `any[]` and `map((node: any) => ...)` from the
  integration clients.
- Remove stale DAWA comments from Datafordeler client code.
- Replace direct `console.warn/error` with the shared logging/error policy from
  ROADMAP-009.
- Add contract tests for valid response, empty response, GraphQL errors and
  malformed payloads.

**Dependencies:**

- ROADMAP-017 for runtime config and endpoint handling.
- ROADMAP-009 for shared logging and error reporting.

---

## ROADMAP-020: `ai-integrations` - Centralize Anthropic calls and JSON extraction

**Title:** `ai-integrations` - Create a typed AI gateway for prompt execution

**Description:**
AI services such as PDF extraction, Hus-DNA generation, image analysis and
byggeanalyse repeat message construction, response parsing and fallback policy.
Some paths cast `res.json()` or extracted JSON directly. That makes AI behavior
hard to test and increases the chance that malformed model output leaks into
domain state.

**Acceptance Criteria:**

- Create a shared AI gateway for Anthropic calls with typed input, timeout,
  logging and normalized error handling.
- Add a reusable `extractStructuredOutput(schema, response)` helper for JSON
  extraction and schema validation.
- Store prompt names/versions in a small prompt registry so model changes are
  traceable.
- Remove `as any` and unchecked `JSON.parse` usage from AI integrations.
- Add unit tests for valid JSON, fenced JSON, invalid JSON, missing fields and
  model/API failure paths.

**Dependencies:**

- ROADMAP-017 for model/runtime config.
- ROADMAP-009 for logging/error policy.

---

## ROADMAP-021: `cockpit-components` - Split the cockpit monolith into focused modules

**Title:** `cockpit-components` - Decompose cockpit UI into hooks, panels and pure helpers

**Description:**
`src/components/cockpit/index.tsx` is still responsible for too much: presentation
layout, upload flow, project sync, compliance recomputation and local UI
coordination. This makes every future cockpit change risky because unrelated
concerns share one large file.

**Acceptance Criteria:**

- Keep `index.tsx` as a public export/composition layer rather than a large
  implementation file.
- Extract upload/sync behavior into hooks or services with explicit input/output
  types.
- Move reactive compliance calls behind a small cockpit controller hook that
  consumes `useProject()` and emits typed patches.
- Extract major panels into focused components with no direct Supabase client
  dependency.
- Add component or hook tests around upload failure, compliance recompute and
  patch sync behavior.

**Dependencies:**

- ROADMAP-012 for deterministic mutation flow.
- ROADMAP-014 for pure reactive compliance.

---

## ROADMAP-022: `MatrikelMap` - Separate map adapter, geometry domain and UI state

**Title:** `MatrikelMap` - Make parcel geometry testable without OpenLayers

**Description:**
`MatrikelMap` mixes OpenLayers runtime objects, parcel geometry calculations,
drag handling, sync behavior and rendering state. The current `any` casts hide
runtime risks around map events and tile/layer instances, while the business
geometry cannot be tested without browser/map setup.

**Acceptance Criteria:**

- Extract pure geometry helpers for footprint placement, boundary distance and
  outside-parcel area.
- Add unit tests for geometry helpers using plain coordinates and polygons.
- Wrap OpenLayers imports in a typed adapter module so component code avoids
  broad `any` casts.
- Move server sync/patch emission out of map rendering code.
- Ensure the UI component only coordinates user interaction and visual state.

**Dependencies:**

- ROADMAP-015 for shared coordinate conversion.
- ROADMAP-012 if map state persists through project patches.

---

## ROADMAP-023: `rule-engine-input-assembler` - Split parsers and mappers from assembly

**Title:** `rule-engine-input-assembler` - Isolate parsing heuristics from rule input assembly

**Description:**
`input-assembler.ts` is pure, but it contains many responsibilities: setback
parsing, roof parsing, zone mapping, project type mapping, usage inference and
fallback heuristics. It also imports domain shapes from `project-store.ts`,
pulling UI state ownership into the rule-engine boundary.

**Acceptance Criteria:**

- Move parsing helpers such as setback, roof types and zone into small tested
  modules.
- Move BBR usage and project-type mapping into named domain mappers.
- Replace magic fallback values with named constants and comments explaining the
  uncertainty model.
- Remove imports from `project-store.ts`; use shared domain types only.
- Add tests for parser edge cases and default/fallback behavior.

**Dependencies:**

- ROADMAP-008 for shared domain type ownership.
- ROADMAP-002 for canonical rule-engine thresholds and terminology.

---

## ROADMAP-024: `datacheck` - Split datapoint definitions from scoring logic

**Title:** `datacheck` - Make data checklist definitions configurable and scoring pure

**Description:**
`src/lib/datacheck.ts` combines static datapoint definitions, phase grouping,
score calculation and status shapes used by routes. That makes it easy to add
new datapoints in a way that accidentally changes scoring behavior or route
persistence.

**Acceptance Criteria:**

- Move datapoint definitions into a dedicated config module with typed IDs and
  phase ownership.
- Keep scoring/status derivation in pure functions that accept explicit input.
- Add a runtime schema for persisted `DataStatusMap` values.
- Update `projekt.datacheck.tsx` to stop writing route-step strings as workflow
  control state.
- Add tests for unknown datapoints, phase score calculation, empty status maps
  and persisted status validation.

**Dependencies:**

- ROADMAP-012 for project mutation/persistence flow.

---

## ROADMAP-025: `testing-tracing-debug` - Type tracing tables and test harnesses

**Title:** `testing-tracing-debug` - Remove debug `any` casts and stabilize regression tests

**Description:**
`analysis-tracing.ts` and `debug.analyse.tsx` access tracing tables through
`supabaseAdmin.from as any`, and several regression tests carry large local mock
setups. Debug and observability code is allowed to be internal, but it still
needs typed boundaries because it sits near compliance analysis.

**Acceptance Criteria:**

- Add generated or handwritten Supabase types for `analysis_runs` and
  `analysis_events`.
- Remove `supabaseAdmin.from as any` from tracing/debug code.
- Gate debug routes behind a dev/admin-only policy with tests or an explicit
  server-side guard.
- Extract repeated fetch/mock setup into shared typed test utilities.
- Fix or quarantine mock cache pollution so integration regression tests are
  deterministic.

**Dependencies:**

- ROADMAP-003 for typed cache/source result contracts.
- ROADMAP-016 for shared server auth/validation wrappers.

---

## AI Model Instruction Update Note

As the P0/P1 architecture tasks land, the AI-facing documentation must be kept in
lockstep with the code. Otherwise future AI agents will keep generating code
against old patterns: direct route-level infrastructure imports, local
compliance state, route God Objects, duplicated hard-stop logic and unchecked
`any` parsing.

Future AI instructions should include these concrete architectural contracts:

- Routes call typed `createServerFn` handlers and compose UI. They do not own
  register clients, persistence logic or compliance decisions.
- Domain logic lives in pure modules with explicit input/output types and tests.
- Infrastructure is accessed through repositories, gateways or shared clients.
- Runtime data from APIs, AI models and JSONB columns is decoded through schemas
  before it reaches domain state.
- Hard Stops are evaluated only through the rule-engine boundary.
- Cockpit data persists through `useProject()` and typed project patches; no
  local duplicated compliance state.
- New large files are treated as a design smell and must be split by
  responsibility before merge.

---

## ROADMAP-026: `ai-agent-instructions` - Update AI-facing architecture rules

**Title:** `ai-agent-instructions` - Make AGENTS/CLAUDE enforce the new architecture patterns

**Description:**
The project relies on AI agents for implementation and review. Once the new
module boundaries are accepted, `AGENTS.md`, `CLAUDE.md` and supporting docs must
teach future models the actual architecture, not only the current product
domain. Without this, the same spaghetti patterns will reappear in generated
code.

**Acceptance Criteria:**

- Update `AGENTS.md` and `CLAUDE.md` with the accepted architecture contracts for
  routes, server functions, repositories/gateways, rule engine, project store and
  runtime schemas.
- Add a "new feature checklist" for AI agents covering type safety, pure
  functions, server boundary, Datafordeler usage, Supabase writes and tests.
- Add short allowed/forbidden examples for common patterns:
  route-to-server-function flow, Datafordeler client usage, project persistence
  writes and cockpit state updates.
- Update `docs/DOCUMENTATION.md` so documentation drift checks include
  `ROADMAP.md` and AI-facing instruction files.
- Update `.claude/commands/sync-docs.md` so doc sync explicitly checks whether
  accepted roadmap patterns need to be reflected in AI instructions.
- Mark `AGENTS.md` and `CLAUDE.md` changes as protected-file changes requiring
  human review.

**Dependencies:**

- Initial version can land after ROADMAP-001, ROADMAP-004, ROADMAP-010 and
  ROADMAP-016 establish the target patterns.
- The note should be revisited after each P0/P1 roadmap item that changes module
  boundaries.
