# CLAUDE.md - ArchAI Architecture Contract

ArchAI - Automated Building Screening.

This file is the architectural operating contract for Claude Code. It is not a
general project wiki. Keep it short, normative and hard to misunderstand.

For implementation rules shared with Codex, see `AGENTS.md`.
For integration details, see `docs/INTEGRATIONS.md`.

---

## Product North Star

ArchAI is a B2B decision platform for private residential construction in
Denmark.

It is not primarily an AI design toy. It is a due-diligence and feasibility
platform that helps professional users answer:

- Can I build here?
- What blocks me?
- What is expensive or risky?
- What must be checked before I buy, demolish or design?
- Which sources support the answer?
- What remains uncertain or requires manual professional review?

Pre-purchase due diligence is a first-class use case. Compliance data must help
users before they spend large amounts on purchase, architects or engineering.

The product should feel like a calm, competent building advisor for
professionals: precise, transparent, honest and action-oriented.

ArchAI must never present itself as a final legal ruling, municipal decision or
replacement for an architect, lawyer, land surveyor or engineer.

Current product priority:

`address -> documented preliminary building screening report`.

Design generation, floor plans, BIM, permit packages and tender workflows are
paused unless the user explicitly revives that scope.

---

## Canonical Product Surfaces

Use these product surfaces in new code, docs and PR descriptions:

1. `Screening` - address, property profile, plot and public-data collection.
2. `Kildebog` - source ledger, timestamps, status, confidence and links.
3. `Risikoregister` - blockers, dispensations, manual review, cost risks and unknowns.
4. `Rapport` - professional preliminary screening report with caveats.

Legacy phase names such as `Sandkassen`, `Maskinrummet` and `Myndighed` may
exist in older routes or archived documents. Do not use them as the current
roadmap framing unless the user explicitly asks to revive that product scope.

---

## Architectural Doctrine

ArchAI uses pragmatic Ports & Adapters around the risky parts of the product:
compliance, public register data, persistence, AI and project state.

### SaaS And API Direction

ArchAI must support both the consumer cockpit and future B2B/SaaS APIs from the
same domain and application-service core.

Consumer UI, TanStack `createServerFn` handlers, external REST/JSON APIs,
background jobs and partner integrations are peer inbound adapters. None of
them may own compliance truth, design truth or persistence policy.

Design new use cases so they can later be exposed through a versioned API
without being rewritten:

- Application services must not depend on React, Zustand, TanStack runtime,
  browser session state or Supabase user-session shape.
- Inbound adapters must translate their auth mechanism into a typed principal.
  For the consumer product this may be a Supabase user. For B2B this may later
  be an organization, API key, service account or partner integration.
- Prefer service inputs and outputs as explicit DTOs validated with Zod. These
  DTOs should be stable enough to become `/v1/*` API contracts.
- `project-store` is a consumer read model and interaction cache. It must not be
  required by domain core or application services that should be callable from a
  B2B API.
- SaaS tables such as organizations, organization members, API keys, usage
  events, quotas and request logs are allowed when introduced through the normal
  architecture-review and migration process.
- Consumer convenience must not introduce hidden assumptions that every project
  belongs to exactly one interactive human user.

For paused design and drawing domains, AI may interpret a brief, suggest options
and explain tradeoffs. A målfast sketch, footprint, beliggenhedsplan or
compliance-relevant geometry must be represented as deterministic structured
data and checked by the rule/geometry engines. An AI-generated image is never
the source of truth for a measurable drawing. Do not make design generation the
default next step from a screening workflow.

### Domain Core

The domain core is pure TypeScript.

It must not import React, Supabase clients, Datafordeler clients, Cloudflare
runtime APIs, server functions, AI SDKs or storage clients.

The domain core owns:

- Rule engine logic
- Hard Stop evaluation
- SAVE, fredning, MAT and compliance policy
- Pure calculations
- Project update mapping
- Risk classification
- Domain decisions that must be testable without network or database

Good examples:

- `src/lib/rule-engine/`
- `src/lib/rule-engine/hard-stop-adapter.ts`
- `src/lib/project-update-builder.ts`
- `src/lib/reactive-compliance.ts`

### Application Services

Application services orchestrate use cases. They may call repositories, gateways
and pure domain functions, but they must not contain raw transport details.

Examples of use cases:

- analyse address
- run byggeanalyse
- generate a preliminary screening report
- sync project
- restore project
- assemble a source ledger and manual-control checklist

### Ports

Ports are typed contracts for external needs. Add them where the dependency is
external, risky, hard to test or likely to change.

Typical ports:

- project repository
- site constraints repository
- register data gateway
- AI gateway
- cache
- file storage
- logger

