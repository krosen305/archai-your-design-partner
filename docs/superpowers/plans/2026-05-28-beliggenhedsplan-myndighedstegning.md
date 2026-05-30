# Beliggenhedsplan Myndighedstegning — Implementeringsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generere deterministiske SVG/PDF-beliggenhedsplaner der kan godkendes af en dansk kommune som bilag til byggeansøgning (BR18) — implementeret i tre progressive niveauer.

**Architecture:** Strict Ports & Adapters. Domain types i `src/domain/drawing/`, application service i `src/services/drawing/`, rendering helpers i `src/lib/drawing/`, adapters i `src/integrations/`. LLM placerer aldrig koordinater. Alle geometrier i EPSG:25832.

**Tech Stack:** TypeScript, Bun, bun:test, Zod, jsts (allerede installeret), proj4 (allerede installeret), SVG string generation.

**Spec:** `docs/superpowers/specs/2026-05-28-beliggenhedsplan-myndighedstegning-design.md`  
**Arkitektur:** `docs/beliggenhedsplan-generator-plan.md` + `CLAUDE.md`

---

## Nuværende kodetilstand (læs inden du starter)

Disse filer eksisterer allerede og skal KENDES før implementering:

| Fil                                                         | Indhold                                                                                |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/domain/drawing/beliggenhedsplan.types.ts`              | Alle domain-typer — **modificeres i Task 1**                                           |
| `src/domain/drawing/beliggenhedsplan.schemas.ts`            | Zod-schemas — **modificeres i Task 2**                                                 |
| `src/domain/drawing/decision-engine.ts`                     | Readiness-klassificering — **modificeres i Task 3**                                    |
| `src/domain/drawing/decision-engine.test.ts`                | Tier 1 tests for decision engine                                                       |
| `src/domain/drawing/ports.ts`                               | Port-interfaces — **modificeres i Task 4**                                             |
| `src/domain/drawing/geometry-engine.ts`                     | jsts-baseret geometrimotor (areal, afstand, buffer)                                    |
| `src/domain/drawing/source-quality.ts`                      | `registrySourceMeta`, `surveySourceMeta`, `generatedSourceMeta`                        |
| `src/integrations/geodanmark/drawing-layers.ts`             | `GeoDanmarkDrawingLayersAdapter` — fetchNeighborBuildings kalder allerede live-service |
| `src/integrations/geodanmark/neighbor-geometry.ts`          | `GeoDanmarkNeighborService` — IS_MOCK via `FEATURE_FLAGS.geodanmarkMock`               |
| `src/integrations/mat/neighbor-parcels.ts`                  | `MatNeighborParcelService` — IS_MOCK via `FEATURE_FLAGS.matNeighborParcelsMock`        |
| `src/integrations/survey/upload-decoder.ts`                 | `SurveyUploadDecoder` implementerer `SurveyUploadDecoderPort`                          |
| `src/services/drawing/assemble-beliggenhedsplan.service.ts` | Samler `BeliggenhedsplanInput` via ports                                               |
| `src/lib/drawing/render-svg.ts`                             | SVG-renderer — basis titleblok, nordpil, parcel-features                               |
| `src/lib/drawing/drawing-model-builder.ts`                  | `buildDrawingModel(plan, readiness) → DrawingModel`                                    |
| `src/lib/drawing/drawing-symbols.ts`                        | `northArrowSvg`, `lineDashed`, `lineDotted`                                            |
| `src/lib/runtime-config.ts`                                 | `FEATURE_FLAGS` inkl. `geodanmarkMock`, `matNeighborParcelsMock`                       |
| `src/lib/env.ts`                                            | Alle env-vars — skal bruges til nye env-vars                                           |

Feature flags styres via env-vars læst i `src/lib/runtime-config.ts`:

- `GEODANMARK_MOCK=false` deaktiverer `FEATURE_FLAGS.geodanmarkMock`
- `MAT_NEIGHBOR_PARCELS_MOCK=false` deaktiverer `FEATURE_FLAGS.matNeighborParcelsMock`

---

## Filkort

| Fil                                                              | Handling                              | Fase |
| ---------------------------------------------------------------- | ------------------------------------- | ---- |
| `src/domain/drawing/beliggenhedsplan.types.ts`                   | Modificer                             | 1    |
| `src/domain/drawing/beliggenhedsplan.schemas.ts`                 | Modificer                             | 1    |
| `src/domain/drawing/decision-engine.ts`                          | Modificer                             | 1    |
| `src/domain/drawing/decision-engine.test.ts`                     | Modificer                             | 1    |
| `src/domain/drawing/ports.ts`                                    | Modificer                             | 1    |
| `src/domain/drawing/drawing-model.ts`                            | Modificer                             | 3    |
| `src/integrations/geodanmark/drawing-layers.ts`                  | Modificer                             | 1    |
| `src/integrations/mat/neighbor-parcels.ts`                       | Ingen kodeændring (env-var aktiverer) | 1    |
| `src/integrations/survey/upload-decoder.ts`                      | Modificer                             | 2    |
| `src/integrations/survey/survey.schemas.ts`                      | Modificer                             | 2    |
| `src/integrations/import/geojson-footprint-decoder.ts`           | Opret                                 | 2    |
| `src/integrations/import/utility-input-decoder.ts`               | Opret                                 | 3    |
| `src/services/drawing/assemble-beliggenhedsplan.service.ts`      | Modificer                             | 1+2  |
| `src/services/drawing/assemble-beliggenhedsplan.service.test.ts` | Modificer                             | 1+2  |
| `src/lib/drawing/drawing-model-builder.ts`                       | Modificer                             | 3    |
| `src/lib/drawing/render-svg.ts`                                  | Modificer                             | 3    |
| `src/lib/drawing/render-svg.test.ts`                             | Modificer                             | 3    |
| `src/lib/drawing/drawing-symbols.ts`                             | Modificer                             | 3    |
| `src/lib/drawing/label-placement.ts`                             | Opret                                 | 2    |
| `src/lib/drawing/label-placement.test.ts`                        | Opret                                 | 2    |
| `src/lib/drawing/dimension-lines.ts`                             | Opret                                 | 2    |
| `src/lib/drawing/dimension-lines.test.ts`                        | Opret                                 | 2    |
| `.env.example`                                                   | Modificer                             | 1    |

---

## Fase 1 — Domain model + live data (Niveau 1: AUTO_DRAFT med rigtige naboer)

**Forudsætning:** Bun installeret, `bun test src` er grøn inden du starter.  
**Output:** SVG-tegning med parcelpolygon, nabomatrikler, nabobygninger og BR18-byggelinjer. Stempel "FORELØBIG".

---

### Task 1: Opdater domain types

**Læs inden start:** `src/domain/drawing/beliggenhedsplan.types.ts`

**Filer:**

- Modificer: `src/domain/drawing/beliggenhedsplan.types.ts`

Erstat hele filens indhold med følgende (alle eksisterende typer bevares, nye tilføjes/udvides):

- [ ] **Step 1: Erstat filindhold**

```typescript
// src/domain/drawing/beliggenhedsplan.types.ts
export type Crs25832 = "EPSG:25832";
export type BBox25832 = [number, number, number, number];

export type GeoJsonPoint25832 = {
  type: "Point";
  coordinates: [number, number];
  crs: Crs25832;
};

export type GeoJsonLineString25832 = {
  type: "LineString";
  coordinates: [number, number][];
  crs: Crs25832;
};

export type GeoJsonPolygon25832 = {
  type: "Polygon";
  coordinates: [number, number][][];
  crs: Crs25832;
};

export type DataConfidence = "high" | "medium" | "low" | "unknown";
export type DataSource =
  | "survey"
  | "registry"
  | "cad_upload"
  | "manual"
  | "generated"
  | "estimated";

export type LayerSourceMeta = {
  source: DataSource;
  confidence: DataConfidence;
  fetchedAt: string | null;
  requiresReview: boolean;
};

export type BoundarySegment = {
  id: string;
  start: GeoJsonPoint25832;
  end: GeoJsonPoint25832;
  type: "road" | "neighbor" | "internal" | "unknown";
  source: LayerSourceMeta;
};

export type NeighborParcel = {
  matrikelnummer: string;
  polygon25832: GeoJsonPolygon25832 | null;
  labelPoint25832: GeoJsonPoint25832;
};

export type ParcelLayer = {
  idLokalId: string;
  bfeNr: string;
  matrikelnummer: string;
  ejerlavskode: number;
  ejerlavsnavn: string;
  polygon25832: GeoJsonPolygon25832;
  areaRegisteredM2: number;
  areaGeometryM2: number;
  areaDiscrepancyM2: number;
  boundarySegments: BoundarySegment[];
  neighborParcels: NeighborParcel[];
  labelPoint25832: GeoJsonPoint25832;
  roadName: string | null;
  source: LayerSourceMeta;
};

export type TerrainPoint = {
  x: number;
  y: number;
  z: number;
  label: string;
  source: DataSource;
};

export type TerrainLayer = {
  verticalDatum: "DVR90";
  points: TerrainPoint[];
  slopePercent: number | null;
  lowPointM: number | null;
  source: LayerSourceMeta;
};

export type SurveyLayer = {
  uploadedAt: string;
  surveyDate: string | null;
  surveyorName: string | null;
  surveyorLicenseNr: string | null;
  terrainPoints: TerrainPoint[];
  boundaryPoints: GeoJsonPoint25832[];
  notes: string[];
  source: LayerSourceMeta;
};

