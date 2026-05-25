# Beliggenhedsplan Generator - Datagrundlag, Beslutningsmodel Og Implementeringsplan

Dato: 2026-05-25  
Scope: Automatisk generering af beliggenhedsplan/situationsplan svarende til bilag 8 og 9 i den analyserede Byg og Miljo-sag.  
Formaal: Beskrive hvad ArchAI har i dag, hvilke datapunkter der mangler, hvordan datakvalitet skal vurderes, og hvilken teknisk loesning der bedst kan generere myndighedsegnede tegninger.

Denne plan er skrevet til arkitektur-review. Den foreslaar ikke, at ArchAI skal erstatte en landinspektoer i alle sager. Den foreslaar en pipeline, hvor ArchAI kan generere en korrekt, deterministisk tegning naar datagrundlaget er staerkt nok, og ellers tydeligt markerer review- eller opmaalingsbehov.

---

## 1. Target Output

ArchAI skal kunne generere en beliggenhedsplan i samme klasse som PDF-bilag 8/9:

- Maalfast plan i fast maalestok, fx `1:250`.
- Parcel/skel med matrikelnummer og nabo-matrikler.
- Nyt byggeri med korrekt footprint, rotation, maal og afstande.
- Eksisterende bygninger, skure, garager, hegn, haek, overkoersel og faste objekter.
- Byggelinjer fra BR18, lokalplan og servitutter.
- Terraenkoter i DVR90 og angivelse af sokkelkote/gulvkote.
- Forsyninger, kloak, bronde, regnvand/spildevand, vand, el, gas.
- Disponeringer som parkering, affald, jordvarmefelt og friholdelsesarealer.
- Tegningshoved, nordpil, signaturforklaring, kildeangivelse og revisionsdata.

Output skal ikke genereres som AI-billede. Selve tegningen skal vaere deterministisk vektorgrafik, hvor alle koordinater, afstande, labels og signaturer stammer fra struktureret data.

---

## 2. Status I Koden I Dag

Dette er baseret paa den aktuelle kode, ikke kun integrationsdokumentet.

| Omraade | Status i kode | Relevant kode | Vurdering |
| --- | --- | --- | --- |
| Parcelpolygon | MAT WFS henter `Jordstykke_Gaeldende` og beregner areal, centroid og bbox | `src/integrations/mat/geometry.ts`, `src/lib/map-proxy.ts` | Godt fundament, men output gemmer ikke nok tegningslag som skel-segmenter, vejskel og kildekvalitet |
| Raa parcelgeometri | Caches i `address_analysis.jordstykke_polygon` | `src/integrations/cache/client.ts` | Brugbar, men CRS skal gemmes eksplicit sammen med geometrien |
| Kortpreview | MAT WMS og skaermkort tiles | `src/lib/map-proxy.ts`, `src/hooks/useParcelData.ts` | Kun visuel baggrund; maa ikke bruges som geometrisk sandhed |
| Designplacering | `DesignPlacement` har footprint, centroid, rotation, hoejde, afstand og overlap | `src/types/project-state.ts`, `src/integrations/supabase/repositories/design-iterations.repository.ts` | Rigtigt domaenebegreb, men korteditoren udfylder ikke fuld geometri i dag |
| Korteditor | Viser parcel og et kvadrat-footprint ud fra areal | `src/components/cockpit/MatrikelMap.tsx` | Prototype. Mangler aegte footprint, polygonafstande, overlap og tegningsdata |
| Skelafstand | Rule engine kan bruge `minDistanceToBoundaryM` | `src/lib/rule-engine/input-assembler.ts`, `src/lib/rule-engine/rules/calculations.ts` | Godt endpoint i regelmotoren, men beregningen er ikke myndighedsgrade endnu |
| Terraen/DHM | DHM client kan hente GeoTIFF og udlede kotepunkter | `src/integrations/sdfi/dhm-client.ts` | Teknisk model findes, men live er feature-flagget/mock som default |
| GeoDanmark | Service findes for nabobygninger og vej | `src/integrations/geodanmark/client.ts` | `IS_MOCK=true`; returnerer ikke brugbare bygnings- eller vejgeometrier endnu |
| Plandata | Henter zone, delomraade, byggefelt og kloakopland som status | `src/integrations/plandata/client.ts` | Mangler at returnere tegnbare geometrier for byggefelt/kloakopland |
| Servitutter | Mock/semiautomatisk model | `src/integrations/tinglysning/client.ts`, `src/lib/analysis/servitut-step.ts` | Mangler geometri og juridisk kildekvalitet for byggelinjer/vejret |

Vigtig teknisk observation: `MatrikelMap` konstruerer i dag et kvadrat ud fra `buildingArea` og centerpunkt. Det er ikke en myndighedsegnet bygningspolygon. Derudover opdateres centroid ved flytning, men ikke det fulde `footprintGeojson`, beregnet skelafstand eller overlap.

Vigtig CRS-observation: MAT WFS bruges i EPSG:25832, mens andre dele af systemet antager WGS84. Tegningsgeneratoren skal have en eksplicit CRS-kontrakt. Alle afstande, offsets og buffers skal beregnes i EPSG:25832 eller tilsvarende meterbaseret projektion.

---

## 3. Myndighedsrelevant Datamodel

Der boer indfoeres en samlet inputmodel for beliggenhedsplanen. Den maa ikke blandes direkte sammen med UI-state eller compliance JSONB.

```ts
type BeliggenhedsplanInput = {
  crs: "EPSG:25832";
  parcel: ParcelLayer;
  survey: SurveyLayer | null;
  existing: ExistingFeaturesLayer;
  proposed: ProposedBuildingLayer;
  constraints: ConstraintLayer[];
  utilities: UtilityLayer[];
  siteUse: SiteUseLayer[];
  terrain: TerrainLayer | null;
  metadata: DrawingMetadata;
  quality: DrawingSourceQualityReport;
};
```

