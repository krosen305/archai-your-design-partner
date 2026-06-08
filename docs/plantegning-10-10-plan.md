# Plan: Produktions-grade plantegninger på HusCompagniet-niveau

Forfatter: Seniorarkitekt / produktejer, ArchAI
Status: Til ressourcegodkendelse
Målbillede: Den vedhæftede HusCompagniet-plantegning (1-plans villa, 8 rum,
garage, overdækkede arealer, fuld målsætning, møblering, sanitet, køkken).

---

## 0. Det korte svar: Ja, det er realistisk

Det er realistisk — og det er realistisk _netop fordi_ fundamentet allerede er
bygget rigtigt. HusCompagniet-tegningen er ikke et AI-billede. Det er en
deterministisk vektortegning af strukturerede data: vægge med tykkelse,
åbninger med placering og svingretning, sanitet og inventar med footprint,
målkæder afledt af geometrien, og en titelblok. **Vi modellerer allerede
næsten alle de data** (se `floor-plan.schemas.ts`). Gabet er ikke i datamodellen
— det er i _gengivelsen_ og i _redigeringsværktøjerne_.

Vær ærlig om én ting: at ramme 10/10 mod den vedhæftede tegning er ikke en
weekendopgave. Det er ~3-4 måneders fokuseret arbejde for det fulde billede,
med en imponerende milepæl undervejs. Men der er ingen forskningsrisiko og intet
"det ved vi ikke om kan lade sig gøre". Det er kendt, deterministisk
ingeniørarbejde. Det er præcis den slags, man kan estimere og levere.

Nedenfor: hvad der konkret mangler, hvordan vi bygger det, og hvad 10/10 betyder.

---

## 1. Gap-analyse: vores SVG i dag vs. målbilledet

Kilde: `src/lib/floor-plan/render-floor-plan-svg.ts` +
`src/lib/floor-plan/floor-plan-render-model.ts`.

| Element på målbilledet                                                     | Hvad vi har i dag                                                                        | Gab                                                                     |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **Vægge** som udfyldt poché med rene hjørnesamlinger                       | Vægge tegnes som _streger_ (`<line>`, stroke = tykkelse)                                 | Stor: kræver væg-poché som lukkede polygoner + hjørne-/T-samlingsløser  |
| **Åbninger** klippet ind i væggen (dørsving-bue, vindue med karm/sprosser) | Åbninger tegnes som _cirkler_ ovenpå væggen                                              | Stor: kræver væg-gap (boolesk) + dør-/vindue-symboler med svingbue      |
| **Møbler** (senge, sofaer, stole, spisebord)                               | Findes ikke i modellen                                                                   | Mellem: nyt møbel-lag + symbolbibliotek                                 |
| **Sanitet** (toilet, håndvask, brus, badekar)                              | Tegnes som tom polygon-firkant                                                           | Mellem: rigtige VVS-symboler pr. `fixtureKind`                          |
| **Køkken** (skabe, ø, Ovn/Køl/Frys/OPV-labels)                             | Tom firkant                                                                              | Mellem: køkken-symboler + apparat-labels                                |
| **Garderobe/walk-in** (hylde-hatching)                                     | Findes ikke                                                                              | Lille: hatch-mønster + reol-symbol                                      |
| **Målkæder** på alle sider (12.35 m, 3.84 m, indvendige mål)               | Findes _kun_ for beliggenhedsplan-polygon (`dimension-lines.ts`), ikke for plantegningen | Stor: dedikeret målkæde-motor (witness lines, kæde-niveauer, hjørnemål) |
| **Overdækkede/uopvarmede arealer** (terrasse, carport) vist stiplet        | Findes ikke som koncept                                                                  | Mellem: zone-lag for ikke-opvarmede arealer                             |
| **Rum-labels** med navn + m²                                               | ✅ Findes allerede                                                                       | Ingen — matcher                                                         |
| **Nordpil + målestok + titelblok + copyright**                             | Findes for beliggenhedsplan (`drawing-symbols.ts`, SVG v2)                               | Lille: genbrug til plantegning                                          |
| **Skalakorrekt PDF-eksport (1:50 / 1:100)**                                | PDF-renderer findes (`render-floor-plan-pdf.ts`) men uden symboler/mål                   | Mellem: udvid med ny render-pipeline                                    |