Do not introduce interfaces everywhere by default. Use ports where they reduce
risk and improve testability.

### Adapters

Adapters translate the outside world into validated domain data.

Adapters include:

- React routes and components
- `createServerFn` handlers
- Supabase repositories
- Datafordeler/DAR/MAT/BBR/FBB clients
- Plandata/WFS clients
- AI gateway clients
- cache clients
- storage clients

Adapters may validate, translate and delegate. They must not own compliance
truth.

---

## Non-Negotiable Rules

### Rule 1 - Contract-First Boundaries

All data crossing a system boundary must be validated at the boundary.

This includes:

- UI input into server functions
- Supabase JSONB payloads
- cache payloads
- Datafordeler responses
- Plandata/WFS responses
- AI responses
- restored project state

Use Zod schemas or explicit typed decoders.

Do not use:

- `any`
- unchecked `JSON.parse`
- `as unknown as DomainType`
- raw API responses as domain data
- Supabase JSONB blobs as trusted domain state

If external data does not match the expected schema, return a typed degraded
state or throw a structured integration error.

### Rule 2 - UI Is An Adapter

React components may display data and collect user intent. They must not own
compliance policy, Hard Stop thresholds, Supabase persistence, Datafordeler
interpretation or AI gating.

Allowed in UI:

- local visual state: tabs, drawers, hover, upload progress
- reading durable project state from `useProject()`
- calling focused hooks or server functions for user actions

Not allowed in UI:

- direct Supabase/Datafordeler/AI calls
- direct compliance/register fetches
- durable project/compliance mirrors in local `useState`
- hardcoded SAVE/MAT/fredning thresholds
- regex/free-text parsing to infer compliance categories

Move workflow logic into hooks. Move business logic into pure domain helpers or
application services.

### Rule 3 - Server Functions Are Inbound Adapters

A `createServerFn` handler must stay thin:

1. validate input
2. authenticate with `withAuth()`
3. dynamically import an application service
4. return the service result

It must not contain raw Supabase queries, AI prompt construction, Datafordeler
calls, storage handling or compliance decisions inline.

### Rule 4 - Server-Side Compliance Authority

Compliance gates are always verified server-side from trusted data.

Server functions must never accept client-provided values such as `hasHardStop`,
`hasAbsoluteHardStop`, SAVE status, MAT blockers or equivalent derived gate
signals as authoritative.

Before AI generates design, analysis or recommendations, the server must verify
Hard Stop status from trusted sources:

- typed columns on `projects`
- `site_constraints`
- decoded cached register data
- or a fresh rule-engine run

The client may disable buttons for UX. The server is the authority.

### Rule 5 - Rule Engine Is The Compliance Source Of Truth

Hard Stop thresholds live in:

- `src/lib/rule-engine/rules/stop-rules.ts`
- `src/lib/rule-engine/hard-stop-adapter.ts`

Do not duplicate thresholds in UI, routes, persistence or AI prompts.

Important domain distinction:

- SAVE 1-3 means high preservation value and typically requires dispensation or
  special authority handling.
- `is_fredet === true` is separate listed-building status.
- Do not treat SAVE value and fredning as the same thing.

### Rule 6 - Typed Columns Beat JSONB

Domain-critical compliance values must be stored in typed SQL columns, not only
inside JSONB.

Typed project columns include:

- `heritage_save_value`
- `is_fredet`
- `grundareal_m2`
- `bebygget_areal_m2`
- `hard_stop`
- `hard_stop_reason`
- `budget_estimate`

JSONB may archive raw or secondary payloads. It is not the source of truth for
critical compliance.

Rule 6 applies to scalar/enum compliance values (areal m2, SAVE value,
`is_fredet`, `hard_stop`, budget). Structured geo payloads (GeoJSON polygons,
BBox arrays, composite register payloads) may remain in JSONB provided they
are Zod-validated at the boundary per Rule 1.

### Rule 7 - Refactor Dirty Domain Boundaries Before Extending

If a module already violates the Domain Core rules, do not build new behavior on
top of the violation.

Before extending the module, first move domain logic into pure TypeScript or
create a small pure helper/use case that the existing adapter can call.

This applies especially when existing code mixes:

- React components with compliance decisions
- server functions with business logic
- Supabase queries with domain policy
- Datafordeler/API parsing with rule decisions
- AI prompt logic with compliance gates
- Zustand state mutation with domain calculations

Do not make dirty modules dirtier.

Acceptable exception: if the user explicitly asks for a minimal hotfix, keep the
change narrow and create a follow-up refactor task.

### Rule 8 - No Circular Imports

Circular imports are forbidden.

Do not introduce import cycles between routes, components, hooks, stores,
services, integrations, repositories or domain modules.

