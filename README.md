# ArchAI - Automated Building Screening For Denmark

ArchAI is being built to become Denmark's best automated building screening and
feasibility platform for villa and residential projects.

The product is not an AI design toy and does not start by drawing a house. It
starts with the question professional advisors ask before design begins:

> Can a project realistically be built on this property, and what risks,
> constraints and unknowns must be checked before money is committed?

ArchAI is for architects, building advisors, type-house companies, contractors
and small residential developers who need faster, better documented early-stage
due diligence.

## Product Position

Primary workflow:

1. Enter a Danish address.
2. Fetch and validate relevant public register and planning data.
3. Produce a preliminary screening of the property, planning context, building
   rights, risks, source quality and missing manual checks.
4. Generate a report that can be used in advisory meetings and pre-purchase
   feasibility discussions.

ArchAI must never present itself as a final legal or municipal decision. The
system must show sources, confidence, degraded data states and issues requiring
manual review.

Trust is more important than automation. Documentation is more important than
AI magic.

## Strategic Product Surfaces

| Surface | Purpose |
| --- | --- |
| Address screening | Start from an address and assemble property, plot and planning context. |
| Evidence ledger | Show source, timestamp, status, confidence, mock/error/skipped state and links. |
| Risk register | Classify findings as blocker, dispensation, manual review, cost risk or unknown. |
| Local plan screening | Extract relevant planning constraints with citations and confidence. |
| Building rights screening | Estimate core feasibility constraints without pretending to be a legal ruling. |
| Screening report | Produce a professional, shareable preliminary report with clear caveats. |

Design generation, floor plans, BIM, permit packages and tender workflows are
paused until the screening product has been validated with professional users.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Framework | TanStack Start (React SSR) |
| Runtime | Cloudflare Workers |
| Language | TypeScript, Bun |
| Database / Auth | Supabase (PostgreSQL + RLS) |
| AI | Anthropic Claude for bounded extraction and explanation, never as compliance authority |
| Danish Data | Datafordeler, Plandata WFS, SDFI, FBB/Kulturarv, GEUS, DK-Jord, VUR and approved authoritative sources |
| Styling | Tailwind CSS + shadcn/ui |
| Tests | Bun test, Playwright and eval tooling |

## Local Setup

```bash
# Prerequisites: Bun, Wrangler CLI, Supabase CLI

bun install
cp .env.example .env.local
bun dev
```

Important environment variables are documented in `.env.example` and
`CLAUDE.md`.

## Commands

```bash
bun dev
bun run build
bun test
bun run test:live
bunx playwright test
bun run evals
bunx tsc --noEmit
bunx eslint .
bunx prettier --write .
```

Before declaring implementation work complete, run:

```bash
bunx tsc --noEmit
bun test
bunx eslint .
bun run build
```

## Architecture

ArchAI uses pragmatic Ports & Adapters around compliance, public register data,
persistence, AI and project state.

```txt
UI / routes / server functions
  -> application services
  -> domain core

application services
  -> ports
  -> adapters implementing ports
```

Core rules:

- Data crossing a boundary must be validated with Zod schemas or explicit
  decoders.
- React is an inbound adapter. It must not own compliance policy or register
  interpretation.
- Server functions stay thin: validate, authenticate, import service, return
  result.
- The rule engine and typed site constraints are the source of compliance truth.
- AI may extract, summarize and explain. AI must not invent compliance truth.
- Public-data uncertainty must be represented explicitly, not hidden.

## Documentation

Start here:

- `docs/AGENT_STARTUP.md` - minimal startup prompt and multi-agent protocol.
- `docs/LLM_OPERATING_BRIEF.md` - one-page brief for independent LLM agents.
- `docs/PRODUCT_STRATEGY.md` - current product strategy and MVP direction.
- `docs/NOW_NEXT_LATER.md` - active roadmap framing.
- `docs/SCREENING_MVP_TASKS.md` - concrete MVP phases, task boundaries and acceptance criteria.
- `docs/LLM_TASK_TEMPLATE.md` - task template for LLM handoffs.
- `docs/STRATEGY_LABELS.md` - recommended Linear/GitHub strategy labels.
- `docs/DOCUMENTATION.md` - documentation hierarchy and archive policy.
- `docs/INTEGRATIONS.md` - integration matrix and data-source policy.
- `docs/data-ingestion-contract.md` - contract for public-data ingestion.
- `docs/offentlige-datakilder-gap-analyse.md` - public-data gap analysis.

Historical design, drawing and permit-package plans are archived and must not be
used as current implementation direction.

See `CHANGELOG.md` for historical version notes.