export type ExistingBuilding = {
  bbrId: string | null;
  footprint25832: GeoJsonPolygon25832;
  usageCode: string | null;
  areaM2: number;
  sokkelKoteM: number | null;
  source: LayerSourceMeta;
};

export type ExistingFeaturesLayer = {
  buildings: ExistingBuilding[];
  fences: GeoJsonLineString25832[];
  source: LayerSourceMeta;
};

export type DimensionLine = {
  fromPoint: GeoJsonPoint25832;
  toPoint: GeoJsonPoint25832;
  labelM: number;
  side: "north" | "south" | "east" | "west" | "auto";
};

export type ProposedBuildingLayer = {
  footprint25832: GeoJsonPolygon25832;
  rotationDeg: number;
  footprintAreaM2: number;
  storeys: number;
  heightM: number | null;
  sokkelKoteM: number | null;
  finishedFloorKoteM: number | null;
  terrainOffsetM: number | null;
  dimensions: DimensionLine[];
  source: LayerSourceMeta;
};

export type ConstraintLayer = {
  type:
    | "br18_setback"
    | "localplan_building_line"
    | "road_boundary_setback"
    | "road_centerline_deklaration"
    | "servitut"
    | "building_field";
  geometry25832: GeoJsonPolygon25832 | GeoJsonLineString25832;
  label: string;
  ruleText: string | null;
  ruleReference: string | null;
  source: LayerSourceMeta;
};

export type UtilityLayer = {
  type:
    | "water"
    | "sewer"
    | "electric"
    | "gas"
    | "rainwater"
    | "wastewater"
    | "inspection_well"
    | "sand_trap"
    | "rat_barrier";
  geometry25832: GeoJsonPoint25832 | GeoJsonLineString25832;
  label: string;
  dkKoteM: number | null;
  diameterMm: number | null;
  lineStyle: "solid" | "dashed" | "dotted" | null;
  source: LayerSourceMeta;
};

export type SiteUseLayer = {
  type:
    | "parking"
    | "waste_sorting"
    | "driveway"
    | "geothermal_field"
    | "terrace"
    | "future_structure";
  geometry25832: GeoJsonPolygon25832;
  label: string;
  widthM: number | null;
  isExisting: boolean;
  permitRequired: boolean | null;
  legalBasis: "br18_notification" | "br18_permit_required" | null;
  note: string | null;
  hatchPattern: "diagonal" | "cross" | "dots" | null;
  source: LayerSourceMeta;
};

export type RevisionEntry = {
  nr: string;
  description: string;
  date: string;
  by: string;
};

export type AreaTable = {
  grundarealM2: number;
  groundFloorM2: number;
  firstFloorM2: number | null;
  doubleHeightDeductionM2: number;
  totalResidentialM2: number;
  coveragePercent: number;
  calculationBasis: string;
};

export type MandatoryAnnotations = {
  koteDatum: string | null;
  terrainSurveyedBy: string | null;
  sewerResponsibility: string | null;
  ratBarrierNote: string | null;
};

export type DrawingMetadata = {
  title: string;
  address: string;
  matrikel: string;
  bfeNr: string | null;
  bygherre: string | null;
  sagNr: string | null;
  buildingCode: "BR18" | "BR20" | null;
  draughtsman: string | null;
  responsibleFirm: string | null;
  revisions: RevisionEntry[];
  areaTable: AreaTable | null;
  date: string;
  scale: 250 | 500;
  paperSize: "A3" | "A2" | "A1";
};

export type BeliggenhedsplanInput = {
  crs: Crs25832;
  parcel: ParcelLayer;
  survey: SurveyLayer | null;
  existing: ExistingFeaturesLayer;
  proposed: ProposedBuildingLayer;
  constraints: ConstraintLayer[];
  utilities: UtilityLayer[];
  siteUse: SiteUseLayer[];
  terrain: TerrainLayer | null;
  metadata: DrawingMetadata;
  mandatoryAnnotations: MandatoryAnnotations;
};
```

- [ ] **Step 2: TypeScript-tjek**

```bash
bunx tsc --noEmit
```

Forventet: Fejl i schemas og andre filer der bruger de gamle typer — det er normalt. Ret dem i de efterfølgende tasks.

- [ ] **Step 3: Commit**

```bash
git add src/domain/drawing/beliggenhedsplan.types.ts
git commit -m "feat(drawing): udvid domain types — sokkelkote, revisionstabel, obligatoriske annotationer, præcise byggelinjetyper"
```

---

### Task 2: Opdater Zod-schemas

**Læs inden start:** `src/domain/drawing/beliggenhedsplan.schemas.ts` + den opdaterede `beliggenhedsplan.types.ts` fra Task 1.

**Filer:**

- Modificer: `src/domain/drawing/beliggenhedsplan.schemas.ts`

- [ ] **Step 1: Erstat filindhold**

```typescript
// src/domain/drawing/beliggenhedsplan.schemas.ts
import { z } from "zod";

const Crs25832Schema = z.literal("EPSG:25832");

export const GeoJsonPoint25832Schema = z.object({
  type: z.literal("Point"),
  coordinates: z.tuple([z.number(), z.number()]),
  crs: Crs25832Schema,
});

export const GeoJsonLineString25832Schema = z.object({
  type: z.literal("LineString"),
  coordinates: z.array(z.tuple([z.number(), z.number()])).min(2),
  crs: Crs25832Schema,
});

export const GeoJsonPolygon25832Schema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))).min(1),
  crs: Crs25832Schema,
});

const DataConfidenceSchema = z.enum(["high", "medium", "low", "unknown"]);
const DataSourceSchema = z.enum([
  "survey",
  "registry",
  "cad_upload",
  "manual",
  "generated",
  "estimated",
]);

const LayerSourceMetaSchema = z.object({
  source: DataSourceSchema,
  confidence: DataConfidenceSchema,
  fetchedAt: z.string().nullable(),
  requiresReview: z.boolean(),
});

const BoundarySegmentSchema = z.object({
  id: z.string(),
  start: GeoJsonPoint25832Schema,
  end: GeoJsonPoint25832Schema,
  type: z.enum(["road", "neighbor", "internal", "unknown"]),
  source: LayerSourceMetaSchema,
});

const NeighborParcelSchema = z.object({
  matrikelnummer: z.string(),
  polygon25832: GeoJsonPolygon25832Schema.nullable(),
  labelPoint25832: GeoJsonPoint25832Schema,
});

export const ParcelLayerSchema = z.object({
  idLokalId: z.string(),
  bfeNr: z.string(),
  matrikelnummer: z.string(),
  ejerlavskode: z.number(),
  ejerlavsnavn: z.string(),
  polygon25832: GeoJsonPolygon25832Schema,
  areaRegisteredM2: z.number().positive(),
  areaGeometryM2: z.number().positive(),
  areaDiscrepancyM2: z.number(),
  boundarySegments: z.array(BoundarySegmentSchema),
  neighborParcels: z.array(NeighborParcelSchema),
  labelPoint25832: GeoJsonPoint25832Schema,
  roadName: z.string().nullable(),
  source: LayerSourceMetaSchema,
});

export const SurveyLayerSchema = z.object({
  uploadedAt: z.string(),
  surveyDate: z.string().nullable(),
  surveyorName: z.string().nullable(),
  surveyorLicenseNr: z.string().nullable(),
  terrainPoints: z.array(
    z.object({
      x: z.number(),
      y: z.number(),
      z: z.number(),
      label: z.string(),
      source: DataSourceSchema,
    }),
  ),
  boundaryPoints: z.array(GeoJsonPoint25832Schema),
  notes: z.array(z.string()),
  source: LayerSourceMetaSchema,
});

export const ExistingFeaturesLayerSchema = z.object({
  buildings: z.array(
    z.object({
      bbrId: z.string().nullable(),
      footprint25832: GeoJsonPolygon25832Schema,
      usageCode: z.string().nullable(),
      areaM2: z.number(),
      sokkelKoteM: z.number().nullable(),
      source: LayerSourceMetaSchema,
    }),
  ),
  fences: z.array(GeoJsonLineString25832Schema),
  source: LayerSourceMetaSchema,
});

const DimensionLineSchema = z.object({
  fromPoint: GeoJsonPoint25832Schema,
  toPoint: GeoJsonPoint25832Schema,
  labelM: z.number(),
  side: z.enum(["north", "south", "east", "west", "auto"]),
});

export const ProposedBuildingLayerSchema = z.object({
  footprint25832: GeoJsonPolygon25832Schema,
  rotationDeg: z.number(),
  footprintAreaM2: z.number().positive(),
  storeys: z.number().int().positive(),
  heightM: z.number().nullable(),
  sokkelKoteM: z.number().nullable(),
  finishedFloorKoteM: z.number().nullable(),
  terrainOffsetM: z.number().nullable(),
  dimensions: z.array(DimensionLineSchema),
  source: LayerSourceMetaSchema,
});

export const ConstraintLayerSchema = z.object({
  type: z.enum([
    "br18_setback",
    "localplan_building_line",
    "road_boundary_setback",
    "road_centerline_deklaration",
    "servitut",
    "building_field",
  ]),
  geometry25832: z.union([GeoJsonPolygon25832Schema, GeoJsonLineString25832Schema]),
  label: z.string(),
  ruleText: z.string().nullable(),
  ruleReference: z.string().nullable(),
  source: LayerSourceMetaSchema,
});

const RevisionEntrySchema = z.object({
  nr: z.string(),
  description: z.string(),
  date: z.string(),
  by: z.string(),
});

