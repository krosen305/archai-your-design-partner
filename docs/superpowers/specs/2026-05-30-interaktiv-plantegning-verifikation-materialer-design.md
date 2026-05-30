# Interaktiv Plantegningseditor, Verifikation Og Materialegrundlag

**Dato:** 2026-05-30
**Status:** Kravspecifikation til fremtidig feature
**Scope:** Interaktiv plantegningseditor i Maskinrummet/Myndighed med live editing af vægge, døre, vinduer, rum og tekniske elementer, formaliseret verifikationsmotor og datagrundlag til senere materialeberegning.
**Ikke i implementeringsscope nu:** Selve feature-implementeringen, materialeberegner, fuld BIM/IFC eksport og myndighedsgaranti.
**Relateret fundament:** `src/domain/drawing/`, `src/services/drawing/`, beliggenhedsplan-generator, rule-engine, `design_iterations`, BR18 compliance services.

---

## 1. Formål

ArchAI skal kunne tilbyde en interaktiv plantegningseditor, hvor brugeren kan starte med et automatisk genereret forslag og derefter arbejde direkte i tegningen:

- trække vægge, hjørner, rum og mål
- placere, flytte og ændre døre
- placere, flytte og ændre vinduer
- placere teknikskab, vådrum, trappe, faste installationer og indbyggede elementer
- få live feedback på geometri, rumarealer og åbenlyse fejl
- indsende forslaget til en server-side verifikationsmotor
- eksportere bruger- og myndighedsnære plantegninger, når datagrundlaget er stærkt nok

Feature skal samtidig planlægges, så plantegningen senere kan danne grundlag for materialebehov. Derfor må plantegningen ikke være en løs grafisk tegning. Den skal være en struktureret bygningsmodel med vægge, rum, åbninger, komponenttyper, dimensioner og kildekvalitet.

---

## 2. Produktprincip

ArchAI skal være en "CAD-light + verifier", ikke et rent tegneprogram.

Brugeren må gerne opleve, at de bare trækker i planen. Systemet bagved skal altid arbejde med:

- typed domain entities
- typed edit operations
- deterministic geometry/topology engines
- server-side verification
- versionering og audit trail
- renderers der kun visualiserer den strukturerede model

AI må assistere med fortolkning, forslag og forklaring. AI må ikke være den autoritative kilde til målfast geometri, compliance eller materialemængder.

---

## 3. Regulatorisk Kontekst

BR18-vejledningen om dokumentation ved ansøgning om byggetilladelse beskriver, at ansøgningen blandt andet skal indeholde oplysninger til identifikation af ejendommen, arbejdet og den planlagte benyttelse, herunder tegningsmateriale hvor dimensioner og placering fremgår. Kommunalbestyrelsen vurderer den indsendte dokumentation før byggetilladelse.

Konsekvens for ArchAI:

- ArchAI må ikke skrive "myndighedsgodkendt" om et automatisk output.
- ArchAI kan skrive "egnet til rådgiver-review", "klar til myndighedspakke-review" eller "mangler dokumentation".
- Endelig godkendelse ligger hos myndighed og relevante rådgivere.
- Verifikationsmotoren skal returnere status, mangler og dokumentationsbehov, ikke en juridisk garanti.

Kilder:

- BR18, dokumentation ved ansøgning om byggetilladelse: https://www.bygningsreglementet.dk/Administrative-bestemmelser/BRV/Vejledning-om-byggesagsbehandling-efter-BR18/3_3_Dokumentation-ved-ansoegning-om-byggetilladelse
- BR18, byggetilladelse: https://www.bygningsreglementet.dk/administrative-bestemmelser/brv/vejledning-om-byggesagsbehandling-efter-br18/6_0_byggetilladelse/

---

## 4. Faser I ArchAI

Feature hører primært til:

- `Maskinrummet`: generering, interaktiv redigering, budget, live compliance og designbeslutninger.
- `Myndighed`: verifikation, tegningspakke, dokumentationsmangler og eksport.

`Sandkassen` kan levere ønsker, stil og inspirationsinput. `Matriklen` leverer trusted site constraints, footprint-ramme, beliggenhedsplan og compliance-data.

---

## 5. Centrale Use Cases

### UC-01: Generer første plantegning fra ønsker

Brugeren har udfyldt byggeønske, areal, antal etager, antal værelser, badeværelser, livsfase, stil, budget og eventuelle særlige krav.

Systemet genererer 2-3 plantegningsforslag med:

- rumprogram
- vægge
- døre
- vinduer
- vådrum
- teknikzone
- trappe ved flere etager
- rumarealer
- samlet areal
- relation til footprint og etager
- tidlig verifikationsstatus

### UC-02: Træk væg

Brugeren trækker en væg mod øst.

Systemet skal:

- snap til grid og relevante parallelle vægge
- bevare eller reparere rumtopologi
- flytte wall-attached døre/vinduer hvis muligt
- opdatere rumarealer live
- advare hvis rum bliver ugyldigt
- oprette en typed operation i historikken

### UC-03: Flyt dør eller vindue

Brugeren trækker en dør eller et vindue langs en væg.

Systemet skal:

- sikre at elementet stadig sidder på en gyldig væg
- forhindre overlap med hjørner, andre åbninger eller tekniske zoner
- opdatere vægsegmenter og åbningens mål
- markere påvirkning af dagslys, flugtvej eller facadeændring, hvor relevant

### UC-04: Fjern væg

Brugeren fjerner en intern væg mellem to rum.

Systemet skal:

- afgøre om væggen er intern, ydervæg eller markeret bærende
- afvise eller kræve review ved bærende/ydervæg
- merge eller reklassificere rum
- bevare rumhistorik og labels
- genberegne arealer og materialepotentiale

### UC-05: Flyt teknikskab

Brugeren flytter teknikskab til et andet rum.

Systemet skal:

- validere placering i rum
- kontrollere plads, adgang og relevante tekniske relationer
- markere dokumentationsbehov for VVS/el/ventilation
- opdatere room fixtures

### UC-06: Verificer forslag

Brugeren trykker "Verificer forslag".

Serveren skal:

- hente trusted project/site/compliance data
- hente aktiv plantegningsversion
- validere plantegningens schema
- køre topology, geometry og verification engines
- returnere status, fund, mangler og næste handlinger
- gemme verifikationssnapshot og input-hash

### UC-07: Eksporter myndighedsnær plantegning

Brugeren eksporterer PDF/SVG.

Systemet skal:

- bruge samme strukturerede model som editoren
- inkludere titleblok, målestok, revision, rumstempler, mål og kilde/status
- markere foreløbig status hvis review/data mangler
- gemme eksport med input-hash og readiness-status

### UC-08: Fremtidig materialeberegning

Ikke i første implementeringsscope, men modellen skal kunne bruges senere til:

- væglængder og vægarealer
- åbninger trukket fra vægarealer
- gulvarealer pr. rum og finish
- loftarealer pr. rum
- fodpaneler, karme og lister
- antal og typer af døre/vinduer
- vådrumsoverflader
- isolering/gips/dampspærre/underlag pr. assembly
- materialespild og cut rules

---

## 6. Ikke-Mål

Første store version skal ikke:

- erstatte Revit, Archicad eller professionel projektering
- udføre statisk dimensionering
- garantere myndighedsgodkendelse
- generere endelige mængdeberegninger
- lave fuld IFC/BIM eksport
- beregne præcis pris eller indkøbsliste
- gætte bærende konstruktioner uden rådgiverdata
- acceptere AI-genererede koordinater som sandhed

---

## 7. Arkitekturprincipper

### 7.1 Model Før Grafik

Source of truth er en `FloorPlanDocument`, ikke SVG, canvas state eller React state.

Renderer må aflede:

- editor preview
- SVG
- PDF
- print
- senere DXF/IFC/material takeoff

Renderer må ikke eje:

- rumarealer
- væggeometri
- compliance
- materialetyper
- verification status

### 7.2 Operation Layer

Alle ændringer skal udtrykkes som typed operations.

Drag i UI og AI-tekstkommandoer skal ende i samme command pipeline.

Eksempel:

