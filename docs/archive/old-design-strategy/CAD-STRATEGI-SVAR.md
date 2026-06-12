# Svar til CEO: Plantegningsløsningen, Revit-spørgsmålet og vejen frem

Forfatter: Seniorarkitekt / produktejer, ArchAI
Status: Til ledelsesbeslutning

Dette er et ærligt svar. Ikke et forsvarsskrift, ikke en undskyldning. Jeg har
gennemgået koden, arkitekturen og commit-historikken, før jeg skrev en linje.

---

## 1. Kort version

Du har ret i, at det vi viser i dag ikke er imponerende på overfladen.
Plantegnings-UI'et føles tyndt: man kan generere en plan og trække i vægge,
men halvdelen af værktøjslinjen siger bogstaveligt talt "kommer senere".

Men du tager fejl på ét afgørende punkt: at løse det ved at "købe Revit-licenser"
er en kategorifejl, der vil koste os hele produktets eksistensberettigelse.
Revit kan tegne. Revit kan ikke fortælle en dansk privatbygherre, om han
overhovedet må bygge på sin grund. Det er dér, vi vinder eller dør — ikke i
endnu en streg-på-skærm-editor.

Nedenfor: hvad der reelt gik galt, hvad vi faktisk har bygget (det er mere og
bedre, end skærmbilledet antyder), og en plan, der gør dig stolt inden for et
realistisk tidsrum.

---

## 2. Ærlig diagnose: hvad gik galt

### 2.1 Vi byggede fundamentet før facaden — og du så facaden

63 commits ind i projektet ligger næsten al energi i det usynlige:
compliance-motor, registerintegrationer (BBR, MAT, DAR, Plandata, FBB,
GeoDanmark), Hard Stop-evaluering, beliggenhedsplan-generering til
myndighedsbrug. Det er det rigtige sted at starte for _vores_ produkt — men
det betyder, at det første du klikker på (plantegningen) er det yngste og
tyndeste lag. Du bedømmer en bygning på en facade, vi ikke har sat op endnu.

### 2.2 Forventningsstyringen fejlede — det er min fejl

"Vi bestilte et super CAD-program." Hvis det var briefen, har vi ikke været
skarpe nok på at sige tydeligt fra i tide: **ArchAI er ikke et CAD-program og
bør ikke være det.** Produktkontrakten (`CLAUDE.md`) siger det selv på linje 1:
"It is not primarily an AI design toy. It is a due-diligence and project
cockpit." Hvis ledelsen og udviklingen har to forskellige produkter i hovedet,
er det den vigtigste ting at få rettet i dag — vigtigere end nogen kodelinje.

### 2.3 De synlige huller er reelle

Konkret, fra koden:

- `src/components/floor-plan/FloorPlanToolbar.tsx`: fire værktøjer er deaktiveret
  med teksten "kommer senere" (væg-, dør/vindue-, fixture- og præcisionsværktøj).
  Brugeren kan altså _ikke_ tegne en ny væg fra bunden i dag.
- `src/domain/floor-plan/apply-command.ts`: kommandoerne `delete_wall`,
  `split_room`, `merge_rooms` og `resize_opening` findes i skemaet, men afvises
  ved kørsel. Man kan flytte, men ikke skabe eller omstrukturere.

Det er derfor det føles som et stykke legetøj. Det _er_ ufærdigt i kanten — men
det er ufærdigt oven på et solidt fundament, ikke ufærdigt hele vejen ned.

---

## 3. Hvad vi faktisk har bygget (fakta, ikke fornemmelser)

Det her er pointen, jeg beder dig læse roligt, for det ændrer billedet:

### 3.1 En rigtig, deterministisk geometrimotor — ikke AI-billeder

Plantegningen er **strukturerede, målfaste data**, ikke et AI-genereret
billede. Det er afgørende og er præcis dét, et myndighedsprodukt kræver.

- `src/domain/floor-plan/topology-engine.ts` — udleder rum fra væggrafen via
  planar face-detektion (egen implementation, håndterer T-samlinger og
  endepunkts-snap). Rum forbliver identificeret på tværs af redigeringer.
- `src/domain/floor-plan/seed-generator.ts` — genererer en gyldig plan
  deterministisk ud fra areal, rumprogram og footprint. Samme input → samme
  plan. 0 AI-tokens.
- `src/domain/geometry/` + `src/lib/floor-plan/snap-engine.ts` — koordinatsystem
  i meter, transform til EPSG:25832, snapping mod grid/vægakser/endepunkter.

### 3.2 Live compliance, mens du tegner — det Revit ikke kan

- `src/domain/floor-plan/verification-engine.ts` kører ved hver ændring og
  giver findings i kategorier: topologi, geometri, rumprogram, BR18, brand,
  tilgængelighed, dagslys, vådrum, materialegrundlag.
- Hard Stop-gating _før_ generering (`generate-floor-plan.service.ts`): kan
  bygherren ikke bygge, får han ikke en optimistisk tegning — han får årsagen.
- Serveren er compliance-autoritet (CLAUDE.md Rule 4), ikke klienten.

### 3.3 Myndighedstegning, ikke kun en skitse

