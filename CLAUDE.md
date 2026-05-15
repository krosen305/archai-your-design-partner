# CLAUDE.md

**ArchAI — The Builder's Cockpit.** AI-powered platform that eliminates the fear and complexity of private residential construction in Denmark. TanStack Start (React SSR) on Cloudflare Workers.

## Product Context

ArchAI serves private homeowners navigating the Danish residential construction journey — primarily the **Nedrivning → Nybyg** path (see `docs/domain/journey-demolition-new-build.md`). The core insight: this journey is non-linear, risk-driven, and iterative, and the biggest risks are invisible until it's too late (geoteknik, fredning, strandbeskyttelse, nabopartshøring).

**The four phases of The Builder's Cockpit:**

1. **Sandkassen** — Inspiration → AI-constrained 3D concepts (Hus-DNA)
2. **Matriklen** — Site analysis → all Hard Stops surfaced before purchase or design investment
3. **Maskinrummet** — Detailed design → parametric guardrails, live compliance, BIM
4. **Myndighed** — Permitting → auto-generated permit applications, statics, LCA

**Pre-purchase is a first-class use case.** Users evaluate properties before buying — compliance data is due diligence, not just project tooling.

**Unique Danish data handling:** The Compliance Engine synthesises 10+ authoritative Danish registers in a single pipeline. Each data source has legal authority weight: lokalplan overrides kommuneplan overrides BR18. Every rule violation must carry its `kilde` (bbr | plandata | servitut | sdfi | regelkerne) so users can act on the right authority.

**Critical risk categories (domain knowledge):**

- Geoteknik: 0 kr (good ground) to 500,000 kr+ (pile foundations) — largest single risk
- Forsyningsafkobling: 50,000–150,000 kr (el, vand, gas, kloak) — frequently omitted from budgets
- Nabosager: nabopartshøring can delay 4–12 weeks — early screening is essential
- Fredning/SAVE 1–3: demolition requires Slots- og Kulturstyrelsen approval
- Strandbeskyttelse/fredskov: absolute building stop without dispensation

## Commands

```bash
bun dev                                        # Dev server
bun build                                      # Production (Cloudflare Workers)
bun test                                       # Alle tests
bun test src/integrations/bbr/bbr.test.ts      # Én testfil
bunx eslint .                                  # Lint
bunx prettier --write .                        # Format
```

## Cockpit architecture (`src/routes/`)

```
/                              → index.tsx
/projekt/start                 → projekt.start.tsx
/projekt/adresse               → projekt.adresse.tsx           (GSearch autocomplete + pre-check)
/projekt/$id/cockpit           → projekt.$id.cockpit.tsx       (Cockpit — Single Source of Truth)
/projekt/datacheck             → projekt.datacheck.tsx         (projektparathed — manuelle datapunkter)
/projekt/teknik                → projekt.teknik.tsx
/projekt/udbud                 → projekt.udbud.tsx
```

Flow: adresse → `/projekt/{adresseid}/cockpit` (auto-kører BBR+Plandata+AI, byggeønsker i venstre panel)

Cockpit-moduler (tabs i `projekt.$id.cockpit.tsx`):

- **ANALYSE** — 3-kolonne dashboard (Design | Matrikel | Compliance) + AI byggeanalyse + lokalplaner + sektioner
- **EJENDOM** — ejendomsdata, plangrænser, compliance flags (`src/components/cockpit/EjendomPanel.tsx`)
- **ØKONOMI** — VUR-data, finansieringsgrundlag (`src/components/cockpit/OekonomiPanel.tsx`)

Compliance pipeline: `createServerFn` → `analyseAddress()` i `src/lib/analysis-orchestrator.ts` → cache i Supabase `address_analysis` (key: `adresseid`).

## Kritiske regler

**Server boundary** — al Datafordeler/Supabase-kode i `createServerFn`. Importer aldrig server-moduler på top-level i route-filer.