```ts
type FloorPlanCommand =
  | { type: "move_wall"; wallId: string; deltaM: number; axis: "x" | "y" }
  | { type: "move_opening"; openingId: string; wallId: string; offsetM: number }
  | { type: "resize_opening"; openingId: string; widthM: number }
  | { type: "delete_wall"; wallId: string }
  | { type: "move_fixture"; fixtureId: string; roomId: string; x: number; y: number }
  | { type: "split_room"; roomId: string; wallLine: Line2D }
  | { type: "merge_rooms"; roomIds: string[] };
```

#### 7.2.1 Command Lifecycle

Alle commands skal igennem samme lifecycle:

```txt
UI drag / inspector / AI text
  -> candidate command
  -> Zod validation
  -> permission + lock check
  -> deterministic apply
  -> topology repair attempt
  -> geometry recalculation
  -> live validation result
  -> persisted command/version, if accepted
```

Command application skal være atomic. Hvis et command ikke kan anvendes uden at efterlade modellen i en korrupt tilstand, returneres en afvisning med forklaring og ingen mutation af aktiv version.

#### 7.2.2 Command Examples

**Drag væg 1,2 m mod øst**

Input fra editor:

```ts
{
  type: "move_wall",
  wallId: "wall_bedroom_1_east",
  deltaM: 1.2,
  axis: "x"
}
```

Engine-result:

```ts
{
  accepted: true,
  changedElementIds: ["wall_bedroom_1_east", "room_bedroom_1", "room_hall"],
  liveFindings: [
    {
      severity: "warning",
      category: "room_program",
      message: "Værelse 1 er nu 8,7 m² og under ønsket minimum på 10,0 m²."
    }
  ]
}
```

**Tekstkommando: "Flyt teknikskab til bryggers"**

AI parser må kun returnere command-kandidat:

```ts
{
  type: "move_fixture",
  fixtureId: "fixture_technical_cabinet",
  roomId: "room_utility",
  x: 7.4,
  y: 3.1
}
```

Systemet anvender derefter samme deterministic pipeline som drag. AI må ikke selv persistere ændringen.

**Afvist command**

```ts
{
  accepted: false,
  reasonCode: "OPENING_OUTSIDE_PARENT_WALL",
  message: "Vinduet kan ikke placeres her, fordi åbningen krydser væggens endepunkt.",
  suggestedCommands: []
}
```

### 7.3 Server Authority

Klienten må give live feedback, men serveren er autoritet for:

- verification result
- authority readiness
- persistence
- export readiness
- AI generation gates
- compliance-relevante derived values

### 7.4 Deterministic Engines

Følgende skal være deterministic, pure TypeScript hvor muligt:

- topology engine
- geometry engine
- room detection
- area calculations
- material quantity basis calculations
- verification checks
- drawing model builder

### 7.5 AI Som Adapter

AI må bruges til:

- første forslag til rumprogram
- rangering af layoutvarianter efter brugerens ønsker
- oversættelse af fritekst til `FloorPlanCommand`
- forklaring af verificeringsfund
- forslag til næste handling

AI må ikke:

- være eneste kilde til geometri
- skrive direkte i persisted floor plan
- omgå Zod command schemas
- erklære myndighedsgodkendelse
- beregne materialemængder uden deterministic engine

---

## 8. Foreslået Modulstruktur

```txt
src/domain/floor-plan/
  floor-plan.types.ts
  floor-plan.schemas.ts
  commands.ts
  command.schemas.ts
  topology-engine.ts
  topology-engine.test.ts
  geometry-engine.ts
  geometry-engine.test.ts
  room-program.ts
  verification-engine.ts
  verification-engine.test.ts
  readiness-engine.ts
  readiness-engine.test.ts
  material-basis.ts
  material-basis.test.ts
  ports.ts

src/domain/geometry/
  geometry-2d.types.ts
  local-transform.ts
  polygon-ops.ts

src/services/floor-plan/
  generate-floor-plan.service.ts
  apply-floor-plan-command.service.ts
  verify-floor-plan.service.ts
  export-floor-plan.service.ts

src/lib/floor-plan/
  floor-plan-render-model.ts
  render-floor-plan-svg.ts
  render-floor-plan-pdf.ts
  editor-hit-testing.ts
  snap-engine.ts

src/components/floor-plan/
  FloorPlanEditor.tsx
  FloorPlanCanvas.tsx
  FloorPlanToolbar.tsx
  FloorPlanInspector.tsx
  VerificationPanel.tsx

src/integrations/ai/
  floor-plan-command-parser.ts
  floor-plan-generator.ts

src/integrations/supabase/repositories/
  floor-plan.repository.ts
  floor-plan-verification.repository.ts
```

### 8.1 Besluttede Defaults For Første Store Version

De følgende defaults skal gælde, medmindre architecture review eksplicit vælger noget andet.

| Område | Default | Begrundelse |
| --- | --- | --- |
| Editor-renderer | Native SVG i v1 | Boligplantegninger har få nok elementer til SVG, og det matcher eksisterende SVG/PDF-tegningspipeline. |
| Hit testing | Domain geometry, ikke DOM som sandhed | DOM/SVG kan bruges til pointer events, men valgt element og snap beregnes mod `FloorPlanDocument`. |
| Canvas/Konva | Udskydes | Indføres kun hvis SVG performance bliver dokumenteret flaskehals. |
| Canonical state | `FloorPlanDocument` i domain model | Ingen React/canvas state som sandhed. |
| Persistence | Separat `floor_plan_iterations`, reference til `design_iterations` | Plantegninger har versionering, commands og exports nok til egen lifecycle. |
| Shared geometry | `src/domain/geometry/` | Forhindrer import-cycles mellem `domain/drawing` og `domain/floor-plan`. |
| Rooms | Derived from walls, men persisted som reconciled snapshot | Geometri udledes fra vægge, men stabile rum-ID'er, labels og materialefelter skal overleve edits. |
| Geometry scope | Primært ortogonale vægge i v1 | Reducerer topology-risiko og matcher mange enfamiliehuse. Ikke-ortogonal geometri markeres `review_required`. |
| Multi-level | 1-2 niveauer i v1, simple trapper | Første release skal understøtte almindelige 1-2 plans huse, men ikke avancerede split-levels. |
| Product catalogs | Minimal project-local snapshot | Dør/vindue/assembly data gemmes projektlokalt i første version, global katalogisering kan komme senere. |
| Material takeoff | Geometry-only summary i v1 | Endelig materialeberegning er ude af scope, men datafelter og summary skal være klar. |
| BR18 checks | Kun sikre deterministic checks som facts; resten `review_required` | Undgår falsk myndighedssikkerhed. |

### 8.2 Første Leverbare Vertical Slice

Den første leverbare slice skal være smal nok til at bygge, men stor nok til at bevise hele arkitekturen:

1. Opret/generer én plantegning for et simpelt 1-plans enfamiliehus.
2. Render planen i interaktiv SVG-editor.
3. Vælg og træk intern væg.
4. Flyt dør langs væg.
5. Flyt vindue langs ydervæg.
6. Flyt teknikskab til andet rum.
7. Kør live validation efter hver operation.
8. Gem command history og ny aktiv version.
9. Kør formal verification server-side.
10. Eksporter SVG/PDF med status og rumarealer.
11. Afled `MaterialBasisSummary` i `GEOMETRY_ONLY` status.

Slice er først godkendt, når samme ændring kan udføres både med drag og med en AI-tekstkommando, og begge veje ender i samme command pipeline.

---

## 9. Domain Model

### 9.1 Coordinate Systems

Plantegningen skal bruge lokale meterkoordinater for editoren.

```ts
type LocalCrs = "LOCAL_METER";

type FloorPlanTransform = {
  localCrs: "LOCAL_METER";
  siteCrs: "EPSG:25832";
  origin25832: [number, number];
  rotationDeg: number;
};
```

Begrundelse:

- Interaktiv editor bliver enklere og hurtigere.
- Materiale- og arealberegning sker i meter.
- Footprint og beliggenhedsplan kan transformere til EPSG:25832.
- Samme model kan placeres på matriklen uden at hver væg gemmes som global koordinat.

### 9.2 FloorPlanDocument