Architectural direction must remain one-way:

```txt
UI / routes / server functions
  -> application services
  -> domain core

application services
  -> ports
  -> adapters implementing ports
```

Domain modules must never import adapters.

If a circular import appears necessary, extract a shared type, pure helper or
port into a lower-level module instead.

---

## Data Source Rules

DAWA/Dataforsyningen REST must not be used as compliance or register source.

Allowed exceptions:

- GSearch v2 for address autocomplete. Both `/adresse` and `/husnummer`
  endpoints are permitted. Metadata fields that GSearch returns in the
  autocomplete response (e.g. `adresseid`, `adgangsadresseid`, `kommunekode`,
  `koordinater`) may be persisted on the project as address metadata.
  GSearch must never be used as a primary source for BBR, MAT, Plandata, FBB,
  EBR/VUR, EMOData or other Datafordeler-backed register/compliance fields.
- SDFI/Dataforsyningen map tiles as visual background only.

All register/compliance data must come from approved Datafordeler or other
approved authoritative sources.

If DAR, MAT, BBR or FBB lacks a field, return `null`, a typed degraded state or
use an approved Datafordeler-based resolver. Do not add DAWA fallback.

---

## Protected Files

Do not edit these casually:

- `src/routeTree.gen.ts` - never edit; generated by TanStack Router.
- `vite.config.ts` - delegated to `@lovable.dev/vite-tanstack-config`.
- `src/server.ts` - must not be deleted; Cloudflare/Sentry entry wrapper.
- `src/lib/project-store.ts`
  - Drawing design params (tagform, taghaldning_grad, har_kaelder, kaelder_gulv_kote_m,
    har_jordvarme) added 2026-06-06 for authority-grade beliggenhedsplan.
- `src/lib/pre-check-adresse.ts`
- `src/lib/reactive-compliance.ts`
  - Extended 2026-06-06 with optional drawing validation params (harKælder, harJordvarme,
    naturbeskyttelseZoner). Returns drawingReasons alongside existing result.
- `src/integrations/supabase/project-persistence.ts`
- `AGENTS.md`
- `CLAUDE.md`
- `package.json`
- `wrangler.toml`

If a protected file must be changed, the PR/summary must say:

`Rører beskyttet fil - kræver review`

---

## Files Requiring Gatekeeper Review (Not Untouchable)

Changes to these files are allowed but require an architecture plan answer
(Gatekeeper Protocol) and explicit human review call-out in the PR:

- `src/lib/analysis-orchestrator.ts` — orchestrates compliance pipeline; changes
  must not break existing source results or introduce circular dependencies

---

## Supabase Rules

Use the active tables:

- `projects`
- `address_analysis`
- `site_constraints`
- `address_source_results`
- `design_iterations`
- `building_tasks`
- `agent_sessions`
- `agent_tasks`

Never write to `projekter`. It no longer exists in production.

Direct Supabase calls belong in repositories under:

`src/integrations/supabase/repositories/`

Application services call repositories. UI and server function handlers do not
write tables directly.

---

## AI Rules

AI may extract, explain and summarize.

AI must not invent compliance truth.

Before AI output that affects feasibility, risk classification or user
confidence:

1. trusted site/compliance data must be loaded
2. `RuleEngineInput` must be assembled
3. `runRuleEngine()` must run
4. blockers, dispensations, manual-review items and unknowns must be surfaced
   before optimistic output

If blockers, dispensations, manual-review items or unknowns exist, return
source-grounded explanation, consequence and next step. Do not generate
reassuring output first.

AI responses crossing into domain state must be schema-validated.

---

## Testing

Use `bun:test` (not Vitest) for all unit and integration tests.

### Three tiers

**Tier 1 — Domain & pure functions** (highest value)
Tests in `src/lib/rule-engine/` and co-located `*.test.ts` files.
No network, no DB, no DOM. These are the compliance brain.

**Tier 2 — Application service handlers**
Test `handleFetchCompliance`, `handleRunByggeanalyse` and orchestrators
via injected fake deps. No TanStack runtime, no real Supabase.

**Tier 3 — Playwright acceptance** (3-6 journeys max)
Critical user journeys only: address → cockpit, hard-stop gate, smoke.
If a test can be a unit test instead, make it a unit test.

### File organisation

- `src/**/*.test.ts` — unit/integration tests, run by `bun test src`
- `src/**/*.test.tsx` — React component/hook tests, require explicit `import "@/testing/react-test-setup"` at top
- `tests/live/` — live Supabase integration, requires `RUN_LIVE_SUPABASE_TESTS=true`
- `tests/*.spec.ts` — Playwright E2E acceptance tests

### Local UI Smoke On Windows/Codex