const AreaTableSchema = z.object({
  grundarealM2: z.number(),
  groundFloorM2: z.number(),
  firstFloorM2: z.number().nullable(),
  doubleHeightDeductionM2: z.number(),
  totalResidentialM2: z.number(),
  coveragePercent: z.number(),
  calculationBasis: z.string(),
});

export const DrawingMetadataSchema = z.object({
  title: z.string().min(1),
  address: z.string().min(1),
  matrikel: z.string().min(1),
  bfeNr: z.string().nullable(),
  bygherre: z.string().nullable(),
  sagNr: z.string().nullable(),
  buildingCode: z.enum(["BR18", "BR20"]).nullable(),
  draughtsman: z.string().nullable(),
  responsibleFirm: z.string().nullable(),
  revisions: z.array(RevisionEntrySchema),
  areaTable: AreaTableSchema.nullable(),
  date: z.string(),
  scale: z.union([z.literal(250), z.literal(500)]),
  paperSize: z.enum(["A3", "A2", "A1"]),
});

const MandatoryAnnotationsSchema = z.object({
  koteDatum: z.string().nullable(),
  terrainSurveyedBy: z.string().nullable(),
  sewerResponsibility: z.string().nullable(),
  ratBarrierNote: z.string().nullable(),
});

export const BeliggenhedsplanInputSchema = z.object({
  crs: Crs25832Schema,
  parcel: ParcelLayerSchema,
  survey: SurveyLayerSchema.nullable(),
  existing: ExistingFeaturesLayerSchema,
  proposed: ProposedBuildingLayerSchema,
  constraints: z.array(ConstraintLayerSchema),
  utilities: z.array(z.unknown()),
  siteUse: z.array(z.unknown()),
  terrain: z.unknown().nullable(),
  metadata: DrawingMetadataSchema,
  mandatoryAnnotations: MandatoryAnnotationsSchema,
});
```

- [ ] **Step 2: TypeScript-tjek**

```bash
bunx tsc --noEmit
```

Forventet: Færre fejl end efter Task 1. Tilbageværende fejl er i service/test-filer der bruger de gamle typer.

- [ ] **Step 3: Kør tests**

```bash
bun test src/domain/drawing/
```

Forventet: Eksisterende domain-tests kan fejle pga. type-ændringer — det rettes i næste steps.

- [ ] **Step 4: Commit**

```bash
git add src/domain/drawing/beliggenhedsplan.schemas.ts
git commit -m "feat(drawing): opdater Zod-schemas — roadName, surveyor, DimensionLine, revisionstabel, mandatoryAnnotations"
```

---

### Task 3: Opdater Decision Engine

**Læs inden start:** `src/domain/drawing/decision-engine.ts` og `src/domain/drawing/decision-engine.test.ts`.

**Filer:**

- Modificer: `src/domain/drawing/decision-engine.ts`
- Modificer: `src/domain/drawing/decision-engine.test.ts`

Tilføj tre nye `DrawingReadinessInput`-felter og en ny `SURVEY_REQUIRED`-regel.

- [ ] **Step 1: Tilføj failing tests**

Åbn `src/domain/drawing/decision-engine.test.ts` og tilføj disse to test-cases efter de eksisterende:

```typescript
it("SURVEY_REQUIRED når road_centerline_deklaration eksisterer men vejmidte mangler", () => {
  const r = classifyDrawingReadiness({
    ...base,
    hasRoadCenterlineGeometry: false,
    hasCenterlineDeklaration: true,
    hasSurveyorAttestation: false,
  });
  expect(r.status).toBe("SURVEY_REQUIRED");
  expect(r.reasons.some((r) => r.code === "CENTERLINE_DEKLARATION_WITHOUT_GEOMETRY")).toBe(true);
});

it("AUTO_REVIEW når surveyor-attestation er til stede", () => {
  const r = classifyDrawingReadiness({
    ...base,
    hasRoadCenterlineGeometry: true,
    hasCenterlineDeklaration: true,
    hasSurveyorAttestation: true,
  });
  expect(r.status).toBe("AUTO_REVIEW");
});
```

Tilføj også de nye felter til `base`-objektet øverst i testfilen:

```typescript
const base = {
  // ... eksisterende felter bevares ...
  hasRoadCenterlineGeometry: true,
  hasCenterlineDeklaration: false,
  hasSurveyorAttestation: false,
};
```

- [ ] **Step 2: Kør tests — verificer at de to nye fejler**

```bash
bun test src/domain/drawing/decision-engine.test.ts
```

Forventet: De to nye tests fejler med type-fejl.

- [ ] **Step 3: Opdater decision-engine.ts**

Tilføj de tre nye felter til `DrawingReadinessInput` og den nye regel i `classifyDrawingReadiness`:

```typescript
// I DrawingReadinessInput — tilføj efter eksisterende felter:
hasRoadCenterlineGeometry: boolean;
hasCenterlineDeklaration: boolean;
hasSurveyorAttestation: boolean;
```

Tilføj denne regel i `classifyDrawingReadiness` umiddelbart efter parcel-discrepancy-tjekket:

```typescript
if (input.hasCenterlineDeklaration && !input.hasRoadCenterlineGeometry) {
  surveyRequired = true;
  reasons.push({
    code: "CENTERLINE_DEKLARATION_WITHOUT_GEOMETRY",
    severity: "warning",
    message: "Byggelinje fra vejmidte (deklaration) kræver opmålt vejmidte-geometri",
    affectedLayer: "constraints",
  });
  reviewRequiredBy.push("landinspektoer");
}
```

- [ ] **Step 4: Kør tests — alle grønne**

```bash
bun test src/domain/drawing/decision-engine.test.ts
```

Forventet: Alle tests grønne.

- [ ] **Step 5: TypeScript-tjek**

```bash
bunx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/domain/drawing/decision-engine.ts src/domain/drawing/decision-engine.test.ts
git commit -m "feat(drawing): decision engine — vejmidte-deklaration og surveyor-attestation regler"
```

---

### Task 4: Udvid DrawingGeometrySourcePort

**Læs inden start:** `src/domain/drawing/ports.ts`.

**Filer:**

- Modificer: `src/domain/drawing/ports.ts`

Tilføj `fetchNeighborParcels` til `DrawingGeometrySourcePort` og `fetchRoadName` til samme interface.

- [ ] **Step 1: Tilføj to nye metoder til interface**

```typescript
// I DrawingGeometrySourcePort — tilføj efter fetchPlandataLayers:
  fetchNeighborParcels(
    ownJordstykkeId: string,
    bbox25832: import("./beliggenhedsplan.types").BBox25832,
  ): Promise<import("./beliggenhedsplan.types").NeighborParcel[]>;

  fetchRoadName(addressId: string): Promise<{ name: string | null }>;
```

- [ ] **Step 2: TypeScript-tjek**

```bash
bunx tsc --noEmit
```

Forventet: `GeoDanmarkDrawingLayersAdapter` mangler nu de to metoder — rettes i Task 5.

- [ ] **Step 3: Commit**

```bash
git add src/domain/drawing/ports.ts
git commit -m "feat(drawing): udvid DrawingGeometrySourcePort med fetchNeighborParcels og fetchRoadName"
```

---

### Task 5: Opdater GeoDanmarkDrawingLayersAdapter

**Læs inden start:** `src/integrations/geodanmark/drawing-layers.ts`, `src/integrations/mat/neighbor-parcels.ts`, `src/lib/runtime-config.ts`.

**Filer:**

- Modificer: `src/integrations/geodanmark/drawing-layers.ts`

Implementer de to nye port-metoder. `fetchNeighborParcels` delegerer til `MatNeighborParcelService`. `fetchRoadName` returnerer vejnavn fra DAR-adresse (returner null for nu).

- [ ] **Step 1: Tilføj de to metoder til adapteren**

Åbn `src/integrations/geodanmark/drawing-layers.ts` og tilføj efter `fetchPlandataLayers`:

```typescript
  async fetchNeighborParcels(
    ownJordstykkeId: string,
    bbox25832: BBox25832,
  ): Promise<import("@/domain/drawing/beliggenhedsplan.types").NeighborParcel[]> {
    const { MatNeighborParcelService } = await import("@/integrations/mat/neighbor-parcels");
    const result = await MatNeighborParcelService.getNeighborParcels(ownJordstykkeId, bbox25832);

    if (!result.data) return [];

    return result.data
      .filter((p) => p.matrikelnummer !== null)
      .map((p) => {
        const geom = p.geometry;
        const polygon25832: GeoJsonPolygon25832 | null =
          geom?.type === "Polygon"
            ? { type: "Polygon", coordinates: geom.coordinates as [number, number][][], crs: "EPSG:25832" }
            : geom?.type === "MultiPolygon"
            ? { type: "Polygon", coordinates: (geom.coordinates as [number, number][][][])[0] ?? [], crs: "EPSG:25832" }
            : null;

        const coords = polygon25832?.coordinates[0] ?? [];
        const cx = coords.length > 0 ? coords.reduce((s, c) => s + c[0], 0) / coords.length : 0;
        const cy = coords.length > 0 ? coords.reduce((s, c) => s + c[1], 0) / coords.length : 0;

        return {
          matrikelnummer: p.matrikelnummer!,
          polygon25832,
          labelPoint25832: { type: "Point" as const, crs: "EPSG:25832" as const, coordinates: [cx, cy] as [number, number] },
        };
      });
  }

  async fetchRoadName(_addressId: string): Promise<{ name: string | null }> {
    return { name: null };
  }