```ts
type FloorPlanDocument = {
  schemaVersion: "floor-plan.v1";
  projectId: string;
  designIterationId: string | null;
  transform: FloorPlanTransform;
  levels: FloorLevel[];
  assemblies: AssemblyCatalog;
  roomProgram: RoomProgram;
  constraints: FloorPlanConstraint[];
  metadata: FloorPlanMetadata;
  provenance: FloorPlanProvenance;
};
```

### 9.3 FloorLevel

```ts
type FloorLevel = {
  id: string;
  name: string;
  levelIndex: number;
  elevationM: number;
  floorToFloorHeightM: number | null;
  walls: Wall[];
  rooms: RoomZone[];
  openings: Opening[];
  fixtures: Fixture[];
  stairs: Stair[];
  annotations: PlanAnnotation[];
};
```

### 9.4 Wall

Vægge er bygningsdele, ikke streger.

```ts
type Wall = {
  id: string;
  levelId: string;
  centerline: Line2D;
  thicknessM: number;
  heightM: number | null;
  wallKind: "exterior" | "interior" | "party" | "foundation" | "shaft";
  structuralRole: "unknown" | "non_bearing" | "bearing" | "requires_engineer_review";
  fireRole: "none" | "fire_separation" | "unknown";
  assemblyId: string | null;
  locked: boolean;
  source: ElementSourceMeta;
};
```

Materialegrundlag kræver især:

- længde
- tykkelse
- højde
- vægtype
- assembly
- åbninger der skal trækkes fra
- side A/side B rumrelationer

### 9.5 RoomZone

Rum kan være derived fra vægge, men label, funktion og brugerintention skal persisteres.

```ts
type RoomZone = {
  id: string;
  levelId: string;
  name: string;
  roomType:
    | "entrance"
    | "hall"
    | "living"
    | "kitchen"
    | "bedroom"
    | "bathroom"
    | "utility"
    | "office"
    | "storage"
    | "technical"
    | "stair"
    | "garage"
    | "other";
  polygon: Polygon2D;
  netAreaM2: number;
  minAreaM2: number | null;
  targetAreaM2: number | null;
  floorFinishAssemblyId: string | null;
  ceilingFinishAssemblyId: string | null;
  wallFinishAssemblyByWallId: Record<string, string | null>;
  ventilationNeed: "unknown" | "natural" | "mechanical" | "wet_room";
  wetRoomZone: boolean;
  daylightRelevant: boolean;
  source: ElementSourceMeta;
};
```

### 9.6 Opening

```ts
type Opening = {
  id: string;
  levelId: string;
  wallId: string;
  openingKind: "door" | "window" | "sliding_door" | "opening" | "garage_door";
  offsetAlongWallM: number;
  widthM: number;
  heightM: number;
  sillHeightM: number | null;
  swing: "left" | "right" | "sliding" | "none" | "unknown";
  productTypeId: string | null;
  locked: boolean;
  source: ElementSourceMeta;
};
```

Materialegrundlag kræver:

- antal og type
- bredde/højde
- vægtilknytning
- fradrag i vægareal
- karm/false/inddækning senere

### 9.7 Fixture

```ts
type Fixture = {
  id: string;
  levelId: string;
  roomId: string | null;
  fixtureKind:
    | "toilet"
    | "sink"
    | "shower"
    | "bathtub"
    | "kitchen_unit"
    | "technical_cabinet"
    | "wardrobe"
    | "appliance"
    | "ventilation_unit"
    | "heat_pump_indoor"
    | "other";
  position: Point2D;
  rotationDeg: number;
  footprint: Polygon2D;
  productTypeId: string | null;
  requiresDisciplineReview: Array<"architect" | "engineer" | "vvs" | "electrician">;
  source: ElementSourceMeta;
};
```

### 9.8 AssemblyCatalog

Dette er nøglen til senere materialebehov.

```ts
type AssemblyCatalog = {
  wallAssemblies: WallAssembly[];
  floorFinishAssemblies: FinishAssembly[];
  ceilingFinishAssemblies: FinishAssembly[];
  openingProductTypes: OpeningProductType[];
};

type WallAssembly = {
  id: string;
  name: string;
  category: "exterior_wall" | "interior_wall" | "wet_room_wall" | "shaft_wall";
  thicknessM: number;
  defaultHeightM: number | null;
  layers: AssemblyLayer[];
  quantityRulesVersion: string;
};

type AssemblyLayer = {
  materialId: string;
  name: string;
  thicknessM: number | null;
  quantityUnit: "m2" | "m3" | "m" | "pcs";
  side: "core" | "side_a" | "side_b" | "both_sides";
  wasteFactorPct: number;
};
```

Første version må gerne have `assemblyId: null`, men modellen skal kunne bære feltet fra dag ét.

---

## 10. Verification Model

### 10.1 To Niveauer

Editoren skal have både live validering og formel verifikation.

#### Live Validation

Kører lokalt og hurtigt efter drag/edit.

Formål:

- hjælpe brugeren
- forhindre åbenlyst ugyldig geometri
- opdatere arealer
- give inline warnings

Live validation må ikke være myndighedsautoritet.

#### Formal Verification

Kører server-side ved submit.

Formål:

- bruge trusted project/site/compliance data
- gemme audit trail
- afgøre readiness
- danne myndigheds- og rådgivergrundlag

### 10.2 Verification Status

```ts
type FloorPlanVerificationStatus =
  | "CONCEPT_DRAFT"
  | "TECHNICAL_REVIEW"
  | "AUTHORITY_REVIEW"
  | "DOCUMENTATION_REQUIRED"
  | "BLOCKED";
```

Betydning:

- `CONCEPT_DRAFT`: tegningen er brugbar som skitse og dialoggrundlag.
- `TECHNICAL_REVIEW`: geometri og rumlogik er konsistent, men rådgiverdata kan mangle.
- `AUTHORITY_REVIEW`: tegningen er egnet til myndighedspakke-review.
- `DOCUMENTATION_REQUIRED`: planen kan være mulig, men kræver dokumentation.
- `BLOCKED`: planen har alvorlige fejl eller konflikter.

### 10.3 Verification Finding

```ts
type VerificationFinding = {
  id: string;
  severity: "info" | "warning" | "review_required" | "blocking";
  category:
    | "topology"
    | "geometry"
    | "room_program"
    | "site_compliance"
    | "br18"
    | "fire"
    | "accessibility"
    | "daylight"
    | "wet_room"
    | "technical_installation"
    | "material_basis"
    | "documentation";
  message: string;
  affectedElementIds: string[];
  source: "deterministic" | "rule_engine" | "trusted_register" | "ai_explanation";
  nextAction: string | null;
};
```

### 10.4 Verification Inputs

Formal verification skal samle:

- active `FloorPlanDocument`
- active `design_iterations` data
- `site_constraints`
- trusted address/project typed columns
- rule-engine results
- beliggenhedsplan/footprint constraints
- BR18 applicability/evidence where available
- uploaded rådgiverdata, if present

Server function må ikke acceptere client-derived compliance booleans som autoritet.

### 10.5 Verification Rule Matrix

Verifikationsmotoren skal implementeres som en rule matrix med stabile rule IDs. Første version skal mindst dække nedenstående regler.

