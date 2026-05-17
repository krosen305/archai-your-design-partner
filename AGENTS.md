# AGENTS.md — ArchAI

**ArchAI — The Builder's Cockpit.** AI-powered platform for private residential construction in Denmark. TanStack Start (React SSR) on Cloudflare Workers. Bun as runtime and package manager.

> Dette projekt har to AI-agenter: **Claude Code** (arkitektonisk opsyn) og **Codex** (implementering). Claude Code ejer CLAUDE.md og AGENTS.md. Codex opdaterer dem **IKKE** autonomt.

---

## Commands

```bash
bun dev                   # Dev server
bun run build             # Production build — kør inden du erklærer dig færdig
bun test                  # Test suite (0 failures påkrævet)
bunx tsc --noEmit         # Type check (0 errors påkrævet)
bunx eslint .             # Lint (0 errors påkrævet)
bunx prettier --write .   # Format
```

---

## De 4 faser — Builder's Cockpit

Kunderejsen er **ikke lineær**. Den er opdelt i 4 faser. Brug altid disse navne i kode, kommentarer og PR-beskrivelser:

| Fase | Navn             | Indhold                                                 |
| ---- | ---------------- | ------------------------------------------------------- |
| 1    | **Sandkassen**   | Inspiration, AI-genererede koncepter (Hus-DNA)          |
| 2    | **Matriklen**    | Grunddata, Hard Stops, SAVE-værdier, beskyttelseslinjer |
| 3    | **Maskinrummet** | Parametrisk design, live compliance, BIM                |
| 4    | **Myndighed**    | Ansøgninger, nabopartshøring, LCA, statics              |

**Pre-purchase er en primær use case** — compliance-data er due diligence, ikke kun projekteringshjælp.

---

## Kritiske regler — ubrydelige

### Aldrig redigér

- `src/routeTree.gen.ts` — auto-genereret af TanStack Router
- `vite.config.ts` — delegerer til `@lovable.dev/vite-tanstack-config`

### Aldrig slet

- `src/server.ts` — Sentry-wrapper. Mangler den, crasher `wrangler.toml` til default entry.

### DAWA er forbudt

Brug **aldrig** `api.dataforsyningen.dk` (DAWA) — hverken som primær kilde eller fallback. DAWA er udfaset og lukker. Al adresse- og matrikeldata hentes udelukkende fra Datafordeler (DAR, MAT, BBR). Hvis DAR mangler jordstykke-FK for en adresse, returneres `null` — ingen fallback.

### Server boundary

Al Datafordeler- og Supabase-kode SKAL ligge i `createServerFn`. Importer **aldrig** server-moduler på top-level i route-filer (`src/routes/*.tsx`).

### State

Cockpit-data lever **udelukkende** i `src/lib/project-store.ts` (Zustand). Ingen lokal `useState` for data der skal bevares på tværs af routes eller genindlæsninger.

### Env

Importér altid env-variabler fra `src/lib/env.ts`. Brug aldrig `process.env` direkte. Nye env-variabler dokumenteres i `CLAUDE.md` under "Env vars".

---

## Development Rules — Compliance Engine

Disse tre regler er ikke-forhandlbare. Enhver kode der overtræder dem vil blive afvist i review.

### Rule 1 — Check `site_constraints` first

Foreslå aldrig et design-valg, generer aldrig AI-output og flyt aldrig brugeren til næste fase uden at `RuleEngineInput` er assembleret og `runRuleEngine()` er kørt. Hvis `result.hardStops.length > 0`, skal dette vises **før** brugeren kan fortsætte.

```typescript
// KORREKT
const input = assembleRuleEngineInput(bbrData, plandata, byggeoenske, ...);
const result = runRuleEngine(input);
if (result.hardStops.length > 0) { /* vis Hard Stop — stop ikke brugeren med AI-output */ }

// FORKERT
generateDesignSuggestion(byggeoenske); // ingen constraint-check
```

### Rule 2 — Single Source of Truth: `projects`-tabellen

Domæne-kritiske compliance-værdier (bebyggelsesprocent, SAVE-værdi, Hard Stop-flag) gemmes i **typede SQL-kolonner** — aldrig udelukkende i JSONB-blobs.

Typede kolonner på `projects`:

- `heritage_save_value SMALLINT` — FBB SAVE 1–9
- `is_fredet BOOLEAN` — DAI WFS fredningsstatus
- `grundareal_m2 FLOAT` — MAT-grundareal
- `bebygget_areal_m2 FLOAT` — BBR bebygget areal
- `hard_stop BOOLEAN` — aggregeret bloker-flag
- `hard_stop_reason TEXT` — menneskelæsbar årsag
- `budget_estimate BIGINT` — DKK, erstatning for `budget TEXT`