Alle lag skal have kilde, friskhed, confidence og om data er `confirmed`, `estimated`, `manual`, `uploaded`, `registry` eller `derived`.

---

## 4. Datapunkter Der Er Nodvendige

### 4.1 Parcel, Skel Og Matrikel

| Datapunkt | Type | Obligatorisk for myndighedstegning | Mulig kilde | Status i ArchAI |
| --- | --- | --- | --- | --- |
| `parcel.id_lokalId` | string | Ja | MAT | Delvist live via BBR/MAT |
| `parcel.bfeNr` | string | Ja | EBR | Live |
| `parcel.matrikelnummer` | string | Ja | DAR/MAT | Live |
| `parcel.ejerlavskode` | number | Ja | DAR/MAT | Live |
| `parcel.ejerlavsnavn` | string | Ja | MAT/DAR | Delvist/mangler som tegningsfelt |
| `parcel.polygon25832` | Polygon/MultiPolygon | Ja | MAT WFS eller landinspektoer | Live via MAT WFS |
| `parcel.areaRegisteredM2` | number | Ja | MAT | Live |
| `parcel.areaGeometryM2` | number | Ja | Beregnet fra polygon | Live beregnet |
| `parcel.areaDiscrepancyM2` | number | Ja | Beregnet | Live beregnet |
| `parcel.boundarySegments[]` | segmenter med start/slut/type | Ja | Afledt fra polygon + vejdata | Mangler |
| `parcel.roadBoundarySegments[]` | segmenter | Ja hvis vejskel vises | MAT + GeoDanmark vej | Mangler |
| `parcel.neighborBoundarySegments[]` | segmenter | Ja | Afledt | Mangler |
| `parcel.boundaryPointMarkers[]` | punkter | Ja hvis opmaalt | Landinspektoer/upload | Mangler |
| `parcel.boundaryUncertainty` | enum | Ja | Afledt/landinspektoer | Mangler |
| `parcel.neighborParcels[]` | matrikelnummer + polygon/labelpunkt | Ja | MAT WFS bbox | Mangler |
| `parcel.labelPoint25832` | point | Ja | Beregnet | Mangler |

Krav: MAT parcelpolygon kan bruges til automatisk kladde, men hvis skel er usikkert, eller byggeri ligger taet paa skel/byggelinje, skal survey/landinspektoer kunne overstyre.

### 4.2 Vej, Vejskel Og Vejmidte

| Datapunkt | Type | Obligatorisk | Mulig kilde | Status |
| --- | --- | --- | --- | --- |
| `road.name` | string | Ja | DAR/GeoDanmark | Adresse har vejnavn, vejgeometri mangler |
| `road.centerline25832` | LineString | Ja hvis byggelinje fra vejmidte | GeoDanmark Vejmidte / survey | GeoDanmark mock |
| `road.roadBoundary25832` | LineString | Ja hvis afstand fra vejskel | MAT + vejskelklassifikation | Mangler |
| `road.drivewayPolygon25832` | Polygon | Ja hvis overkoersel vises | Survey/GeoDanmark/manual | Mangler |
| `road.drivewayWidthM` | number | Ja hvis overkoersel vises | Beregnet/opmaalt | Mangler |
| `road.fixedObjects[]` | lysmast, kantsten, skilte | Ikke altid, men ofte nyttigt | Survey/GeoDanmark/manual | Mangler |

Bilag 8/9 viser blandt andet `Byledet`, overkoersel og lysmast. Den type objekter kan sjaeldent udledes sikkert fra BBR/MAT alene.

### 4.3 Terraen, Koter Og DVR90

| Datapunkt | Type | Obligatorisk | Mulig kilde | Status |
| --- | --- | --- | --- | --- |
| `terrain.verticalDatum` | `"DVR90"` | Ja naar koter vises | Survey/DHM metadata | Mangler som eksplicit felt |
| `terrain.points[]` | `{ x, y, z, label, source }` | Ja | Landinspektoer eller DHM | DHM model findes, survey mangler |
| `terrain.roadMidPoints[]` | kote ved vejmidte | Ja hvis koter maales fra vej | Survey | Mangler |
| `terrain.boundaryPoints[]` | kote ved skel | Ja for myndighedsnaer plan | Survey/DHM | Mangler |
| `terrain.buildingCornerPoints[]` | kote ved husets hjoerner | Ja | Survey/generator | Mangler |
| `terrain.proposedTerrainAroundBuildingM` | number/points | Ja ved sokkel/terraenangivelse | Projektering | Mangler |
| `terrain.slopePercent` | number | Nej, men nyttigt | DHM | Findes som model |
| `terrain.lowPointM` | number | Nej, men nyttigt | DHM | Findes som model |
| `terrain.contours[]` | LineString[] | Valgfri | DHM/survey | Mangler |

Myndighedsniveau kraever typisk ikke bare en generel DHM-risiko. Det kraever faktiske koteangivelser paa relevante punkter, isaer hvis der er skraanende terraen, sokkelkote, kaelder, regnvand eller jordvarme.

### 4.4 Eksisterende Bygninger Og Objekter