| Rule ID | Kategori | Input | Check | Severity default | Output |
| --- | --- | --- | --- | --- | --- |
| `FP-TOPO-001` | topology | walls, rooms | Alle persisted room polygons kan reconciles fra wall graph. | blocking | Affected rooms/walls |
| `FP-TOPO-002` | topology | walls | Wall graph har ingen dangling wall endpoints, medmindre endpoint er markeret som åbent/eksternt. | blocking | Affected wall endpoints |
| `FP-TOPO-003` | topology | openings | Alle openings har gyldigt `wallId`. | blocking | Affected openings |
| `FP-TOPO-004` | topology | openings | Openings overlapper ikke hinanden på samme væg. | warning | Affected openings |
| `FP-GEO-001` | geometry | rooms | Alle rumarealer er positive og over minimum geometry tolerance. | blocking | Affected rooms |
| `FP-GEO-002` | geometry | floor plan | Nettoareal er plausibelt i forhold til bruttoareal. | warning | Area summary |
| `FP-GEO-003` | geometry | floor plan, footprint | Planens udvendige vægge ligger inden for eller matcher active footprint tolerance. | review_required | Affected exterior walls |
| `FP-GEO-004` | geometry | openings, walls | Openings holder minimum afstand til wall endpoints. | warning | Affected openings |
| `FP-ROOM-001` | room_program | rooms, roomProgram | Krævede rumtyper fra room program findes. | warning | Missing room types |
| `FP-ROOM-002` | room_program | rooms | Rum under minimum eller target area markeres. | warning | Affected rooms |
| `FP-ROOM-003` | room_program | fixtures | Vådrum har relevante fixtures eller markeres ufuldstændige. | review_required | Affected rooms/fixtures |
| `FP-SITE-001` | site_compliance | floor area, site_constraints | Samlet areal sammenholdes med bebyggelsesprocent. | review_required/blocking efter rule-engine | Rule-engine result |
| `FP-SITE-002` | site_compliance | levels, site_constraints | Antal etager sammenholdes med typed constraints. | review_required/blocking efter rule-engine | Rule-engine result |
| `FP-SITE-003` | site_compliance | height, site_constraints | Højde sammenholdes med typed constraints, hvis højde kendes. | review_required | Rule-engine result |
| `FP-BR18-001` | accessibility | doors, rooms | Dørbredder og adgangsforhold markeres til review, indtil detaljeret BR18-modul findes. | review_required | Affected doors/rooms |
| `FP-BR18-002` | fire | rooms, stairs, escape routes | Flugtvej/brandforhold markeres til review, hvis modellen mangler branddata. | review_required | Documentation gap |
| `FP-DAY-001` | daylight | windows, rooms | Dagslysrelevante rum uden vinduer eller med ukendt vinduesdata markeres. | review_required | Affected rooms/windows |
| `FP-TECH-001` | technical_installation | fixtures | Teknikskab/ventilation/VVS fixtures har gyldigt rum og discipline review. | warning | Affected fixtures |
| `FP-MAT-001` | material_basis | walls | Vægge mangler `assemblyId`. | info | Missing material data |
| `FP-MAT-002` | material_basis | walls, openings | Wall gross/net area kan beregnes eller forklarer manglende højde/åbninger. | warning | Material basis summary |

Severity må gerne skærpes af rule-engine eller trusted constraints, men må ikke nedtones af klienten.

### 10.6 Verification Output Contract

Formal verification skal returnere både menneskelig forklaring og maskinlæsbare facts:

```ts
type FloorPlanVerificationResult = {
  status: FloorPlanVerificationStatus;
  findings: VerificationFinding[];
  metrics: {
    grossAreaM2: number | null;
    netAreaM2: number | null;
    levelsCount: number;
    roomsCount: number;
    exteriorWallLengthM: number | null;
    interiorWallLengthM: number | null;
    openingsCount: number;
  };
  materialBasis: MaterialBasisSummary;
  missingDataPoints: string[];
  inputHash: string;
  verifiedAt: string;
};
```

`findings` er canonical. AI-genererede forklaringer må kun være et præsentationslag oven på samme findings.

---

## 11. Functional Requirements

### 11.1 Generation

| ID | Krav |
| --- | --- |
| FR-GEN-001 | Systemet skal kunne generere mindst 2 plantegningsforslag fra et struktureret byggeønske. |
| FR-GEN-002 | Forslag skal overholde valgt antal etager og ønsket areal inden for konfigurerede tolerancer. |
| FR-GEN-003 | Forslag skal kunne begrænses af et eksisterende/proposed footprint. |
| FR-GEN-004 | AI-output skal valideres med Zod, før det bliver til domain data. |
| FR-GEN-005 | Hvis AI-output er ugyldigt, skal systemet returnere degraded state og ikke gemme planen. |
| FR-GEN-006 | Alle genererede elementer skal have `source.source = "generated"` og confidence. |

### 11.2 Interactive Editing

| ID | Krav |
| --- | --- |
| FR-EDIT-001 | Brugeren skal kunne vælge og trække vægge. |
| FR-EDIT-002 | Brugeren skal kunne vælge og trække døre langs gyldige vægge. |
| FR-EDIT-003 | Brugeren skal kunne vælge og trække vinduer langs gyldige ydervægge. |
| FR-EDIT-004 | Brugeren skal kunne tilføje, flytte, resize og slette døre. |
| FR-EDIT-005 | Brugeren skal kunne tilføje, flytte, resize og slette vinduer. |
| FR-EDIT-006 | Brugeren skal kunne tilføje og flytte fixtures, herunder teknikskab og vådrumsobjekter. |
| FR-EDIT-007 | Brugeren skal kunne låse elementer mod ændring. |
| FR-EDIT-008 | Editor skal understøtte undo/redo baseret på command history. |
| FR-EDIT-009 | Editor skal understøtte snap til grid, vægforlængelse, parallelle vægge og hjørner. |
| FR-EDIT-010 | Editor skal forhindre operationer der ødelægger modellen uden at kunne repareres deterministisk. |
| FR-EDIT-011 | Alle edits skal gemmes som typed commands, ikke som raw SVG/canvas mutations. |

### 11.3 Room And Topology

| ID | Krav |
| --- | --- |
| FR-TOPO-001 | Systemet skal kunne detektere lukkede rum fra vægge. |
| FR-TOPO-002 | Systemet skal bevare rum-identitet ved mindre vægflytninger. |
| FR-TOPO-003 | Systemet skal markere åbne eller selvkrydsende rum som invalid. |
| FR-TOPO-004 | Systemet skal håndtere merge af rum ved sletning af intern væg. |
| FR-TOPO-005 | Systemet skal håndtere split af rum ved ny intern væg. |
| FR-TOPO-006 | Døre, vinduer og fixtures skal knyttes til gyldige parent entities. |

### 11.4 Measurement And Drawing

| ID | Krav |
| --- | --- |
| FR-DRAW-001 | Systemet skal vise mål på vægge, rum og åbninger. |
| FR-DRAW-002 | Systemet skal vise rumstempler med navn og nettoareal. |
| FR-DRAW-003 | Systemet skal vise dørslag/sving, hvor relevant. |
| FR-DRAW-004 | Systemet skal vise vinduesbredde og placering på ydervæg. |
| FR-DRAW-005 | Systemet skal kunne eksportere SVG og PDF fra samme render model. |
| FR-DRAW-006 | Myndighedsnær eksport skal have målestok, titleblok, revision og status. |

### 11.5 Verification

| ID | Krav |
| --- | --- |
| FR-VER-001 | Systemet skal kunne køre live validation efter hver edit operation. |
| FR-VER-002 | Systemet skal kunne køre formal verification server-side. |
| FR-VER-003 | Formal verification skal gemme input-hash og verification snapshot. |
| FR-VER-004 | Formal verification skal returnere konkrete affected element IDs. |
| FR-VER-005 | Verifikation skal skelne mellem blocking, review_required, warning og info. |
| FR-VER-006 | Verifikation må ikke stole på client-provided compliance state. |
| FR-VER-007 | Verifikation skal kunne returnere manglende dokumentation som path-baserede datapunkter. |

### 11.6 AI Commands

| ID | Krav |
| --- | --- |
| FR-AI-001 | Brugerens tekstkommandoer skal oversættes til `FloorPlanCommand` eller afvises. |
| FR-AI-002 | AI-command parseren må maksimalt modtage relevant plan-slice, ikke hele historikken. |
| FR-AI-003 | AI-output skal valideres med command schema. |
| FR-AI-004 | Ved tvetydighed skal AI returnere clarification candidates fremfor at gætte. |
| FR-AI-005 | En AI-kommando skal gennem samme command pipeline som drag operationer. |

### 11.7 Future Material Basis

| ID | Krav |
| --- | --- |
| FR-MAT-001 | Vægge skal have længde, tykkelse, højde og `assemblyId` felt. |
| FR-MAT-002 | Åbninger skal være knyttet til vægge, så fradrag kan beregnes senere. |
| FR-MAT-003 | Rum skal have gulv- og loftfinish assembly fields. |
| FR-MAT-004 | Vægge skal kunne relatere side A og side B til rum. |
| FR-MAT-005 | Materialegrundlag skal kunne afledes deterministisk uden AI. |
| FR-MAT-006 | Første version skal kunne markere `materialBasisReadiness`. |
| FR-MAT-007 | Systemet skal kunne fortælle hvad der mangler, før materialeberegning kan blive præcis. |