Skriv **aldrig** compliance-data kun til `compliance_data JSONB` uden at skrive de tilhørende typede kolonner. JSONB-blobben beholdes som arkiv, ikke som primær kilde.

### Rule 3 — Hard Stop Logic er deterministisk

Hard Stops evalueres i `src/lib/rule-engine/rules/stop-rules.ts` — aldrig i UI-komponenter ved string-matching eller AI-output-parsing.

Hard Stop-tærskler:

- `heritage_save_value <= 3` → `dispensation_required` (Slots- og Kulturstyrelsen)
- `heritage_save_value === 4` → `warning` (§14-forbud, kommunen)
- `is_fredet === true` → `illegal` (ved nedrivning)
- `mat_strandbeskyttelse === true` → `dispensation_required`
- `mat_fredskov === true` → `dispensation_required`
- `mat_klitfredning === true` → `dispensation_required`

Disse tærskler er defineret i `src/lib/rule-engine/rules/stop-rules.ts` og i `src/types/building-platform.ts`. Kopiér dem aldrig til andre filer — brug import.

---

## Supabase-skema — aktive tabeller

Kend disse tabeller. `projekter` eksisterer **ikke** længere — den er droppet i migration `20260515100000`.

| Tabel               | Formål                                                          | Nøgle                                     |
| ------------------- | --------------------------------------------------------------- | ----------------------------------------- |
| `projects`          | SSOT for alle projekt-data — inkl. typede compliance-kolonner   | `id UUID`, `user_id`                      |
| `address_analysis`  | Delt cache for compliance-resultater (alle brugere, én adresse) | `address_id TEXT`                         |
| `site_constraints`  | Typede plot-begrænsninger til Validation Engine                 | `address_id TEXT` FK → `address_analysis` |
| `design_iterations` | Versionerede brugerdesigns (én aktiv pr. projekt)               | `project_id UUID` FK → `projects`         |
| `building_tasks`    | Bruger-vendt Building Timeline (Sandkassen → Myndighed)         | `project_id UUID`, `task_key TEXT`        |
| `agent_sessions`    | AI-agent teknisk log (service_role kun)                         | `id TEXT`                                 |
| `agent_tasks`       | Opgave-log pr. session (service_role kun)                       | `session_id TEXT`                         |

**Skriv aldrig til `projekter`** — tabellen eksisterer ikke i produktions-DB.

**`design_iterations`** har en partial unique index: kun én aktiv iteration pr. projekt:

```sql
CREATE UNIQUE INDEX ON design_iterations(project_id) WHERE is_active = true;
```

For at aktivere en ny version: sæt den eksisterende til `is_active = false` først.

**`building_tasks`** har `UNIQUE(project_id, task_key)` (where task_key IS NOT NULL). Brug `UPSERT` med `onConflict: 'project_id,task_key'` — ikke INSERT.

---

## Beskyttede filer — kræver human review inden merge

Codex MÅ redigere disse, men PR **må ikke merges** uden eksplicit godkendelse. Skriv: `🔒 Rører beskyttet fil — kræver review`.

| Fil                                                | Årsag til beskyttelse                                                   |
| -------------------------------------------------- | ----------------------------------------------------------------------- |
| `src/lib/project-store.ts`                         | State-shape-ændringer bryder sync og restore                            |
| `src/lib/analysis-orchestrator.ts`                 | Compliance-pipeline — fejl rammer alle brugere                          |
| `src/lib/pre-check-adresse.ts`                     | Adresse-gate — fejl blokerer brugerflow                                 |
| `src/lib/reactive-compliance.ts`                   | Reaktiv compute — arkitektonisk fundament                               |
| `src/integrations/supabase/project-persistence.ts` | Domain Sync Engine — skriver typede kolonner + genererer building_tasks |
| `AGENTS.md`, `CLAUDE.md`                           | Agent-instruktioner — Claude Code ejer disse                            |
| `package.json`, `wrangler.toml`                    | Build og deployment                                                     |
| Nye `createServerFn`-mønstre                       | Server boundary — arkitektonisk beslutning                              |

---

## Sikre arbejdsområder — Codex kan arbejde autonomt

Disse areas kræver **ikke** review for merge, men verification checklist nedenfor skal passere:

- **UI-komponenter** — `src/components/` (følg shadcn + Lucide mønstre)
- **Cockpit-faner og panels** — `src/components/cockpit/` (læs fra `useProject()`, ingen lokal compliance-state)
- **Stub-routes** — `src/routes/projekt.oekonomi.tsx`, `teknik.tsx`, `udbud.tsx`
- **Regel-engine regler** — `src/lib/rule-engine/rules/` (pure functions, ingen I/O)
- **Integrationsklienter** — `src/integrations/*/` (kopier eksisterende klientmønster)
- **IS_MOCK=true services** → live implementation
- **Tests** — `src/**/*.test.ts`
- **Database-migrationer** — `supabase/migrations/` (additive: ADD COLUMN, CREATE TABLE — aldrig DROP uden eksplicit instruks)