| Datapunkt | Type | Obligatorisk | Mulig kilde | Status |
| --- | --- | --- | --- | --- |
| `existing.buildings[].footprint25832` | Polygon | Ja hvis eksisterende bebyggelse vises | GeoDanmark/BBR geometri/survey | Mangler |
| `existing.buildings[].bbrId` | string | Ja hvis BBR-koblet | BBR | BBR IDs findes |
| `existing.buildings[].usageCode` | string | Ja | BBR | Live |
| `existing.buildings[].areaM2` | number | Ja | BBR/geometri | BBR areal live, geometri mangler |
| `existing.buildings[].sokkelKoteM` | number | Hvis vist | Survey | Mangler |
| `existing.secondaryStructures[]` | skur, garage, carport | Ja hvis relevante | GeoDanmark/survey/manual | Mangler |
| `existing.fences[]` | LineString + type | Nej, men bilag viser det | Survey/manual | Mangler |
| `existing.hedges[]` | LineString | Nej, men bilag viser det | Survey/manual | Mangler |
| `existing.pavedAreas[]` | Polygon | Valgfri | Survey/manual | Mangler |
| `existing.notes[]` | tekstnoter | Ja ved usikre forhold | Survey/manual | Mangler |

BBR giver arealer og anvendelse, men ikke nok geometri til tegningen. GeoDanmark skal levere bygningspolygoner, eller brugeren skal uploade/saette dem.

### 4.5 Nyt Byggeri

| Datapunkt | Type | Obligatorisk | Mulig kilde | Status |
| --- | --- | --- | --- | --- |
| `proposed.primaryBuilding.footprint25832` | Polygon | Ja | Designgenerator/korteditor/CAD | Mangler som korrekt persistet geometri |
| `proposed.primaryBuilding.footprintWgs84` | Polygon | Ja til UI | Afledt | Delvist i model |
| `proposed.primaryBuilding.rotationDeg` | number | Ja | Korteditor/design | Findes |
| `proposed.primaryBuilding.footprintAreaM2` | number | Ja | Geometri | Findes i model, ikke altid beregnet |
| `proposed.primaryBuilding.floorAreaM2` | number | Ja | Byggeoenske/design | Delvist |
| `proposed.primaryBuilding.storeys` | number | Ja | Byggeoenske/design | Findes |
| `proposed.primaryBuilding.heightM` | number | Ja ved hoejdekrav | Design/snit | Delvist/heuristik |
| `proposed.primaryBuilding.sokkelKoteM` | number | Ja for bilag 8/9-niveau | Projektering/survey | Mangler |
| `proposed.primaryBuilding.finishedFloorKoteM` | number | Ja | Projektering/survey | Mangler |
| `proposed.primaryBuilding.terrainOffsetM` | number | Ja hvis angivet | Projektering | Mangler |
| `proposed.primaryBuilding.dimensions[]` | maal-linjer | Ja | Geometri | Mangler |
| `proposed.secondaryBuildings[]` | fremtidig carport/garage | Hvis vist | Bruger/design | Mangler |
| `proposed.buildingLabels[]` | labelpunkter og tekst | Ja | Afledt | Mangler |

Nuvaerende `MatrikelMap` skal aendres fra kvadratisk proxy til aegte footprint-model. Footprint kan komme fra parametisk design, uploadet CAD/DXF eller manuel polygon-editor.

### 4.6 Afstande, Maal Og Kontrolgeometri

| Datapunkt | Type | Obligatorisk | Kilde | Status |
| --- | --- | --- | --- | --- |
| `measurements.distanceToBoundary[]` | linje + meter + target | Ja | Beregnet | Delvist som enkelt min-afstand |
| `measurements.distanceToRoadBoundary[]` | linje + meter | Ja hvis vejskel relevant | Beregnet | Mangler |
| `measurements.distanceToRoadCenterline[]` | linje + meter | Ja ved vejmidte-deklaration | Beregnet | Mangler |
| `measurements.distanceToNeighborBuildings[]` | linje + meter | Ja ved brand/skel/nabo | GeoDanmark/survey | Mangler |
| `measurements.buildingDimensions[]` | maal-linjer paa bygning | Ja | Geometri | Mangler |
| `measurements.parcelDimensions[]` | skel-laengder | Ofte ja | MAT/survey | Mangler |
| `measurements.setbackViolations[]` | typed violations | Ja hvis konflikt | Beregnet | Delvist i rule engine |

En myndighedstegning skal kunne vise mere end "min skelafstand = 2.8 m". Den skal kunne placere selve maal-linjen paa tegningen.

### 4.7 Byggelinjer Og Juridiske Linjer

| Datapunkt | Type | Obligatorisk | Kilde | Status |
| --- | --- | --- | --- | --- |
| `constraints.br18SetbackLines[]` | LineString/Polygon buffer | Ja | Afledt fra skel | Mangler |
| `constraints.localplanBuildingLines[]` | geometri + regeltekst | Ja hvis lokalplan har krav | Plandata/lokalplan PDF/manual | Delvist som fritekst |
| `constraints.roadBuildingLine[]` | buffer fra vejskel | Ja ved vejskelkrav | Vejskel + regel | Mangler |
| `constraints.roadCenterlineBuildingLine[]` | buffer fra vejmidte | Ja ved deklaration | Vejmidte + servitut | Mangler |
| `constraints.servitutLines[]` | geometri + dokumentId | Ja hvis servitut relevant | Tingbog/upload/manual | Mangler |
| `constraints.buildingFieldPolygon[]` | Polygon | Ja hvis byggefelt findes | Plandata | Status findes, geometri mangler |
| `constraints.constraintLabels[]` | tekst + placering | Ja | Afledt | Mangler |

Plandata og lokalplan-PDF-udtraek er ikke nok. Tegningsgeneratoren skal have konkrete linjer/polygoner, ikke kun tekst om krav.

### 4.8 Forsyning, Kloak Og Ledninger

