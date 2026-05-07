# CLAUDE.md

**ArchAI** — AI-assisted byggetilladelsesrådgiver for danske selvbyggere. TanStack Start (React SSR) på Cloudflare Workers.

## Commands

```bash
bun dev                                          # Dev server
bun build                                        # Production build (Cloudflare Workers)
bun test                                         # Alle tests
bun test src/integrations/bbr/bbr.test.ts        # Én testfil
bunx eslint .                                    # Lint
bunx prettier --write .                          # Format
```

## Wizard flow

5-fase wizard. Routes er filbaserede i `src/routes/`:

```
/                         → index.tsx
/projekt/adresse          → projekt.adresse.tsx       (GSearch autocomplete)
/projekt/hus-dna          → projekt.hus-dna.tsx       (Phase 1: AI drømmehus-input)
/projekt/compliance       → projekt.compliance.tsx     (BBR + Plandata pipeline)
/projekt/match            → projekt.match.tsx          (Phase 2: compliance matrix)
/projekt/finans           → projekt.finans.tsx         (Phase 3: placeholder)
/projekt/engineering      → projekt.engineering.tsx    (Phase 4: placeholder)
/projekt/udbud            → projekt.udbud.tsx          (Phase 5: placeholder)
```

Flow: adresse → hus-dna → compliance (auto-kører BBR+Plandata) → match → finans → …

Compliance kører som én `createServerFn` via `src/lib/analysis-orchestrator.ts`. Resultater caches i Supabase `address_analysis` (key: `address.adresseid`).

**Auto-genererede filer — redigér aldrig:**
- `src/routeTree.gen.ts` — TanStack Router
- `vite.config.ts` — delegerer til `@lovable.dev/vite-tanstack-config`

**Kritisk server-entry:** `src/server.ts` wrapper TanStack Start med Sentry via `withSentry`. Slet ikke.

## src/lib/ — nøglefiler

Tjek altid om logik allerede eksisterer her inden du skriver nyt:

| Fil | Indhold |
|---|---|
| `project-store.ts` | Global Zustand wizard-state (`address`, `bbrData`, `complianceFlags`, `lokalplaner`, `husDna`, `phases`) |
| `analysis-orchestrator.ts` | Entry point for compliance pipeline |
| `compliance-*.ts` | Compliance-logik og flagberegning |
| `phase-*.ts` | Fase-styring og -tilstand |
| `auth.ts` / `auth-middleware.ts` | Auth utilities + Cloudflare middleware |
| `env.ts` | Zod-valideret env (brug denne — importér ikke `process.env` direkte) |
| `feature-*.ts` | Feature flags |
| `linear-*.ts` | Linear webhook-håndtering |
| `utils.ts` | `cn()` og øvrige utilities |

## Integrations

Alle integrationer i `src/integrations/`. Server-side tjenester **må aldrig** importeres direkte i route-filer — brug `createServerFn` som grænse.

**Schema-referencer** (Datafordeler GraphQL): `bbr-schema.txt`, `mat-schema.txt` i rod-mappen.

| Service | Fil | Status |
|---|---|---|
| `GsearchService` | `gsearch/client.ts` | ✅ Live |
| `BbrService` | `bbr/client.ts` | ✅ Live |
| `MatService` | `mat/client.ts` | ✅ Live |
| `DarService` | `dar/client.ts` | ✅ Live |
| `PlandataService` | `plandata/client.ts` | ✅ Live |
| `TinglysningService` | `tinglysning/client.ts` | 🟡 IS_MOCK=true (ARCH-26) |
| `PdfExtractorService` | `ai/pdf-extractor.ts` | ✅ Live |
| `HusDnaGeneratorService` | `ai/hus-dna-generator.ts` | ✅ Live |
| Supabase | `supabase/` | ✅ Live |

