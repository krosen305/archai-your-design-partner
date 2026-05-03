# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun dev          # Start development server
bun build        # Production build (Cloudflare Workers target)
bun test         # Run tests with Bun test runner
bunx eslint .    # Lint TypeScript files
bunx prettier --write .   # Format code
```

To run a single test file:

```bash
bun test src/integrations/bbr/bbr.test.ts
```

## Architecture

**ArchAI** is an AI-assisted building permit advisor for Danish private builders. It is a TanStack Start (React SSR) application deployed on **Cloudflare Workers** via Wrangler.

### Wizard flow

The app follows a 5-phase architecture. Steps map directly to file-based routes in `src/routes/`:

```
/                         → index.tsx              (landing / welcome)
/projekt/adresse          → projekt.adresse.tsx    (address autocomplete via DAWA/DAR)
/projekt/hus-dna          → projekt.hus-dna.tsx    (Phase 1: AI Hus-DNA — dream house input)
/projekt/compliance       → projekt.compliance.tsx  (cache-first BBR + Plandata pipeline)
/projekt/match            → projekt.match.tsx       (Phase 2: compliance matrix vs. plangrundlag)
/projekt/finans           → projekt.finans.tsx      (Phase 3: finansiering — placeholder)
/projekt/engineering      → projekt.engineering.tsx (Phase 4: ingeniør — placeholder)
/projekt/udbud            → projekt.udbud.tsx       (Phase 5: udbud — placeholder)
```

**Navigation flow:** adresse → hus-dna → compliance (auto-runs BBR+Plandata) → match → finans → …

**Legacy routes** (from earlier wizard design — not in primary flow):

- `projekt.beskrivelse.tsx` — project description form
- `projekt.brief.tsx` — AI-generated design brief

**Compliance pipeline** runs as a single `createServerFn` that calls `analyseAddress()` from `src/lib/analysis-orchestrator.ts`. Results are cached in Supabase `address_analysis` table (cache key: `address.adresseid`).

Global wizard state is managed by a single Zustand store: `src/lib/project-store.ts`. Key fields: `address` (incl. `adresseid` for cache key), `bbrData`, `complianceDone`, `complianceFlags`, `lokalplaner`, `husDna`, `phases`.

### Shared UI primitives

- `src/components/wizard-ui.tsx` — `PageTransition`, `StepHeader`, `Card` (used on every step)
- `src/components/wizard-chrome.tsx` — `TopBar`, `StepDots`, `BackLink` (navigation chrome)

The route tree (`src/routeTree.gen.ts`) is **auto-generated** by TanStack Router — never edit it manually. `vite.config.ts` delegates entirely to `@lovable.dev/vite-tanstack-config` and must not have plugins added manually.

**Cloudflare Worker entry**: `src/server.ts` is the custom server entry (pointed to by `wrangler.toml`'s `main`). It wraps the TanStack Start handler with Sentry via `withSentry`. Do not delete this file — without it, `wrangler.toml` falls back to `@tanstack/react-start/server-entry` and Sentry is not included.

### Integrations (`src/integrations/`)

Each integration is a standalone service class. Server-side services must **never** be called directly from the browser — use TanStack Start's `createServerFn` as the boundary (see `projekt.compliance.tsx`).

| Service                  | File                      | Side        | Notes                                                                                                                  |
| ------------------------ | ------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| `GsearchService`         | `gsearch/client.ts`       | Server only | Address autocomplete via Dataforsyningen GSearch v2. Requires `DATAFORSYNINGEN_TOKEN`                                   |
| `BbrService`             | `bbr/client.ts`           | Server only | Building register via Datafordeler GraphQL v2. Requires `DATAFORDELER_API_KEY`                                         |
| `MatService`             | `mat/client.ts`           | Server only | Matrikel register (grundareal) via Datafordeler GraphQL v2                                                             |
| `DarService`             | `dar/client.ts`           | Server only | Address register via Datafordeler GraphQL v1                                                                           |
| `PlandataService`        | `plandata/client.ts`      | Server only | Local plans via public WFS. No API key needed                                                                          |
| `TinglysningService`     | `tinglysning/client.ts`   | Server only | Servitutter. **IS_MOCK=true** — live API pending (ARCH-26)                                                             |
| `PdfExtractorService`    | `ai/pdf-extractor.ts`     | Server only | Lokalplan PDF → structured rules via Claude API. **IS_MOCK=true** — requires `ANTHROPIC_API_KEY` (ARCH-25)             |
| `HusDnaGeneratorService` | `ai/hus-dna-generator.ts` | Server only | Inspirationsbilleder + fritekst → Hus-DNA via Claude vision. **IS_MOCK=true** — requires `ANTHROPIC_API_KEY` (ARCH-47) |
| Supabase                 | `supabase/`               | Both        | Auth middleware and typed client                                                                                       |

**Datafordeler GraphQL constraints** (applies to BBR, MAT, DAR):

- Only one root field per query (`DAF-GQL-0010`)
- `virkningstid` parameter is required on all queries (`DAF-GQL-0009`)
- No aliases (`DAF-GQL-0008`)
- Introspection disabled (`HC0046`)
- API key goes as a **query parameter** (`?apiKey=...`), never as an `Authorization` header

### Environment variables

Server-side only — **no `VITE_` prefix** (these must not reach the browser):

```
DATAFORDELER_API_KEY         # Required for BBR, MAT, DAR
DATAFORDELER_BBR_ENDPOINT    # Optional, defaults to graphql.datafordeler.dk/BBR/v2
DATAFORDELER_MAT_ENDPOINT    # Optional, defaults to graphql.datafordeler.dk/MAT/v2
DATAFORDELER_DAR_ENDPOINT    # Optional, defaults to graphql.datafordeler.dk/DAR/v1
ANTHROPIC_API_KEY            # Required for PdfExtractorService + HusDnaGeneratorService (IS_MOCK=true skips this)
DATAFORSYNINGEN_TOKEN        # Optional for GsearchService — free token from dataforsyningen.dk; unauthenticated requests may be rate-limited
SENTRY_DSN                   # Optional — Sentry error tracking DSN. If absent, Sentry is silently disabled.
ENVIRONMENT                  # Optional — used as Sentry environment tag (defaults to "production")
```

**GitHub Actions secrets** required for source map upload:
```
SENTRY_AUTH_TOKEN            # Sentry auth token for source map upload (Settings → Auth Tokens)
```

### Styling

Dark-only design. Accent color is `#E8FF4D` (yellow-green). Fonts: Inter (body), Space Mono (monospace labels/headings). Tailwind CSS v4 with custom CSS variables defined in `src/styles.css`. The `@/` path alias resolves to `src/`.