```

Tilføj import øverst i filen (efter eksisterende imports):

```typescript
import type { GeoJsonPolygon25832, BBox25832 } from "@/domain/drawing/beliggenhedsplan.types";
```

- [ ] **Step 2: TypeScript-tjek**

```bash
bunx tsc --noEmit
```

Forventet: Ingen fejl.

- [ ] **Step 3: Opdater .env.example**

Åbn `.env.example` og tilføj under feature flags-sektionen:

```
# Sæt til false for at aktivere live GeoDanmark og MAT naboparceller
GEODANMARK_MOCK=true
MAT_NEIGHBOR_PARCELS_MOCK=true
```

- [ ] **Step 4: Kør tests**

```bash
bun test src
```

Forventet: Alle grønne.

- [ ] **Step 5: Commit**

```bash
git add src/integrations/geodanmark/drawing-layers.ts .env.example
git commit -m "feat(geodanmark): fetchNeighborParcels delegerer til MatNeighborParcelService"
```

---

### Task 6: Opdater assembleBeliggenhedsplan service

**Læs inden start:**  
`src/services/drawing/assemble-beliggenhedsplan.service.ts`  
`src/services/drawing/assemble-beliggenhedsplan.service.test.ts`

**Filer:**

- Modificer: `src/services/drawing/assemble-beliggenhedsplan.service.ts`
- Modificer: `src/services/drawing/assemble-beliggenhedsplan.service.test.ts`

Service skal nu:

1. Hente naboparceller via `fetchNeighborParcels`
2. Hente vejnavn via `fetchRoadName`
3. Auto-udfylde `mandatoryAnnotations` baseret på aktive lag
4. Beregne BR18 2,5 m skel-byggelinje som tegnbar constraint
5. Beregne `areaTable` fra `proposed` og `parcel` data

- [ ] **Step 1: Tilføj failing tests**

Åbn `src/services/drawing/assemble-beliggenhedsplan.service.test.ts` og tilføj `fetchNeighborParcels` og `fetchRoadName` til `fakeSource`:

```typescript
const fakeSource: DrawingGeometrySourcePort = {
  fetchParcelLayers: async () => fakeParcel,
  fetchNeighborBuildings: async () => fakeExisting,
  fetchRoadGeometry: async () => ({ centerline25832: null }),
  fetchPlandataLayers: async () => [],
  fetchNeighborParcels: async () => [],
  fetchRoadName: async () => ({ name: "Testvej" }),
};
```

Tilføj disse tests:

```typescript
it("plan indeholder mandatoryAnnotations med koteDatum", async () => {
  const result = await assembleBeliggenhedsplan({
    matrikelId: "test-id",
    kommunekode: "0101",
    addressId: "addr-1",
    proposedFootprint25832: fakeFootprint,
    projectId: "proj-1",
    metadata: baseMeta,
    geometrySource: fakeSource,
    survey: null,
  });
  expect(result.plan?.mandatoryAnnotations.koteDatum).toContain("DVR90");
});

it("plan indeholder BR18-byggelinje i constraints", async () => {
  const result = await assembleBeliggenhedsplan({
    matrikelId: "test-id",
    kommunekode: "0101",
    addressId: "addr-1",
    proposedFootprint25832: fakeFootprint,
    projectId: "proj-1",
    metadata: baseMeta,
    geometrySource: fakeSource,
    survey: null,
  });
  expect(result.plan?.constraints.some((c) => c.type === "br18_setback")).toBe(true);
});

it("plan.parcel.roadName sættes fra fetchRoadName", async () => {
  const result = await assembleBeliggenhedsplan({
    matrikelId: "test-id",
    kommunekode: "0101",
    addressId: "addr-1",
    proposedFootprint25832: fakeFootprint,
    projectId: "proj-1",
    metadata: baseMeta,
    geometrySource: fakeSource,
    survey: null,
  });
  expect(result.plan?.parcel.roadName).toBe("Testvej");
});
```

Opdater `baseMeta` til at matche den nye `DrawingMetadata`-type:

```typescript
const baseMeta = {
  title: "Beliggenhedsplan test",
  address: "Testvej 1",
  matrikel: "1a",
  bfeNr: null,
  bygherre: null,
  sagNr: null,
  buildingCode: null,
  draughtsman: null,
  responsibleFirm: null,
  revisions: [{ nr: "A", description: "Udgivelse", date: "2026-05-28", by: "" }],
  areaTable: null,
  date: "2026-05-28",
  scale: 250 as const,
  paperSize: "A3" as const,
};
```

- [ ] **Step 2: Kør tests — verificer at de nye fejler**

```bash
bun test src/services/drawing/assemble-beliggenhedsplan.service.test.ts
```

- [ ] **Step 3: Opdater service**

Erstat hele `src/services/drawing/assemble-beliggenhedsplan.service.ts`:

```typescript
// src/services/drawing/assemble-beliggenhedsplan.service.ts
import type {
  BeliggenhedsplanInput,
  DrawingMetadata,
  GeoJsonPolygon25832,
  SurveyLayer,
  MandatoryAnnotations,
  ConstraintLayer,
} from "@/domain/drawing/beliggenhedsplan.types";
import type { DrawingGeometrySourcePort } from "@/domain/drawing/ports";
import {
  classifyDrawingReadiness,
  type DrawingReadinessDecision,
} from "@/domain/drawing/decision-engine";
import {
  polygonAreaM2,
  distanceToNearestBoundaryM,
  splitPolygonIntoBoundarySegments,
  generateBuffer25832,
} from "@/domain/drawing/geometry-engine";
import { generatedSourceMeta, registrySourceMeta } from "@/domain/drawing/source-quality";

type AssembleInput = {
  matrikelId: string;
  kommunekode: string;
  addressId: string;
  proposedFootprint25832: GeoJsonPolygon25832;
  projectId: string;
  metadata: DrawingMetadata;
  geometrySource: DrawingGeometrySourcePort;
  survey: SurveyLayer | null;
};

type AssembleResult = {
  plan: BeliggenhedsplanInput | null;
  readiness: DrawingReadinessDecision;
};

function buildMandatoryAnnotations(
  hasSurvey: boolean,
  hasUtilities: boolean,
): MandatoryAnnotations {
  return {
    koteDatum: "Alle koter er faktiske DVR90 i meter målt fra midte vej",
    terrainSurveyedBy: hasSurvey ? "Terræn/grund indmålt af landinspektør" : null,
    sewerResponsibility: hasUtilities ? "Arbejdet udføres af Aut. Kloakmester" : null,
    ratBarrierNote: hasUtilities
      ? "Rottespærre placeres i parcelbrand eller 1. spildevandsbrand på grunden"
      : null,
  };
}

function buildBr18Constraint(parcelPolygon: GeoJsonPolygon25832): ConstraintLayer {
  const buffer = generateBuffer25832(parcelPolygon, -2.5);
  const now = new Date().toISOString();
  return {
    type: "br18_setback",
    geometry25832: buffer,
    label: "Byggelinje 2,5 m fra skel jf. BR18",
    ruleText: "BR18 §185 stk. 1",
    ruleReference: "BR18",
    source: { source: "generated", confidence: "high", fetchedAt: now, requiresReview: false },
  };
}