| Datapunkt | Type | Obligatorisk | Kilde | Status |
| --- | --- | --- | --- | --- |
| `utilities.waterConnectionPoint` | point | Ja hvis vist | Forsyning/survey/manual | Mangler |
| `utilities.sewerConnectionPoint` | point | Ja | Kloaktegning/survey/manual | Mangler |
| `utilities.electricConnectionPoint` | point | Ja hvis vist | Forsyning/manual | Mangler |
| `utilities.gasConnectionPoint` | point | Hvis relevant | Forsyning/manual | Mangler |
| `utilities.rainwaterLines[]` | LineString | Ja hvis kloakplan vises | Kloakprojekt | Mangler |
| `utilities.wastewaterLines[]` | LineString | Ja | Kloakprojekt | Mangler |
| `utilities.drainageLines[]` | LineString | Hvis relevant | Kloakprojekt | Mangler |
| `utilities.wells[]` | point + type + diameter + kote | Ja hvis vist | Kloakprojekt/survey | Mangler |
| `utilities.cleanout[]` | point | Hvis relevant | Kloakprojekt | Mangler |
| `utilities.ratBarrier` | point | Hvis relevant | Kloakprojekt | Mangler |
| `utilities.lineStyles` | enum/signatur | Ja | Tegningsstandard | Mangler |

Offentlige registre kan give kloakopland/status, men sjaeldent stikledningernes praecise placering. For bilag 8/9-niveau skal disse enten tegnes manuelt, uploades fra kloakprojekt eller genereres som forslag med tydelig reviewstatus.

### 4.9 Ubebyggede Arealer Og Disponering

| Datapunkt | Type | Obligatorisk | Kilde | Status |
| --- | --- | --- | --- | --- |
| `siteUse.parkingSpaces[]` | Polygon + count | Ja hvis vist | Design/manual | Mangler |
| `siteUse.wasteSortingArea` | Polygon/point | Ja hvis vist | Design/manual | Mangler |
| `siteUse.drivewayArea` | Polygon | Ja hvis vist | Design/manual/survey | Mangler |
| `siteUse.heatPumpOutdoorUnit` | point | Hvis relevant | Design/manual | Mangler |
| `siteUse.geothermalField` | Polygon | Ja ved jordvarme | Varmepumpeleverandoer/design | Mangler |
| `siteUse.geothermalKeepClearArea` | Polygon + note | Ja ved jordvarme | Design/manual | Mangler |
| `siteUse.terraces[]` | Polygon | Hvis vist | Design | Mangler |
| `siteUse.futureStructures[]` | Polygon + status | Hvis vist | Bruger/design | Mangler |

Bilag 8/9 viser jordvarmefelt, parkering og affaldssortering. Det er design-/projekteringsdata, ikke registerdata.

### 4.10 Tegningsmetadata

| Datapunkt | Type | Obligatorisk | Kilde | Status |
| --- | --- | --- | --- | --- |
| `drawing.title` | string | Ja | System | Mangler |
| `drawing.address` | string | Ja | DAR | Live |
| `drawing.matrikel` | string | Ja | DAR/MAT | Live |
| `drawing.bygherre` | string | Ja | Project repository (`projects.owner_name` eller tilsvarende felt) | Mangler |
| `drawing.sagNr` | string | Ja | Project repository (`projects.id` eller ekstern sagsnr) | Mangler/delvist |
| `drawing.revision` | string | Ja | System | Mangler |
| `drawing.date` | date | Ja | System | Mangler |
| `drawing.scale` | enum/number | Ja | Renderer | Mangler |
| `drawing.paperSize` | enum | Ja | Renderer | Mangler |
| `drawing.northArrow` | geometry/symbol | Ja | Renderer | Mangler |
| `drawing.legendItems[]` | symbol + label | Ja | Renderer | Mangler |
| `drawing.sourceList[]` | kilde + dato + confidence | Ja | SourceQuality | Mangler |
| `drawing.disclaimer` | string | Ja ved ikke-survey | DecisionEngine | Mangler |

---

## 5. Kildehierarki

For hver geometri og hvert tal skal generatoren kende kilde og prioritet.

| Prioritet | Kilde | Maa bruges til myndighedsnaer tegning | Kommentar |
| --- | --- | --- | --- |
| 1 | Landinspektoer/survey upload | Ja | Hoejeste autoritet for skel, koter og faste objekter |
| 2 | Uploadet CAD/DXF/GeoJSON fra raadgiver | Ja efter validering | Skal CRS-valideres |
| 3 | Officielle vektordata fra MAT/GeoDanmark/Plandata | Ja til kladde/review | Ikke altid nok ved taet placering |
| 4 | Projekteringsdata fra ArchAI/designmodel | Ja for foreslaaet byggeri | Skal vaere struktureret og reviewet |
| 5 | Manuel brugerinput | Kun med review | Skal markeres |
| 6 | WMS/WMTS/rasterkort | Nej som geometri | Kun baggrund/visuel reference |
| 7 | AI-billede | Nej | Maa ikke bruges til maalfast tegning |

---

## 6. Beslutningsmodel

Der skal bygges en `DrawingReadinessDecisionEngine`, som klassificerer hvert projekt foer eksport.

```ts
type DrawingReadinessStatus =
  | "AUTO_DRAFT"
  | "AUTO_REVIEW"
  | "SURVEY_REQUIRED"
  | "BLOCKED_MISSING_CORE_DATA";

type DrawingReadinessDecision = {
  status: DrawingReadinessStatus;
  reasons: Array<{
    code: string;
    severity: "info" | "warning" | "blocking";
    message: string;
    affectedLayer: string;
  }>;
  missingDataPoints: string[];
  reviewRequiredBy: Array<"landinspektoer" | "arkitekt" | "ingenioer" | "kloakmester" | "myndighed">;
};
```

### 6.1 AUTO_DRAFT

ArchAI maa generere en foreloebig tegning naar:

- Adresse, kommune og matrikel findes.
- Parcelpolygon findes fra MAT WFS.
- Grundareal findes.
- Foreslaaet footprint findes eller kan genereres.
- Tegningen tydeligt markeres som foreloebig.

Output: Brugbar til tidlig dialog, placering, koncept, pre-check og kundemoede.

### 6.2 AUTO_REVIEW