**Aldrig redigér** `src/routeTree.gen.ts` (auto-genereret) eller `vite.config.ts` (delegerer til `@lovable.dev/vite-tanstack-config`).

**Aldrig slet** `src/server.ts` — Sentry-wrapper. Uden den falder `wrangler.toml` tilbage til default entry.

**State** — wizard-data lever udelukkende i `src/lib/project-store.ts`. Ingen lokal `useState` for flow-data.

**Env** — importér altid fra `src/lib/env.ts`, aldrig `process.env` direkte.

## Development Rules — Compliance Engine

**Rule 1 — Check `site_constraints` first.**
Before any design suggestion, code generation, or AI prompt that involves plot dimensions, building height, footprint, or style, verify the site constraints are loaded. The `RuleEngineInput` assembled by `src/lib/rule-engine/input-assembler.ts` is the authoritative constraint object for the current plot. Never suggest a design change that hasn't been validated against it.

```typescript
// CORRECT: read constraints, then suggest
const input = assembleRuleEngineInput(bbrData, plandata, byggeoenske, ...);
const result = runRuleEngine(input);
if (result.hardStops.length > 0) { /* surface before proceeding */ }

// WRONG: suggest first, validate later
suggestDesign(byggeoenske);
```

**Rule 2 — Single Source of Truth: the `projects` table.**
All persisted project state lives in the `projects` table. Domain-critical compliance values (bebyggelsesprocent, max etager, grundareal, SAVE-value, Hard Stop flags) must be stored as **typed Supabase columns**, not inside JSONB blobs. When adding new compliance data:

- Add a typed column migration, not a JSONB field
- Update `project-sync.ts` to write to the typed column
- Update `project-store.ts` to read from the typed column on restore

**Rule 3 — Hard Stop logic.**
Hard Stops are non-negotiable blocking conditions. The severity ladder:

- `"illegal"` — cannot be dispensed (listed building + demolition intent)
- `"dispensation_required"` — requires approval from named authority
- `"warning"` — advisory; design can proceed

Current Hard Stop triggers (source: `src/lib/rule-engine/rules/stop-rules.ts`):

- `saveValue <= 3` → fredning/dispensation_required (Slots- og Kulturstyrelsen)
- `saveValue === 4` → demolition warning (add this — currently missing, see Blocker 3 below)
- `strandbeskyttelse === true` → absolute stop
- `fredskov === true` → absolute stop
- `klitfredning === true` → absolute stop
- `listedBuilding === true` → illegal

When implementing new compliance rules, always add a corresponding `ComplianceFlag` entry so the UI surfaces the violation with its `kilde` and `dispensationMyndighed`.

## Tech Debt Management

The codebase has accumulated vibe-coded JSON blobs that violate the Data-Driven Architecture north star. Prune in this order:

**Prune pattern — JSONB → typed columns:**
When you encounter a field being read from `compliance_data JSONB` or `projekter.bbr_data JSONB` for a domain-critical value, migrate it:

1. Write a Supabase migration adding the typed column
2. Backfill from the JSONB field in the same migration
3. Update the TypeScript types and `project-sync.ts`
4. Remove the JSONB read path once the typed column is confirmed stable
5. Do NOT delete the JSONB column until the backfill has been verified in production

**Prune pattern — duplicate project tables:**
`projects` and `projekter` are two tables serving overlapping purposes (see Blocker 2 below). New features must not add data to `projekter` — use `projects`. The consolidation migration is tracked as a Linear issue.

**Never add new JSONB fields for compliance data.** If you're tempted to add `compliance_data->>'new_value'`, add a typed column instead. The one exception is `inspection_payload` — raw API response archiving is intentionally untyped.

## src/lib — nøglefiler

