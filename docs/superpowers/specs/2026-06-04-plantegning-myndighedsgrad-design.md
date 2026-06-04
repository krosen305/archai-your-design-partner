# Plantegning → myndighedsgrad — Design

- **Status:** Godkendt design, klar til implementeringsplan
- **Dato:** 2026-06-04
- **Forfatter:** Claude Code (brainstorm med Kasper)
- **Delprojekt 1 af program:** Myndighedsgodkendt tegningssæt
- **Relateret:** `2026-05-30-interaktiv-plantegning-verifikation-materialer-design.md`,
  `docs/beliggenhedsplan-generator-plan.md`

---

## 0. Programkontekst

Et fuldt byggetilladelses-tegningssæt i Danmark er dekomponeret i fem
delprojekter, hver med egen spec → plan → implementering:

| # | Delprojekt | Status |
|---|---|---|
| **1** | **Plantegning → myndighedsgrad** | **Denne spec** |
| 2 | Snit (sektioner) | Senere — kræver lodret højdedata |
| 3 | Facader | Senere — kræver lodret højdedata |
| 4 | Situationsplan / beliggenhedsplan | Eget eksisterende spor |
| 5 | Ansøgningspakke (samler 1–4 + arealskema + BR18-evidens) | Senere |

Snit og facader er projektioner af plantegningens geometri; derfor er en stærk
plantegning fundamentet, og den bygges først.

---

## 1. Problemet (som brugeren ser det)

Den interaktive plantegningseditor opleves som en prototype, ikke et
verdensklasse-værktøj. Fire konkrete brugerobservationer:

1. Det er ikke intuitivt at fjerne et rum.
2. Vægge kan kun flyttes vandret (højre/venstre) — ægte planer er mere komplekse.
3. Døre og vinduer vises som mystiske cirkler med "V"/"D" i stedet for
   traditionelle arkitekt-tegn.
4. Der er ingen målangivelser på vægge — umuligt at tegne fx et køkken ind uden
   at kende målene.

## 2. Kernediagnose

Problemerne er **ikke** fire manglende features. De har én fælles rod:

**Der findes allerede to renderere, og kun den ene er myndighedsgrad.**

| Aspekt | `renderFloorPlanSvg` (lib → PDF) | `FloorPlanCanvas.tsx` (interaktiv editor) |
|---|---|---|
| Vægge | Poché-polygoner med åbningshuller skåret ud | Simple `<line>`-streger |
| Døre | Dørsving-bue (`getSymbol("door_left")`) | Cirkel med "D" |
| Vinduer | Vinduesbrud i væglinjen | Cirkel med "V" |
| Mål | Facademål (pile + vidnelinjer) + indvendige mål | Ingen |
| Inventar | Rigtige symboler fra symbol-registret | Tomme firkanter |
| BR18 | Compliance-badges + arealskema | Ingen |

Render-modellen (`src/lib/floor-plan/floor-plan-render-model.ts`) bærer allerede
`wallPoche`, `dimensionChains`, `interiorDimensions`, `furniture`, `zones` og
`complianceOverlay`. Den interaktive canvas ignorerer dem næsten alle og
gentegner alt naivt.

Tilsvarende understøtter kommando-skemaet
(`src/domain/floor-plan/command.schemas.ts`) allerede `add_wall`, `delete_wall`,
`split_room`, `merge_rooms`, `add_opening`, `resize_opening`, `add_fixture`,
`add_furniture` — men værktøjslinjen
(`src/components/floor-plan/FloorPlanToolbar.tsx`) har disse værktøjer deaktiveret
("kommer senere"), og kun drag-baseret `move_wall`/`move_opening`/`move_fixture`
er wiret.

Endelig producerer seed-generatoren (`src/domain/floor-plan/seed-generator.ts`)
altid lige brede lodrette strimler (`x = i*W/roomCount`, fuld højde).

**Konklusion:** arbejdet er konvergens + UI-wiring + en bedre generator — ikke en
domæne-ombygning. Det meste af "hjernen" findes.