---

## 12. Non-Functional Requirements

### Performance

- Live drag feedback skal føles øjeblikkelig for almindelige parcelhuse.
- Target: under 50 ms for lokal geometry/topology update ved typisk edit.
- Formal verification target: under 10 sekunder for almindelig 1-2 etagers bolig.
- SVG/PDF export target: under 10 sekunder for typisk myndighedstegning.

### Robusthed

- En ugyldig operation må ikke korrumpere aktiv plan.
- Undo/redo skal virke på command niveau.
- Autosave må ikke gemme halvvalideret partial state som aktiv myndighedsmodel.

### Tokenforbrug

- Drag/edit må bruge 0 AI tokens.
- Live validation må bruge 0 AI tokens.
- Formal verification må bruge 0 AI tokens til deterministic checks.
- AI må kun bruges til generation, command parsing og forklaring.
- AI prompts skal bruge plan-slices, ikke fuld `FloorPlanDocument`, medmindre eksplicit nødvendigt.

### Auditability

- Hver gemt version skal have:
  - command history hash
  - model hash
  - verification hash
  - created_by
  - source
  - timestamp

### Security

- Alle server functions skal bruge tynd adapter-pattern:
  1. validate input
  2. auth
  3. import service
  4. return service result

- Supabase writes må kun ske gennem repositories.

---

## 13. Persistence Requirements

### 13.1 Nye Tabeller

Foreslåede additive tabeller:

```txt
floor_plan_iterations
floor_plan_commands
floor_plan_verifications
floor_plan_exports
floor_plan_material_profiles
```

### 13.2 floor_plan_iterations

Formål: canonical store for plantegningsversioner.

Vigtige felter:

- `id`
- `project_id`
- `design_iteration_id`
- `version`
- `is_active`
- `schema_version`
- `floor_plan_json`
- `model_hash`
- `verification_status`
- `gross_area_m2`
- `net_area_m2`
- `footprint_area_m2`
- `levels_count`
- `rooms_count`
- `wall_length_total_m`
- `exterior_wall_length_m`
- `openings_count`
- `material_basis_readiness`
- `created_at`
- `created_by`

Bemærk:

- Den fulde model kan starte som valideret JSONB med `schema_version`.
- Kritiske aggregates skal have typed columns, så UI, verification og fremtidige API'er ikke skal parse JSONB for alt.
- Compliance-kritiske værdier må ikke kun ligge i JSONB, hvis de senere bruges autoritativt.

### 13.3 floor_plan_commands

Formål: audit trail og replay.

Felter:

- `id`
- `floor_plan_iteration_id`
- `project_id`
- `command_index`
- `command_json`
- `command_hash`
- `source`: `"drag" | "keyboard" | "ai" | "system"`
- `created_at`
- `created_by`

### 13.4 floor_plan_verifications

Formål: formal verification snapshots.

Felter:

- `id`
- `project_id`
- `floor_plan_iteration_id`
- `input_hash`
- `status`
- `findings_json`
- `missing_data_points_json`
- `verified_at`
- `verified_by`
- `rule_engine_snapshot_id`

### 13.5 floor_plan_exports

Formål: PDF/SVG exports.

Felter:

- `id`
- `project_id`
- `floor_plan_iteration_id`
- `drawing_type`
- `readiness_status`
- `svg_path`
- `pdf_path`
- `input_hash`
- `generated_at`
- `approved_at`
- `approved_by`

### 13.6 floor_plan_material_profiles

Formål: fremtidig materialeberegning uden at ændre modelkontrakten.

Felter:

- `id`
- `project_id`
- `floor_plan_iteration_id`
- `profile_name`
- `assembly_catalog_json`
- `readiness_status`
- `created_at`

---

## 14. Materialebehov: Fremtidigt Designkrav

Selvom materialeberegning ikke implementeres nu, skal editoren samle nok data til at undgå senere redesign.

### 14.1 Material Basis Output

Første version skal kunne aflede en `MaterialBasisSummary`:

```ts
type MaterialBasisSummary = {
  readiness:
    | "NOT_READY"
    | "GEOMETRY_ONLY"
    | "ASSEMBLIES_ASSIGNED"
    | "READY_FOR_ESTIMATE"
    | "READY_FOR_QUANTITY_TAKEOFF";
  wallLengthTotalM: number;
  exteriorWallLengthM: number;
  interiorWallLengthM: number;
  wallGrossAreaM2: number | null;
  wallNetAreaM2: number | null;
  floorAreaByRoomM2: Array<{ roomId: string; areaM2: number; finishAssemblyId: string | null }>;
  openingCounts: Array<{ openingKind: string; productTypeId: string | null; count: number }>;
  assemblyQuantities: MaterialAssemblyQuantity[];
  missingDataPoints: string[];
};

type MaterialAssemblyQuantity = {
  assemblyId: string | null;
  elementKind: "wall" | "floor_finish" | "ceiling_finish" | "opening" | "fixture";
  quantity: number;
  unit: "m" | "m2" | "m3" | "pcs";
  confidence: "geometry_only" | "assembly_assigned" | "reviewed";
  sourceElementIds: string[];
};
```

### 14.2 Readiness Regler

- `NOT_READY`: geometri/topologi er invalid.
- `GEOMETRY_ONLY`: arealer/længder kan beregnes, men assemblies mangler.
- `ASSEMBLIES_ASSIGNED`: væg/gulv/loft assemblies er valgt.
- `READY_FOR_ESTIMATE`: mængder kan bruges til overslag.
- `READY_FOR_QUANTITY_TAKEOFF`: kræver produkt-/lagdata, højder, åbninger og review.

### 14.3 Elementkrav For Fremtidige Mængder

Vægge:

- centerline
- thickness
- height
- assemblyId
- wallKind
- structuralRole
- room side mapping

Døre/vinduer:

- wallId
- width
- height
- sill height for windows
- productTypeId

Rum:

- polygon
- net area
- room type
- floor finish
- ceiling finish
- wet room flag

Fixtures:

- type
- room
- footprint
- productTypeId, if available

### 14.4 Quantity Formula Contract

Før materialeberegneren bygges, skal første version kunne beregne disse basisformler deterministisk:

| Quantity | Formel | Kræver | Readiness |
| --- | --- | --- | --- |
| Væglængde | `wall.centerline.lengthM` | Valid wall geometry | `GEOMETRY_ONLY` |
| Brutto vægareal | `wall.lengthM * wall.heightM` | Wall height | `GEOMETRY_ONLY` eller højere |
| Åbningsareal | `opening.widthM * opening.heightM` | Opening dimensions | `GEOMETRY_ONLY` |
| Netto vægareal | `grossWallAreaM2 - sum(openingAreaM2)` | Wall/opening relation | `GEOMETRY_ONLY` |
| Gulvareal | `room.netAreaM2` | Valid room polygon | `GEOMETRY_ONLY` |
| Loftareal | `room.netAreaM2` med loftfinish | Valid room polygon | `ASSEMBLIES_ASSIGNED` |
| Fodpanel længde | Room perimeter minus door openings | Room/wall/opening relation | `READY_FOR_ESTIMATE` |
| Dør/vindue antal | Count by `openingKind` and `productTypeId` | Product type optional | `GEOMETRY_ONLY` |
| Vådzone areal | Wet room wall/floor zones | Wet room metadata | `READY_FOR_ESTIMATE` |

Regler:

- Hvis en væg mangler `heightM`, må systemet beregne længde men ikke vægareal uden at markere missing data.
- Hvis `assemblyId` mangler, må systemet beregne geometriske mængder men ikke materialelag.
- Hvis åbning mangler højde, må systemet tælle åbningen men ikke fratrække korrekt vægareal.
- Hvis room side mapping mangler, må systemet ikke fordele vægfinish på rum uden review.
- Materiale-output fra v1 er et beregningsgrundlag, ikke en indkøbsliste.

### 14.5 Material Basis Acceptance Criteria

Materialebasis er tilfredsstillende for første store release når:

- alle vægge kan rapportere længde
- alle rum kan rapportere nettoareal
- alle døre/vinduer kan tælles pr. type
- vægarealer rapporteres som `null` med missing data, hvis højde mangler
- assemblies kan være `null`, men feltet findes på vægge, gulve, lofter og åbninger
- systemet kan forklare præcist, hvad der mangler for at nå `READY_FOR_ESTIMATE`
- materialebasis ikke bruger AI til talberegning

---

## 15. Verification Checks

### 15.1 Topology Checks

- Alle rum skal være lukkede polygoner.
- Vægge må ikke have ugyldige selvkryds.
- Åbninger skal ligge på en eksisterende væg.
- Døre/vinduer må ikke overlappe hinanden.
- Døre/vinduer må ikke krydse vægendepunkter.
- Fixtures skal ligge i et gyldigt rum eller teknisk zone.

### 15.2 Geometry Checks

- Rumarealer skal være positive.
- Samlet nettoareal skal være plausibelt i forhold til bruttoareal.
- Vægges tykkelse og længde skal være positive.
- Etager skal være konsistente med projektets antal etager.
- Footprint skal være konsistent med beliggenhedsplan/design placement.

### 15.3 Room Program Checks

- Antal soveværelser matcher eller afviger fra brugerønske.
- Antal badeværelser matcher eller afviger fra brugerønske.
- Hjemmekontor behandles hvis valgt.
- Teknikrum/teknikskab findes.
- Vådrum findes og er markeret.
- Rum under target area markeres som warning eller review.

### 15.4 Site And Compliance Checks

- Samlet areal sammenholdes med bebyggelsesprocent.
- Antal etager sammenholdes med typed site constraints.
- Højde, hvis kendt, sammenholdes med typed constraints.
- Footprint og skelafstand håndteres af drawing/placement engine.
- Facadeændringer via vinduer på ydervæg markeres som relevant for myndighed/energi/dagslys.

### 15.5 Documentation Checks

- Manglende statik-review hvis bærende vægge ændres.
- Manglende brand-review hvis brandforhold ikke kan afgøres.
- Manglende ventilation/VVS review ved vådrum og teknik.
- Manglende material assemblies for material takeoff.
- Manglende etage-/snitdata for myndighedsnær pakke.

---

## 16. User Experience Requirements

### 16.1 Editor

Editor skal føles som en professionel, fokuseret arbejdsflade:

- central plantegning
- venstre værktøjslinje med ikoner
- højre inspector for valgt element
- nederste statuslinje med arealer/verifikation
- verification panel som sidepanel
- undo/redo
- zoom/pan
- snap settings
- etage-tabs

### 16.2 Interaktionsprincipper

- Klik væg for at vælge.
- Træk væg for at flytte.
- Træk endpoint for at ændre væglængde, hvor allowed.
- Træk dør/vindue langs parent wall.
- Inspector ændrer præcise mål.
- Invalid moves vises med inline feedback.
- Alvorlige ændringer på låste/bærende elementer kræver eksplicit bekræftelse eller blokeres.

### 16.3 Feedback

Feedback skal være handlingsorienteret:

Ikke: "Plan invalid"

Men: "Værelse 2 er ikke længere lukket. Flyt væggen tilbage, eller tilføj en afsluttende væg."

---

## 17. API Og Server Function Krav

### 17.1 generateFloorPlanFn

Input:

- `projectId`
- `designIterationId`
- generation options

Flow:

1. validate input
2. auth resolves typed `principal`
3. import service
4. service henter trusted context
5. service verifies trusted Hard Stop status before AI/layout output
6. AI/layout engine genererer forslag
7. Zod validates `FloorPlanDocument`
8. repository gemmer version

### 17.2 applyFloorPlanCommandFn

Input:

- `projectId`
- `floorPlanIterationId`
- `command`

Flow:

1. validate command
2. auth resolves typed `principal`
3. import service
4. load active floor plan
5. apply command deterministisk
6. run topology/geometry validation
7. save new version or patch

### 17.3 parseFloorPlanCommandFn

Input:

- `projectId`
- selected element context
- natural language command

Flow:

1. validate input
2. auth resolves typed `principal`
3. load minimal relevant plan slice
4. AI returns command candidates
5. schema validation
6. return candidate commands, not automatically persisted unless confidence and UX policy allow it

### 17.4 verifyFloorPlanFn

Input:

- `projectId`
- `floorPlanIterationId`

Flow:

1. validate input
2. auth resolves typed `principal`
3. import service
4. load trusted project/site data
5. run verification
6. persist verification snapshot
7. return status and findings

### 17.5 exportFloorPlanFn

Input:

- `projectId`
- `floorPlanIterationId`
- export options

Flow:

1. validate input
2. auth resolves typed `principal`
3. verify or reuse valid verification by input hash
4. build drawing model
5. render SVG/PDF
6. store export
7. return signed URLs

---

## 18. AI Token Strategy

### 18.1 Token Rules

- Dragging uses no AI.
- Inspector edits use no AI.
- Snap/topology/geometry uses no AI.
- Verification uses no AI for core result.
- AI explanation may be generated after verification, but deterministic finding remains canonical.

### 18.2 Prompt Slicing

AI command parser receives:

- user command
- selected element IDs
- nearby elements
- room names and IDs
- relevant constraints

AI command parser must not receive:

- full command history
- full SVG/PDF
- unrelated levels
- raw register payloads

### 18.3 Commercial Quotas

Recommended product model:

- unlimited manual edits
- included AI generation attempts: e.g. 3 initial layout generations
- included AI text commands/explanations: e.g. 10 per project
- additional AI iterations sold as packs or included in higher plan
- formal verification can be limited per plan because it consumes server resources and has high product value

---

## 19. Test Strategy

### Tier 1: Domain

Use `bun:test`.

Tests:

- topology engine detects rooms
- move wall preserves room closure
- delete wall merges rooms
- openings attach to walls
- invalid openings are rejected
- room areas are deterministic
- material basis subtracts openings
- verification statuses classify fixtures/findings

### Tier 2: Application Services

Use fake repositories and fake AI adapters.

Tests:

- generate service persists validated plan
- apply command service rejects invalid command
- verify service never trusts client flags
- export service uses verification hash
- AI command parser returns candidates only

### Tier 3: Acceptance

Keep small and critical:

- generate plan, drag wall, verify, export PDF
- move door/window and confirm room/area updates
- invalid edit is blocked or warned
- material basis summary appears as geometry-only

---

## 20. Implementation Phases

### Phase 0: Architecture Review

Deliverables:

- approve domain model
- approve persistence tables
- approve AI boundaries
- decide direct SVG vs canvas/Konva editor rendering
- decide relation to `design_iterations`

### Phase 1: Domain Core

Deliverables:

- `FloorPlanDocument` types and schemas
- command schemas
- topology engine
- geometry engine
- material basis summary skeleton
- Tier 1 tests

### Phase 2: Renderer And Read-Only Preview

Deliverables:

- render model
- SVG preview
- room labels
- walls/openings/fixtures rendering
- PDF export prototype

### Phase 3: Interactive Editor

Deliverables:

- select/move wall
- move door/window
- add/delete openings
- fixtures
- snap
- undo/redo
- inspector
- local live validation

### Phase 4: Persistence And Versioning

Deliverables:

- migrations
- repositories
- active version model
- command history
- autosave policy
- restore flow

### Phase 5: Formal Verification

Deliverables:

- verification service
- server function
- verification panel
- persisted verification snapshots
- readiness statuses

### Phase 6: AI Generation And AI Commands

Deliverables:

- room program AI adapter
- initial layout generation adapter
- natural language command parser
- token budget controls
- clarification flow

### Phase 7: Authority Export

Deliverables:

- titleblok
- revision table
- measurements
- room schedule
- verification status on export
- SVG/PDF storage

### Phase 8: Material Takeoff Preparation

Deliverables:

- assembly catalog UI foundation
- material basis summary
- missing material data panel
- no final quantities yet

### 20.1 P0 Backlog For Første Vertical Slice

Følgende P0 backlog er den anbefalede nedbrydning for første implementeringsrunde.