export async function assembleBeliggenhedsplan(input: AssembleInput): Promise<AssembleResult> {
  const {
    matrikelId,
    kommunekode,
    addressId,
    proposedFootprint25832,
    geometrySource,
    survey,
    metadata,
  } = input;

  const parcel = await geometrySource.fetchParcelLayers(matrikelId);

  if (!parcel) {
    return {
      plan: null,
      readiness: classifyDrawingReadiness({
        hasAddress: true,
        hasMatrikel: true,
        hasParcelPolygon: false,
        hasProposedFootprint: true,
        hasCrsContract: true,
        parcelAreaDiscrepancyPct: 0,
        minDistanceToSetbackLineM: 999,
        setbackRequirementM: 2.5,
        hasOpmaalteKoter: false,
        hasDhmKoter: false,
        hasExistingBuildingGeometry: false,
        missingDataPoints: ["parcel.polygon25832"],
        hasRoadCenterlineGeometry: true,
        hasCenterlineDeklaration: false,
        hasSurveyorAttestation: false,
      }),
    };
  }

  const parcelWithSegments = {
    ...parcel,
    boundarySegments:
      parcel.boundarySegments.length > 0
        ? parcel.boundarySegments
        : splitPolygonIntoBoundarySegments(parcel.polygon25832),
  };

  const xs = parcel.polygon25832.coordinates[0].map((c) => c[0]);
  const ys = parcel.polygon25832.coordinates[0].map((c) => c[1]);
  const bbox: [number, number, number, number] = [
    Math.min(...xs),
    Math.min(...ys),
    Math.max(...xs),
    Math.max(...ys),
  ];

  const [existing, constraints, neighborParcels, roadNameResult] = await Promise.all([
    geometrySource.fetchNeighborBuildings(bbox),
    geometrySource.fetchPlandataLayers(kommunekode, bbox),
    geometrySource.fetchNeighborParcels(parcel.idLokalId, bbox),
    geometrySource.fetchRoadName(addressId),
  ]);

  const br18Constraint = buildBr18Constraint(parcelWithSegments.polygon25832);
  const allConstraints: ConstraintLayer[] = [br18Constraint, ...constraints];

  const footprintAreaM2 = polygonAreaM2(proposedFootprint25832);
  const minDistanceToBoundaryM = distanceToNearestBoundaryM(
    proposedFootprint25832,
    parcelWithSegments.polygon25832,
  );
  const areaDiscrepancyPct =
    (parcelWithSegments.areaDiscrepancyM2 / parcelWithSegments.areaRegisteredM2) * 100;
  const hasCenterlineDeklaration = allConstraints.some(
    (c) => c.type === "road_centerline_deklaration",
  );

  const parcelWithNeighbors = {
    ...parcelWithSegments,
    neighborParcels,
    roadName: roadNameResult.name,
  };

  const plan: BeliggenhedsplanInput = {
    crs: "EPSG:25832",
    parcel: parcelWithNeighbors,
    survey,
    existing,
    proposed: {
      footprint25832: proposedFootprint25832,
      rotationDeg: 0,
      footprintAreaM2,
      storeys: 1,
      heightM: null,
      sokkelKoteM: null,
      finishedFloorKoteM: null,
      terrainOffsetM: null,
      dimensions: [],
      source: generatedSourceMeta(),
    },
    constraints: allConstraints,
    utilities: [],
    siteUse: [],
    terrain: null,
    metadata,
    mandatoryAnnotations: buildMandatoryAnnotations(survey !== null, false),
  };

  const readiness = classifyDrawingReadiness({
    hasAddress: !!metadata.address,
    hasMatrikel: !!metadata.matrikel,
    hasParcelPolygon: true,
    hasProposedFootprint: true,
    hasCrsContract: true,
    parcelAreaDiscrepancyPct: areaDiscrepancyPct,
    minDistanceToSetbackLineM: minDistanceToBoundaryM,
    setbackRequirementM: 2.5,
    hasOpmaalteKoter: (survey?.terrainPoints.length ?? 0) > 0,
    hasDhmKoter: false,
    hasExistingBuildingGeometry: existing.buildings.length > 0,
    missingDataPoints: [],
    hasRoadCenterlineGeometry: true,
    hasCenterlineDeklaration,
    hasSurveyorAttestation: !!survey?.surveyorName,
  });

  return { plan, readiness };
}
```

- [ ] **Step 4: Kør alle tests**

```bash
bun test src/services/drawing/
```

Forventet: Alle grønne.

- [ ] **Step 5: Full suite + TypeScript**

```bash
bun test src && bunx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/services/drawing/
git commit -m "feat(drawing): assemble service — naboparceller, vejnavn, BR18-byggelinje, mandatoryAnnotations"
```

---

## Fase 2 — Survey + footprint import (Niveau 2: AUTO_REVIEW med koter)

**Forudsætning:** Fase 1 er gennemført. `bun test src` er grøn.  
**Kontekst:** Survey-dekoderen i `src/integrations/survey/upload-decoder.ts` eksisterer og parses via `SurveyUploadPayloadSchema` i `survey.schemas.ts`.  
**Output:** SVG-tegning med DVR90-koter, mål-linjer og korrekt footprint fra upload.

---

### Task 7: Opdater survey decoder

**Læs inden start:** `src/integrations/survey/upload-decoder.ts` + `src/integrations/survey/survey.schemas.ts`

**Filer:**

- Modificer: `src/integrations/survey/survey.schemas.ts`
- Modificer: `src/integrations/survey/upload-decoder.ts`

- [ ] **Step 1: Tilføj felter til SurveyUploadPayloadSchema**

Åbn `src/integrations/survey/survey.schemas.ts` og tilføj i `SurveyUploadPayloadSchema`:

```typescript
export const SurveyUploadPayloadSchema = z.object({
  surveyDate: z.string().optional().nullable(),
  surveyorName: z.string().optional().nullable(), // NY
  surveyorLicenseNr: z.string().optional().nullable(), // NY
  crs: z.literal("EPSG:25832"),
  points: z.array(SurveyPointRowSchema).min(1),
  notes: z.array(z.string()).optional().default([]),
});
```

- [ ] **Step 2: Opdater upload-decoder.ts**

I `src/integrations/survey/upload-decoder.ts`, tilføj de to nye felter til det returnerede `SurveyLayer`:

```typescript
const layer: SurveyLayer = {
  uploadedAt: now,
  surveyDate: payload.surveyDate ?? null,
  surveyorName: payload.surveyorName ?? null, // NY
  surveyorLicenseNr: payload.surveyorLicenseNr ?? null, // NY
  terrainPoints: payload.points
    .filter((p) => p.type === "terrain")
    .map((p) => ({ x: p.x, y: p.y, z: p.z, label: p.label, source: "survey" as const })),
  boundaryPoints: payload.points
    .filter((p) => p.type === "boundary")
    .map((p) => ({
      type: "Point" as const,
      crs: "EPSG:25832" as const,
      coordinates: [p.x, p.y] as [number, number],
    })),
  notes: payload.notes,
  source: surveySourceMeta(now),
};
```

- [ ] **Step 3: TypeScript + test**

```bash
bunx tsc --noEmit && bun test src
```

- [ ] **Step 4: Commit**

```bash
git add src/integrations/survey/
git commit -m "feat(survey): tilføj surveyorName og surveyorLicenseNr til SurveyUploadDecoder"
```

---

### Task 8: GeoJSON footprint decoder

**Filer:**

- Opret: `src/integrations/import/geojson-footprint-decoder.ts`
- Opret: `src/integrations/import/geojson-footprint-decoder.test.ts`

Dekoderen modtager rå GeoJSON og returnerer en valideret `GeoJsonPolygon25832`. Understøtter FeatureCollection (tager første Polygon-feature), Feature og rå Polygon.

- [ ] **Step 1: Opret failing test**

```typescript
// src/integrations/import/geojson-footprint-decoder.test.ts
import { describe, it, expect } from "bun:test";
import { decodeGeoJsonFootprint } from "./geojson-footprint-decoder";

const rawPolygon = {
  type: "Polygon",
  coordinates: [
    [
      [720005, 6170005],
      [720015, 6170005],
      [720015, 6170015],
      [720005, 6170015],
      [720005, 6170005],
    ],
  ],
};

