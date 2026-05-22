# AGENTS.md - ArchAI Implementation Contract

ArchAI - The Builder's Cockpit.

This file is the implementation contract for AI coding agents working in this
repository. It is intentionally practical and strict.

Claude Code owns architecture and these instruction files. Codex and other
implementation agents must not update `AGENTS.md` or `CLAUDE.md` unless the
user explicitly asks and the change receives human review.

For architecture doctrine, see `CLAUDE.md`.
For the current refactoring backlog, see `ROADMAP2.md`.
For integration details, see `docs/INTEGRATIONS.md`.

---

## Product Invariant

ArchAI is a due-diligence and decision cockpit for private residential
construction in Denmark.

It is not primarily an AI design toy.

The product must help users understand:

- whether they can build
- what blocks them
- what is risky or expensive
- what must be checked before purchase, demolition or design
- which design choices are realistic under regulation, budget and site data

Pre-purchase due diligence is a primary use case.

AI may inspire and explain. AI must not invent compliance truth.

---

## Canonical Phases

Use these phase names in new code, comments, docs and PR descriptions:

1. `Sandkassen` - inspiration, wishes, images, Hus-DNA.
2. `Matriklen` - address, plot, BBR/MAT/FBB/Plandata, Hard Stops.
3. `Maskinrummet` - parametric design, budget, live compliance, BIM direction.
4. `Myndighed` - applications, neighbour hearing, LCA, statics, documentation.

The journey is iterative, not linear.

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

## Architecture Model

ArchAI uses pragmatic Ports & Adapters around compliance, persistence, public
register data, AI and project state.

Dependency direction:

```txt
UI / routes / server functions
  -> application services
  -> domain core

application services
  -> ports
  -> adapters implementing ports
```

The domain core is pure TypeScript. It must not import React, Supabase,
Datafordeler clients, Cloudflare runtime APIs, server functions, AI SDKs or
storage clients.

Adapters translate the outside world into validated domain data. Adapters must
not own compliance truth.

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

Important distinction:

- SAVE 1-3 means high preservation value and usually requires dispensation or
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

Domain modules must never import adapters.

If a circular import appears necessary, extract a shared type, pure helper or
port into a lower-level module instead.

### Rule 9 - No DAWA For Compliance

DAWA/Dataforsyningen REST must not be used as compliance or register source.

Allowed exceptions:

- GSearch v2 for address autocomplete only.
- SDFI/Dataforsyningen map tiles as visual background only.

All register/compliance data must come from approved Datafordeler or other
approved authoritative sources.

If DAR, MAT, BBR or FBB lacks a field, return `null`, a typed degraded state or
use an approved Datafordeler-based resolver. Do not add DAWA fallback.

### Rule 10 - Structured Server Logging

Use `logServerEvent()` for server-pipeline logging.

Do not leave new `console.log`, `console.warn` or `console.error` in production
server code.

---

## Established Patterns

### Server Function Pattern

```ts
export const myServerFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => mySchema.parse(data))
  .handler(async ({ data }) => {
    return withAuth(data.accessToken, async () => {
      const { myService } = await import("@/lib/my-service.server");
      return myService.doWork(data);
    });
  });
```

Do not inline auth, Supabase queries or business logic in the handler.

### Persistence Pattern

```ts
import { updateProject } from "@/integrations/supabase/repositories/projects.repository";
import { buildProjectUpdate } from "@/lib/project-update-builder";

const update = buildProjectUpdate(patch);
await updateProject(projectId, update);
```

Direct Supabase table writes belong in repositories only.

### Hard Stop Pattern

```ts
import {
  evaluateHardStop,
  isSaveDispensationRequired,
  isSaveWarning,
} from "@/lib/rule-engine/hard-stop-adapter";
```

Never hardcode SAVE thresholds outside rule-engine modules and tests.

### Cockpit State Pattern

```ts
const { bbrData, complianceFlags, heritageSaveValue, hardStop } = useProject();
```

Durable project and compliance data belongs in `src/lib/project-store.ts`.

---

## Protected Files

Do not edit these unless the user task requires it.

- `src/routeTree.gen.ts` - never edit; generated by TanStack Router.
- `vite.config.ts` - do not edit without explicit instruction.
- `src/server.ts` - do not delete.
- `src/lib/project-store.ts`
- `src/lib/analysis-orchestrator.ts`
- `src/lib/pre-check-adresse.ts`
- `src/lib/reactive-compliance.ts`
- `src/integrations/supabase/project-persistence.ts`
- `AGENTS.md`
- `CLAUDE.md`
- `package.json`
- `wrangler.toml`

If a protected file is changed, the final response and PR summary must include:

`PROTECTED FILE CHANGED - human review required`

---

## Active Supabase Tables

Use these active tables:

- `projects`
- `address_analysis`
- `site_constraints`
- `address_source_results`
- `design_iterations`
- `building_tasks`
- `agent_sessions`
- `agent_tasks`

Never write to `projekter`. It no longer exists in production.

`design_iterations` allows only one active row per project. Deactivate the
current active iteration before activating a new one.

`building_tasks` has a unique `(project_id, task_key)` constraint. Use upsert
with `onConflict: "project_id,task_key"`.

---

## Safe Work Areas

These areas are usually safe for Codex-style implementation, provided all rules
above are followed:

- presentational UI components in `src/components/`
- focused cockpit panels in `src/components/cockpit/`
- stub routes such as `projekt.teknik` and `projekt.udbud`
- pure rule-engine rules and tests
- pure helpers
- additive database migrations
- tests

These areas are not automatically safe:

- new `createServerFn` patterns
- persistence/state-shape changes
- compliance/rule-engine semantics
- Datafordeler/MAT/BBR/FBB/Plandata clients
- AI gates and AI response parsing
- project restore/sync
- protected files

When in doubt, stop and ask for architecture review.

---

## Linear Labels

Use labels as authority boundaries:

- `codex-safe`: implementation agents may work autonomously when the issue is
  clear.
- `needs-architecture`: do not implement without Claude/human architecture
  review.
- `lovable-frontend`: intended for Lovable/frontend workflow, not Codex.

If an issue looks simple but has `needs-architecture`, do not implement it.

---

## Before Coding Checklist

Before writing code, answer:

- Does this cross a boundary?
- Which schema or decoder validates the data?
- Where does the business logic live?
- Which application service owns the workflow?
- Which adapter handles Supabase, Datafordeler, AI, storage or cache?
- Does this touch a protected file?
- Could this create a circular import?
- Am I building on dirty domain code that should be refactored first?

For small local UI copy/style changes, keep this lightweight.

---

## Verification Checklist

Before declaring work complete:

```bash
bunx tsc --noEmit
bun test
bunx eslint .
bun run build
```

Also verify:

- no debug logs remain
- no new `any` or unchecked boundary casts were introduced
- no new direct Supabase calls appear outside repositories
- no new compliance values are stored only in JSONB
- no circular imports were introduced
- protected files are called out for review
- docs are updated if behavior, env, architecture or integrations changed

