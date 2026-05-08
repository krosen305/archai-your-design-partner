# CLAUDE.md

**ArchAI** — AI-assisted byggetilladelsesrådgiver. TanStack Start (React SSR) på Cloudflare Workers.

## Commands

```bash
bun dev                                        # Dev server
bun build                                      # Production (Cloudflare Workers)
bun test                                       # Alle tests
bun test src/integrations/bbr/bbr.test.ts      # Én testfil
bunx eslint .                                  # Lint
bunx prettier --write .                        # Format
```

## Wizard routes (`src/routes/`)

```
/                        → index.tsx
/projekt/adresse         → projekt.adresse.tsx      (GSearch autocomplete)
/projekt/hus-dna         → projekt.hus-dna.tsx      (Phase 1: AI drømmehus)
/projekt/compliance      → projekt.compliance.tsx    (BBR + Plandata pipeline)
/projekt/match           → projekt.match.tsx         (Phase 2: compliance matrix)
/projekt/finans          → projekt.finans.tsx        (Phase 3+: placeholders)
```

Flow: adresse → hus-dna → compliance (auto-kører BBR+Plandata) → match → …
Compliance pipeline: `createServerFn` → `analyseAddress()` i `src/lib/analysis-orchestrator.ts` → cache i Supabase `address_analysis` (key: `adresseid`).

## Kritiske regler

**Server boundary** — al Datafordeler/Supabase-kode i `createServerFn`. Importer aldrig server-moduler på top-level i route-filer.

**Aldrig redigér** `src/routeTree.gen.ts` (auto-genereret) eller `vite.config.ts` (delegerer til `@lovable.dev/vite-tanstack-config`).

**Aldrig slet** `src/server.ts` — Sentry-wrapper. Uden den falder `wrangler.toml` tilbage til default entry.

**State** — wizard-data lever udelukkende i `src/lib/project-store.ts`. Ingen lokal `useState` for flow-data.

**Env** — importér altid fra `src/lib/env.ts`, aldrig `process.env` direkte.

## src/lib — nøglefiler

| Fil                              | Ansvar                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------- |
| `project-store.ts`               | Zustand wizard-state (`address`, `bbrData`, `complianceFlags`, `lokalplaner`, `husDna`, `phases`) |
| `analysis-orchestrator.ts`       | Entry point for compliance pipeline                                                               |
| `compliance-*.ts`                | Compliance-logik og flagberegning                                                                 |
| `phase-*.ts`                     | Fase-styring                                                                                      |
| `auth.ts` / `auth-middleware.ts` | Auth utilities + Cloudflare middleware                                                            |
| `env.ts`                         | Zod-valideret env — brug denne                                                                    |
| `kommuner.ts`                    | Kommunekode → kommunenavn map (98 kommuner)                                                       |
| `utils.ts`                       | `cn()` og utilities                                                                               |

## Integrations (`src/integrations/`)

Se `docs/INTEGRATIONS.md` for fuld tabel og Datafordeler GraphQL-constraints.

Aktiv status:

- `TinglysningService` — IS_MOCK=true (ARCH-26, API afventes)
- Alle andre services er live

## Env vars (server-side — ingen `VITE_` prefix)

```
DATAFORDELER_API_KEY    # Påkrævet: BBR, MAT, DAR
ANTHROPIC_API_KEY       # Påkrævet: PdfExtractor + HusDnaGenerator
DATAFORSYNINGEN_TOKEN   # Valgfri: GSearch (rate-limits uden)
SENTRY_DSN              # Valgfri
ENVIRONMENT             # Valgfri: Sentry env tag
LINEAR_WEBHOOK_SECRET   # Valgfri: ARCH-74
GITHUB_DISPATCH_TOKEN   # Valgfri: ARCH-74
```

Dokumentér altid nye env-variabler her.

## Slash commands (Claude Code)

| Kommando                      | Beskrivelse                                                     |
| ----------------------------- | --------------------------------------------------------------- |
| `/new-issue <idébeskrivelse>` | Genererer og opretter en Linear ARCH-issue direkte fra fritekst |

Filer: `.claude/commands/`

## Definition of done

- [ ] Feature virker end-to-end i `bun dev`
- [ ] `bun build` — ingen type-fejl
- [ ] `bun test` — ingen failing/skipped tests
- [ ] `bunx eslint .` — ingen nye fejl
- [ ] Ingen `console.log` eller debug-kode
- [ ] Nye env-variabler dokumenteret herover
- [ ] Linear issue → **Done**