| Fil                              | Ansvar                                                                                                                                                      |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `project-store.ts`               | Zustand wizard-state (`address`, `bbrData`, `complianceFlags`, `lokalplaner`, `husDna`, `byggeanalyseResultat`, `adressePreCheck`, `boligoenskeValidering`) |
| `project-sync.ts`                | Fire-and-forget Supabase-sync (`syncPatch`, `restoreProject`) — session-persistens                                                                          |
| `analysis-orchestrator.ts`       | Entry point for compliance pipeline — BBR+MAT+Plandata+geodata paralleliseret                                                                               |
| `pre-check-adresse.ts`           | `preCheckAdresse` createServerFn — kører BBR+MAT+Plandata+Natur+Save+VUR parallelt ved adressevalg (ARCH-121)                                               |
| `reactive-compliance.ts`         | `computePartialUpdate()` — client-safe wrapper: compliance-metrics + regel-engine + flags uden API-kald                                                     |
| `rule-engine/`                   | Deterministisk regelkerne (stopregler, beregninger, energi) — pure functions, ingen AI                                                                      |
| `compliance-engine.ts`           | Beregning af `ComplianceMetrics` (bebyggelsesprocent, etager, areal)                                                                                        |
| `auth.ts` / `auth-middleware.ts` | Auth utilities + Cloudflare middleware                                                                                                                      |
| `env.ts`                         | Zod-valideret env — brug denne                                                                                                                              |
| `kommuner.ts`                    | Kommunekode → kommunenavn map (98 kommuner)                                                                                                                 |
| `utils.ts`                       | `cn()` og utilities                                                                                                                                         |

## Integrations (`src/integrations/`)

Se `docs/INTEGRATIONS.md` for fuld tabel og Datafordeler GraphQL-constraints.

IS_MOCK=true services (live API afventer verifikation):

- `TinglysningService` — ARCH-26 (TingbogenV2 schema)
- `DkJordService` — ARCH-66 (dkjord.mst.dk)
- `GeusService` — ARCH-101 (GEUS WFS layer-navne)
- `DhmService` — ARCH-102 (DHM WCS)

**OBS:** `mat_strandbeskyttelse`, `mat_fredskov`, `mat_klitfredning` i `BbrKompliantData` er **live** data fra MAT_Jordstykke og erstatter delvist NaturbeskyttelseService for disse tre typer.

## Env vars (server-side — ingen `VITE_` prefix)

```
SUPABASE_URL                # Påkrævet: Supabase project URL
SUPABASE_SERVICE_ROLE_KEY   # Påkrævet: Supabase service role (server-side)
SUPABASE_PUBLISHABLE_KEY    # Påkrævet: Supabase anon key (client-side)
DATAFORDELER_API_KEY        # Påkrævet: BBR, MAT, DAR, EBR, VUR
ANTHROPIC_API_KEY           # Valgfri: PdfExtractor + HusDnaGenerator (mock-fallback uden)
DATAFORSYNINGEN_TOKEN       # Valgfri: GSearch (rate-limits uden)
SENTRY_DSN                  # Valgfri
ENVIRONMENT                 # Valgfri: Sentry env tag
LINEAR_WEBHOOK_SECRET       # Valgfri: ARCH-74
GITHUB_DISPATCH_TOKEN       # Valgfri: ARCH-74
```

Dokumentér altid nye env-variabler her.

## GraphQL-skemaer (`schema/`)

Datafordeler introspektionsfiler — **gitignored** (for store til repo, regenererbare).

```
schema/BBR.graphql   # BBR v2 — bygning, enhed, grund, etage
schema/DAR.graphql   # DAR v1 — adresse, husnummer, vejnavn
schema/EBR.graphql   # EBR — ejendomsbeliggenhed (BFE-nøgle)
schema/MAT.graphql   # MAT v2 — jordstykke, ejerlav, matrikel
schema/VUR.graphql   # VUR — ejendomsvurdering (ejendoms- og grundværdi)
```

Regenerér: `curl -s "https://graphql.datafordeler.dk/{REGISTER}/v2/schema?apiKey=..." > schema/{REGISTER}.graphql`

## Slash commands (Claude Code)