ArchAI maa generere en myndighedsnaer tegning til raadgiverreview naar:

- Parcelpolygon har eksplicit CRS og rimelig arealoverensstemmelse med registreret areal.
- Foreslaaet footprint er en aegte polygon i EPSG:25832.
- Afstande til skel og vej er beregnet i meterbaseret CRS.
- Byggelinjer er beregnet som geometri.
- Koter er enten survey-uploadet eller DHM markeret med lavere confidence.
- Eksisterende objekter og forsyninger er enten importeret, tegnet manuelt eller eksplicit markeret som ikke vist.
- Ingen kritisk data er `unknown`.

Output: Tegning kan reviewes af arkitekt/raadgiver og potentielt bruges som bilag efter faglig godkendelse.

### 6.3 SURVEY_REQUIRED

Landinspektoer/survey kraeves naar en eller flere betingelser er sande:

- Parcelpolygon mangler eller har flere kandidater.
- Arealafvigelse mellem MAT-registreret areal og polygonareal overstiger en konfigureret graense.
- Bygning ligger taettere end `krav + safetyMarginM` til skel, vejskel, vejmidte eller byggelinje.
- Naboobjekt ligger taet paa eller over formodet skel.
- Planen skal vise koter, men der findes ikke opmaalte DVR90-punkter.
- Terraen er stejlt, lavpunkt/bluespot er kritisk, eller sokkelkote er afgoerende.
- Servitut/deklaration refererer til vejmidte, byggelinje eller privatretlig linje uden geometri.
- Kommunen eller raadgiver kraever opmaalt beliggenhedsplan.
- Tegningen skal bruges til afsaetning eller udfoerelse.

Foreslaaet default:

```ts
const DRAWING_QUALITY_THRESHOLDS = {
  setbackSafetyMarginM: 0.5,
  maxParcelAreaDiscrepancyPct: 1.0,
  maxParcelAreaDiscrepancyM2: 10,
  minTerrainSourceForFinal: "survey",
};
```

### 6.4 BLOCKED_MISSING_CORE_DATA

Eksport blokeres naar:

- Ingen parcelpolygon.
- Ingen foreslaaet bygningsplacering.
- CRS kan ikke bestemmes.
- Ingen tegningsmetadata/adresse.
- Geometri er ugyldig eller selvkrydsende.

---

## 7. Bedst Mulige Tekniske Loesning

### 7.1 Princip

Brug en deterministisk geometri- og vektorrendering. Ikke ren billedgenerering.

- LLM maa bruges til at udtraekke fritekstregler, foreslaa labels og klassificere servituttekst.
- LLM maa ikke placere linjer, maal, bygninger eller koter i den endelige tegning.
- Output skal kunne regenereres identisk fra samme input.

### 7.2 Foreslaaet Modulstruktur

CLAUDE.md definerer tre distinkte lag, som tegningssystemet skal respektere:

- `src/domain/drawing/` — domain core: pure TypeScript, ingen adapters, ingen netvaerk, ingen Supabase
- `src/services/drawing/` — application services: orkestrerer use cases via ports, maa kalde repositories og adapters
- `src/lib/drawing/` — pure rendering helpers og utiliteter (ingen sideeffekter, ingen netvaerk)
- `src/integrations/*/drawing-layers.ts` — adapters mod eksterne registre, validerer indgaaende data med Zod

```txt
src/domain/drawing/
  beliggenhedsplan.types.ts       # BeliggenhedsplanInput + alle undertyper
  beliggenhedsplan.schemas.ts     # Zod schemas til boundary-validering ved hvert datakryds
  ports.ts                        # Port-interfaces for geometry sources, export store, survey upload
  source-quality.ts
  decision-engine.ts
  geometry-engine.ts
  drawing-model.ts
  drawing-model.schemas.ts

src/services/drawing/
  assemble-beliggenhedsplan.service.ts    # orkestrerer MAT, GeoDanmark, Plandata, survey via ports
  export-drawing.service.ts              # orkestrerer SVG-render, PDF-eksport, reviewstatus og storage

src/lib/drawing/
  render-svg.ts
  render-pdf.ts
  render-dxf.ts              # senere
  label-placement.ts
  drawing-symbols.ts

src/integrations/geodanmark/
  drawing-layers.ts

src/integrations/plandata/
  drawing-layers.ts

src/integrations/survey/
  upload-decoder.ts
  survey.schemas.ts
```

### 7.3 Geometry Engine

Opgaver:

- Normaliser alle koordinater til EPSG:25832.
- Valider polygoner og linjer.
- Split parcelring i skel-segmenter.
- Klassificer vejskel ved intersection/nearest med vejmidte/vejflade.
- Beregn BR18 2,5 m buffers.
- Beregn lokalplan-/servitutbyggelinjer.
- Beregn afstandslinjer fra bygning til skel, vejskel, vejmidte og naboobjekter.
- Beregn overlap mellem bygning og parcel.
- Beregn labelpunkter og centroid.
- Beregn maallinjer til bygning og parcel.

Nuvaerende `src/lib/parcel-geometry.ts` er ikke nok, fordi den bruger omtrentlige WGS84-beregninger og bbox-only overlap. Den kan bevares til UI/pre-check, men myndighedsgeneratoren skal have en rigtig geometri-motor.

Foreslaaet dependency:

- `proj4` beholdes.
- Tilfoej `jsts` eller tilsvarende robust JS geometri-engine til buffer/intersection/distance.
- Alternativt kan serveren paa sigt bruge PostGIS, men det er tungere og kraever mere DB-arkitektur.

### 7.4 Drawing Model

Renderer skal ikke arbejde direkte paa registerdata. Den skal arbejde paa en faerdig tegningsmodel.