describe("decodeGeoJsonFootprint", () => {
  it("accepterer rå Polygon", () => {
    const result = decodeGeoJsonFootprint({
      ...rawPolygon,
      crs: { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::25832" } },
    });
    expect(result.type).toBe("Polygon");
    expect(result.crs).toBe("EPSG:25832");
  });

  it("accepterer Feature med Polygon-geometri", () => {
    const result = decodeGeoJsonFootprint({
      type: "Feature",
      geometry: rawPolygon,
      properties: null,
    });
    expect(result.crs).toBe("EPSG:25832");
  });

  it("accepterer FeatureCollection og tager første Polygon", () => {
    const result = decodeGeoJsonFootprint({
      type: "FeatureCollection",
      features: [{ type: "Feature", geometry: rawPolygon, properties: null }],
    });
    expect(result.crs).toBe("EPSG:25832");
  });

  it("kaster fejl for ikke-polygon geometri", () => {
    expect(() => decodeGeoJsonFootprint({ type: "Point", coordinates: [0, 0] })).toThrow();
  });

  it("kaster fejl for ugyldig struktur", () => {
    expect(() => decodeGeoJsonFootprint("ikke geojson")).toThrow();
  });
});
```

- [ ] **Step 2: Kør test — verificer fejl**

```bash
bun test src/integrations/import/geojson-footprint-decoder.test.ts
```

- [ ] **Step 3: Opret implementering**

```typescript
// src/integrations/import/geojson-footprint-decoder.ts
import { z } from "zod";
import type { GeoJsonPolygon25832 } from "@/domain/drawing/beliggenhedsplan.types";

const polygonCoordinatesSchema = z.array(z.array(z.tuple([z.number(), z.number()]))).min(1);

function extractPolygonCoordinates(raw: unknown): [number, number][][] {
  const anyObj = raw as Record<string, unknown>;
  const type = anyObj["type"];

  if (type === "FeatureCollection") {
    const features = anyObj["features"];
    if (!Array.isArray(features) || features.length === 0) {
      throw new Error("FeatureCollection har ingen features");
    }
    return extractPolygonCoordinates(features[0]);
  }

  if (type === "Feature") {
    return extractPolygonCoordinates(anyObj["geometry"]);
  }

  if (type === "Polygon") {
    return polygonCoordinatesSchema.parse(anyObj["coordinates"]);
  }

  throw new Error(`Geometritype "${String(type)}" er ikke understøttet — forventet Polygon`);
}

export function decodeGeoJsonFootprint(raw: unknown): GeoJsonPolygon25832 {
  if (!raw || typeof raw !== "object") {
    throw new Error("Input er ikke et gyldigt GeoJSON-objekt");
  }

  const coordinates = extractPolygonCoordinates(raw);

  return {
    type: "Polygon",
    coordinates,
    crs: "EPSG:25832",
  };
}
```

- [ ] **Step 4: Kør tests — alle grønne**

```bash
bun test src/integrations/import/geojson-footprint-decoder.test.ts
```

- [ ] **Step 5: TypeScript + fuld suite**

```bash
bunx tsc --noEmit && bun test src
```

- [ ] **Step 6: Commit**

```bash
git add src/integrations/import/
git commit -m "feat(import): GeoJSON footprint decoder — Polygon, Feature, FeatureCollection"
```

---

### Task 9: Dimension lines helper

**Filer:**

- Opret: `src/lib/drawing/dimension-lines.ts`
- Opret: `src/lib/drawing/dimension-lines.test.ts`

Beregner afstandslinjer fra et bygningsfootprint: én mål-linje per ydre side med labelM = sidens faktiske længde.

- [ ] **Step 1: Opret failing test**

```typescript
// src/lib/drawing/dimension-lines.test.ts
import { describe, it, expect } from "bun:test";
import { buildDimensionLines } from "./dimension-lines";
import type { GeoJsonPolygon25832 } from "@/domain/drawing/beliggenhedsplan.types";

const rect15x10: GeoJsonPolygon25832 = {
  type: "Polygon",
  crs: "EPSG:25832",
  // Rektangel 15m bred (Ø-V) × 10m dyb (N-S)
  coordinates: [
    [
      [720000, 6170000],
      [720015, 6170000],
      [720015, 6170010],
      [720000, 6170010],
      [720000, 6170000],
    ],
  ],
};

describe("buildDimensionLines", () => {
  it("returnerer 4 dimensionslinjer for rektangel", () => {
    const lines = buildDimensionLines(rect15x10);
    expect(lines).toHaveLength(4);
  });

  it("to sider er ~15m og to er ~10m", () => {
    const lines = buildDimensionLines(rect15x10);
    const lengths = lines.map((l) => l.labelM).sort((a, b) => a - b);
    expect(lengths[0]).toBeCloseTo(10, 1);
    expect(lengths[1]).toBeCloseTo(10, 1);
    expect(lengths[2]).toBeCloseTo(15, 1);
    expect(lengths[3]).toBeCloseTo(15, 1);
  });

  it("alle fromPoint og toPoint er EPSG:25832", () => {
    const lines = buildDimensionLines(rect15x10);
    expect(lines.every((l) => l.fromPoint.crs === "EPSG:25832")).toBe(true);
    expect(lines.every((l) => l.toPoint.crs === "EPSG:25832")).toBe(true);
  });

  it("returnerer tom liste for polygon med færre end 3 punkter", () => {
    const bad: GeoJsonPolygon25832 = {
      type: "Polygon",
      crs: "EPSG:25832",
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [0, 0],
        ],
      ],
    };
    expect(buildDimensionLines(bad)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Kør test — verificer fejl**

```bash
bun test src/lib/drawing/dimension-lines.test.ts
```

- [ ] **Step 3: Implementer**

```typescript
// src/lib/drawing/dimension-lines.ts
import type { DimensionLine, GeoJsonPolygon25832 } from "@/domain/drawing/beliggenhedsplan.types";

function sideLength(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);
}

function sideDirection(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): "north" | "south" | "east" | "west" {
  const dx = bx - ax;
  const dy = by - ay;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "east" : "west";
  return dy >= 0 ? "north" : "south";
}

export function buildDimensionLines(polygon: GeoJsonPolygon25832): DimensionLine[] {
  const ring = polygon.coordinates[0];
  if (!ring || ring.length < 4) return [];

  const lines: DimensionLine[] = [];

  for (let i = 0; i < ring.length - 1; i++) {
    const [ax, ay] = ring[i]!;
    const [bx, by] = ring[i + 1]!;
    const len = sideLength(ax, ay, bx, by);
    if (len < 0.1) continue;

    lines.push({
      fromPoint: { type: "Point", crs: "EPSG:25832", coordinates: [ax, ay] },
      toPoint: { type: "Point", crs: "EPSG:25832", coordinates: [bx, by] },
      labelM: Math.round(len * 100) / 100,
      side: sideDirection(ax, ay, bx, by),
    });
  }

  return lines;
}
```

- [ ] **Step 4: Kør tests**

```bash
bun test src/lib/drawing/dimension-lines.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/drawing/dimension-lines.ts src/lib/drawing/dimension-lines.test.ts
git commit -m "feat(drawing): dimension-lines helper — beregner mål-linjer fra polygon-sider"
```

---

### Task 10: Label placement engine

**Filer:**

- Opret: `src/lib/drawing/label-placement.ts`
- Opret: `src/lib/drawing/label-placement.test.ts`

Deterministisk label-placement: finder bedste position for et tekst-label givet et ankerpunkt og en liste af allerede-placerede bounding-boxes.

- [ ] **Step 1: Opret failing test**

```typescript
// src/lib/drawing/label-placement.test.ts
import { describe, it, expect } from "bun:test";
import { findLabelPosition, type PlacedLabel } from "./label-placement";

describe("findLabelPosition", () => {
  it("returnerer nordøst-position når ingen konflikter", () => {
    const pos = findLabelPosition({
      anchorX: 100,
      anchorY: 100,
      text: "27.20",
      existingLabels: [],
    });
    expect(pos.x).toBeGreaterThan(100);
    expect(pos.y).toBeGreaterThan(100);
    expect(pos.requiresManualReview).toBe(false);
  });

  it("undgår eksisterende label ved at vælge anden kandidat", () => {
    const blocking: PlacedLabel = { x: 108, y: 108, width: 20, height: 8 };
    const pos = findLabelPosition({
      anchorX: 100,
      anchorY: 100,
      text: "27.20",
      existingLabels: [blocking],
    });
    const overlapsBlocking =
      pos.x < blocking.x + blocking.width &&
      pos.x + pos.width > blocking.x &&
      pos.y < blocking.y + blocking.height &&
      pos.y + pos.height > blocking.y;
    expect(overlapsBlocking).toBe(false);
  });

  it("sætter requiresManualReview=true når alle positioner er blokerede", () => {
    const allBlocked: PlacedLabel[] = [
      { x: 90, y: 90, width: 40, height: 30 },
      { x: 60, y: 90, width: 40, height: 30 },
      { x: 90, y: 60, width: 40, height: 30 },
      { x: 60, y: 60, width: 40, height: 30 },
      { x: 90, y: 120, width: 40, height: 30 },
      { x: 60, y: 120, width: 40, height: 30 },
      { x: 120, y: 90, width: 40, height: 30 },
      { x: 120, y: 60, width: 40, height: 30 },
    ];
    const pos = findLabelPosition({
      anchorX: 100,
      anchorY: 100,
      text: "27.20",
      existingLabels: allBlocked,
    });
    expect(pos.requiresManualReview).toBe(true);
  });
});
```

- [ ] **Step 2: Kør test — verificer fejl**

```bash
bun test src/lib/drawing/label-placement.test.ts
```

- [ ] **Step 3: Implementer**

```typescript
// src/lib/drawing/label-placement.ts

export type PlacedLabel = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type LabelPlacementInput = {
  anchorX: number;
  anchorY: number;
  text: string;
  existingLabels: PlacedLabel[];
  charWidthPx?: number;
  fontHeightPx?: number;
  offsetPx?: number;
};

export type LabelPlacementResult = PlacedLabel & {
  requiresManualReview: boolean;
};

const CANDIDATE_OFFSETS: [number, number][] = [
  [1, 1], // NØ (foretrukket)
  [-1, 1], // NV
  [1, -1], // SØ
  [-1, -1], // SV
  [0, 1], // N
  [1, 0], // Ø
  [0, -1], // S
  [-1, 0], // V
];

function overlaps(a: PlacedLabel, b: PlacedLabel): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function findLabelPosition(input: LabelPlacementInput): LabelPlacementResult {
  const {
    anchorX,
    anchorY,
    text,
    existingLabels,
    charWidthPx = 5.5,
    fontHeightPx = 8,
    offsetPx = 4,
  } = input;

  const width = text.length * charWidthPx;
  const height = fontHeightPx;

  for (const [dx, dy] of CANDIDATE_OFFSETS) {
    const candidate: PlacedLabel = {
      x: anchorX + dx * offsetPx,
      y: anchorY + dy * offsetPx,
      width,
      height,
    };

    if (!existingLabels.some((existing) => overlaps(candidate, existing))) {
      return { ...candidate, requiresManualReview: false };
    }
  }

  // Fallback: brug NØ uanset overlap, markér til manuel gennemgang
  return {
    x: anchorX + offsetPx,
    y: anchorY + offsetPx,
    width,
    height,
    requiresManualReview: true,
  };
}
```

- [ ] **Step 4: Kør tests**

```bash
bun test src/lib/drawing/label-placement.test.ts
```

- [ ] **Step 5: Fuld suite**

```bash
bun test src && bunx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/drawing/label-placement.ts src/lib/drawing/label-placement.test.ts
git commit -m "feat(drawing): deterministisk label-placement engine med kollisionsdetektion"
```

---

## Fase 3 — SVG renderer v2 (Niveau 1+2+3: alle lag)

**Forudsætning:** Fase 1 og 2 er gennemført. `bun test src` er grøn.  
**Kontekst:**

- `src/domain/drawing/drawing-model.ts` definerer `DrawingLayerKind`, `DrawingModel`, `DrawingFeature`
- `src/lib/drawing/render-svg.ts` renderer `DrawingModel` til SVG
- `src/lib/drawing/drawing-model-builder.ts` konverterer `BeliggenhedsplanInput` → `DrawingModel`  
  **Output:** Komplet SVG med mål-linjer, koter, byggelinjer, kloak, skraveringer og komplet titleblok.

---

### Task 11: Udvid DrawingLayerKind

**Læs inden start:** `src/domain/drawing/drawing-model.ts`

**Filer:**

- Modificer: `src/domain/drawing/drawing-model.ts`

- [ ] **Step 1: Tilføj nye lag-typer til DrawingLayerKind**

Åbn `src/domain/drawing/drawing-model.ts` og erstat `DrawingLayerKind`:

```typescript
export type DrawingLayerKind =
  | "parcel_boundary"
  | "neighbor_parcels"
  | "existing_buildings"
  | "proposed_buildings"
  | "setback_lines"
  | "building_lines"
  | "terrain_points"
  | "utilities"
  | "site_use"
  | "dimensions"
  | "labels"
  | "title_block"
  | "legend"
  // NYE lag:
  | "dimension_lines"
  | "terrain_labels"
  | "utility_lines"
  | "utility_wells"
  | "hatch_areas"
  | "road_label"
  | "scale_bar"
  | "mandatory_annotations";
```

- [ ] **Step 2: TypeScript-tjek**

```bash
bunx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/domain/drawing/drawing-model.ts
git commit -m "feat(drawing): udvid DrawingLayerKind med dimension_lines, terrain_labels, utility_wells, hatch_areas m.fl."
```

---

### Task 12: Opdater DrawingModelBuilder

**Læs inden start:**  
`src/lib/drawing/drawing-model-builder.ts`  
`src/lib/drawing/dimension-lines.ts` (fra Task 9)  
`src/lib/drawing/label-placement.ts` (fra Task 10)

**Filer:**

- Modificer: `src/lib/drawing/drawing-model-builder.ts`

Builderen skal nu generere SVG-elementer for alle nye lag.

- [ ] **Step 1: Tilføj failing test**

Åbn `src/lib/drawing/render-svg.test.ts` og tilføj:

```typescript
it("indeholder BR18-byggelinje hvis constraints har br18_setback", () => {
  const modelWithConstraint: DrawingModel = {
    ...model,
    features: [
      ...model.features,
      {
        id: "br18-1",
        kind: "setback_lines",
        svgElement:
          '<polygon points="10,10 90,10 90,60 10,60" fill="none" stroke="red" stroke-width="0.5"/>',
        label: "Byggelinje 2,5 m fra skel",
        labelX: 50,
        labelY: 10,
        zIndex: 20,
      },
    ],
  };
  expect(renderSvg(modelWithConstraint)).toContain("br18-1");
});
```

- [ ] **Step 2: Kør test**

```bash
bun test src/lib/drawing/render-svg.test.ts
```

Forventet: Grøn (testen tjekker feature-id, ikke byggelogik).

- [ ] **Step 3: Opdater buildDrawingModel**

Erstat hele `src/lib/drawing/drawing-model-builder.ts`:

```typescript
// src/lib/drawing/drawing-model-builder.ts
import type { BeliggenhedsplanInput } from "@/domain/drawing/beliggenhedsplan.types";
import type { DrawingReadinessDecision } from "@/domain/drawing/decision-engine";
import type { DrawingModel, DrawingFeature } from "@/domain/drawing/drawing-model";
import { PAGE_SIZES, computeViewport } from "@/domain/drawing/drawing-model";
import { buildDimensionLines } from "./dimension-lines";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function coordsToSvgPoints(
  coords: [number, number][],
  minX: number,
  maxY: number,
  scale: number,
): string {
  return coords.map(([x, y]) => `${(x - minX) * scale},${(maxY - y) * scale}`).join(" ");
}

function polygonFeature(
  id: string,
  kind: DrawingFeature["kind"],
  coords: [number, number][],
  minX: number,
  maxY: number,
  scale: number,
  style: string,
  label: string | null = null,
  zIndex = 10,
): DrawingFeature {
  const pts = coordsToSvgPoints(coords, minX, maxY, scale);
  const cx = coords.reduce((s, c) => s + c[0], 0) / coords.length;
  const cy = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  return {
    id,
    kind,
    svgElement: `<polygon points="${pts}" ${style}/>`,
    label,
    labelX: (cx - minX) * scale,
    labelY: (maxY - cy) * scale,
    zIndex,
  };
}

export function buildDrawingModel(
  plan: BeliggenhedsplanInput,
  readiness: DrawingReadinessDecision,
): DrawingModel {
  const coords = plan.parcel.polygon25832.coordinates[0];
  const xs = coords.map((c) => c[0]);
  const ys = coords.map((c) => c[1]);
  const pad = 20;
  const bbox: [number, number, number, number] = [
    Math.min(...xs) - pad,
    Math.min(...ys) - pad,
    Math.max(...xs) + pad,
    Math.max(...ys) + pad,
  ];
  const [minX, minY, maxX, maxY] = bbox;
  const page = PAGE_SIZES[plan.metadata.paperSize];
  const titleBlockMm = 60;
  const drawWidthMm = page.widthMm - titleBlockMm;
  const PX_PER_MM = 3.7795;
  const drawWidthPx = drawWidthMm * PX_PER_MM;
  const drawHeightPx = page.heightMm * PX_PER_MM;
  const scaleX = drawWidthPx / (maxX - minX);
  const scaleY = drawHeightPx / (maxY - minY);
  const scale = Math.min(scaleX, scaleY) * 0.9;

  const features: DrawingFeature[] = [];

  // Parcelpolygon
  features.push(
    polygonFeature(
      "parcel",
      "parcel_boundary",
      plan.parcel.polygon25832.coordinates[0] as [number, number][],
      minX,
      maxY,
      scale,
      'fill="none" stroke="#000" stroke-width="1.5"',
      plan.parcel.matrikelnummer,
      30,
    ),
  );

  // Nabomatrikler
  plan.parcel.neighborParcels.forEach((np, i) => {
    if (!np.polygon25832) return;
    features.push(
      polygonFeature(
        `neighbor-${i}`,
        "neighbor_parcels",
        np.polygon25832.coordinates[0] as [number, number][],
        minX,
        maxY,
        scale,
        'fill="none" stroke="#888" stroke-width="0.8" stroke-dasharray="3,2"',
        np.matrikelnummer,
        5,
      ),
    );
  });

  // Eksisterende bygninger
  plan.existing.buildings.forEach((b, i) => {
    features.push(
      polygonFeature(
        `existing-${i}`,
        "existing_buildings",
        b.footprint25832.coordinates[0] as [number, number][],
        minX,
        maxY,
        scale,
        'fill="#e8e8e8" stroke="#555" stroke-width="0.8"',
        null,
        15,
      ),
    );
  });

  // Foreslået bygning
  features.push(
    polygonFeature(
      "proposed",
      "proposed_buildings",
      plan.proposed.footprint25832.coordinates[0] as [number, number][],
      minX,
      maxY,
      scale,
      'fill="#d4e8ff" stroke="#00f" stroke-width="1"',
      null,
      20,
    ),
  );

  // Byggelinjer (constraints)
  plan.constraints.forEach((c, i) => {
    const isSetback = c.type === "br18_setback";
    const stroke = isSetback ? "#c00" : "#f80";
    const dash = isSetback ? "" : 'stroke-dasharray="6,3"';
    if (c.geometry25832.type === "Polygon") {
      const pts = coordsToSvgPoints(
        c.geometry25832.coordinates[0] as [number, number][],
        minX,
        maxY,
        scale,
      );
      features.push({
        id: `constraint-${i}`,
        kind: "setback_lines",
        svgElement: `<polygon points="${pts}" fill="none" stroke="${stroke}" stroke-width="0.6" ${dash}/>`,
        label: c.label,
        labelX: null,
        labelY: null,
        zIndex: 25,
      });
    }
  });

  // Mål-linjer
  const dimLines = buildDimensionLines(plan.proposed.footprint25832);
  dimLines.forEach((dl, i) => {
    const x1 = (dl.fromPoint.coordinates[0] - minX) * scale;
    const y1 = (maxY - dl.fromPoint.coordinates[1]) * scale;
    const x2 = (dl.toPoint.coordinates[0] - minX) * scale;
    const y2 = (maxY - dl.toPoint.coordinates[1]) * scale;
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    features.push({
      id: `dim-${i}`,
      kind: "dimension_lines",
      svgElement: `<g><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#00f" stroke-width="0.4"/><text x="${mx}" y="${my - 3}" text-anchor="middle" font-family="Arial" font-size="6" fill="#00f">${dl.labelM.toFixed(2)}</text></g>`,
      label: null,
      labelX: null,
      labelY: null,
      zIndex: 35,
    });
  });

  // Terrain-koter
  if (plan.survey) {
    plan.survey.terrainPoints.forEach((tp, i) => {
      const px = (tp.x - minX) * scale;
      const py = (maxY - tp.y) * scale;
      features.push({
        id: `kote-${i}`,
        kind: "terrain_labels",
        svgElement: `<g><circle cx="${px}" cy="${py}" r="1.5" fill="#555"/><text x="${px + 4}" y="${py - 2}" font-family="Arial" font-size="6" fill="#333">${tp.z.toFixed(2)}</text></g>`,
        label: String(tp.z),
        labelX: px,
        labelY: py,
        zIndex: 40,
      });
    });
  }

  // Obligatoriske noter
  const annots = plan.mandatoryAnnotations;
  const annotLines = [
    annots.koteDatum,
    annots.terrainSurveyedBy,
    annots.sewerResponsibility,
    annots.ratBarrierNote,
  ].filter(Boolean) as string[];

  if (annotLines.length > 0) {
    const annotSvg = annotLines
      .map(
        (line, i) =>
          `<text x="4" y="${drawHeightPx - 20 + i * 10}" font-family="Arial" font-size="5" fill="#333">${esc(line)}</text>`,
      )
      .join("\n");
    features.push({
      id: "mandatory-annotations",
      kind: "mandatory_annotations",
      svgElement: `<g>${annotSvg}</g>`,
      label: null,
      labelX: null,
      labelY: null,
      zIndex: 50,
    });
  }

  const areaTable = plan.metadata.areaTable ?? {
    grundarealM2: plan.parcel.areaRegisteredM2,
    groundFloorM2: plan.proposed.footprintAreaM2,
    firstFloorM2: null,
    doubleHeightDeductionM2: 0,
    totalResidentialM2: plan.proposed.footprintAreaM2,
    coveragePercent: (plan.proposed.footprintAreaM2 / plan.parcel.areaRegisteredM2) * 100,
    calculationBasis: "BR18 §452",
  };

  const revisions =
    plan.metadata.revisions.length > 0
      ? plan.metadata.revisions
      : [{ nr: "A", description: "Udgivelse", date: plan.metadata.date, by: "" }];

  return {
    page: {
      size: plan.metadata.paperSize,
      orientation: "landscape",
      scale: plan.metadata.scale,
      ...page,
    },
    viewport: computeViewport(bbox, plan.metadata.scale),
    features,
    titleBlock: {
      title: plan.metadata.title,
      address: plan.metadata.address,
      matrikel: plan.metadata.matrikel,
      bygherre: plan.metadata.bygherre,
      sagNr: plan.metadata.sagNr,
      scale: `1:${plan.metadata.scale}`,
      paperSize: plan.metadata.paperSize,
      date: plan.metadata.date,
      revision: revisions[0]?.nr ?? "A",
      disclaimer: readiness.status === "AUTO_DRAFT" ? "FORELØBIG — ikke til myndighedsbrug" : null,
      sourceList: [
        `Grundareal: ${areaTable.grundarealM2} m²`,
        `Bebyg.%: ${areaTable.coveragePercent.toFixed(2)}% (${areaTable.calculationBasis})`,
        ...(plan.metadata.buildingCode ? [`Opføres efter: ${plan.metadata.buildingCode}`] : []),
        ...(plan.metadata.bygherre ? [`Bygherre: ${plan.metadata.bygherre}`] : []),
        ...(plan.metadata.sagNr ? [`Sagsnr.: ${plan.metadata.sagNr}`] : []),
        ...(readiness.reviewRequiredBy.length > 0
          ? [`Review: ${readiness.reviewRequiredBy.join(", ")}`]
          : []),
      ],
    },
    legend: [
      {
        symbol: '<rect width="12" height="8" fill="none" stroke="#000" stroke-width="1.5"/>',
        label: "Parcel",
      },
      {
        symbol: '<rect width="12" height="8" fill="#d4e8ff" stroke="#00f" stroke-width="1"/>',
        label: "Nyt byggeri",
      },
      {
        symbol: '<rect width="12" height="8" fill="#e8e8e8" stroke="#555" stroke-width="0.8"/>',
        label: "Eksist. bygning",
      },
      {
        symbol: '<line x1="0" y1="4" x2="12" y2="4" stroke="#c00" stroke-width="0.6"/>',
        label: "Byggelinje BR18",
      },
    ],
    northArrowRotationDeg: 0,
    readinessStatus: readiness.status,
  };
}
```

- [ ] **Step 4: Kør tests**

```bash
bun test src/lib/drawing/
```

- [ ] **Step 5: TypeScript + fuld suite**

```bash
bunx tsc --noEmit && bun test src
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/drawing/drawing-model-builder.ts
git commit -m "feat(drawing): DrawingModelBuilder v2 — nabomatrikler, byggelinjer, mål-linjer, koter, obligatoriske noter"
```

---

### Task 13: Opdater SVG-renderer med titleblok v2 og skalastav

**Læs inden start:** `src/lib/drawing/render-svg.ts` + `src/lib/drawing/render-svg.test.ts`

**Filer:**

- Modificer: `src/lib/drawing/render-svg.ts`
- Modificer: `src/lib/drawing/render-svg.test.ts`

- [ ] **Step 1: Tilføj failing tests**

Åbn `src/lib/drawing/render-svg.test.ts` og tilføj:

```typescript
it("indeholder bebyggelsesprocent i kildelist", () => {
  const modelWithArea: DrawingModel = {
    ...model,
    titleBlock: {
      ...model.titleBlock,
      sourceList: ["Grundareal: 1086 m²", "Bebyg.%: 24.98% (BR18 §452)"],
    },
  };
  expect(renderSvg(modelWithArea)).toContain("Bebyg.%");
});