`feat(drawing): authority-grade beliggenhedsplan` (PR #6/#7) bygger en
beliggenhedsplan med titelblok, arealtabel, målsætning, byggelinjer,
nabomatrikler, koter, skalastav og lovpligtige noter — eksporteret til SVG/PDF
via `pdf-lib`. Det er den slags dokument en byggesag faktisk skal bruge.

### 3.4 Arkitektur, der kan bære et SaaS/B2B-produkt

Ren domænekerne, ports & adapters, Zod-kontrakter på alle grænser, typede
SQL-kolonner til compliance-værdier, tests på domæneniveau. Det er kedeligt at
se på, men det er forskellen på et produkt vi kan skalere og sælge til
erhverv — og en demo, der knækker ved første rigtige kunde.

**Konklusion:** Vi har ikke bygget noget elendigt. Vi har bygget det rigtige
fundament og en uimponerende facade. Det er to vidt forskellige problemer.

---

## 4. Revit-spørgsmålet: skal du fyre os og købe licenser?

Lad mig svare som den, der har ansvaret, og ikke pakke det ind.

**Hvis målet er "et CAD-program": ja, køb Revit. Vi vil aldrig slå det.**
Revit er ~30 års udvikling, hundredvis af udviklerår, ~18.000 kr/sæde/år.
At forsøge at genbygge det er at brænde din kapital på en kamp, der er tabt på
forhånd. Det ville være uansvarligt af mig at love dig andet.

**Men Revit løser ikke det problem, vi sælger os på.** Sæt en dansk
privatbygherre foran Revit: det fortæller ham intet om hvorvidt grunden er
fredet, SAVE-vurderet, omfattet af lokalplan, har naturbeskyttelse, om
bebyggelsesprocenten er sprængt, eller om der er en Hard Stop _inden_ han
køber. Det er **hele vores eksistensberettigelse**, og det er bygget.

Den ærlige strategiske sandhed:

> Vores moat er dansk compliance + registerdata + beslutningsstøtte — ikke
> tegneværktøjet. Tegningen skal være _god nok til beslutninger og myndighed_,
> ikke konkurrere med BIM-authoring.

Den rigtige langsigtede arkitektur er ikke "byg Revit". Det er:
**vær det compliance- og beslutningslag, som folk bruger _før_ og _sammen med_
Revit/Archicad** — og kan eksportere strukturerede data (IFC/DXF) til.
Det er en position, ingen CAD-leverandør har, og som ingen kan tage fra os uden
at genopbygge den danske registerintegration vi allerede har.

---

## 5. Planen, der gør dig stolt

To spor. Spor A lukker det pinlige hul hurtigt. Spor B bygger forspringet.

### Spor A — "Stop med at være pinligt" (4–6 uger)

Mål: en bruger kan tegne en hel plan fra bunden, ikke kun redigere en genereret.

1. **Færdiggør tegneværktøjerne** der i dag siger "kommer senere":
   væg-, dør/vindue-, fixture- og måleværktøj i `FloorPlanToolbar` +
   tilhørende kommandoer (`add_wall`, `add_opening`, `add_fixture`).
2. **Implementér de afviste strukturkommandoer** i `apply-command.ts`:
   `delete_wall`, `split_room`, `merge_rooms`, `resize_opening` — med
   topologi-reparation, så rum forbliver konsistente.
3. **Tastatur + præcision**: indtast mål direkte (3,40 m), pilejustering,
   vinkel-snap. Det er det, der får det til at _føles_ professionelt.
4. **Polish af canvas**: bedre væg-rendering (hjørnesamlinger), dør/vindue-
   symboler i arkitekt-konvention, målsætningslinjer på lærredet.

Leverance: en plan tegnet 100 % i appen, der verificerer og eksporterer rent.

### Spor B — "Det Revit aldrig får" (parallelt, 1–2 kvartaler)

5. **Compliance-overlay live på tegningen**: byggelinjer, skel, afstandskrav og
   bebyggelsesprocent tegnet direkte oven på planen fra trusted site-data.
   Brugeren _ser_ overtrædelsen, mens han tegner.
6. **Budget-kobling i realtid**: areal → m²-pris → estimat, opdateret per
   redigering (Maskinrummet lover allerede "design og økonomi").
7. **IFC/DXF-eksport**: gør os til samarbejdspartner for arkitekter/Revit i
   stedet for konkurrent. Strategisk det vigtigste enkeltpunkt.
8. **3D/snit-afledning** fra 2D-modellen (vægge har allerede højde) — billig
   wow-effekt, fordi data allerede er der.

### Hvad jeg bevidst _fravælger_

Fuld BIM-authoring, familier/parametriske komponenter, MEP, konstruktiv
beregning. Det er Revits domæne. Vi integrerer, vi konkurrerer ikke.

---

## 6. Hvad jeg beder om

1. **En beslutning om identitet:** Er ArchAI et compliance- og beslutnings-
   cockpit (med en god-nok tegning), eller forventer du et CAD-program? Mit
   klare råd: det første. Hvis det andet — så er Revit faktisk det rigtige svar,
   og det skal jeg sige højt frem for at bygge videre på en forkert præmis.
2. **Lov til at lukke Spor A** før vi viser plantegningen frem igen. Det er
   det, der fjerner "elendigt"-følelsen.
3. **Prioritér IFC/DXF-eksport** (punkt 7) højt. Det er billetten til at stå
   _ved siden af_ Revit i stedet for under det.

Jeg er ikke træt af at arbejde her. Jeg er stolt af fundamentet og flov over
facaden — og jeg ved præcis, hvilke filer der skal røres for at lukke gabet.
Giv mig grønt lys på Spor A, så har du en plantegningsløsning, du kan vise frem
uden forbehold, inden for halvanden måned.