| Kommando                      | Beskrivelse                                                          |
| ----------------------------- | -------------------------------------------------------------------- |
| `/new-issue <idébeskrivelse>` | Genererer og opretter en Linear ARCH-issue direkte fra fritekst      |
| `/sync-docs`                  | Tjekker og retter forældet dokumentation — kør efter store ændringer |

Filer: `.claude/commands/`

## Domain

Primær kunderejse: **Nedrivning → Nybyg** (reference: `docs/domain/journey-demolition-new-build.md`).

Journeyen er ikke-lineær, risiko-drevet og iterativ. Den består af tre overlappende projekter: boligkøb, nedrivningsprojekt og nybyggeri. Brugeren justerer designvalg mange gange (Phase 8: sketch → price → redesign loop).

**Pre-purchase use case:** ArchAI bruges til at vurdere ejendomme FØR køb (Phase 4–6 i journeyen) — ikke kun til projektering af en allerede ejet ejendom. Compliance-data er due diligence, ikke kun byggesagsrådgivning.

**Kritiske risikokategorier (domænekendskab):**

- Geoteknik: 0 kr (god grund) til 500.000 kr+ (pælfundering) — største enkeltrisiko
- Forsyningsafkobling: 50.000–150.000 kr (el, vand, gas, kloak) — ofte glemt i budget
- Nabosager: nabopartshøring kan forsinke 4–12 uger — tidlig screening vigtig
- Fredning/SAVE 1-3: nedrivning kræver Slots- og Kulturstyrelsen
- Strandbeskyttelse/fredskov: absolut byggestop uden dispensation

**Arkitekturkonsekvenser:**

- Flow skal understøtte spring og iteration, ikke kun lineær wizard-progression
- Reaktiv compute: `src/lib/reactive-compliance.ts` beregner ComplianceMetrics + RuleEngineResult client-side ved Byggeoenske-ændringer — ingen Datafordeler-kald
- Statiske data (BBR, plandata) caches i Supabase `address_analysis` og project-store; dynamiske data (Byggeoenske) beregnes lokalt
- AI-gatekeeper: HusDnaGeneratorService må kun genkaldes hvis `inspirationsbilleder` eller `arkitektoniskStil` ændres

## Dual-agent workflow (Claude Code + Codex)

Claude Code har arkitektonisk opsyn. Codex implementerer.

**Codex læser:** `AGENTS.md` — kilde til sandhed for Codex-constraints. Claude Code ejer begge filer. Codex opdaterer dem IKKE autonomt.

**Arbejdsdeling:**

- **Codex**: vel-scoped Linear-issues med klar spec, tests, UI-komponenter, stub-routes, IS_MOCK→live
- **Claude Code**: arkitekturændringer, nye dataflow-mønstre, state-shape-beslutninger, ændringer i orchestrator/pre-check/reactive-compliance, nye env-vars, CLAUDE.md/AGENTS.md

**Linear-labels:**

- `codex-safe` — Codex kan implementere autonomt (kræver klar spec i issue)
- `needs-architecture` — kun Claude Code (arkitekturimplikationer)

**Konfliktforebyggelse:**

- Codex rører aldrig beskyttede filer uden `🔒 Rører beskyttet fil — kræver review` i PR
- Begge agenter kører `bunx tsc --noEmit && bun test` inden de erklærer sig færdige
- Beskyttede filer: `project-store.ts`, `analysis-orchestrator.ts`, `pre-check-adresse.ts`, `reactive-compliance.ts`, `AGENTS.md`, `CLAUDE.md`, `package.json`, `wrangler.toml`

## Definition of done

- [ ] Feature virker end-to-end i `bun dev`
- [ ] `bun build` — ingen type-fejl
- [ ] `bun test` — ingen failing/skipped tests
- [ ] `bunx eslint .` — ingen nye fejl
- [ ] Ingen `console.log` eller debug-kode
- [ ] Nye env-variabler dokumenteret herover
- [ ] Docs i sync: hvis integration-klient, project-store, orchestrator eller routes er ændret → kør `/sync-docs`
- [ ] Linear issue → **Done**