**Datafordeler GraphQL-constraints** (BBR, MAT, DAR):
- Ét root-felt per query (DAF-GQL-0010)
- `virkningstid` påkrævet (DAF-GQL-0009)
- Ingen aliases (DAF-GQL-0008)
- `?apiKey=...` som query-param — aldrig `Authorization` header

## Tests

- **Unit tests**: co-lokeres ved siden af modulet (`bbr.test.ts` → `src/integrations/bbr/`)
- **E2E tests**: `tests/` i rod-mappen (Playwright)

## Shared UI-primitiver

- `src/components/wizard-ui.tsx` — `PageTransition`, `StepHeader`, `Card`
- `src/components/wizard-chrome.tsx` — `TopBar`, `StepDots`, `BackLink`

## Styling

**Dark-only.** Accent: `#E8FF4D` (via `text-accent` / `bg-accent`). Fonts: Inter (body), Space Mono (labels/headings). Tailwind v4 + CSS-variabler i `src/styles.css`.

## Environment variables

Server-side only — **ingen `VITE_` prefix**. Valideres via `src/lib/env.ts` — importér derfra, ikke fra `process.env`.

```
DATAFORDELER_API_KEY          # Påkrævet: BBR, MAT, DAR
ANTHROPIC_API_KEY             # Påkrævet: PdfExtractor + HusDnaGenerator (IS_MOCK bypasser)
DATAFORSYNINGEN_TOKEN         # Valgfri: GSearch (rate-limits uden)
SENTRY_DSN                    # Valgfri: Sentry error tracking
ENVIRONMENT                   # Valgfri: Sentry environment tag (default: "production")
LINEAR_WEBHOOK_SECRET         # Valgfri: HMAC signing (ARCH-74)
GITHUB_DISPATCH_TOKEN         # Valgfri: GitHub PAT til Linear bridge (ARCH-74)
GITHUB_REPO                   # Valgfri: default krosen305/archai-your-design-partner
DATAFORDELER_BBR_ENDPOINT     # Valgfri: default graphql.datafordeler.dk/BBR/v2
DATAFORDELER_MAT_ENDPOINT     # Valgfri: default graphql.datafordeler.dk/MAT/v2
DATAFORDELER_DAR_ENDPOINT     # Valgfri: default graphql.datafordeler.dk/DAR/v1
```

Dokumentér altid nye env-variabler her.

## Code conventions

- **TypeScript strict** — ingen `any`, eksplicitte return-typer på eksporterede funktioner
- **Imports**: `@/`-alias for `src/`; aldrig `../../` på tværs af feature-grænser
- **Server boundary**: al Datafordeler/Supabase-kode i `createServerFn`
- **State**: global wizard-state udelukkende i `src/lib/project-store.ts`
- **Env**: importér altid fra `src/lib/env.ts`, aldrig `process.env` direkte
- **Styling**: Tailwind utility-klasser — ingen inline `style`, ingen nye CSS-filer
- **Linear**: ARCH-N i commit-beskeder; flyt issue til **Done** ved task-afslutning

## Definition of done

- [ ] Feature virker end-to-end i `bun dev` (happy path + edge cases)
- [ ] `bun build` — ingen type-fejl
- [ ] `bun test` — ingen failing/skipped tests
- [ ] `bunx eslint .` — ingen nye fejl
- [ ] Ingen `console.log` eller debug-kode
- [ ] Nye env-variabler dokumenteret herover
- [ ] Linear issue → **Done**

## CI/CD

| Workflow | Trigger | Formål |
|---|---|---|
| `ci.yml` | PR + push til main | tsc · eslint · test · build |
| `deploy.yml` | Push til main | Build + wrangler deploy |
| `sentry-to-linear.yml` | `repository_dispatch` | Sentry fejl → Linear bug |
| `ai-pr-review.yml` | PR opened/sync | Claude Haiku PR-review |
| `linear-to-github.yml` | `repository_dispatch` | Linear issue → GitHub branch |
| `github-to-linear.yml` | PR opened/closed | Opdatér Linear status |

Opsætningsvejledning: `docs/CI_CD.md`.
