# AGENTS.md — ArchAI

**ArchAI** — AI-assisted byggetilladelsesrådgiver. TanStack Start (React SSR) på Cloudflare Workers. Bun som runtime og package manager.

> Dette projekt har to AI-agenter: **Claude Code** (arkitektonisk opsyn) og **Codex** (implementering). Claude Code ejer CLAUDE.md og AGENTS.md. Codex opdaterer dem IKKE autonomt.

## Commands

```bash
bun dev              # Dev server
bun test             # Test suite (skal give 0 failures)
bunx tsc --noEmit    # Type check (skal være rent)
bunx eslint .        # Lint (0 errors påkrævet)
bunx prettier --write .  # Format
```

## Kritiske regler — ubrydelige

### Aldrig redigér
- `src/routeTree.gen.ts` — auto-genereret af TanStack Router
- `vite.config.ts` — delegerer til `@lovable.dev/vite-tanstack-config`

### Aldrig slet
- `src/server.ts` — Sentry-wrapper. Mangler den, crasher `wrangler.toml` til default entry.

### Server boundary
Al Datafordeler- og Supabase-kode SKAL ligge i `createServerFn`. Importer ALDRIG server-moduler på top-level i route-filer (`src/routes/*.tsx`). Brug dynamisk `import()` inde i server-funktioner.

### State
Wizard-flow-data lever **udelukkende** i `src/lib/project-store.ts` (Zustand). Ingen lokal `useState` for data der skal bevares på tværs af routes.

### Env
Importér altid env-variabler fra `src/lib/env.ts`. Brug aldrig `process.env` direkte.

### Nye env-variabler
Dokumentér altid i `CLAUDE.md` under "Env vars". Aldrig `VITE_`-prefix på server-side variabler.

---

## Beskyttede filer — kræver human review inden merge

Codex MÅ redigere disse, men PR **må ikke merges** uden eksplicit godkendelse fra menneske. Skriv i PR-beskrivelsen: `🔒 Rører beskyttet fil — kræver review`.

| Fil | Årsag |
|-----|-------|
| `src/lib/project-store.ts` | State-shape-ændringer bryder sync og restore |
| `src/lib/analysis-orchestrator.ts` | Compliance-pipeline — fejl rammer alle brugere |
| `src/lib/pre-check-adresse.ts` | Adresse-gate — fejl blokerer brugerflow |
| `src/lib/reactive-compliance.ts` | Reaktiv compute — arkitekturelt fundament |
| `AGENTS.md`, `CLAUDE.md` | Agent-instruktioner — Claude Code ejer disse |
| `package.json`, `wrangler.toml` | Build og deployment |
| Nye `createServerFn`-mønstre | Server boundary — arkitektonisk beslutning |

---

## Sikre arbejdsområder — Codex kan arbejde autonomt

- **Stub-routes** — `src/routes/projekt.oekonomi.tsx`, `teknik.tsx`, `udbud.tsx` (fuld implementation)
- **UI-komponenter** — `src/components/` (følg eksisterende mønstre med shadcn + Lucide)
- **Integrationsklienter** — `src/integrations/*/` (kopier eksisterende klientmønster nøjagtigt)
- **Regelkerne** — `src/lib/rule-engine/rules/` (pure functions, ingen I/O)
- **Tests** — `src/**/*.test.ts` (brug eksisterende testmønstre)
- **IS_MOCK=true services** → live implementation (følg eksisterende klientstruktur)

---

## Arkitektur — nøglefiler

| Fil | Ansvar |
|-----|--------|
| `src/lib/project-store.ts` | Zustand wizard-state — ENESTE kilde til flow-data |
| `src/lib/project-sync.ts` | Fire-and-forget Supabase-sync (`syncPatch`) |
| `src/lib/analysis-orchestrator.ts` | Cache-first compliance pipeline (BBR+MAT+Plandata+geodata) |
| `src/lib/pre-check-adresse.ts` | Hurtig Layer-1-fetch ved adressevalg |
| `src/lib/reactive-compliance.ts` | Client-safe compliance-compute uden API-kald |
| `src/lib/rule-engine/` | Deterministisk regelkerne — pure functions, ingen AI |
| `src/lib/compliance-engine.ts` | `calculateComplianceMetrics()` — bebyggelsesprocent, etager, areal |
| `src/lib/env.ts` | Zod-valideret env — brug denne |

Se `docs/INTEGRATIONS.md` for fuld integrationsoversigt.

## Domain

Primær kunderejse: Nedrivning → Nybyg. Ikke-lineær, risiko-drevet.  
Brugeren vurderer ejendomme FØR køb (due diligence) — ikke kun projektering.  
Se `docs/domain/journey-demolition-new-build.md`.

---

## Verification checklist

Inden du erklærer en opgave færdig:

```bash
bunx tsc --noEmit   # 0 errors
bun test            # 0 failures
bunx eslint .       # 0 errors
```

Ingen `console.log` eller debug-kode i produktionskode.  
Rørte du en beskyttet fil? Skriv `🔒 Rører beskyttet fil — kræver review` i PR-beskrivelsen.