- If `bun dev` fails in sandbox with Vite config/read access errors, rerun it
  with approval outside the sandbox. If PowerShell `Start-Process` hits duplicate
  `Path`/`PATH`, start a detached PowerShell process that runs `bun dev --host
  127.0.0.1` and writes logs to `C:\tmp`.
- Vite may choose `http://127.0.0.1:8080/` when 5173 is busy. Read the dev log
  before opening the browser.
- If the in-app Browser/Node REPL fails with Windows sandbox spawn errors, use
  Playwright from `node` with approval. On Windows, `bun` may hang launching
  Chromium; `node` has been more reliable.
- Authenticated register flows require `.env.local` test credentials
  (`PLAYWRIGHT_TEST_EMAIL`, `PLAYWRIGHT_TEST_PASSWORD`) and Supabase env. Inject a
  Supabase session into browser localStorage using `tests/helpers/session.ts` as
  the pattern. Do not print secrets.
- Guest mode is not enough for address -> cockpit -> drawing smoke tests; it
  stops at the auth/project gate.
- Put screenshots, generated SVG/PDF and temporary scripts under `C:\tmp`; never
  commit those artifacts.

### Rules

- `mock.module` on `@/lib/project-store` or `@/lib/project-sync` is forbidden
  at file scope. Extract pure helpers and test those directly.
- Unit tests must pass without `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY`.
- CI unit job (`bun test src`) must not expose service-role credentials.
- Lovable must never write or modify test files.

### What not to test

- CSS / visual appearance
- Trivial React renders where TypeScript already proves correctness
- Every permutation — representative cases suffice

---

## Gatekeeper Protocol

Before implementing any non-trivial change touching compliance, AI, public
register data, persistence, project state or cockpit architecture, Claude must
produce a short architecture plan.

The plan must answer the strategy preflight first:

1. Have I read `docs/LLM_OPERATING_BRIEF.md` for the current mission?
2. Does this support `address -> documented preliminary building screening report`?
3. Which product surface owns this work: `Screening`, `Kildebog`,
   `Risikoregister` or `Rapport`?
4. Is this source/evidence/risk/report related?
5. Does this revive a paused legacy track such as Hus-DNA, floor plans, BIM,
   authority drawings, permit packages or tender workflows?
6. Could the output be mistaken for a legal ruling or municipal decision?

Then it must answer the architecture boundary questions:

1. Which boundary does this change cross?
2. Which schema or decoder validates the data?
3. Where does the business logic live?
4. Which application service owns the workflow?
5. Which adapter handles Supabase, Datafordeler, AI, storage or cache?
6. How is UI prevented from owning domain logic?
7. Which tests prove the boundary and domain behavior?

Small local UI copy/style changes do not need this protocol.

---

## Commands

Use Bun.

```bash
bun dev
bun run build
bun test
bunx tsc --noEmit
bunx eslint .
bunx prettier --write .
```

Before declaring work complete, run:

```bash
bunx tsc --noEmit
bun test
bunx eslint .
bun run build
```

All must pass unless the user explicitly accepts a known failing baseline.

---

## Env Vars

Access env only through `src/lib/env.ts`.

Never use `process.env` directly.

When adding an env var:

1. add it to `src/lib/env.ts`
2. add it to `.env.example`
3. document purpose and required/optional status here or in the env docs
4. add tests if behavior changes by env

Important current env vars:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_PUBLISHABLE_KEY`
- `DATAFORDELER_API_KEY`
- `ANTHROPIC_API_KEY`
- `LOVABLE_API_KEY`
- `DATAFORSYNINGEN_TOKEN`
- `SENTRY_DSN`
- `ENVIRONMENT`
- `LINEAR_WEBHOOK_SECRET`
- `GITHUB_DISPATCH_TOKEN`

---

## Claude Role

Claude Code is responsible for architectural coherence.

Claude should own or review:

- architecture changes
- new dataflow patterns
- protected files
- compliance/rule-engine changes
- server boundary decisions
- AI instruction updates
- cross-module refactors

Claude must not treat itself as only an implementation agent. If existing code
violates this architecture contract, Claude should identify and correct the
boundary before extending the module.

Claude owns `CLAUDE.md` and `AGENTS.md`, but these files still require explicit
human review before merge.

---

## Definition Of Done

A task is not done until:

- the feature works end-to-end where relevant
- TypeScript passes
- tests pass
- lint passes
- build passes
- no debug logs remain
- no new `any` or unchecked boundary casts are introduced
- no new direct Supabase calls appear outside repositories
- no new compliance values are stored only in JSONB
- no circular imports are introduced
- protected files are called out for review
- docs are updated if behavior, env, architecture or integrations changed