## Linear task management

Issues are tracked in the **ArchAI** team on Linear (`linear.app/archai-design-partner`).

- Issue identifiers follow the pattern `ARCH-N`
- When starting work on an issue, move it to **In Progress**
- Link commits to issues by including the identifier in the commit message (e.g. `ARCH-5: setup auth`)
- Priorities: Urgent (1) → High (2) → Normal (3) → Low (4)

## Code conventions

- **Language**: TypeScript throughout — no `any`, prefer explicit return types on exported functions
- **Imports**: Use the `@/` alias for `src/` imports; never use relative `../../` paths crossing feature boundaries
- **Server boundary**: All Datafordeler / Supabase calls go inside `createServerFn` — never import server-only modules at the top level of a route file
- **State**: Global wizard state lives exclusively in `src/lib/project-store.ts`; do not add local `useState` for data that belongs to the wizard flow
- **Styling**: Tailwind utility classes only — no inline `style` props, no new CSS files. Dark-only; use the `#E8FF4D` accent via `text-accent` / `bg-accent` CSS variable classes
- **Tests**: Co-locate test files next to the module (e.g. `bbr.test.ts` beside `bbr/client.ts`); use `bun test`

## Definition of done

A task is done when all of the following are true:

- [ ] Feature works end-to-end in `bun dev` (golden path + obvious edge cases)
- [ ] `bun build` succeeds with no type errors
- [ ] `bun test` passes (no skipped tests introduced)
- [ ] `bunx eslint .` reports no new errors
- [ ] No `console.log` or debug code left in
- [ ] Environment variables documented in CLAUDE.md if new ones were added
- [ ] Linear issue moved to **Done**

## CI/CD

GitHub Actions kører automatisk via `.github/workflows/`:

| Workflow     | Trigger                     | Steps                                    |
| ------------ | --------------------------- | ---------------------------------------- |
| `ci.yml`     | PR til main + push til main | tsc · eslint · bun test · bun build      |
| `deploy.yml` | Push til main               | bun build · wrangler deploy (production) |

**Preview deploys** på PR: `wrangler deploy --name archai-preview-pr-<N>` — kræver at Cloudflare Workers plan tillader flere workers.

**GitHub Secrets der skal sættes** (Settings → Secrets → Actions):

```
CLOUDFLARE_API_TOKEN         # Cloudflare API token med Workers:Edit permission
DATAFORDELER_API_KEY
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_PUBLISHABLE_KEY
ANTHROPIC_API_KEY
```

**wrangler.toml** er i rod-mappen. Sæt `account_id` til din Cloudflare-konto-ID inden første deploy.

## DAWA migration — ✅ COMPLETED (ARCH-23)

DAWA (`api.dataforsyningen.dk`) er fuldt erstattet. Alle tre faser er done:

- **Phase 1** ✅: `grundareal` → `MatService.getGrundareal(ejerlavskode, matrikelnummer)`
- **Phase 2** ✅: `DawaService.getAddressDetails()` → `DarService.getAddressDetails()`
- **Phase 3** ✅: `DawaService.getSuggestions()` → `GsearchService.getSuggestions()` (server-side via `createServerFn`)