it("indeholder skalastav-tekst", () => {
  expect(renderSvg(model)).toContain("1:250");
});
```

- [ ] **Step 2: Kør tests — verificer de nye passer (sourceList er allerede implementeret)**

```bash
bun test src/lib/drawing/render-svg.test.ts
```

- [ ] **Step 3: Opdater render-svg.ts med titleblok v2**

Erstat titelblokkens `titleSvg`-sektion i `renderSvg` (hold resten uændret):

```typescript
const { titleBlock: tb } = model;
const tx = drawW;
const lineH = 9;
let lineY = 14;

function tbLine(text: string, size = 7, bold = false): string {
  const weight = bold ? ' font-weight="bold"' : "";
  const svg = `<text x="${tx + 5}" y="${lineY}" font-family="Arial" font-size="${size}" fill="#222"${weight}>${esc(text)}</text>`;
  lineY += lineH;
  return svg;
}

const titleSvg = `
    <rect x="${tx}" y="0" width="${titleBlockW}" height="${h}" fill="#f9f9f9" stroke="#bbb" stroke-width="0.5"/>
    ${tbLine(tb.title, 9, true)}
    ${tbLine(tb.address)}
    ${tbLine(tb.matrikel)}
    <line x1="${tx}" y1="${lineY}" x2="${tx + titleBlockW}" y2="${lineY}" stroke="#bbb" stroke-width="0.3"/>
    ${(() => {
      lineY += 4;
      return "";
    })()}
    ${tb.sourceList.map((s) => tbLine(s, 6)).join("\n")}
    <line x1="${tx}" y1="${lineY}" x2="${tx + titleBlockW}" y2="${lineY}" stroke="#bbb" stroke-width="0.3"/>
    ${(() => {
      lineY += 4;
      return "";
    })()}
    ${tb.bygherre ? tbLine(`Bygherre: ${tb.bygherre}`, 6) : ""}
    ${tb.sagNr ? tbLine(`Sagsnr.: ${tb.sagNr}`, 6) : ""}
    <line x1="${tx}" y1="${lineY}" x2="${tx + titleBlockW}" y2="${lineY}" stroke="#bbb" stroke-width="0.3"/>
    ${(() => {
      lineY += 4;
      return "";
    })()}
    ${tbLine(`Dato: ${tb.date}`, 6)}
    ${tbLine(`Mål: ${tb.scale}  Ark: ${tb.paperSize}`, 6)}
    ${tbLine(`Rev.: ${tb.revision}`, 6)}
    <line x1="${tx}" y1="${lineY}" x2="${tx + titleBlockW}" y2="${lineY}" stroke="#bbb" stroke-width="0.3"/>
    ${(() => {
      lineY += 4;
      return "";
    })()}
    ${tb.disclaimer ? `<text x="${tx + 5}" y="${lineY}" font-family="Arial" font-size="6" fill="#c00" font-weight="bold">${esc(tb.disclaimer)}</text>` : ""}
  `;
