# CLAUDE.md - ArchAI Architecture Contract

ArchAI - The Builder's Cockpit.

This file is the architectural operating contract for Claude Code. It is not a
general project wiki. Keep it short, normative and hard to misunderstand.

For implementation rules shared with Codex, see `AGENTS.md`.
For the current refactoring backlog, see `ROADMAP2.md`.
For integration details, see `docs/INTEGRATIONS.md`.

---

## Product North Star

ArchAI is a decision platform for private residential construction in Denmark.

It is not primarily an AI design toy. It is a due-diligence and project cockpit
that helps users answer:

- Can I build here?
- What blocks me?
- What is expensive or risky?
- What must be checked before I buy, demolish or design?
- Which design choices are realistic under regulation, budget and site data?

Pre-purchase due diligence is a first-class use case. Compliance data must help
users before they spend large amounts on purchase, architects or engineering.

The product should feel like a calm, competent building advisor: precise,
transparent, honest and action-oriented.

---

## Canonical Journey

Use these four phase names in new code, docs and PR descriptions:

1. `Sandkassen` - inspiration, user wishes, images, Hus-DNA.
2. `Matriklen` - address, plot, BBR/MAT/FBB/Plandata, Hard Stops.
3. `Maskinrummet` - parametric design, budget, live compliance, BIM direction.
4. `Myndighed` - applications, neighbour hearing, LCA, statics, documentation.

The journey is iterative, not linear. Do not force wizard-only thinking into
architecture.

---

## Architectural Doctrine

ArchAI uses pragmatic Ports & Adapters around the risky parts of the product:
compliance, public register data, persistence, AI and project state.

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
- generate design proposals
- sync project
- restore project
- upload and analyse images

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

- GSearch v2 for address autocomplete only.
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
- `src/lib/analysis-orchestrator.ts`
- `src/lib/pre-check-adresse.ts`
- `src/lib/reactive-compliance.ts`
- `src/integrations/supabase/project-persistence.ts`
- `AGENTS.md`
- `CLAUDE.md`
- `package.json`
- `wrangler.toml`

If a protected file must be changed, the PR/summary must say:

`Rører beskyttet fil - kræver review`

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

AI may explain, summarize, inspire and generate proposals.

AI must not invent compliance truth.

Before AI output that affects design direction, feasibility or user confidence:

1. trusted site/compliance data must be loaded
2. `RuleEngineInput` must be assembled
3. `runRuleEngine()` must run
4. Hard Stops must be surfaced before optimistic output

If Hard Stops exist, return explanation, consequence and next step. Do not
generate reassuring design output first.

AI responses crossing into domain state must be schema-validated.

---

## Gatekeeper Protocol

Before implementing any non-trivial change touching compliance, AI, public
register data, persistence, project state or cockpit architecture, Claude must
produce a short architecture plan.

The plan must answer:

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