**Undgå** at introducere `useState` for compliance-data i cockpit-komponenter. Brug `useProject()` fra `src/lib/project-store.ts` for alle felter der er beskrevet i Rule 2 ovenfor.

---

## Arkitektur — nøglefiler

| Fil                                                | Ansvar                                                                                                      |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `src/lib/project-store.ts`                         | Zustand cockpit-state — ENESTE kilde til flow-data inkl. typede compliance-felter                           |
| `src/lib/project-sync.ts`                          | Fire-and-forget Supabase-sync (`syncPatch`) — thin wrapper                                                  |
| `src/integrations/supabase/project-persistence.ts` | Domain Sync Engine — skriver typede kolonner, `hard_stop`, `building_tasks`                                 |
| `src/lib/analysis-orchestrator.ts`                 | Cache-first compliance pipeline — BBR+MAT+Plandata+geodata paralleliseret                                   |
| `src/lib/pre-check-adresse.ts`                     | Hurtig Layer-1-fetch ved adressevalg (ARCH-121)                                                             |
| `src/lib/reactive-compliance.ts`                   | Client-safe compliance-compute — ingen API-kald, kald ved Byggeoenske-ændringer                             |
| `src/lib/rule-engine/`                             | Deterministisk regelkerne — pure functions, ingen AI                                                        |
| `src/lib/compliance-engine.ts`                     | `calculateComplianceMetrics()` — bebyggelsesprocent, etager, areal                                          |
| `src/lib/env.ts`                                   | Zod-valideret env — brug denne                                                                              |
| `src/types/building-platform.ts`                   | Domain-typer: `SiteConstraints`, `DesignIteration`, `BuildingTask`, `BUILDING_TASK_KEYS`, Hard Stop helpers |

---

## Linear-labels — hvad du må arbejde på

| Label                | Betydning                                                            |
| -------------------- | -------------------------------------------------------------------- |
| `codex-safe`         | Codex kan implementere autonomt uden arkitekt-review                 |
| `needs-architecture` | **Må ikke implementeres af Codex** — kræver Claude Code review først |
| `lovable-frontend`   | Frontend-opgave til Lovable — ikke Codex                             |

Tag kun issues med `codex-safe` label. Ser du `needs-architecture`-issues der virker enkle, opret en kommentar i Linear og vent på Claude Code.

---

## Tech debt — regler for oprydning

- Læs **aldrig** `compliance_data JSONB` for værdier der har typede kolonner (se Rule 2-liste ovenfor)
- Skriv **aldrig** til den droppede `projekter`-tabel
- Brug **aldrig** `current_step`-streng-enum til at drive navigation eller betinget rendering — brug `compliance_done` og `adresse_dar_id` som afledt datastatus
- Tilføj **aldrig** ny JSONB-kolonne til `projects` for compliance-data — tilføj en typed kolonne i stedet

---

## Domain — kritiske risikokategorier

| Risiko                       | Størrelsesorden        | Kilde            |
| ---------------------------- | ---------------------- | ---------------- |
| Geoteknik                    | 0–500.000 kr+          | GEUS WFS         |
| Forsyningsafkobling          | 50.000–150.000 kr      | Manuel datacheck |
| Nabosager/nabopartshøring    | 4–12 ugers forsinkelse | Plandata         |
| Fredning / SAVE 1–3          | Byggestop — kræver SKS | FBB WFS          |
| Strandbeskyttelse / fredskov | Absolut byggestop      | MAT_Jordstykke   |

Se `docs/domain/journey-demolition-new-build.md` for fuld kunderejse.

---

## Verification checklist — inden du erklærer færdig

```bash
bunx tsc --noEmit   # 0 errors
bun test            # 0 failures
bunx eslint .       # 0 errors
bun build           # ingen build-fejl
```

- Ingen `console.log` eller debug-kode i produktionskode
- Rørte du en beskyttet fil? → `🔒 Rører beskyttet fil — kræver review` i PR
- Tilføjede du compliance-data til en ny JSONB-blob? → Stop. Tilføj en typed kolonne i stedet
- Skriver din kode til `projekter`-tabellen? → Stop. Tabellen eksisterer ikke
- Bruger din kode `fbbData?.fbb_bedste_bygning?.bevaringsvaerdi` direkte i en UI-komponent? → Læs `heritage_save_value` fra `useProject()` i stedet