```

Tilføj skalastav øverst i `<g clip-path>` sektionen (efter `featuresSvg`):

```typescript
const scaleBarM = model.page.scale === 250 ? 10 : 20;
const scaleBarPx = (scaleBarM / model.viewport.metersPerMm) * PX_PER_MM;
const scaleBarSvg = `<g transform="translate(10,${h - 20})">
    <rect x="0" y="0" width="${scaleBarPx / 2}" height="4" fill="#000"/>
    <rect x="${scaleBarPx / 2}" y="0" width="${scaleBarPx / 2}" height="4" fill="#fff" stroke="#000" stroke-width="0.5"/>
    <text x="0" y="10" font-family="Arial" font-size="5">0</text>
    <text x="${scaleBarPx / 2}" y="10" font-family="Arial" font-size="5" text-anchor="middle">${scaleBarM / 2}m</text>
    <text x="${scaleBarPx}" y="10" font-family="Arial" font-size="5" text-anchor="end">${scaleBarM}m</text>
  </g>`;
```

Tilføj `scaleBarSvg` til SVG-outputtet inden for `clip-path`-gruppen.

- [ ] **Step 4: Kør alle tests**

```bash
bun test src/lib/drawing/render-svg.test.ts
```

Forventet: Alle grønne.

- [ ] **Step 5: Full suite + TypeScript + build**

```bash
bun test src && bunx tsc --noEmit && bun run build
```

Forventet: Ingen fejl.

- [ ] **Step 6: Commit**

```bash
git add src/lib/drawing/render-svg.ts src/lib/drawing/render-svg.test.ts
git commit -m "feat(drawing): SVG renderer v2 — titleblok med arealtabel, skalastav, disclaimer"
```

---

## Verifikation af alle tre faser

- [ ] **Kør fuld test-suite**

```bash
bun test src
```

Forventet: Alle tests grønne — ingen regressioner.

- [ ] **TypeScript**

```bash
bunx tsc --noEmit
```

Forventet: Ingen fejl.

- [ ] **Build**

```bash
bun run build
```

Forventet: Ingen fejl.

- [ ] **Aktivér live data (manuelt trin)**

Sæt i `.env.local`:

```
GEODANMARK_MOCK=false
MAT_NEIGHBOR_PARCELS_MOCK=false
```

Kør smoke-test mod en reel adresse (fx Hasselvej 48, Gentofte) og verificer at:

- Parcelpolygon hentes
- Nabomatrikler returneres
- Nabobygninger returneres med geometri

---

## Deferred (ikke i denne plan)

- PDF-render via `pdf-lib` — kræver server-side renderer
- Kloak-layout editor i UI — disponeringsarealer tegnes manuelt
- DXF-import (kun GeoJSON understøttes i denne plan)
- Plandata byggefeltsgeometri (Plandata returnerer kun status i dag)
- Vejmidte-geometri fra GeoDanmark (live endpoint ikke verificeret)
- Nordpil rotation fra faktisk nord-orientering
- Tingbog/servitut-geometri for historiske deklarationer