```ts
type DrawingModel = {
  page: {
    size: "A3" | "A2" | "A1";
    orientation: "landscape" | "portrait";
    scale: 250 | 500;
    units: "m";
  };
  viewport: {
    bbox25832: [number, number, number, number];
    metersPerMm: number;
  };
  layers: DrawingLayer[];
  annotations: DrawingAnnotation[];
  titleBlock: DrawingTitleBlock;
  legend: DrawingLegendItem[];
  sourceNotes: DrawingSourceNote[];
};
```

Lagtyper:

- `parcel_boundary`
- `neighbor_parcels`
- `existing_buildings`
- `proposed_buildings`
- `setback_lines`
- `building_lines`
- `terrain_points`
- `utilities`
- `site_use`
- `dimensions`
- `labels`
- `title_block`
- `legend`

### 7.5 Renderer

Foreslaaet raekkefoelge:

1. SVG som canonical render target.
2. PDF genereres fra SVG.
3. DXF eksport senere, hvis raadgivere skal kunne viderebearbejde.

Hvorfor SVG foerst:

- Laesbart og diffbart.
- Let at teste.
- Let at previewe i browser.
- Kan eksporteres til PDF.
- Perfekt til linjer, tekst, symboler og signaturforklaring.

PDF kan genereres med en server-renderer senere. Hvis dependency-valg skal holdes simpelt, kan SVG eksporteres og printes/renderes i browser foerst. For myndighedspakker boer der dog komme en server-side PDF-render.

### 7.6 Label Placement

Automatisk labelplacering skal vaere deterministisk:

- Kandidatpositioner omkring geometri.
- Collision detection mod andre labels og tegningshoved.
- Prioritet: byggelinjer, afstande, bygning, koter, forsyning, noter.
- Hvis label ikke kan placeres uden overlap, flyttes til callout med leader line.
- Hvis stadig umuligt, markeres `manualReviewRequired`.

### 7.7 Port-Interfaces

Tegningssystemet har tre primære eksterne afhengigheder der er risky, testbarhedskritiske og likely to change. Disse skal defineres som ports i `src/domain/drawing/ports.ts`:

```ts
// Kilde for geometriske tegningslag (MAT, GeoDanmark, Plandata)
interface DrawingGeometrySourcePort {
  fetchParcelLayers(matrikelId: string): Promise<ParcelLayer | null>;
  fetchNeighborBuildings(bbox25832: BBox): Promise<ExistingFeaturesLayer>;
  fetchRoadGeometry(addressId: string): Promise<RoadLayer | null>;
  fetchPlandataLayers(kommunekode: string, bbox25832: BBox): Promise<ConstraintLayer[]>;
}

// Modtager og dekoder survey-upload (landinspektoer CSV/GeoJSON)
interface SurveyUploadDecoderPort {
  decode(raw: unknown): Promise<SurveyLayer>;
}

// Persisterer og henter SVG/PDF eksport
interface DrawingExportStorePort {
  saveSvg(projectId: string, svg: string): Promise<string>;
  savePdf(projectId: string, pdf: Uint8Array): Promise<string>;
  getExport(exportId: string): Promise<DrawingExportRecord | null>;
}
```

`assemble-beliggenhedsplan.service.ts` og `export-drawing.service.ts` maa kun kalde disse interfaces — aldrig konkrete adapters direkte. Dette er det kritiske krav for Tier 2-testbarhed (fake deps, ingen netvaerk).

Konkrete adapters der implementerer portene:

- `src/integrations/geodanmark/drawing-layers.ts` → `DrawingGeometrySourcePort`
- `src/integrations/plandata/drawing-layers.ts` → `DrawingGeometrySourcePort`
- `src/integrations/survey/upload-decoder.ts` → `SurveyUploadDecoderPort`
- Supabase storage adapter (ny) → `DrawingExportStorePort`

### 7.8 Boundary-Validering Og CRS

Alle datapunkter der krydser en systemgraense skal valideres med Zod ved indgangspunktet (CLAUDE.md Rule 1). For tegningssystemet galder:

| Graense | Zod-schema | Adapter |
| --- | --- | --- |
| MAT WFS response → ParcelLayer | `ParcelLayerSchema` i `beliggenhedsplan.schemas.ts` | `geodanmark/drawing-layers.ts` |
| GeoDanmark GeoJSON → ExistingFeaturesLayer | `ExistingFeaturesLayerSchema` | `geodanmark/drawing-layers.ts` |
| Survey upload (CSV/GeoJSON) → SurveyLayer | `SurveyLayerSchema` | `survey/upload-decoder.ts` |
| Plandata WFS → ConstraintLayer[] | `ConstraintLayerSchema` | `plandata/drawing-layers.ts` |
| Server function input → ProjectId | inline Zod i server function | `createServerFn` handler |
| `drawing_sources` JSONB → typed payload | `DrawingSourcePayloadSchema` | drawing repository |

Alle geometrier i EPSG:25832 skal have `crs: "EPSG:25832"` som eksplicit felt i Zod-skemaet, saa en runtime fejl opstaar hvis koordinater kommer i forkert projektion.

### 7.9 Gatekeeper Protocol

CLAUDE.md kraever eksplicitte svar paa 7 spoergsmaal for ikke-trivielle aendringer der berorer compliance, registre eller persistence. Tegningssystemet er en sadan aendring.

**1. Hvilken boundary krydses?**
Fem boundaries: (a) MAT WFS → parcelgeometri, (b) GeoDanmark WFS → bygninger og vej, (c) Plandata WFS → byggefeltgeometri, (d) Survey upload → koter og skelpunkter, (e) Supabase → `drawing_sources`, `drawing_geometries`, `drawing_exports`.

**2. Hvilken schema validerer data?**
Zod-schemas i `src/domain/drawing/beliggenhedsplan.schemas.ts` validerer hvert indgangspunkt (se tabel i 7.8). Ingen raa API-responses maa bruges som domain data.

