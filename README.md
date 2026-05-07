# ArchAI — Den Digitale Byggepartner

AI-assisteret byggetilladelsesrådgiver. Hjælper danskere med at forstå hvad de må bygge på deres grund inden de kontakter en arkitekt eller kommunen.

## Hvad er ArchAI?

ArchAI guider brugeren gennem et wizard-flow:

1. **Adresse** — slå adressen op via DAWA/DAR
2. **Hus-DNA** — AI-genereret billede af drømmehuset (Claude vision)
3. **Compliance** — Automatisk analyse: BBR + Plandata + 7+ geodatakilder
4. **Match** — Compliance-matrix: hvad må du bygge?
5. **Finans** — Budgetestimat og næste skridt

Compliance-pipeline: `analyseAddress()` → cache i Supabase → BBR, MAT, DAR, Plandata, naturbeskyttelse, geoteknik, terrain, nabobygninger, fjernvarme.

## Tech Stack

| Lag | Teknologi |
|---|---|
| Framework | TanStack Start (React SSR) |
| Runtime | Cloudflare Workers |
| Sprog | TypeScript, Bun |
| Database / Auth | Supabase (PostgreSQL + RLS) |
| AI | Anthropic Claude (Haiku / Sonnet) |
| Styling | Tailwind CSS + shadcn/ui |
| Tests | Vitest (unit) + Playwright (E2E) + eval-framework |

## Lokalt setup

```bash
# Forudsætter: Bun, Wrangler CLI, Supabase CLI

bun install
cp .dev.vars.example .dev.vars   # Udfyld API-nøgler (se nedenfor)
bun dev                           # http://localhost:3000
```

Kræver `.dev.vars`:
```
DATAFORDELER_API_KEY=...
ANTHROPIC_API_KEY=...
DATAFORSYNINGEN_TOKEN=...   # valgfri
SUPABASE_URL=...
SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

## Kommandoer

```bash
bun dev           # Dev server
bun build         # Production build (Cloudflare Workers)
bun test          # Unit tests
bun run evals     # AI eval-suite (mock mode)
bunx tsc --noEmit # Type-check
bunx eslint .     # Lint
bunx prettier --write . # Format
```

<!-- INTEGRATIONS-START -->
<!-- Auto-genereret af .github/workflows/auto-readme.yml — rediger ikke manuelt -->

## Integrationer

| Service | Fil | Status | Beskrivelse |
|---|---|---|---|
| `BbrService` | `integrations/bbr/client.ts` | ✅ Live | Bygningsregister via Datafordeler GraphQL v2 |
| `NaboService` | `integrations/bbr/neighbor-client.ts` | ✅ Live | Nabobygninger inden for 40 m via DAWA REST |
| `CacheService` | `integrations/cache/client.ts` | ✅ Live | Supabase-cache for compliance-resultater |
| `DarService` | `integrations/dar/client.ts` | ✅ Live | Adresseregister via Datafordeler GraphQL v1 |
| `GeusService` | `integrations/geus/client.ts` | 🟡 IS_MOCK=true | Geoteknisk risikodata via GEUS WFS |
| `GsearchService` | `integrations/gsearch/client.ts` | ✅ Live | Adresse-autocomplete via Dataforsyningen GSearch v2 |
| `DkJordService` | `integrations/miljoe/dkjord.ts` | 🟡 IS_MOCK=true | Forurenede grunde via DK-Jord WFS |
| `MatService` | `integrations/mat/client.ts` | ✅ Live | Matrikelregister (grundareal) via Datafordeler GraphQL v2 |
| `PlandataService` | `integrations/plandata/client.ts` | ✅ Live | Lokalplaner og kommuneplanrammer via WFS |
| `FjernvarmeService` | `integrations/plandata/fjernvarme.ts` | 🟡 IS_MOCK=true | Fjernvarmedækning via Plandata WFS |
| `DhmService` | `integrations/sdfi/dhm-client.ts` | 🟡 IS_MOCK=true | DHM terrain-data via SDFI WCS |
| `NaturbeskyttelseService` | `integrations/sdfi/naturbeskyttelse.ts` | 🟡 IS_MOCK=true | Naturbeskyttelseslinjer via DAI WFS |
| `ByggeanalyseService` | `integrations/ai/byggeanalyse.ts` | ✅ Live | AI byggeanalyse med regelkerne-integration |
| `HusDnaGeneratorService` | `integrations/ai/hus-dna-generator.ts` | ✅ Live | Billeder + tekst → Hus-DNA via Claude vision |
| `PdfExtractorService` | `integrations/ai/pdf-extractor.ts` | ✅ Live | Lokalplan PDF → strukturerede regler via Claude |
| `TinglysningService` | `integrations/tinglysning/client.ts` | 🟡 IS_MOCK=true | Servitutter fra TingbogenV2 (live API afventes) |

<!-- INTEGRATIONS-END -->

## Arkitektur

```
src/
├── routes/          # TanStack Start SSR routes (wizard-steps)
├── lib/             # Domænelogik (orchestrator, regelmotor, projekt-store)
├── integrations/    # Alle eksterne API-klienter (server-side only)
└── components/      # React UI-komponenter
```

**Server boundary**: al Datafordeler/Supabase-kode lever i `createServerFn`. Importer aldrig server-moduler direkte i route-filer.

## CI/CD

GitHub Actions: type-check → lint → test → build → evals (mock) → E2E → deploy til Cloudflare Workers.

Se `.github/workflows/` for detaljer.
