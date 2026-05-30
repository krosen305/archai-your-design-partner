# Beliggenhedsplan — Myndighedstegning (v2)

**Dato:** 2026-05-28  
**Scope:** Komplet myndighedsegnet beliggenhedsplan i tre progressive niveauer.  
**Baggrund:** Analyse af bilag 9, sagsnr. 703036, Byledet 3, 2820 Gentofte (HusCompagniet A/S).  
**Relaterede planer:** `docs/beliggenhedsplan-generator-plan.md`, `docs/superpowers/plans/2026-05-25-beliggenhedsplan-generator.md`

---

## 1. Mål

Generere en deterministisk SVG → PDF beliggenhedsplan der kan godkendes af en dansk kommune som bilag til byggeansøgning (BR18). Tegningen har præcist de samme elementer som et professionelt arkitekt/landinspektørproduceret bilag.

**Ikke-mål:** AI genererer aldrig koordinater, afstande eller koter. LLM bruges udelukkende til at berige tekst-felter (noter, labels, signaturforklaring) og klassificere servituttekst.

---

## 2. De tre niveauer

### Niveau 1 — AUTO_DRAFT

**Input:** Adresse + matrikel (alt fra offentlige registre, ingen upload).  
**Datakrav:**

- MAT WFS parcelpolygon i EPSG:25832
- Nabomatrikler via MAT WFS bbox-query (aktiveres fra IS_MOCK)
- Nabobygningspolygoner via GeoDanmark `gdk:Bygning` (aktiveres fra IS_MOCK)
- BR18 2,5 m skel-buffers beregnet fra parcelpolygon
- Vejnavn fra DAR (vises som label langs vejskel)

**Output:** SVG med parcel, nabomatrikler, nabobygninger, BR18-byggelinjer, arealtabel, nordpil. Stempel: **"FORELØBIG — ikke til myndighedsbrug"**.

**Readiness:** `AUTO_DRAFT`

---

### Niveau 2 — AUTO_REVIEW

**Input:** Niveau 1 + survey CSV/GeoJSON (landinspektør) + arkitekt-footprint DXF/GeoJSON.  
**Datakrav:**

- Opmålte DVR90-koter som navngivne punkter
- Skelpunkter der afløser MAT-polygon som autoritativ kilde
- Rigtig bygningspolygon i EPSG:25832
- Sokkelkote, gulvkote, terrænkote (150 mm under sokkel)
- Landinspektørens navn + autorisationsnr.

**Output:** SVG med koter, mål-linjer, rigtige afstande, korrekt footprint. Til rådgiver-review før indsendelse.

**Readiness:** `AUTO_REVIEW`

---

### Niveau 3 — FINAL

**Input:** Niveau 2 + kloakdata + disponeringsarealer fra app-editor.  
**Datakrav:**

- Regnvand/spildevand linjegeometri
- Brønde med DK-koter og dimensioner
- Disponeringsarealer: parkering, affald, jordvarme, carport
- Komplet titleblok: bygherre, sagsnr., tegner, BR18-reference, revisionstabel

**Output:** Komplet SVG/PDF klar til kommunalt bilag.

**Readiness:** `AUTO_REVIEW` — `DrawingReadinessStatus` har ingen separat `FINAL`-status. Niveau 3 er et indholdsoverlay oven på niveau 2. En tegning med kloak og disponeringsarealer men uden survey forbliver `AUTO_DRAFT`. Survey er absolut krav for at tegningen kan bruges som myndighedsbilag uanset indholdsrigdom.

---

## 3. Komplet input-model (BeliggenhedsplanInput — ændringer og tilføjelser)

Ændringer til eksisterende typer i `src/domain/drawing/beliggenhedsplan.types.ts`:

### 3.1 ConstraintLayer — præciserede byggelinjetyper

**Breaking change:** Den eksisterende type `"road_building_line"` erstattes af to præcise typer.
Alle steder der sætter `type: "road_building_line"` opdateres til den korrekte type ved migreringen.

```typescript
// Erstat "road_building_line" med to præcise typer:
type:
  | "br18_setback"                   // 2,5 m buffer fra skel (beregnet)
  | "localplan_building_line"         // byggelinje jf. lokalplan (geometri fra Plandata)
  | "road_boundary_setback"           // fra vejskel/vejkant (BR18 eller lokalplan)
  | "road_centerline_deklaration"     // fra vejmidte — historisk servitut/deklaration
  | "servitut"
  | "building_field"
```

