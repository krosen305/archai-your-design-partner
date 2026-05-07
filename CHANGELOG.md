# Changelog

## 2026-05-07

### Nyt
- Auto-README: GitHub Actions opdaterer integrationstabel automatisk ved merge til main (ARCH-76)
- `/new-issue` slash-command i Claude Code: fritekst → struktureret Linear issue på under 2 min (ARCH-77)
- Supabase Storage bucket `inspirationsbilleder` med upload/slet/forny-URL funktioner (ARCH-82)
- FjernvarmeService: Plandata WFS-integration for fjernvarmedækning, IS_MOCK=true (ARCH-111)
- NaboService: nabobygninger inden for 40 m via DAWA REST, live (ARCH-103)
- PDF-extractor eval-suite tilsluttet faktisk service med 3 cases (ARCH-95)
- Analysis-orchestrator eval-suite tilsluttet faktisk `analyseAddress()` (ARCH-96)
- Regelkerne eval-suite: 20 deterministiske cases, alle 100% (ARCH-110)
- Regelkerne wireret ind i byggeanalyse-pipeline via `runByggeanalyse` (ARCH-109)
- Deterministisk regelkerne: stopregler (fredning, naturbeskyttelse), beregninger (bebyggelsespct, højde, setback), energiregler (ARCH-108)
- `RuleEngineInput` type + `assembleRuleEngineInput()` mapper alle compliance-data (ARCH-107)
- Projekt-readiness tracker `/projekt/datacheck` med 63 datapunkter og risikoflags (ARCH-105)
- Centralt mock-datasæt `MOCK_ADRESSE` (Hasselvej 48) + evals i CI pipeline (ARCH-85, ARCH-97)
- DHM terrænmodel via SDFI WCS, IS_MOCK=true (ARCH-102)
- TinglysningService: servitutter med AI-klassifikation, IS_MOCK=true (ARCH-104)
- GEUS geoteknisk risikoprofil: radon + grundvand, IS_MOCK=true (ARCH-101)

### Forbedringer
- Regelmotor konsekvensanalyse dokumenteret i `docs/rule-engine-impact-analysis.md` (ARCH-106)
- Agent tracing, evals framework og context-optimering (ARCH-94, ARCH-98, ARCH-99, ARCH-100)

## 2026-05-06

### Forbedringer
- PDF-analyse token-optimering: regex pre-parser + prompt caching (ARCH-90)
- DarService kommunenavn via kommuner.ts map (ARCH-57)
- Server-side auth på `fetchCompliance` og `runByggeanalyse` (ARCH-91)
- Linear webhook: fail-closed med signing secret (ARCH-92)
- Smarte defaults og skip-flow for byggeønsker (ARCH-87)

### Fejlrettelser
- Bebyggelsesprocent: grundareal DAR fallback + cache bypass ved manglende grundareal (ARCH-88)
- Prettier formatting — 271 formateringsfejl rettet i CI

## 2026-05-05

### Nyt
- Linear ↔ GitHub sync: webhook bridge, PR status workflows og PR template (ARCH-74)
- Compliance Engine v1: beregn max bygningsareal og bygningsret (ARCH-33)

### Forbedringer
- Projektliste på startsiden + rigtige ejendomsindikatorer (ARCH-86, ARCH-89)

## 2026-05-04

### Nyt
- Sentry → Linear auto-bug workflow (ARCH-70)
- GitHub branch protection setup workflow (ARCH-79)
- AI PR review med Claude Haiku som CodeRabbit-erstatning (ARCH-71)

### Forbedringer
- Byggeanalyse-prompt: struktureret Byggeoenske JSON til Claude (ARCH-83)

## 2026-05-03

### Nyt
- Auth-integration: Supabase login, registrering og gæstetilstand (ARCH-80)
- Byggeoenske datamodel: Supabase migration, typer og CRUD-lag (ARCH-81)
- Sentry integration på Cloudflare Worker entry med source maps

## 2026-04-30 — 2026-05-02

### Nyt
- Naturbeskyttelse + DK-Jord compliance-integration (ARCH-65, ARCH-66)
- Playwright E2E tests for fuld wizard flow (ARCH-72)
- Live Anthropic API for Hus-DNA og lokalplan PDF-parsing (ARCH-52, ARCH-53)
- CI/CD: GitHub Actions + Cloudflare Workers deploy pipeline (ARCH-54)
- DarService server-side med ejerlavskode + matrikelnummer (ARCH-56, ARCH-59)
- GSearch v2 adresse-autocomplete med DATAFORSYNINGEN_TOKEN (ARCH-23)
- Cache-first AI-udtræk med `address_analysis` tabel og orchestrator
- Kommuneplanramme fra Plandata WFS (ARCH-19, ARCH-20)
- MatService: grundareal fra Datafordeler MAT GraphQL (ARCH-18)

### Forbedringer
- DAR v1 schema verificeret og DAR-klient omskrevet (ARCH-21)
- Wizard flow: adresse → hus-dna → compliance → match (ARCH-45)
- Env-validering ved opstart med Zod (ARCH-env)