| Epic | Leverance | Accept |
| --- | --- | --- |
| FP-CORE-001 | `FloorPlanDocument` + Zod schemas | Invalid wall/room/opening payloads afvises i tests. |
| FP-CORE-002 | Command schemas og command result contract | `move_wall`, `move_opening`, `move_fixture` valideres og kan afvises uden mutation. |
| FP-CORE-003 | Geometry helpers | Længde, areal, perimeter, opening projection og local meter transforms er deterministic. |
| FP-CORE-004 | Topology reconciliation | Lukkede rum kan udledes fra ortogonale vægge med stabile room IDs. |
| FP-RENDER-001 | Read-only SVG render model | Plan kan vises med vægge, rumstempler, døre, vinduer og fixtures. |
| FP-EDITOR-001 | Selection + drag wall | Intern væg kan trækkes og opdaterer tilstødende rumarealer. |
| FP-EDITOR-002 | Door/window drag | Opening kan flyttes langs parent wall med endpoint/overlap constraints. |
| FP-EDITOR-003 | Fixture drag | Teknikskab kan flyttes mellem rum og bevarer room relation. |
| FP-VERIFY-001 | Live validation | Invalid topology, invalid openings og room-program warnings vises efter edit. |
| FP-PERSIST-001 | Floor plan repository | Aktiv version og command history kan gemmes/hentes uden direkte Supabase i UI. |
| FP-VERIFY-002 | Formal verification service | Rule matrix P0-regler returnerer findings med affected element IDs. |
| FP-EXPORT-001 | SVG/PDF export | Export bruger samme render model og viser verification status. |
| FP-MAT-001 | Material basis summary | Geometry-only summary returnerer væglængder, rumarealer og opening counts. |
| FP-AI-001 | AI command parser | Tekstkommando returnerer validated command candidate eller clarification. |

P0 skal ikke inkludere:

- fuld produktkatalogstyring
- præcis mængdeberegning
- avancerede skrå/kurvede vægge
- split-level
- fuld BR18 brand/tilgængelighedsdokumentation

### 20.2 P0 Verification Scope

P0 formal verification skal mindst implementere:

- `FP-TOPO-001`
- `FP-TOPO-003`
- `FP-GEO-001`
- `FP-GEO-002`
- `FP-ROOM-001`
- `FP-ROOM-002`
- `FP-MAT-001`
- `FP-MAT-002`

Site/compliance-regler (`FP-SITE-*`) må i P0 returnere `review_required`, hvis de ikke kan kobles sikkert til eksisterende rule-engine input.

---

## 21. Acceptance Criteria For First Large Release

Feature can be considered first-release complete when:

- A user can generate an initial 1-2 level residential floor plan.
- A user can drag walls, doors, windows and fixtures.
- The model remains structured after edits.
- Invalid topology is detected and visible.
- Undo/redo works through command history.
- A formal verification can be submitted server-side.
- Verification returns clear findings and readiness status.
- SVG/PDF export uses the same model.
- The model includes assembly/material fields even if many are null.
- A material basis summary can report geometry-only quantities and missing data.
- AI usage is limited to generation, text command parsing and explanation.
- No compliance truth lives in UI.
- No direct Supabase writes occur outside repositories.
- P0 verification rules have deterministic unit tests.
- Drag and AI text command for the same intent produce equivalent command pipeline outcomes.
- Formal verification snapshot is reproducible from the same input hash.

---

## 22. Key Risks

### Risk 1: Editor Becomes Graphic State

Mitigation:

- domain model first
- commands only
- renderer is disposable

### Risk 2: Topology Complexity Explodes

Mitigation:

- start with orthogonal walls
- define allowed operations narrowly
- require manual/review state for complex geometry

### Risk 3: AI Produces Invalid Plans

Mitigation:

- AI returns intent/constraints
- deterministic generator constructs geometry
- Zod validation and degraded state

### Risk 4: Myndighedssprog Bliver For Stærkt

Mitigation:

- use readiness language
- never "godkendt"
- store documentation gaps

### Risk 5: Material Calculation Requires Redesign

Mitigation:

- wall/opening/room assemblies from v1
- material basis summary from v1
- no pure SVG geometry

---

## 23. Arkitekturbeslutninger Og Udskudte Spørgsmål

### 23.1 Besluttet Default

| Spørgsmål | Default |
| --- | --- |
| Første editor-renderer | Native SVG |
| Relation til `design_iterations` | Separat `floor_plan_iterations` med reference til aktiv design iteration |
| Room persistence | Rooms er derived fra walls, men persisteres som reconciled snapshot med stabile IDs |
| Multi-level | 1-2 niveauer med simple trapper i første store release |
| Product catalogs | Minimal project-local snapshot |
| Assemblies | Project-local snapshot i v1, global catalog senere |
| BR18 scope | Sikre deterministic checks som facts, usikre forhold som `review_required` |

### 23.2 Stadig Åbent Til Architecture Review

1. Skal non-orthogonal walls understøttes i første store release eller gemmes til v1.5?
2. Skal formal verification altid oprette ny snapshot, eller genbruge seneste snapshot ved identisk input hash?
3. Skal AI initial layout-generatoren producere room graph constraints eller færdige wall candidates?
4. Skal project-local assemblies kunne redigeres af brugeren i v1, eller kun vælges fra presets?
5. Skal eksport til myndighedspakke kræve `TECHNICAL_REVIEW` eller kan `CONCEPT_DRAFT` eksporteres med tydeligt stempel?

### 23.3 Lukkede Beslutninger Før P0 (Phase 0 Decisions)

Følgende fem beslutninger lukkes her, fordi de er billige at afgøre nu og dyre at
opdage under implementering. De er normative for P0, medmindre architecture review
eksplicit omgør dem.

#### 23.3.1 Geometri-Algoritme Og -Bibliotek

`src/domain/floor-plan/` og `src/domain/geometry/` bruger **egen pure 2D-geometri i
`LOCAL_METER`**, ikke JSTS.

- Rumdetektion sker som **planar subdivision på vægge-centerline-grafen** (half-edge /
  cykeldetektion), ikke som boolean polygon-ops.
- Areal beregnes med shoelace, perimeter som segmentsum, point-in-polygon som ray
  casting. Alt deterministisk pure TypeScript.
- JSTS forbliver **kun** i `src/domain/drawing/` til EPSG:25832 site-geometri
  (jf. [geometry-engine.ts](../../../src/domain/drawing/geometry-engine.ts)). Floor-plan
  importerer ikke JSTS i hot path (drag/live validation, 0 tokens, <50 ms-target).
- Ikke-ortogonal geometri markeres `review_required` (jf. §8.1) frem for at trække en
  tung robust-geometri-afhængighed ind i v1.

**Begrundelse:** half-edge cykeldetektion på ortogonale vægge er det rigtige værktøj til
rumudledning; JSTS' styrke (robuste boolean-ops på vilkårlige polygoner i 25832) løser
ikke editor-problemet og er for tung til hot path.

#### 23.3.2 Snapshot Er Canonical, Commands Er Audit

- `floor_plan_iterations.floor_plan_json` (valideret snapshot) er **eneste source of
  truth** ved restore. `floor_plan_commands` er en **append-only audit/replay-log** og
  bruges ikke som genskabelseskilde i v1.
- Undo/redo er en **in-memory snapshot-stak i editoren**, ikke replay af persisterede
  commands. Ved konflikt mellem snapshot og command-log vinder snapshot.
- Hver accepteret command persisteres efter deterministic apply sammen med den nye
  snapshot i samme logiske skrivning, så `model_hash` altid matcher seneste command.

**Begrundelse:** to sandheder (snapshot + replay) er en kendt kilde til divergens.
Event-sourcing-replay som autoritativ restore er ude af scope for v1.

#### 23.3.3 Kanonisk Serialisering Og Hash

Reproducerbar `model_hash` / `inputHash` (jf. §10.6, §12, §21) kræver en fastlagt
kanonisk serialisering. P0 leverer en domain-helper `canonicalFloorPlanJson()`:

- objekt-nøgler sorteres leksikografisk
- alle tal afrundes til **3 decimaler (1 mm)** og `-0` normaliseres til `0`
- array-rækkefølge **bevares** (koordinat-/vertex-arrays må ikke omsorteres); engines
  holder entity-arrays (vægge, rum, åbninger) sorteret efter `id`, så hash er
  insertion-order-invariant uden at ødelægge geometri