Tilføj `ruleReference: string | null` — fx "jf. lokalplan 278" eller "jf. dekt. fryst 31.03.1900".

Grep-tjek inden implementering: `grep -r "road_building_line" src/` for alle eksisterende brugssteder.

### 3.2 ProposedBuildingLayer — nye felter

```typescript
sokkelKoteM: number | null          // fx 27.20
finishedFloorKoteM: number | null   // fx 27.22
terrainOffsetM: number | null       // negativ = terræn under sokkel, fx -0.15 (150 mm)
dimensions: DimensionLine[]         // mål-linjer til renderer
```

```typescript
type DimensionLine = {
  fromPoint: GeoJsonPoint25832;
  toPoint: GeoJsonPoint25832;
  labelM: number; // fx 15.23
  side: "north" | "south" | "east" | "west" | "auto";
};
```

### 3.3 SurveyLayer — landinspektørattestering

```typescript
surveyorName: string | null; // "Landinspektør Navn"
surveyorLicenseNr: string | null; // autorisationsnummer
// surveyDate: string allerede der ✅
```

### 3.4 SiteUseLayer — juridiske og praktiske felter

```typescript
// Tilføj til eksisterende SiteUseLayer:
widthM: number | null; // overkarsel-bredde
isExisting: boolean; // "Eksisterende overkørsel bevares"
permitRequired: boolean | null; // kræver vejmyndighed-tilladelse
legalBasis: "br18_notification" | "br18_permit_required" | null; // fremtidige strukturer
note: string | null; // fritekst til tegning
```

### 3.5 UtilityLayer — brønddimensioner

```typescript
// Tilføj til eksisterende UtilityLayer:
dkKoteM: number | null; // DK = dækkote (top af brønddæksel)
diameterMm: number | null; // fx 315
lineStyle: "solid" | "dashed" | "dotted" | null; // spildevand=solid, regnvand=dashed
```

### 3.6 DrawingMetadata — komplet titleblok

```typescript
// Nye felter:
bygherre: string | null             // "Michelle og Thomas Lykke Mølmer"
sagNr: string | null                // "703036"
bfeNr: string | null                // BFE-nummer
buildingCode: "BR18" | "BR20" | null
draughtsman: string | null          // initialer, fx "eja"
responsibleFirm: string | null      // "HusCompagniet A/S"
revisions: RevisionEntry[]          // erstatter revision: string (deprecated — fjernes)
// MIGRATION: DrawingMetadataSchema revision: z.string() → revisions: z.array(RevisionEntrySchema)
// Eksisterende kode der sætter revision: "A" → revisions: [{ nr: "A", description: "Udgivelse", date: today, by: "" }]
areaTable: AreaTable | null         // beregnet og vist i titleblok

type RevisionEntry = {
  nr: string          // "A", "B", "1"...
  description: string
  date: string
  by: string
}

type AreaTable = {
  grundarealM2: number
  groundFloorM2: number             // bebygget stue-areal
  firstFloorM2: number | null       // bebygget 1. sal
  doubleHeightDeductionM2: number   // fradrag for dobbelt-højt rum
  totalResidentialM2: number        // samlet boligareal
  coveragePercent: number           // bebyggelsesprocent
  calculationBasis: "BR18 §452" | string
}
```

### 3.7 Obligatoriske juridiske annotationer

Nye felt på `BeliggenhedsplanInput`:

```typescript
mandatoryAnnotations: {
  koteDatum: string | null; // "Alle koter er faktiske DVR90 i meter målt fra midte vej"
  terrainSurveyedBy: string | null; // "Terræn/grund indmålt af landinspektør" (kun ved survey)
  sewerResponsibility: string | null; // "Arbejdet udføres af Aut. Kloakmester" (kun ved kloak)
  ratBarrierNote: string | null; // "Rottespærre placeres i parcelbrand..."
}
```

Disse udfyldes automatisk af `assembleBeliggenhedsplan.service.ts` baseret på hvilke lag der er til stede.

---

## 4. Nye ports og adapters

### 4.1 FootprintImportPort (ny)

```typescript
// src/domain/drawing/ports.ts — tilføj:
interface FootprintImportPort {
  decode(raw: unknown, filename: string): Promise<GeoJsonPolygon25832>;
}
```

Adapter: `src/integrations/import/dxf-footprint-decoder.ts`  
Understøtter: DXF, GeoJSON, CSV med koordinatpar.