**Konklusion:** 3 store, 5 mellemstore, 2 små rendering-gaps. Plus
redigeringsværktøjerne (`add_wall`/`add_opening`/`add_fixture` + struktur-
kommandoer), som brugeren skal bruge for selv at bygge en plan i den klasse.

---

## 2. Arkitektur-beslutninger (så vi bygger 10/10, ikke 8/10)

Disse beslutninger er det, der adskiller en flot demo fra et produkt, der holder.

### 2.1 Rendering som ren funktion af modellen

Al gengivelse forbliver `FloorPlanDocument -> RenderModel -> SVG/PDF`. Ingen
visuel sandhed opstår i rendereren (jf. kommentaren i
`floor-plan-render-model.ts`: _"The renderer owns nothing"_). Det betyder at
editor-preview, SVG-eksport og PDF altid er pixel-identiske, fordi de deler
render-modellen. **Dette er grunden til at vi kan garantere "what you see is
what you export".**

### 2.2 Væg-poché via geometrisk offset, ikke streg-tykkelse

Vægge skal være lukkede polygoner (centerline ± halv tykkelse), med
hjørnesamlinger løst via skæring af nabovæggenes kanter. Vi har allerede `jsts`
(JavaScript Topology Suite) i `package.json` — den kan lave robust polygon-union
og offset. Det fjerner behovet for at opfinde geometri-matematik selv og er
nøglen til de rene hjørner på målbilledet.

### 2.3 Symbolbibliotek som data, ikke hardkodet SVG

Hvert symbol (toilet, seng, sofa, køkkenø, dørsving) defineres som en
parametrisk, skalerbar SVG-template med tilknytningspunkter. Lægges i
`src/lib/floor-plan/symbols/` med et register pr. `fixtureKind` og ny
`furnitureKind`. Det gør biblioteket udvideligt uden at røre rendereren —
afgørende for at nå "alt hvad man kan forestille sig".

### 2.4 Målkæde-motor som domæne-funktion (deterministisk, testbar)

Ny ren modul `src/domain/floor-plan/dimension-engine.ts`: tager en `FloorLevel`
og producerer målkæder (ydermål pr. facade, indvendige rum-mål, åbningsmål).
Pure, testbar, 0 AI. Følger samme mønster som `dimension-lines.ts`, men for hele
planen og i flere niveauer (kæde-stabling som på målbilledet).

### 2.5 Datamodel-udvidelser bag Zod (Rule 1)

- Nyt `Furniture`-element (løst inventar: senge, sofaer, stole, borde) ELLER
  udvid `Fixture` med møbel-kinds. **Beslutning:** separat `furniture`-lag, så
  inventar ikke forveksles med compliance-relevant sanitet/teknik.
- Ny `Zone`-entitet for uopvarmede/overdækkede arealer (terrasse, carport,
  overdækket indgang) — vist stiplet, tæller ikke i BBR-bebygget areal på samme
  måde. Compliance-relevant, så typed og Zod-valideret.
- Berig `PlanAnnotation` med dimension-geometri (witness-punkter, offset).

Alt dette er additivt og bryder ikke `floor-plan.v1` hvis vi versionerer til
`floor-plan.v2` med migrering. **Rører ikke compliance-truth-kolonner.**

### 2.6 Redigeringsværktøjer færdiggøres (forudsætning for brugerskabte planer)

De kommandoer der i dag afvises i `apply-command.ts` (`delete_wall`,
`split_room`, `merge_rooms`, `resize_opening`) + nye (`add_wall`, `add_opening`,
`add_fixture`, `add_furniture`) implementeres med topologi-reparation, så rum
forbliver konsistente. Værktøjslinjen (`FloorPlanToolbar.tsx`) aktiveres.

---

## 3. Arbejdsnedbrydning i workstreams