## 3. Locked beslutninger (fra brainstorm)

1. **Interaktionsmodel:** struktureret editor — generator laver realistisk
   førsteudkast, brugeren forfiner med tilføj/slet/flyt under live-validering.
2. **Leverancescope nu:** kun plantegningen til myndighedsgrad (delprojekt 1).
3. **Geometri:** ortogonalt + L/T-former nu; datamodel klar til frie vinkler
   senere (ingen skemaændring krævet for det).
4. **Førsteudkast:** forbedret deterministisk layout-motor, 0 AI-tokens.
5. **Rendering:** konvergér på render-modellen (strategi A) — den interaktive
   canvas tegner de rige model-felter deklarativt; naiv line/cirkel-kode slettes.
   Ægte WYSIWYG mellem editor og PDF.

## 4. Arkitekturprincip

```txt
FloorPlanCanvas (UI-adapter)
  -> buildRenderModel (lib, pure projektion)
  -> domæne (geometri / topologi / verifikation / apply-command)
```

- Én deterministisk render-model er sandheden for både skærm og PDF.
- Al redigering går gennem typede kommandoer → `applyCommand` → ny model.
- UI ejer ingen geometri eller compliance (CLAUDE.md Rule 2).
- Verifikation er server-autoritet (Rule 4); klienten viser kun findings.
- Ingen nye direkte Supabase/AI-kald i UI; ingen nye importcyklusser (Rule 8).

## 5. Arbejdsspor

Leveres i rækkefølge; WS-A og WS-B rummer de fire synlige brugerproblemer og
kommer først.

### WS-A — Canvas-konvergens (WYSIWYG)

`FloorPlanCanvas` skal rendere de rige felter fra render-modellen deklarativt med
React-elementer, så den beholder selektion/hover/drag men ser ud som PDF'en:

- Tegn `wallPoche` (level-merged poché-polygoner) i stedet for `<line>`-vægge.
- Tegn åbninger via symbol-registret: dørsving-bue, vinduesbrud, skydedør,
  garageport — ikke cirkel + bogstav.
- Tegn `dimensionChains` + `interiorDimensions` (vidnelinjer, kædelinje, pile,
  labels).
- Tegn `furniture`/`fixtures` som symboler.
- Tegn `zones` med hatch og `complianceOverlay`-badges + arealskema.
- Bevar hit-testing mod `pochePolygon` (per-væg rektangel) for præcis selektion.
- Slet den naive line/cirkel/firkant-tegnekode.

**Resultat:** løser problem 3 (symboler) og 4 (mål).

### WS-B — Redigering: tilføj / slet / del rum

Aktiver de deaktiverede værktøjer og koble dem til det eksisterende
kommando-vokabular:

- **Tegn-væg** (`add_wall`): klik-klik med ortogonal-snap + snap til eksisterende
  hjørner; live længde-label under tegning.
- **Slet væg** (`delete_wall`): vælg væg → slet; bærende vægge giver
  `BEARING_WALL_REQUIRES_REVIEW` i stedet for lydløs sletning.
- **Del rum** (`split_room`) og **flet rum** (`merge_rooms`).
- **Placér dør/vindue** (`add_opening`): klik på væg → symbol snapper langs væg.
- **Rum-konteksthandlinger:** vælg rum → omdøb, skift rumtype (BR18-relevant),
  sæt målareal, slet (fjerner skillevæg / fletter med nabo).
- **Type-to-set-dimension:** klik på et mål-tal → skriv ny værdi → væg flytter
  (klassisk CAD-præcision).

**Resultat:** løser problem 1 (fjern rum intuitivt) og 2 (vægge i begge akser).

### WS-C — Layout-motor (erstatter strimler)

Erstat strimmel-logikken i seed-generatoren med en deterministisk
rum-dispositions-motor:

- Cirkulation/gang som forbindende areal, ikke parallelle skiver.
- Rumproportioner og min-arealer pr. rumtype (bad ≠ stue i størrelse/form).
- Døre mellem tilstødende rum (ikke kun én ydre dør).
- Vinduer placeret mod facader pr. dagslysrelevant rum.
- 0 AI-tokens, deterministisk, validerer mod topologi-motoren som i dag.