### 4.2 UtilityInputPort (ny)

```typescript
interface UtilityInputPort {
  decode(raw: unknown): Promise<UtilityLayer[]>;
}
```

Adapter: `src/integrations/import/utility-input-decoder.ts`  
Format: Simpelt GeoJSON med `featureType`-property (`rainwater_pipe`, `wastewater_pipe`, `inspection_well` osv.).

### 4.3 DrawingGeometrySourcePort — udvides

Tilføj til eksisterende interface:

```typescript
fetchNeighborParcels(ownJordstykkeId: string, bbox25832: BBox25832): Promise<NeighborParcel[]>
fetchRoadName(addressId: string): Promise<{ name: string | null }>
```

---

## 5. SVG-renderer — nye lag

Følgende lag tilføjes til `DrawingLayerKind` og implementeres i renderer:

| Lag                      | Beskrivelse                            | Nøglekrav                                |
| ------------------------ | -------------------------------------- | ---------------------------------------- |
| `dimension_lines`        | Mål-linjer med pile og tal             | Ortogonale, auto-side-valg               |
| `terrain_labels`         | DVR90-koter som navngivne punkter      | Label-placement collision detection      |
| `building_setback_lines` | Tegnede byggelinjer (rød)              | Linjesignatur + label med regelreference |
| `utility_lines`          | Regnvand (stiplet) / spildevand (hel)  | Korrekte linjetyper per standard         |
| `utility_wells`          | Brønde som cirkel-symbol + DK-kote     | ∅-annotation                             |
| `hatch_areas`            | Skraveringer: jordvarme, carport, osv. | Diagonal hatching                        |
| `road_label`             | Vejnavn langs vejskel                  | Roteret tekst langs skel-segment         |
| `scale_bar`              | Skalastav                              | Auto-beregnet fra `metersPerMm`          |
| `mandatory_annotations`  | Juridiske noter som tekstblok          | Fast placering nederst venstre           |

### Label-placement engine

Deterministisk — ingen random:

1. Kandidatpositioner: N, S, Ø, V, NØ, NV, SØ, SV af punkt
2. Scorer mod: tegningskant, andre labels, bygningspolygon, titleblok
3. Laveste score vinder
4. Hvis ingen fri position: leader line til nærmeste frie zone
5. Hvis stadig umuligt: `requiresManualReview: true` på feature

---

## 6. GeoDanmark og MAT live-aktivering

To services der er IS_MOCK=true aktiveres som del af denne spec:

### GeoDanmark `gdk:Bygning` og `gdk:Vejmidte`

- Kør `GetCapabilities` og verificer typenavn
- Sæt `FEATURE_FLAGS.geodanmarkMock = false`
- Tilføj `geometry` (Polygon/MultiPolygon) til `NeighborBuilding`-typen
- Opdater `GeoDanmarkNeighborService` til at returnere bygningspolygoner

### MAT naboparceller

- Verificer live-respons mod kendt adresse (Hasselvej 48)
- Sæt `FEATURE_FLAGS.matNeighborParcelsMock = false`
- Output bruges direkte som `parcel.neighborParcels[]`

---

## 7. Readiness-klassificering (opdatering)

Tilføj til `DrawingReadinessInput`:

```typescript
hasRoadCenterlineGeometry: boolean; // vejmidte til deklarationsbyggelinje
hasSurveyorAttestation: boolean; // landinspektørnavn + autorisationsnr.
hasAllMandatoryAnnotations: boolean; // alle lovpligtige noter er udfyldt
```

Nye regler:

- `SURVEY_REQUIRED` hvis `hasRoadCenterlineGeometry = false` og der findes en `road_centerline_deklaration`-byggelinje
- `SURVEY_REQUIRED` hvis niveau 3 kræves og `hasSurveyorAttestation = false`

---

## 8. Titleblok — komplet visning

Titleblokken (højre side af tegningen) vises med følgende sektioner:

```
┌─────────────────────────────┐
│ BELIGGENHEDSPLAN            │  ← titel (stor)
│ Byledet 3, 2820 Gentofte    │  ← adresse
│ Matr.nr.: 2ac               │  ← matrikel + ejerlavsnavn
│ BFE: 12345678               │  ← BFE-nummer
├─────────────────────────────┤
│ Grundareal:      1086 m²    │  ← arealtabel
│ Bebygget (stue): 140,57 m²  │
│ Bebygget (1.sal): 130,67 m² │
│ Fradrag dobb.h.: -9,9 m²   │
│ Samlet boligareal: 271,24 m²│
│ Bebyg.%: 24,98% (BR18 §452) │
├─────────────────────────────┤
│ Bygherre: M. og T. Mølmer   │
│ Sagsnr.: 703036             │
│ Opføres efter: BR18         │
├─────────────────────────────┤
│ Dato: 24/03/2021            │
│ Tegn.: eja    Mål: 1:250   │
│ Ark: A3                     │
├─────────────────────────────┤
│ Rev. │ Beskr. │ Dato │ By  │  ← revisionstabel
│  A   │ Udg.   │ ...  │ eja │
├─────────────────────────────┤
│ FORELØBIG — ikke til        │  ← kun AUTO_DRAFT
│ myndighedsbrug              │
└─────────────────────────────┘
```

---

## 9. Hvad LLM bruges til (og ikke til)

**Må bruges:**

- Foreslå `mandatoryAnnotations`-tekster baseret på hvilke lag der er aktive
- Klassificere servituttekst til `road_centerline_deklaration` vs. `road_boundary_setback`
- Foreslå `note`-tekster på `siteUse`-elementer
- Forklare readiness-status til brugeren

**Må ikke bruges:**

- Placere koordinater, afstande, koter eller geometri
- Generere tegningen som billede
- Gætte byggelinjeafstande
- Beregne bebyggelsesprocent

---

## 10. Teststrategi

### Tier 1 — domain

- `decision-engine.ts`: nye readiness-input-felter og regler
- `geometry-engine.ts`: dimension-line beregning, byggelinje-buffer for vejmidte

### Tier 2 — services

- `assembleBeliggenhedsplan.service.ts`: mandatoryAnnotations udfyldes korrekt pr. niveau
- Fake port-implementations for survey, footprint-import og utility-input

### Tier 3 — SVG strukturelle tests

- Niveau 1 SVG: indeholder parcel, nabomatrikler, BR18-linjer, "FORELØBIG"
- Niveau 2 SVG: indeholder koter-labels, mål-linjer, sokkelkote
- Niveau 3 SVG: indeholder brøndsymboler, jordvarme-skravering, komplet titleblok

---

## 11. Gatekeeper Protocol (CLAUDE.md)

1. **Boundaries:** MAT WFS (naboparceller), GeoDanmark WFS (bygninger+vej), survey-upload, DXF-import, Supabase `drawing_exports`
2. **Schemas:** `BeliggenhedsplanInputSchema` (Zod) validerer alle boundarykryds. Nye ports validerer ved decode.
3. **Business logic:** `decision-engine.ts` (pure), `geometry-engine.ts` (pure), `label-placement.ts` (pure)
4. **Application service:** `assembleBeliggenhedsplan.service.ts` ejer al orkestrering
5. **Adapters:** `GeoDanmarkDrawingLayersAdapter`, `SurveyUploadDecoder`, `DxfFootprintDecoder`, `UtilityInputDecoder`, `DrawingRepository`
6. **UI-isolation:** Server functions er tynde. UI kalder kun server functions. Ingen geometrilogik i React-komponenter.
7. **Tests:** Tier 1 for domain, Tier 2 for services med fake deps, Tier 3 for SVG-struktur

---

## 12. Definition of Done

- [ ] GeoDanmark live (bygningspolygoner + vejmidte)
- [ ] MAT naboparceller live
- [ ] Survey-upload decoder (CSV/GeoJSON → koter + skelpunkter)
- [ ] DXF/GeoJSON footprint-import
- [ ] Utility-input decoder (kloak GeoJSON)
- [ ] `ProposedBuildingLayer` med sokkelkote, gulvkote, terrænoffset, dimensionslinjer
- [ ] `DrawingMetadata` med bygherre, sagNr, bfeNr, buildingCode, revisionstabel, arealtabel
- [ ] `mandatoryAnnotations` auto-udfyldes i assembleBeliggenhedsplan service
- [ ] SVG-renderer: mål-linjer, koter, byggelinjer, brønde, skraveringer, skalastav, revisionstabel
- [ ] Label-placement engine (deterministisk, kollisionsdetektion)
- [ ] Alle tre niveauer generer korrekt SVG i tests
- [ ] TypeScript ren, bun test src grøn, build grøn