Otte workstreams. WS1-WS4 giver den visuelle wow. WS5 giver brugeren
skabeevnen. WS6-WS8 giver myndigheds- og produktmodenhed.

### WS1 — Væg-geometri & poché _(stor, fundament for alt visuelt)_

- Væg-centerline → lukket poché-polygon via offset
- Hjørne- og T-samlingsløser (jsts union/intersection)
- Boolesk væg-gap ved åbninger (dør/vindue klippes ind i væggen)
- Bærende vs. ikke-bærende stregvægt/skravering
- **Acceptance:** væg-render visuelt identisk med målbilledets grønne poché

### WS2 — Symbol- & inventarbibliotek _(mellem, højest wow pr. krone)_

- Sanitet: toilet, håndvask, brus, badekar (VVS-konvention)
- Køkken: bordplade, ø, vask, kogeplade, + apparat-labels (Ovn/Køl/Frys/OPV/VM/TT)
- Inventar: enkelt-/dobbeltseng, sofa, lænestol, spisebord+stole, reol/walk-in
- Dør-symbol med svingbue; vindue med karm/sprosse
- **Acceptance:** alle symboler på målbilledet kan gengives målfast

### WS3 — Målkæde-motor _(stor, det "professionelle" signal)_

- Ydermål pr. facade i stablede kæder (jf. 12.35 / 3.84 / 1.92 på billedet)
- Indvendige rum-mål og åbningsplaceringer
- Witness lines, pilehoveder, tekstplacering uden kollision
  (genbrug `label-placement.ts` kollisionsmotor)
- **Acceptance:** målkæder matcher målbilledets tæthed og læsbarhed

### WS4 — Lag, zoner & skravering _(mellem)_

- Zone-lag: overdækket terrasse/indgang/carport (stiplet kontur, label + m²)
- Hatch-mønstre: walk-in hylder, terrassedæk, teknikrum
- Lag-styring (vis/skjul: mål, møbler, zoner)
- **Acceptance:** overdækkede arealer og hatching som på billedet

### WS5 — Skabe- & redigeringsværktøjer _(mellem-stor, forudsætning for brugerplaner)_

- `add_wall`, `add_opening`, `add_fixture`, `add_furniture`
- `delete_wall`, `split_room`, `merge_rooms`, `resize_opening` (færdiggør)
- Tastatur-præcision (indtast 3,40 m direkte), vinkel-/akse-snap
- Aktivér de fire "kommer senere"-knapper i `FloorPlanToolbar.tsx`
- **Acceptance:** en bruger kan tegne den vedhæftede plan 100% i appen

### WS6 — Ark, titelblok & skala _(lille-mellem)_

- Titelblok m. adresse, arealtabel, dato, skala, nordpil (genbrug fra beliggenhedsplan)
- Skala-korrekt layout 1:50 / 1:100 på A3/A2
- Copyright/branding-felt
- **Acceptance:** komplet ark-output som en HusCompagniet-side

### WS7 — Eksport-pipeline _(mellem)_

- Vektor-PDF i målestok (udvid `render-floor-plan-pdf.ts` med WS1-WS4)
- PNG-preview i høj opløsning
- (Strategisk) DXF/IFC-eksport-spor — billet til samarbejde med arkitekter/Revit
- **Acceptance:** PDF kan printes i korrekt skala og måles efter med lineal

### WS8 — Compliance-overlay & data-binding _(mellem, vores moat på tegningen)_

- Byggelinjer/skel/bebyggelsesprocent live på planen (trusted site-data)
- Arealtabel auto-genereret fra rum (BBR-relevant areal vs. uopvarmet zone)
- Live BR18-findings koblet til de viste rum (dagslys, vådrum, tilgængelighed)
- **Acceptance:** tegningen viser ikke bare geometri — den viser om den må bygges

---

## 4. Milepæle (tidslinje med imponerende checkpoints)

> Estimater forudsætter 1-2 dedikerede udviklere. Skaler tidslinjen med ressourcer.

### Milepæl 1 — "Det ligner en rigtig tegning" (uge 1-4)