**Resultat:** løser "strimler" + urealistiske proportioner.

### WS-D — Live BR18-validering

- Hver committet kommando kører `verification-engine` server-side via den
  eksisterende `verify`-handler.
- Findings vises som badges på rum + et panel med severity, konsekvens og næste
  skridt.
- Hard-Stop-gate respekteres før optimistisk output (CLAUDE.md AI-regler).

**Resultat:** myndighedsgrad-tillid; brugeren ser hvad der blokerer mens de
tegner.

### WS-E — Målfast PDF-finish

- Verificér titelblok, nordpil, målestok (1:100 / 1:50) og arealskema i
  eksporten.
- Verificér WYSIWYG-paritet: skærm og PDF projicerer samme render-model.

**Resultat:** leverancen er et målfast myndighedsdokument.

## 6. Geometri-grænse (ortogonalt nu)

- Topologi-motoren (`src/domain/floor-plan/topology-engine.ts`) udvides fra
  T-junctions til også at håndtere X-krydsninger robust.
- Vægge er akse-justerede i v1; `add_wall` snapper til ortogonalt + hjørner.
- `centerline` er allerede frie punkter, så frie vinkler kan tilføjes senere uden
  skemaændring — eksplicit out of scope nu.

## 7. Datakontrakter & boundaries

- Alle kommandoer Zod-valideres mod `FloorPlanCommandSchema` før apply (Rule 1).
- Verifikation kører server-side; klienten er ikke autoritet (Rule 4).
- Server-handlers forbliver tynde inbound-adaptere (Rule 3); ingen rå
  Supabase/AI i UI.
- Ingen nye compliance-værdier kun i JSONB (Rule 6); geo-payloads forbliver
  Zod-validerede.

## 8. Teststrategi (bun:test, tre tiers)

**Tier 1 — domæne (højest værdi):**
- Layout-motor: korrekt rumantal, proportioner pr. type, døre mellem rum,
  vinduer mod facade, deterministisk output.
- X-krydsnings-topologi: faces detekteres korrekt ved krydsende skillevægge.
- Hver ny kommandos `applyCommand` + afvisningskoder
  (`BEARING_WALL_REQUIRES_REVIEW`, `WOULD_CORRUPT_TOPOLOGY`, …).
- Render-model: nye felter projiceres korrekt (testes som data, ikke pixels).

**Tier 2 — service:**
- Verify-loop pr. kommando returnerer findings.
- Hard-Stop-gate blokerer generering før optimistisk output.

**Tier 3 — Playwright (én journey):**
- Generér plan → tegn væg → placér dør → se mål → eksportér PDF.

**Testes ikke:** pixels/visuelt udseende, trivielle React-renders, alle
permutationer.

## 9. Definition of Done

- De fire brugerproblemer er målbart væk:
  1. rum kan slettes/fletes via rum-kontekstmenu,
  2. vægge kan tilføjes/flyttes i begge akser,
  3. døre/vinduer renderes som arkitekt-symboler,
  4. mål vises og kan redigeres (type-to-set).
- WYSIWYG-paritet mellem editor og PDF verificeret.
- Layout-motor producerer realistiske dispositioner (ingen strimler).
- Live BR18-findings vises under redigering.
- `bunx tsc --noEmit`, `bun test`, `bunx eslint .`, `bun run build` grønne.
- Ingen nye `any`/uchecked casts, ingen nye direkte Supabase-kald i UI, ingen nye
  importcyklusser.
- Protected files: ingen forventede ændringer i denne spec; hvis nødvendigt
  markeres "Rører beskyttet fil — kræver review".

## 10. Eksplicit out of scope

- Snit, facader, situationsplan, ansøgningspakke (delprojekt 2–5).
- Frie (ikke-ortogonale) vægvinkler.
- AI-genereret layout (deterministisk generator er valgt).
- 3D / lodret højdedata.