**3. Hvor lever business logic?**
`DrawingReadinessDecisionEngine` i `src/domain/drawing/decision-engine.ts` (pure TypeScript). Geometry-beregninger i `src/domain/drawing/geometry-engine.ts` (pure TypeScript). Ingen business logic i adapters eller UI.

**4. Hvilken application service ejer workflowet?**
`assemble-beliggenhedsplan.service.ts` ejer assembleringsworkflowet (hent alle lag, valider, beregn geometri, kald decision engine). `export-drawing.service.ts` ejer eksport-workflowet (render SVG, eksporter PDF, gem i storage, opdater reviewstatus).

**5. Hvilken adapter haandterer Supabase/Datafordeler/storage?**
Supabase: ny `drawing.repository.ts` under `src/integrations/supabase/repositories/`. Datafordeler/GeoDanmark/Plandata: adapters i `src/integrations/*/drawing-layers.ts`. Storage: ny adapter der implementerer `DrawingExportStorePort`.

**6. Hvordan forhindres UI i at eje domaelogik?**
Server functions er tynde (`createServerFn` → importer service → returneer resultat). UI kalder kun server functions eller hooks. `DrawingReadinessDecisionEngine` og geometry-engine maa ikke importeres i React-komponenter.

**7. Hvilke tests beviser boundary og domaeadfaerd?**
Tier 1: unit tests paa `decision-engine.ts` og `geometry-engine.ts` med kendte polygon-fixtures. Tier 2: service tests paa `assemble-beliggenhedsplan.service.ts` med fake port-implementations. Tier 3: SVG snapshot-test der verificerer strukturelle krav (parcel, footprint, setback lines, north arrow, title block).

---

## 8. Implementeringsplan

### Fase 1 - Datakontrakter Og Readiness

Leverancer:

- Opret `BeliggenhedsplanInput` typer og Zod schemas i `src/domain/drawing/`.
- Opret Port-interfaces i `src/domain/drawing/ports.ts` (se afsnit 7.7).
- Opret `DrawingSourceQualityReport`.
- Opret `DrawingReadinessDecisionEngine`.
- Tilfoej tests for beslutningsmodellen.

Acceptkriterier:

- En adresse kan klassificeres som `AUTO_DRAFT`, `AUTO_REVIEW`, `SURVEY_REQUIRED` eller `BLOCKED_MISSING_CORE_DATA`.
- Alle manglende datapunkter returneres som konkrete `path`-strenge, fx `survey.terrain.points`.
- Ingen UI eller renderer behoever vaere bygget endnu.
- Port-interfaces er defineret og kan bruges af fake test-implementations i Tier 2 tests.

### Fase 2 - CRS Og Geometri-Core

Leverancer:

- Indfoer typed geometry wrappers med `crs`.
- Normaliser MAT, design footprint og upload-geometri til EPSG:25832.
- Erstat myndighedsberegninger i generatoren med robust polygon distance/overlap.
- Lav helpers for bufferlinjer, distance lines og dimension lines.

Acceptkriterier:

- Afstand fra footprint til hvert skelsegment kan beregnes.
- Overlap med parcel kan beregnes korrekt.
- BR18 2,5 m linjer kan genereres som tegnbar geometri.
- Tests bruger kendte simple polygoner i meterkoordinater.

### Fase 3 - Rigtig Designplacering

**Regel 7-krav (CLAUDE.md): `MatrikelMap.tsx` maa ikke udvides foer boundaryen er renset.**

`MatrikelMap.tsx` blander i dag UI-rendering med geometrisk sandhed (konstruerer kvadrat ud fra `buildingArea`, gemmer kun centroid, ingen eksplicit CRS). Det er en dirty domain boundary. Foer nogen ny geometrifunktionalitet bygges paa korteditoren, skal:

1. Geometriberegninger (footprint-konstruktion, skelafstand, overlap) flyttes ud af komponenten til en ren helper eller application service.
2. `MatrikelMap.tsx` reduceres til at vaere en ren visningsadapter der modtager `footprintGeojson` som prop.
3. Server-side geometry engine validerer og genberegner ved gem.

Leverancer:

- Refaktorer `MatrikelMap.tsx` boundary (flytte geometrilogik ud).
- Opdater korteditor/generator til at gemme aegte `footprintGeojson`.
- Gem `footprintAreaM2`, `minDistanceToBoundaryM`, `outsideParcelAreaM2` fra server-side geometry engine.
- Tilfoej explicit source: `generated`, `user`, `cad_upload`, `architect_upload`.

Acceptkriterier:

- `MatrikelMap.tsx` indeholder ingen geometriberegninger.
- Korteditoren maa ikke kun gemme centroid.
- Rule engine bruger aegte beregnede vaerdier.
- Placering kan reloades og regenerere samme footprint.

### Fase 4 - Tegningslag Fra Kilder

Leverancer:

- `geodanmark/drawing-layers.ts`: bygninger, vejmidte, vejobjekter.
- `plandata/drawing-layers.ts`: byggefeltgeometri, zone/kloakopland geometri.
- `survey/upload-decoder.ts`: CSV/GeoJSON for koter, skelpunkter og objekter.
- Manuel fallbackmodel for forsyninger, hegn, overkoersel og jordvarme.

Acceptkriterier:

- Generator kan samle alle tegningslag uden renderer.
- Hvert lag har source/confidence.
- Manglende lag markeres uden at blive tolket som "findes ikke".

### Fase 5 - SVG Renderer

Leverancer:

- `DrawingModelBuilder`
- `render-svg.ts`
- Tegningshoved
- Nordpil
- Signaturforklaring
- Maalestok og viewport-fit
- Labels og maallinjer

Acceptkriterier:

- En test-fixture kan generere en SVG med parcel, hus, byggelinjer, koter og tegningshoved.
- SVG output er stabilt i snapshot-test.
- Labels maa ikke overlappe kritiske lag i simple cases.

### Fase 6 - PDF Eksport Og Reviewflow

Export endpoint skal foelge CLAUDE.md Rule 3 (tynde server functions):

```
createServerFn handler
  → valider input (projectId, exportOptions) med Zod
  → withAuth()
  → dynamisk import export-drawing.service.ts
  → service kalder render-svg.ts, render-pdf.ts, DrawingExportStorePort
  → returneer { exportId, pdfUrl, svgUrl, readinessStatus }
```

`export-drawing.service.ts` ejer eksport-workflowet. Server function haandterer kun validering og routing. UI kalder kun server function — aldrig render-funktioner direkte.

Leverancer:

- `export-drawing.service.ts` i `src/services/drawing/`.
- PDF-render fra SVG via `render-pdf.ts`.
- Tynd `createServerFn` eksport-handler.
- Reviewstatus: `draft`, `needs_review`, `approved_for_submission`.
- Source notes og disclaimers i tegningshoved.
- `drawing_exports` tabel opdateres via drawing repository (ikke direkte fra server function).

Acceptkriterier:

- `AUTO_DRAFT` PDF har tydelig foreloebig markering.
- `AUTO_REVIEW` PDF har kildeoversigt og reviewkrav.
- `SURVEY_REQUIRED` blokerer endelig eksport, men kan eksportere mangelliste.
- Server function er under 20 linjer (valider, auth, importer service, returneer).

---

## 9. Datapunkter Der Skal Gemmes I Database

Foelgende boer ikke kun ligge i JSONB compliance archive.

### `drawing_sources`

- `id`
- `project_id`
- `source_kind`
- `source_name`
- `source_url`
- `source_document_id`
- `source_date`
- `fetched_at`
- `confidence`
- `crs`
- `payload_schema_version`
- `payload_json`

### `drawing_geometries`

- `id`
- `project_id`
- `drawing_source_id`
- `layer_kind`
- `feature_kind`
- `geometry_25832`
- `label`
- `properties_json`
- `confidence`
- `requires_review`

**CRS og JSONB — eksplicit arkitekturvalg:**

`geometry_25832` starter som validated GeoJSON JSONB med paakraevet `crs: "EPSG:25832"` felt. Dette er teknisk gaeld i forhold til CLAUDE.md Rule 6 (Typed Columns Beat JSONB), men accepteres her fordi:

1. Geometri er ikke en compliance-vaerdi i regel-motorens forstand — den bruges til rendering og afstandsberegning, ikke til Hard Stop-evaluering.
2. PostGIS kraever migrations-infrastruktur og Supabase-extension setup der er udenfor dette scopes ramme.
3. Zod-validering ved boundary sikrer at indholdet er korrekt struktureret GeoJSON, og `crs`-feltet haandhaeves i skemaet.

Konsekvenser der skal accepteres:
- Spatial queries (fx "find alle projekter med byggeri indenfor 5 m af skel") kan ikke goeres effektivt uden PostGIS.
- Geometri maa ikke bruges som authoritative compliance-kilde — kun som rendering-input.

Migreringssti: naar PostGIS aktiveres, erstattes JSONB-kolonnen med `geometry(Polygon, 25832)` og existing rows konverteres. Skemaversionen paa `drawing_sources.payload_schema_version` faciliterer migreringen.

### `drawing_exports`

- `id`
- `project_id`
- `drawing_type`
- `status`
- `readiness_status`
- `svg_path`
- `pdf_path`
- `input_hash`
- `generated_at`
- `approved_at`
- `approved_by`
- `source_quality_json`

---

## 10. Teststrategi

Tier 1 pure tests:

- CRS conversion.
- Polygon area.
- Polygon overlap.
- Distance to each boundary segment.
- Buffer generation.
- DecisionEngine classification.
- DrawingModelBuilder with fixture input.

Tier 2 service tests:

- Assemble beliggenhedsplan input from fake MAT/GeoDanmark/Plandata/survey deps.
- Ensure missing data is represented as missing, not false.
- Ensure source quality is preserved.

Tier 3 acceptance:

- Generate SVG/PDF fixture for a simple parcel.
- Visual regression or structural SVG checks:
  - contains parcel boundary
  - contains proposed footprint
  - contains setback lines
  - contains north arrow
  - contains title block
  - contains source notes

---

## 11. Hvad LLM Skal Og Ikke Skal Goere

LLM kan bruges til:

- Udtraekke byggelinje-tekst fra lokalplan/servitut.
- Foreslaa signaturforklaring og noter.
- Klassificere servituttekst.
- Foreslaa hvilke mangler brugeren skal uploade.
- Forklare hvorfor landmaaler/review er paakraevet.

LLM maa ikke:

- Placere bygning, skel, koter eller ledninger.
- Generere endelig tegning som billede.
- Gaette afstande.
- Gaette koter.
- Gaette forsyningsplaceringer uden tydelig `estimated/manual_review` status.

---

## 12. Konklusion

Den bedste vej er:

1. Byg en typed `BeliggenhedsplanInput` med eksplicit CRS og kildekvalitet.
2. Brug en robust geometri-engine i meterkoordinater.
3. Lav en klar beslutningsmodel for auto, review og landmaalerkrav.
4. Render SVG deterministisk.
5. Eksporter PDF fra samme DrawingModel.
6. Brug LLM som datafortolker og forklaringslag, ikke som tegnemotor.

ArchAI kan med nuvaerende kodebase relativt hurtigt komme til `AUTO_DRAFT`. For `AUTO_REVIEW` og myndighedsegnet eksport kraeves isaer aegte footprint-geometri, GeoDanmark-geometrier, survey/upload-koter, forsyningslag og en robust vektor-renderer.