WS1 (væg-poché + åbnings-cuts) + WS2 (sanitet, køkken, dør/vindue-symboler).
**Demo:** en _genereret_ plan gengivet med rigtige vægge, døre og badeværelses-
symboler. Dette alene flytter indtrykket fra "legetøj" til "tegning".

### Milepæl 2 — "Fuldt målsat og møbleret" (uge 5-8)

WS3 (målkæder) + WS4 (zoner, hatching) + resten af WS2 (møbler).
**Demo:** en plan der side om side med målbilledet er svær at skelne i
detaljegrad. Dette er den milepæl, jeg vil vise dig for "imponeret".

### Milepæl 3 — "Brugeren tegner selv" (uge 9-12)

WS5 (skabe-/redigeringsværktøjer + præcision).
**Demo:** vi genskaber den vedhæftede plan fra bunden i appen, live.

### Milepæl 4 — "Myndigheds- og salgsklar" (uge 13-16)

WS6 (ark/titelblok) + WS7 (PDF/DXF) + WS8 (compliance-overlay).
**Demo:** komplet, skala-korrekt PDF med arealtabel og live compliance —
det Revit ikke kan.

---

## 5. Hvad "10/10" konkret betyder (så vi kan måle det)

Jeg vil ikke aflevere noget, jeg selv vurderer til 8/10. Derfor en hård
definition, vi kan holde hinanden op på:

1. **Målfasthed:** enhver streg kan måles efter i eksporteret PDF og stemmer
   med modellen ± afrunding. Ingen "cirka".
2. **Symbol-komplethed:** alle elementtyper på målbilledet har et korrekt,
   arkitekt-konventionelt symbol.
3. **Målsætning:** ydermål + indvendige mål i stablede kæder, uden tekst-
   kollision, på niveau med målbilledet.
4. **Renhed:** rene hjørnesamlinger, åbninger klippet i vægge, ingen
   overlappende streger.
5. **Determinisme:** samme model → byte-identisk tegning. Editor = eksport.
6. **Compliance-kobling:** arealtabel og BR18-findings udledt af tegningen, ikke
   indtastet ved siden af.
7. **Eksport:** skala-korrekt PDF + (strategisk) DXF/IFC.

Når alle syv er grønne mod den vedhæftede plan, er det 10/10. Ikke før.

---

## 6. Risici og hvad jeg har brug for

### Risici (alle håndterbare — ingen forskningsrisiko)

- **Hjørne-/samlingsgeometri** er det sværeste enkeltpunkt. Mitigeret ved at
  bruge `jsts` frem for hjemmestrikket matematik.
- **Tekst-kollision i målkæder** — mitigeret ved at genbruge den eksisterende
  `label-placement.ts` kollisionsmotor.
- **Skema-migrering** (v1→v2) — additiv, med migrering og fuld Zod-validering;
  rører ikke compliance-truth-kolonner.

### Hvad jeg beder om

1. **Grønt lys på planen** og prioritering Milepæl 1→4.
2. **Ressourcer:** 1-2 dedikerede udviklere i ~3-4 måneder for det fulde 10/10.
   Med 1 udvikler når vi Milepæl 1-2 (det visuelle wow) på ~8 uger.
3. **Beslutning om DXF/IFC** (WS7-sporet) — strategisk det vigtigste for at stå
   _ved siden af_ Revit i stedet for under det. Anbefales prioriteret.

---

## 7. Hvorfor jeg er sikker på, vi rammer det

Fordi det hårde, usikre arbejde allerede er gjort: den deterministiske
datamodel, topologi-motoren, compliance-koblingen og registerdataen. Det der
mangler er gengivelse og redigering — kendt, estimerbart håndværk oven på et
fundament, der allerede er bygget til netop dette. Vi skal ikke opfinde noget.
Vi skal tegne det, vi allerede ved.

Giv mig grønt lys, så starter jeg på Milepæl 1 (væg-poché + symboler) — det
checkpoint der hurtigst fjerner enhver tvivl om, at vi kan ramme målbilledet.