- hash = SHA-256 over den kanoniske JSON-streng (via `crypto.subtle`, portabelt til
  Cloudflare Workers og Bun)

Samme helper bruges til både `model_hash` (model) og `inputHash` (verification input).
Ingen ad hoc-afrunding må indgå i hash-stien.

**Begrundelse:** acceptkriteriet "verification snapshot reproducerbar fra samme input
hash" (§21) er ikke opnåeligt uden dette.

#### 23.3.4 Delt Geometri-Flade Og Footprint-Transform-Ejer

`src/domain/geometry/` er den fælles lavere-niveau-flade og ejer:

- `geometry-2d.types.ts`: `Point2D`, `Line2D`, `Polygon2D`, `Segment2D`.
- `local-transform.ts`: `LOCAL_METER` ↔ `EPSG:25832` via `FloorPlanTransform`
  (rotation om `origin25832` + translation). Round-trip skal være deterministisk.
- `polygon-ops.ts`: shoelace-areal, perimeter, point-in-polygon, segment-afstand.

Cross-domain footprint-checken (`FP-GEO-003`) ejes af **`verify-floor-plan.service.ts`**:
servicen transformerer floor-plan udvendige vægge til EPSG:25832 GeoJSON via
`local-transform.ts` og kalder derefter eksisterende
[geometry-engine.ts](../../../src/domain/drawing/geometry-engine.ts)
(`polygonOverlapAreaM2` / `distanceToNearestBoundaryM`). Hverken `domain/drawing` eller
`domain/floor-plan` importerer hinanden — servicen orkestrerer (jf. §24.5).

`ElementSourceMeta` justeres til samme form som eksisterende
`LayerSourceMeta` (`source`, `confidence`, `fetchedAt`, `requiresReview`) for konsistens.

#### 23.3.5 Iteration-Kardinalitet Og Active-Invariant

- `floor_plan_iterations` er **N:1 til `design_iterations`**: én design-iteration kan have
  flere plantegningsversioner. `design_iteration_id` er **nullable** — generering kræver
  ikke en eksisterende design-iteration.
- **Præcis én aktiv plantegning pr. projekt** i v1, håndhævet med et partial unique index:
  `UNIQUE (project_id) WHERE is_active`. Aktivering af en ny version deaktiverer den
  forrige i samme transaktion.

**Begrundelse:** uden index-håndhævet invariant kan to versioner stå som `is_active`, og
UI/verification/API kan ikke entydigt vælge den aktive model.

---

## 24. Architecture Compliance Amendments

Denne feature krydser compliance, AI, persistence, project state og fremtidig API-retning. Derfor skal nedenstående være eksplicit del af implementation readiness, før P0 bygges.

### 24.1 Gatekeeper Protocol Mapping

| Gatekeeper-spørgsmål | Svar for denne feature |
| --- | --- |
| Hvilken boundary krydses? | UI/editor input, AI responses, Supabase JSONB, verification snapshots, SVG/PDF storage og trusted project/site data. |
| Hvilket schema validerer data? | `FloorPlanDocumentSchema`, `FloorPlanCommandSchema`, `FloorPlanVerificationResultSchema`, `MaterialBasisSummarySchema` og repository decoders for persisted JSONB. |
| Hvor lever business logic? | `src/domain/floor-plan/` og shared pure geometry i `src/domain/geometry/`. |
| Hvilken application service ejer workflowet? | `generate-floor-plan.service.ts`, `apply-floor-plan-command.service.ts`, `verify-floor-plan.service.ts`, `export-floor-plan.service.ts`. |
| Hvilken adapter håndterer Supabase/Datafordeler/AI/storage? | Supabase repositories, AI adapters under `src/integrations/ai/`, storage/export repository og existing trusted site/compliance services. |
| Hvordan forhindres UI i at eje domain logic? | UI må kun producere candidate commands og vise render output. Commands, topology, verification og persistence ejes af services/domain. |
| Hvilke tests beviser boundary og domain behavior? | Tier 1 domain tests, Tier 2 service tests med fake repositories/AI, og få Tier 3 acceptance flows for generate/edit/verify/export. |

### 24.2 Persistence Og Migration Review

De foreslåede `floor_plan_*` tabeller er arkitektonisk korrekte, men de må ikke implementeres uden architecture review og additive migrations.

Policy:

- `floor_plan_json`, `command_json`, `findings_json` og `assembly_catalog_json` må starte som JSONB.
- Alle JSONB payloads skal have `schema_version` eller tilsvarende payload version.
- Alle JSONB payloads skal valideres ved read/write boundary.
- Scalar values der bruges til filtering, API responses, readiness eller compliance-relevant decisions skal have typed columns.
- Ingen compliance-kritisk autoritet må kun ligge i JSONB.

Typed columns i v1 skal mindst inkludere:

- verification status
- material basis readiness
- gross/net/footprint area
- level/room/opening counts
- exterior/interior/total wall lengths
- model/input hashes
- active/version metadata

### 24.3 AI Hard Stop Gate

Før AI genererer initial layout, room program eller designretning der kan give brugeren tillid til feasibility, skal serveren:

1. hente trusted project/site data
2. assemble rule-engine input hvor muligt
3. køre eller genbruge frisk rule-engine/Hard Stop-evaluering
4. returnere blockers og næste handling, før optimistisk designoutput

AI command parsing må godt oversætte en brugerkommando til en command-kandidat uden fuld compliance-run, men commanden må ikke præsenteres som realistisk/myndighedsnær før deterministic apply og relevant verification er kørt.

### 24.4 UI Boundary For Hit Testing Og Snap

`editor-hit-testing.ts` og `snap-engine.ts` må kun ligge i `src/lib/floor-plan/`, hvis de er pure helpers mod domain geometry.

Tilladt:

- point-to-wall distance
- snap candidate scoring
- bounding box queries
- local meter coordinate transforms

Ikke tilladt i pure helpers:

- DOM reads
- SVG element mutation
- React state
- browser event parsing

Browser pointer mapping og component event handling skal blive i `src/components/floor-plan/` eller en UI hook.

### 24.5 Import Direction Og Shared Geometry

`domain/drawing` og `domain/floor-plan` må ikke importere hinanden direkte.

Fælles typer og beregninger skal ligge lavere:

```txt
src/domain/geometry/
  -> imported by domain/drawing
  -> imported by domain/floor-plan
```

Dette reducerer risikoen for circular imports, når plantegning senere skal placeres i beliggenhedsplan, eksporteres til myndighedstegning eller bruges som materialebasis.

### 24.6 Typed Principal Og Future API

Application services må ikke antage, at alle requests kommer fra én interaktiv Supabase-bruger.

Service inputs skal tage en typed principal:

```ts
type FloorPlanPrincipal = {
  subjectId: string;
  subjectKind: "user" | "organization" | "api_key" | "service_account";
  projectRole: "owner" | "editor" | "viewer" | "service";
};
```

Inbound adapters oversætter Supabase session, future REST API auth eller background jobs til denne principal. Authorization checks skal ske ved service/repository boundary, ikke i React-komponenter.

### 24.7 Required Spec Corrections Before Build

Før P0 implementation bør spec'en omsættes til konkrete tickets, hvor hvert ticket markerer:

- boundary
- schema/decoder
- owning service
- repository/adapter
- test tier
- protected-file impact

Hvis en ticket berører compliance/rule-engine semantics, AI gates, persistence schema eller project restore/sync, skal den markeres til architecture review før implementation.

---

## 25. Anbefalet Beslutning

Byg feature som en struktureret, versioneret plantegningsmodel med interaktiv editor ovenpå.

Den store første version bør være ambitiøs i brugeroplevelsen, men konservativ i domain-reglerne:

- orthogonal primary geometry først
- deterministic edits
- strict schemas
- server-side verification
- SVG/PDF export
- material basis fields fra dag ét

Det giver ArchAI et fundament, der senere kan bære både myndighedspakker, rådgiverreview, prisestimat og materialebehov uden at skulle bygges om fra en grafisk prototype.
