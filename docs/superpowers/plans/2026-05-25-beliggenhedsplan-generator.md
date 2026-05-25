# Beliggenhedsplan Generator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Byg data-foundation, beslutningsmotor, geometricore og rendering-pipeline til at generere myndighedsegnede beliggenhedsplaner fra danske offentlige registre og landinspektoerdata.

**Architecture:** Strict Ports & Adapters — pure domaetyper og Zod-schemas i `src/domain/drawing/`, application services i `src/services/drawing/`, rendering-helpers i `src/lib/drawing/`, register- og storage-adapters i `src/integrations/`. Systemet samler en typed `BeliggenhedsplanInput` fra registerdata, evaluerer tegningskvalitet via en deterministisk `DrawingReadinessDecisionEngine`, beregner geometri i EPSG:25832 via `jsts`, renderer til SVG og eksporterer til PDF. LLMs maa aldrig placere koordinater.

**Tech Stack:** TypeScript, Bun, bun:test, Zod, proj4 (allerede installeret), jsts (ny dependency), SVG string generation, pdf-lib (Phase 6).

**Architecture reference:** `docs/beliggenhedsplan-generator-plan.md` — laes inden du starter en task.

**Gatekeeper Protocol svar:** Se afsnit 7.9 i architecture reference.

---

## File Map

| Fil                                                              | Ansvar                                                                                        | Phase |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----- |
| `src/domain/drawing/beliggenhedsplan.types.ts`                   | Alle domain-typer (BeliggenhedsplanInput, lag-typer, CRS-wrappere)                            | 1     |
| `src/domain/drawing/beliggenhedsplan.schemas.ts`                 | Zod schemas til hvert boundary-kryds                                                          | 1     |
| `src/domain/drawing/ports.ts`                                    | Port-interfaces: DrawingGeometrySourcePort, SurveyUploadDecoderPort, DrawingExportStorePort   | 1     |
| `src/domain/drawing/source-quality.ts`                           | DrawingSourceQualityReport + confidence-helpers                                               | 1     |
| `src/domain/drawing/decision-engine.ts`                          | DrawingReadinessDecisionEngine — klassificerer AUTO_DRAFT/AUTO_REVIEW/SURVEY_REQUIRED/BLOCKED | 1     |
| `src/domain/drawing/decision-engine.test.ts`                     | Tier 1 tests for alle 4 readiness-statuser                                                    | 1     |
| `src/domain/drawing/geometry-engine.ts`                          | CRS-normalisering, polygon-afstand/buffer/overlap/segmentering via jsts                       | 2     |
| `src/domain/drawing/geometry-engine.test.ts`                     | Tests med kendte polygon-fixtures i EPSG:25832                                                | 2     |
| `src/domain/drawing/drawing-model.ts`                            | DrawingModel, DrawingLayer, DrawingFeature, titelbloktypes                                    | 5     |
| `src/lib/drawing/footprint-builder.ts`                           | Pure helper: byg kvadratfootprint fra centroid + areal (erstatning for MatrikelMap-logik)     | 3     |
| `src/lib/drawing/drawing-model-builder.ts`                       | Konverterer BeliggenhedsplanInput → DrawingModel                                              | 5     |
| `src/lib/drawing/drawing-symbols.ts`                             | SVG-symboler: nordpil, skraveringer, linjestyler                                              | 5     |
| `src/lib/drawing/render-svg.ts`                                  | Deterministisk SVG-renderer fra DrawingModel                                                  | 5     |
| `src/lib/drawing/render-svg.test.ts`                             | Strukturelle SVG-tests (indeholder parcel, nordpil, titelbloktekst)                           | 5     |
| `src/services/drawing/assemble-beliggenhedsplan.service.ts`      | Application service: samler BeliggenhedsplanInput via ports                                   | 4     |
| `src/services/drawing/assemble-beliggenhedsplan.service.test.ts` | Tier 2 tests med fake port-implementations                                                    | 4     |
| `src/services/drawing/export-drawing.service.ts`                 | Application service: SVG-render → PDF → storage → DB-record                                   | 6     |
| `src/integrations/geodanmark/drawing-layers.ts`                  | Implementerer DrawingGeometrySourcePort via eksisterende GeoDanmark-klient                    | 4     |
| `src/integrations/survey/survey.schemas.ts`                      | Zod schemas til survey-upload format (CSV/JSON)                                               | 4     |
| `src/integrations/survey/upload-decoder.ts`                      | Implementerer SurveyUploadDecoderPort                                                         | 4     |
| `src/integrations/supabase/repositories/drawing.repository.ts`   | Supabase adapter: drawing_sources/drawing_geometries/drawing_exports                          | 6     |
| `src/components/cockpit/MatrikelMap.tsx`                         | Refaktoreret til ren visningsadapter — ingen geometriberegninger                              | 3     |

---

## Phase 1 — Data Contracts & Readiness

### Task 1: Domain Types

**Files:**

- Create: `src/domain/drawing/beliggenhedsplan.types.ts`

- [x] **Step 1: Create types file**

```typescript
// src/domain/drawing/beliggenhedsplan.types.ts

export type Crs25832 = "EPSG:25832";
export type BBox25832 = [number, number, number, number]; // [minX, minY, maxX, maxY]

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

export type ProposedBuildingLayer = {
  footprint25832: GeoJsonPolygon25832;
  rotationDeg: number;
  footprintAreaM2: number;
  storeys: number;
  heightM: number | null;
  sokkelKoteM: number | null;
  source: LayerSourceMeta;
};

export type ConstraintLayer = {
  type:
    | "br18_setback"
    | "localplan_building_line"
    | "road_building_line"
    | "servitut"
    | "building_field";
  geometry25832: GeoJsonPolygon25832 | GeoJsonLineString25832;
  label: string;
  ruleText: string | null;
  source: LayerSourceMeta;
};

export type UtilityLayer = {
  type: "water" | "sewer" | "electric" | "gas" | "rainwater" | "wastewater";
  geometry25832: GeoJsonPoint25832 | GeoJsonLineString25832;
  label: string;
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
  source: LayerSourceMeta;
};

export type DrawingMetadata = {
  title: string;
  address: string;
  matrikel: string;
  bygherre: string | null;
  sagNr: string | null;
  revision: string;
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
};
```

- [x] **Step 2: TypeScript check**

```bash
bunx tsc --noEmit
```

Expected: ingen fejl.

- [x] **Step 3: Commit**

```bash
git add src/domain/drawing/beliggenhedsplan.types.ts
git commit -m "feat(drawing): add BeliggenhedsplanInput domain types"
```

---

### Task 2: Zod Schemas

**Files:**

- Create: `src/domain/drawing/beliggenhedsplan.schemas.ts`

- [x] **Step 1: Create schemas file**

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
  source: LayerSourceMetaSchema,
});

export const SurveyLayerSchema = z.object({
  uploadedAt: z.string(),
  surveyDate: z.string().nullable(),
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

export const ProposedBuildingLayerSchema = z.object({
  footprint25832: GeoJsonPolygon25832Schema,
  rotationDeg: z.number(),
  footprintAreaM2: z.number().positive(),
  storeys: z.number().int().positive(),
  heightM: z.number().nullable(),
  sokkelKoteM: z.number().nullable(),
  source: LayerSourceMetaSchema,
});

export const ConstraintLayerSchema = z.object({
  type: z.enum([
    "br18_setback",
    "localplan_building_line",
    "road_building_line",
    "servitut",
    "building_field",
  ]),
  geometry25832: z.union([GeoJsonPolygon25832Schema, GeoJsonLineString25832Schema]),
  label: z.string(),
  ruleText: z.string().nullable(),
  source: LayerSourceMetaSchema,
});

export const DrawingMetadataSchema = z.object({
  title: z.string().min(1),
  address: z.string().min(1),
  matrikel: z.string().min(1),
  bygherre: z.string().nullable(),
  sagNr: z.string().nullable(),
  revision: z.string(),
  date: z.string(),
  scale: z.union([z.literal(250), z.literal(500)]),
  paperSize: z.enum(["A3", "A2", "A1"]),
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
});
```

- [x] **Step 2: TypeScript check**

```bash
bunx tsc --noEmit
```

- [x] **Step 3: Commit**

```bash
git add src/domain/drawing/beliggenhedsplan.schemas.ts
git commit -m "feat(drawing): add Zod schemas for all BeliggenhedsplanInput boundaries"
```

---

### Task 3: Port Interfaces + Source Quality

**Files:**

- Create: `src/domain/drawing/ports.ts`
- Create: `src/domain/drawing/source-quality.ts`

- [x] **Step 1: Create ports.ts**

```typescript
// src/domain/drawing/ports.ts
import type {
  ParcelLayer,
  ExistingFeaturesLayer,
  ConstraintLayer,
  SurveyLayer,
  BBox25832,
} from "./beliggenhedsplan.types";

export interface DrawingGeometrySourcePort {
  fetchParcelLayers(matrikelId: string): Promise<ParcelLayer | null>;
  fetchNeighborBuildings(bbox25832: BBox25832): Promise<ExistingFeaturesLayer>;
  fetchRoadGeometry(
    addressId: string,
  ): Promise<{ centerline25832: import("./beliggenhedsplan.types").GeoJsonLineString25832 | null }>;
  fetchPlandataLayers(kommunekode: string, bbox25832: BBox25832): Promise<ConstraintLayer[]>;
}

export interface SurveyUploadDecoderPort {
  decode(raw: unknown): Promise<SurveyLayer>;
}

export type DrawingExportRecord = {
  id: string;
  projectId: string;
  svgPath: string | null;
  pdfPath: string | null;
  readinessStatus: string;
  generatedAt: string;
  approvedAt: string | null;
};

export interface DrawingExportStorePort {
  saveSvg(projectId: string, svg: string): Promise<string>;
  savePdf(projectId: string, pdf: Uint8Array): Promise<string>;
  getExport(exportId: string): Promise<DrawingExportRecord | null>;
}
```

- [x] **Step 2: Create source-quality.ts**

```typescript
// src/domain/drawing/source-quality.ts
import type { DataConfidence, DataSource, LayerSourceMeta } from "./beliggenhedsplan.types";

export type DrawingSourceQualityReport = {
  overallConfidence: DataConfidence;
  layerReports: LayerQualityReport[];
  missingDataPoints: string[];
  requiresReviewBy: Array<
    "landinspektoer" | "arkitekt" | "ingenioer" | "kloakmester" | "myndighed"
  >;
};

export type LayerQualityReport = {
  layerName: string;
  path: string;
  source: DataSource;
  confidence: DataConfidence;
  requiresReview: boolean;
  missing: boolean;
};

export function registrySourceMeta(fetchedAt: string): LayerSourceMeta {
  return { source: "registry", confidence: "medium", fetchedAt, requiresReview: false };
}

export function surveySourceMeta(fetchedAt: string): LayerSourceMeta {
  return { source: "survey", confidence: "high", fetchedAt, requiresReview: false };
}

export function generatedSourceMeta(): LayerSourceMeta {
  return { source: "generated", confidence: "medium", fetchedAt: null, requiresReview: true };
}
```

- [x] **Step 3: TypeScript check**

```bash
bunx tsc --noEmit
```

- [x] **Step 4: Commit**

```bash
git add src/domain/drawing/ports.ts src/domain/drawing/source-quality.ts
git commit -m "feat(drawing): add port interfaces and source quality types"
```

---

### Task 4: DrawingReadinessDecisionEngine + Tests (TDD)

**Files:**

- Create: `src/domain/drawing/decision-engine.ts`
- Create: `src/domain/drawing/decision-engine.test.ts`

- [x] **Step 1: Skriv failing tests foerst**

```typescript
// src/domain/drawing/decision-engine.test.ts
import { describe, it, expect } from "bun:test";
import { classifyDrawingReadiness } from "./decision-engine";

const base = {
  hasAddress: true,
  hasMatrikel: true,
  hasParcelPolygon: true,
  hasProposedFootprint: true,
  hasCrsContract: true,
  parcelAreaDiscrepancyPct: 0.5,
  minDistanceToSetbackLineM: 1.5,
  setbackRequirementM: 0.5,
  hasOpmaalteKoter: false,
  hasDhmKoter: true,
  hasExistingBuildingGeometry: true,
  missingDataPoints: [] as string[],
};

describe("classifyDrawingReadiness", () => {
  it("AUTO_DRAFT naar minimal data er til stede", () => {
    const r = classifyDrawingReadiness({
      ...base,
      hasExistingBuildingGeometry: false,
      hasDhmKoter: false,
    });
    expect(r.status).toBe("AUTO_DRAFT");
  });

  it("AUTO_REVIEW naar alle kerndata er til stede og afstande er sikre", () => {
    const r = classifyDrawingReadiness(base);
    expect(r.status).toBe("AUTO_REVIEW");
  });

  it("SURVEY_REQUIRED naar bygning er for taet paa byggelinje", () => {
    const r = classifyDrawingReadiness({
      ...base,
      minDistanceToSetbackLineM: 0.2,
      setbackRequirementM: 2.5,
    });
    expect(r.status).toBe("SURVEY_REQUIRED");
    expect(r.reasons.some((r) => r.code === "BUILDING_TOO_CLOSE_TO_SETBACK")).toBe(true);
  });

  it("SURVEY_REQUIRED naar parcelarealafvigelse er for stor", () => {
    const r = classifyDrawingReadiness({ ...base, parcelAreaDiscrepancyPct: 2.5 });
    expect(r.status).toBe("SURVEY_REQUIRED");
    expect(r.reasons.some((r) => r.code === "PARCEL_AREA_DISCREPANCY")).toBe(true);
  });

  it("BLOCKED_MISSING_CORE_DATA naar ingen parcelpolygon", () => {
    const r = classifyDrawingReadiness({ ...base, hasParcelPolygon: false });
    expect(r.status).toBe("BLOCKED_MISSING_CORE_DATA");
  });

  it("BLOCKED_MISSING_CORE_DATA naar ingen foreslaaet footprint", () => {
    const r = classifyDrawingReadiness({ ...base, hasProposedFootprint: false });
    expect(r.status).toBe("BLOCKED_MISSING_CORE_DATA");
  });

  it("missingDataPoints propageres til resultatet", () => {
    const r = classifyDrawingReadiness({
      ...base,
      hasParcelPolygon: false,
      missingDataPoints: ["parcel.polygon25832"],
    });
    expect(r.missingDataPoints).toContain("parcel.polygon25832");
  });
});
```

- [x] **Step 2: Kjoer tests — verificer at de fejler**

```bash
bun test src/domain/drawing/decision-engine.test.ts
```

Expected: `Cannot find module './decision-engine'`.

- [x] **Step 3: Implementer decision-engine.ts**

```typescript
// src/domain/drawing/decision-engine.ts

export type DrawingReadinessStatus =
  | "AUTO_DRAFT"
  | "AUTO_REVIEW"
  | "SURVEY_REQUIRED"
  | "BLOCKED_MISSING_CORE_DATA";

export type ReadinessReason = {
  code: string;
  severity: "info" | "warning" | "blocking";
  message: string;
  affectedLayer: string;
};

export type DrawingReadinessDecision = {
  status: DrawingReadinessStatus;
  reasons: ReadinessReason[];
  missingDataPoints: string[];
  reviewRequiredBy: Array<
    "landinspektoer" | "arkitekt" | "ingenioer" | "kloakmester" | "myndighed"
  >;
};

export type DrawingReadinessInput = {
  hasAddress: boolean;
  hasMatrikel: boolean;
  hasParcelPolygon: boolean;
  hasProposedFootprint: boolean;
  hasCrsContract: boolean;
  parcelAreaDiscrepancyPct: number;
  minDistanceToSetbackLineM: number;
  setbackRequirementM: number;
  hasOpmaalteKoter: boolean;
  hasDhmKoter: boolean;
  hasExistingBuildingGeometry: boolean;
  missingDataPoints: string[];
};

const THRESHOLDS = {
  setbackSafetyMarginM: 0.5,
  maxParcelAreaDiscrepancyPct: 1.0,
};

export function classifyDrawingReadiness(input: DrawingReadinessInput): DrawingReadinessDecision {
  const reasons: ReadinessReason[] = [];
  const reviewRequiredBy: DrawingReadinessDecision["reviewRequiredBy"] = [];

  if (!input.hasParcelPolygon) {
    return {
      status: "BLOCKED_MISSING_CORE_DATA",
      reasons: [
        {
          code: "NO_PARCEL_POLYGON",
          severity: "blocking",
          message: "Ingen parcelpolygon fundet",
          affectedLayer: "parcel",
        },
      ],
      missingDataPoints: ["parcel.polygon25832", ...input.missingDataPoints],
      reviewRequiredBy: ["landinspektoer"],
    };
  }

  if (!input.hasProposedFootprint) {
    return {
      status: "BLOCKED_MISSING_CORE_DATA",
      reasons: [
        {
          code: "NO_PROPOSED_FOOTPRINT",
          severity: "blocking",
          message: "Ingen foreslaaet bygningsfodprint",
          affectedLayer: "proposed",
        },
      ],
      missingDataPoints: ["proposed.primaryBuilding.footprint25832", ...input.missingDataPoints],
      reviewRequiredBy: ["arkitekt"],
    };
  }

  if (!input.hasAddress || !input.hasMatrikel) {
    return {
      status: "BLOCKED_MISSING_CORE_DATA",
      reasons: [
        {
          code: "NO_ADDRESS_OR_MATRIKEL",
          severity: "blocking",
          message: "Adresse eller matrikel mangler",
          affectedLayer: "metadata",
        },
      ],
      missingDataPoints: input.missingDataPoints,
      reviewRequiredBy: [],
    };
  }

  let surveyRequired = false;

  const safeDistance = input.setbackRequirementM + THRESHOLDS.setbackSafetyMarginM;
  if (input.minDistanceToSetbackLineM < safeDistance) {
    surveyRequired = true;
    reasons.push({
      code: "BUILDING_TOO_CLOSE_TO_SETBACK",
      severity: "warning",
      message: `Bygning er ${input.minDistanceToSetbackLineM.toFixed(2)} m fra byggelinje — krav + margin er ${safeDistance.toFixed(2)} m`,
      affectedLayer: "proposed",
    });
    reviewRequiredBy.push("landinspektoer");
  }

  if (input.parcelAreaDiscrepancyPct > THRESHOLDS.maxParcelAreaDiscrepancyPct) {
    surveyRequired = true;
    reasons.push({
      code: "PARCEL_AREA_DISCREPANCY",
      severity: "warning",
      message: `Arealafvigelse er ${input.parcelAreaDiscrepancyPct.toFixed(1)}% — graense er ${THRESHOLDS.maxParcelAreaDiscrepancyPct}%`,
      affectedLayer: "parcel",
    });
    reviewRequiredBy.push("landinspektoer");
  }

  if (surveyRequired) {
    return {
      status: "SURVEY_REQUIRED",
      reasons,
      missingDataPoints: input.missingDataPoints,
      reviewRequiredBy,
    };
  }

  const isAutoReview =
    input.hasCrsContract &&
    input.hasExistingBuildingGeometry &&
    (input.hasOpmaalteKoter || input.hasDhmKoter) &&
    input.missingDataPoints.length === 0;

  if (isAutoReview) {
    return { status: "AUTO_REVIEW", reasons, missingDataPoints: [], reviewRequiredBy };
  }

  if (input.missingDataPoints.length > 0) {
    reasons.push({
      code: "MISSING_DATA_POINTS",
      severity: "info",
      message: `${input.missingDataPoints.length} datapunkter mangler`,
      affectedLayer: "multiple",
    });
  }

  return {
    status: "AUTO_DRAFT",
    reasons,
    missingDataPoints: input.missingDataPoints,
    reviewRequiredBy,
  };
}
```

- [x] **Step 4: Kjoer tests — alle skal vaere groenne**

```bash
bun test src/domain/drawing/decision-engine.test.ts
```

Expected: 7/7 passed.

- [x] **Step 5: TypeScript check**

```bash
bunx tsc --noEmit
```

- [x] **Step 6: Commit**

```bash
git add src/domain/drawing/decision-engine.ts src/domain/drawing/decision-engine.test.ts
git commit -m "feat(drawing): DrawingReadinessDecisionEngine — alle 4 statuser + Tier 1 tests"
```

---

## Phase 2 — CRS & Geometry Core

### Task 5: Installer jsts + Geometry Engine

**Files:**

- Create: `src/domain/drawing/geometry-engine.ts`
- Create: `src/domain/drawing/geometry-engine.test.ts`

- [x] **Step 1: Installer jsts**

```bash
bun add jsts && bun add -d @types/jsts
```

Expected: jsts tilfoejt i package.json.

- [x] **Step 2: Skriv failing geometry tests**

```typescript
// src/domain/drawing/geometry-engine.test.ts
import { describe, it, expect } from "bun:test";
import {
  polygonAreaM2,
  distanceToNearestBoundaryM,
  generateBuffer25832,
  splitPolygonIntoBoundarySegments,
  polygonOverlapAreaM2,
  distanceToBoundarySegments,
} from "./geometry-engine";
import type { GeoJsonPolygon25832 } from "./beliggenhedsplan.types";

// 20x20m parcel ved EPSG:25832 koordinater (Koebenhavn-omraadet)
const parcel20x20: GeoJsonPolygon25832 = {
  type: "Polygon",
  crs: "EPSG:25832",
  coordinates: [
    [
      [720000, 6170000],
      [720020, 6170000],
      [720020, 6170020],
      [720000, 6170020],
      [720000, 6170000],
    ],
  ],
};

// 4x4m bygning placeret 3m fra vest og 3m fra nord
const building4x4: GeoJsonPolygon25832 = {
  type: "Polygon",
  crs: "EPSG:25832",
  coordinates: [
    [
      [720003, 6170003],
      [720007, 6170003],
      [720007, 6170007],
      [720003, 6170007],
      [720003, 6170003],
    ],
  ],
};

// Polygon helt udenfor parcellen
const outsidePolygon: GeoJsonPolygon25832 = {
  type: "Polygon",
  crs: "EPSG:25832",
  coordinates: [
    [
      [720100, 6170100],
      [720110, 6170100],
      [720110, 6170110],
      [720100, 6170110],
      [720100, 6170100],
    ],
  ],
};

describe("polygonAreaM2", () => {
  it("beregner areal af 20x20m parcel som ~400 m2", () => {
    expect(polygonAreaM2(parcel20x20)).toBeCloseTo(400, 0);
  });
  it("beregner areal af 4x4m bygning som ~16 m2", () => {
    expect(polygonAreaM2(building4x4)).toBeCloseTo(16, 0);
  });
});

describe("distanceToNearestBoundaryM", () => {
  it("returnerer 3m naar bygning er 3m fra naermeste skel", () => {
    expect(distanceToNearestBoundaryM(building4x4, parcel20x20)).toBeCloseTo(3, 1);
  });
});

describe("generateBuffer25832", () => {
  it("buffer-polygon er stoerre end input-polygon", () => {
    const buffered = generateBuffer25832(building4x4, 2.5);
    expect(polygonAreaM2(buffered)).toBeGreaterThan(polygonAreaM2(building4x4));
  });
});

describe("polygonOverlapAreaM2", () => {
  it("returnerer 0 for ikke-overlappende polygoner", () => {
    expect(polygonOverlapAreaM2(building4x4, outsidePolygon)).toBe(0);
  });
  it("returnerer ~16 for bygning der er fuldt inden i parcel", () => {
    expect(polygonOverlapAreaM2(building4x4, parcel20x20)).toBeCloseTo(16, 0);
  });
});

describe("splitPolygonIntoBoundarySegments", () => {
  it("returnerer 4 segmenter for rektangulaer parcel", () => {
    expect(splitPolygonIntoBoundarySegments(parcel20x20)).toHaveLength(4);
  });
});

describe("distanceToBoundarySegments", () => {
  it("returnerer afstand for hvert segment", () => {
    const result = distanceToBoundarySegments(building4x4, parcel20x20);
    expect(result).toHaveLength(4);
    expect(result.every((r) => r.distanceM >= 0)).toBe(true);
  });
});
```

- [x] **Step 3: Kjoer tests — verificer at de fejler**

```bash
bun test src/domain/drawing/geometry-engine.test.ts
```

Expected: module not found.

- [x] **Step 4: Implementer geometry-engine.ts**

```typescript
// src/domain/drawing/geometry-engine.ts
import * as jsts from "jsts";
import type { GeoJsonPolygon25832, BoundarySegment } from "./beliggenhedsplan.types";
import { generatedSourceMeta } from "./source-quality";

const reader = new jsts.io.GeoJSONReader();
const writer = new jsts.io.GeoJSONWriter();

function toJsts(geom: GeoJsonPolygon25832): jsts.geom.Geometry {
  const { crs: _crs, ...geojson } = geom;
  return reader.read(geojson as Parameters<typeof reader.read>[0]);
}

function fromJstsPolygon(geom: jsts.geom.Geometry): GeoJsonPolygon25832 {
  const raw = writer.write(geom) as { type: string; coordinates: [number, number][][] };
  return { type: "Polygon", coordinates: raw.coordinates, crs: "EPSG:25832" };
}

export function polygonAreaM2(polygon: GeoJsonPolygon25832): number {
  return Math.abs(toJsts(polygon).getArea());
}

export function distanceToNearestBoundaryM(
  building: GeoJsonPolygon25832,
  parcel: GeoJsonPolygon25832,
): number {
  return toJsts(building).distance(toJsts(parcel).getBoundary());
}

export function polygonOverlapAreaM2(a: GeoJsonPolygon25832, b: GeoJsonPolygon25832): number {
  const ga = toJsts(a);
  const gb = toJsts(b);
  if (!ga.intersects(gb)) return 0;
  return Math.abs(ga.intersection(gb).getArea());
}

export function generateBuffer25832(
  polygon: GeoJsonPolygon25832,
  bufferM: number,
): GeoJsonPolygon25832 {
  return fromJstsPolygon(toJsts(polygon).buffer(bufferM));
}

export function splitPolygonIntoBoundarySegments(polygon: GeoJsonPolygon25832): BoundarySegment[] {
  const coords = polygon.coordinates[0];
  return coords.slice(0, -1).map((coord, i) => {
    const next = coords[i + 1];
    return {
      id: `seg-${i}`,
      start: { type: "Point", coordinates: coord as [number, number], crs: "EPSG:25832" },
      end: { type: "Point", coordinates: next as [number, number], crs: "EPSG:25832" },
      type: "unknown" as const,
      source: generatedSourceMeta(),
    };
  });
}

export function distanceToBoundarySegments(
  building: GeoJsonPolygon25832,
  parcel: GeoJsonPolygon25832,
): Array<{ segmentId: string; distanceM: number }> {
  const buildingGeom = toJsts(building);
  return splitPolygonIntoBoundarySegments(parcel).map((seg) => {
    const segGeom = reader.read({
      type: "LineString",
      coordinates: [seg.start.coordinates, seg.end.coordinates],
    } as Parameters<typeof reader.read>[0]);
    return { segmentId: seg.id, distanceM: buildingGeom.distance(segGeom) };
  });
}
```

- [x] **Step 5: Kjoer geometry tests**

```bash
bun test src/domain/drawing/geometry-engine.test.ts
```

Expected: alle groenne.

- [x] **Step 6: Fuld test-suite — ingen regressioner**

```bash
bun test src
```

- [x] **Step 7: Commit**

```bash
git add src/domain/drawing/geometry-engine.ts src/domain/drawing/geometry-engine.test.ts
git commit -m "feat(drawing): geometry engine med jsts — areal, afstand, buffer, overlap"
```

---

## Phase 3 — Design Placement (MatrikelMap Refactor)

### Task 6: Ekstraher Geometrilogik fra MatrikelMap.tsx

**CLAUDE.md Rule 7 — dirty boundary skal renses foer udvidelse.**

`MatrikelMap.tsx` konstruerer i dag et kvadrat ud fra `buildingArea` og gemmer kun centroid. Al geometriberegning skal ud af komponenten foer nogen ny geometrifunktionalitet tilfojes.

**Files:**

- Create: `src/lib/drawing/footprint-builder.ts`
- Modify: `src/components/cockpit/MatrikelMap.tsx`

- [x] **Step 1: Laes MatrikelMap.tsx og find geometriberegningerne**

Kig efter: kvadrat-konstruktion fra `buildingArea`, centroid-opdatering, eventuelle afstandsberegninger i komponenten.

- [x] **Step 2: Create footprint-builder.ts**

```typescript
// src/lib/drawing/footprint-builder.ts
import type { GeoJsonPolygon25832 } from "@/domain/drawing/beliggenhedsplan.types";
import proj4 from "proj4";

proj4.defs(
  "EPSG:25832",
  "+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
);

export type FootprintParams = {
  centroidWgs84: [number, number]; // [lng, lat]
  areaM2: number;
  rotationDeg: number;
};

export function buildSquareFootprint25832(params: FootprintParams): GeoJsonPolygon25832 {
  const [cx, cy] = proj4("WGS84", "EPSG:25832", [params.centroidWgs84[0], params.centroidWgs84[1]]);
  const halfSide = Math.sqrt(params.areaM2) / 2;
  const angle = (params.rotationDeg * Math.PI) / 180;

  const corners: [number, number][] = (
    [
      [-halfSide, -halfSide],
      [halfSide, -halfSide],
      [halfSide, halfSide],
      [-halfSide, halfSide],
    ] as [number, number][]
  ).map(([dx, dy]) => [
    cx + dx * Math.cos(angle) - dy * Math.sin(angle),
    cy + dx * Math.sin(angle) + dy * Math.cos(angle),
  ]);

  return {
    type: "Polygon",
    crs: "EPSG:25832",
    coordinates: [[...corners, corners[0]]],
  };
}
```

- [x] **Step 3: Opdater MatrikelMap.tsx**

Fjern al geometriberegning fra komponenten. Komponenten maa kun:

- Vise parcelpolygon
- Modtage `footprintGeojson?: GeoJsonPolygon25832` som prop og vise den
- Emitte `onFootprintChange?(geojson: GeoJsonPolygon25832)` naar brugeren flytter

Foraeldre-komponenten bruger `buildSquareFootprint25832` til at konstruere footprint inden den sender det ned.

- [x] **Step 4: TypeScript check**

```bash
bunx tsc --noEmit
```

Expected: ingen fejl.

- [x] **Step 5: Commit**

```bash
git add src/lib/drawing/footprint-builder.ts src/components/cockpit/MatrikelMap.tsx
git commit -m "refactor(map): fjern geometrilogik fra MatrikelMap til footprint-builder (Rule 7)"
```

---

## Phase 4 — Drawing Layers Fra Kilder

### Task 7: GeoDanmark Drawing Layers Adapter

**Files:**

- Create: `src/integrations/geodanmark/drawing-layers.ts`

- [x] **Step 1: Find hvilken funktion der henter parcelgeometri i den eksisterende klient**

```bash
grep -n "Jordstykke\|fetchJordstykke\|jordstykke" src/integrations/geodanmark/client.ts
```

Noteer det eksakte funktionsnavn og retur-type.

- [x] **Step 2: Create drawing-layers.ts**

```typescript
// src/integrations/geodanmark/drawing-layers.ts
import type { DrawingGeometrySourcePort } from "@/domain/drawing/ports";
import type {
  ParcelLayer,
  ExistingFeaturesLayer,
  ConstraintLayer,
  BBox25832,
} from "@/domain/drawing/beliggenhedsplan.types";
import {
  ParcelLayerSchema,
  ExistingFeaturesLayerSchema,
} from "@/domain/drawing/beliggenhedsplan.schemas";
import { registrySourceMeta } from "@/domain/drawing/source-quality";
import { splitPolygonIntoBoundarySegments } from "@/domain/drawing/geometry-engine";
// Tilpas import til det faktiske eksporterede navn fra client.ts:
import { geodanmarkClient } from "./client";

export class GeoDanmarkDrawingLayersAdapter implements DrawingGeometrySourcePort {
  async fetchParcelLayers(matrikelId: string): Promise<ParcelLayer | null> {
    const raw = await geodanmarkClient.fetchJordstykke(matrikelId);
    if (!raw) return null;

    const now = new Date().toISOString();
    const polygon25832 = {
      type: "Polygon" as const,
      crs: "EPSG:25832" as const,
      coordinates: raw.geometry.coordinates as [number, number][][],
    };

    const layer: ParcelLayer = {
      idLokalId: raw.id_lokalId,
      bfeNr: raw.BFEnr ?? "",
      matrikelnummer: raw.matrikelnummer,
      ejerlavskode: raw.ejerlavskode,
      ejerlavsnavn: raw.ejerlavsnavn ?? "",
      polygon25832,
      areaRegisteredM2: raw.registreretAreal,
      areaGeometryM2: raw.beregnetAreal ?? raw.registreretAreal,
      areaDiscrepancyM2: Math.abs(
        (raw.beregnetAreal ?? raw.registreretAreal) - raw.registreretAreal,
      ),
      boundarySegments: splitPolygonIntoBoundarySegments(polygon25832),
      neighborParcels: [],
      labelPoint25832: { type: "Point", crs: "EPSG:25832", coordinates: raw.centroid ?? [0, 0] },
      source: registrySourceMeta(now),
    };

    return ParcelLayerSchema.parse(layer);
  }

  async fetchNeighborBuildings(_bbox25832: BBox25832): Promise<ExistingFeaturesLayer> {
    // GeoDanmark IS_MOCK=true — returneer tomt lag med lav confidence
    const now = new Date().toISOString();
    return ExistingFeaturesLayerSchema.parse({
      buildings: [],
      fences: [],
      source: { source: "registry", confidence: "low", fetchedAt: now, requiresReview: true },
    });
  }

  async fetchRoadGeometry(_addressId: string) {
    return { centerline25832: null };
  }

  async fetchPlandataLayers(
    _kommunekode: string,
    _bbox25832: BBox25832,
  ): Promise<ConstraintLayer[]> {
    return [];
  }
}
```

Note: Tilpas `geodanmarkClient.fetchJordstykke` og retur-felternes navne til det faktiske API fra `client.ts` — brug `grep`-resultatet fra Step 1.

- [x] **Step 3: TypeScript check**

```bash
bunx tsc --noEmit
```

- [x] **Step 4: Commit**

```bash
git add src/integrations/geodanmark/drawing-layers.ts
git commit -m "feat(geodanmark): DrawingGeometrySourcePort adapter for drawing layers"
```

---

### Task 8: Survey Upload Decoder

**Files:**

- Create: `src/integrations/survey/survey.schemas.ts`
- Create: `src/integrations/survey/upload-decoder.ts`

- [x] **Step 1: Create survey.schemas.ts**

```typescript
// src/integrations/survey/survey.schemas.ts
import { z } from "zod";

export const SurveyPointRowSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
  label: z.string().optional().default(""),
  type: z.enum(["terrain", "boundary", "building_corner"]).optional().default("terrain"),
});

export const SurveyUploadPayloadSchema = z.object({
  surveyDate: z.string().optional().nullable(),
  crs: z.literal("EPSG:25832"),
  points: z.array(SurveyPointRowSchema).min(1),
  notes: z.array(z.string()).optional().default([]),
});
```

- [x] **Step 2: Create upload-decoder.ts**

```typescript
// src/integrations/survey/upload-decoder.ts
import type { SurveyUploadDecoderPort } from "@/domain/drawing/ports";
import type { SurveyLayer } from "@/domain/drawing/beliggenhedsplan.types";
import { SurveyLayerSchema } from "@/domain/drawing/beliggenhedsplan.schemas";
import { SurveyUploadPayloadSchema } from "./survey.schemas";
import { surveySourceMeta } from "@/domain/drawing/source-quality";

export class SurveyUploadDecoder implements SurveyUploadDecoderPort {
  async decode(raw: unknown): Promise<SurveyLayer> {
    const payload = SurveyUploadPayloadSchema.parse(raw);
    const now = new Date().toISOString();

    const layer: SurveyLayer = {
      uploadedAt: now,
      surveyDate: payload.surveyDate ?? null,
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

    return SurveyLayerSchema.parse(layer);
  }
}
```

- [x] **Step 3: TypeScript check**

```bash
bunx tsc --noEmit
```

- [x] **Step 4: Commit**

```bash
git add src/integrations/survey/survey.schemas.ts src/integrations/survey/upload-decoder.ts
git commit -m "feat(survey): SurveyUploadDecoderPort adapter med Zod-validering"
```

---

### Task 9: Assemble Beliggenhedsplan Service + Tier 2 Tests (TDD)

**Files:**

- Create: `src/services/drawing/assemble-beliggenhedsplan.service.ts`
- Create: `src/services/drawing/assemble-beliggenhedsplan.service.test.ts`

- [x] **Step 1: Opret `src/services/drawing/` mappen og skriv failing Tier 2 tests**

```typescript
// src/services/drawing/assemble-beliggenhedsplan.service.test.ts
import { describe, it, expect } from "bun:test";
import { assembleBeliggenhedsplan } from "./assemble-beliggenhedsplan.service";
import type { DrawingGeometrySourcePort } from "@/domain/drawing/ports";
import type {
  ParcelLayer,
  ExistingFeaturesLayer,
  GeoJsonPolygon25832,
} from "@/domain/drawing/beliggenhedsplan.types";
import { registrySourceMeta } from "@/domain/drawing/source-quality";

const now = new Date().toISOString();

const fakeParcel: ParcelLayer = {
  idLokalId: "test-id",
  bfeNr: "12345",
  matrikelnummer: "1a",
  ejerlavskode: 1234,
  ejerlavsnavn: "Testejerlav",
  polygon25832: {
    type: "Polygon",
    crs: "EPSG:25832",
    coordinates: [
      [
        [720000, 6170000],
        [720020, 6170000],
        [720020, 6170020],
        [720000, 6170020],
        [720000, 6170000],
      ],
    ],
  },
  areaRegisteredM2: 400,
  areaGeometryM2: 400,
  areaDiscrepancyM2: 0,
  boundarySegments: [],
  neighborParcels: [],
  labelPoint25832: { type: "Point", crs: "EPSG:25832", coordinates: [720010, 6170010] },
  source: registrySourceMeta(now),
};

const fakeExisting: ExistingFeaturesLayer = {
  buildings: [],
  fences: [],
  source: { source: "registry", confidence: "low", fetchedAt: null, requiresReview: true },
};

const fakeSource: DrawingGeometrySourcePort = {
  fetchParcelLayers: async () => fakeParcel,
  fetchNeighborBuildings: async () => fakeExisting,
  fetchRoadGeometry: async () => ({ centerline25832: null }),
  fetchPlandataLayers: async () => [],
};

const fakeFootprint: GeoJsonPolygon25832 = {
  type: "Polygon",
  crs: "EPSG:25832",
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

const baseMeta = {
  title: "Beliggenhedsplan test",
  address: "Testvej 1",
  matrikel: "1a",
  bygherre: null,
  sagNr: null,
  revision: "A",
  date: "2026-05-25",
  scale: 250 as const,
  paperSize: "A3" as const,
};

describe("assembleBeliggenhedsplan", () => {
  it("returnerer plan med parcel fra port", async () => {
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
    expect(result.plan?.crs).toBe("EPSG:25832");
    expect(result.plan?.parcel.matrikelnummer).toBe("1a");
    expect(result.readiness.status).not.toBe("BLOCKED_MISSING_CORE_DATA");
  });

  it("returnerer BLOCKED naar port ikke kan finde parcel", async () => {
    const nullSource: DrawingGeometrySourcePort = {
      ...fakeSource,
      fetchParcelLayers: async () => null,
    };
    const result = await assembleBeliggenhedsplan({
      matrikelId: "missing",
      kommunekode: "0101",
      addressId: "addr-1",
      proposedFootprint25832: fakeFootprint,
      projectId: "proj-1",
      metadata: baseMeta,
      geometrySource: nullSource,
      survey: null,
    });
    expect(result.readiness.status).toBe("BLOCKED_MISSING_CORE_DATA");
    expect(result.plan).toBeNull();
  });

  it("footprintAreaM2 beregnes fra den faktiske polygon", async () => {
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
    expect(result.plan?.proposed.footprintAreaM2).toBeCloseTo(100, 0);
  });
});
```

- [x] **Step 2: Kjoer tests — verificer at de fejler**

```bash
bun test src/services/drawing/assemble-beliggenhedsplan.service.test.ts
```

- [x] **Step 3: Implementer assemble-beliggenhedsplan.service.ts**

```typescript
// src/services/drawing/assemble-beliggenhedsplan.service.ts
import type {
  BeliggenhedsplanInput,
  DrawingMetadata,
  GeoJsonPolygon25832,
  SurveyLayer,
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
} from "@/domain/drawing/geometry-engine";
import { generatedSourceMeta } from "@/domain/drawing/source-quality";

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

export async function assembleBeliggenhedsplan(input: AssembleInput): Promise<AssembleResult> {
  const { matrikelId, kommunekode, proposedFootprint25832, geometrySource, survey, metadata } =
    input;

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

  const [existing, constraints] = await Promise.all([
    geometrySource.fetchNeighborBuildings(bbox),
    geometrySource.fetchPlandataLayers(kommunekode, bbox),
  ]);

  const footprintAreaM2 = polygonAreaM2(proposedFootprint25832);
  const minDistanceToBoundaryM = distanceToNearestBoundaryM(
    proposedFootprint25832,
    parcelWithSegments.polygon25832,
  );
  const areaDiscrepancyPct =
    (parcelWithSegments.areaDiscrepancyM2 / parcelWithSegments.areaRegisteredM2) * 100;

  const plan: BeliggenhedsplanInput = {
    crs: "EPSG:25832",
    parcel: parcelWithSegments,
    survey,
    existing,
    proposed: {
      footprint25832: proposedFootprint25832,
      rotationDeg: 0,
      footprintAreaM2,
      storeys: 1,
      heightM: null,
      sokkelKoteM: null,
      source: generatedSourceMeta(),
    },
    constraints,
    utilities: [],
    siteUse: [],
    terrain: null,
    metadata,
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
  });

  return { plan, readiness };
}
```

- [x] **Step 4: Kjoer Tier 2 tests**

```bash
bun test src/services/drawing/assemble-beliggenhedsplan.service.test.ts
```

Expected: 3/3 passed.

- [x] **Step 5: Fuld test-suite**

```bash
bun test src
```

- [x] **Step 6: Commit**

```bash
git add src/services/drawing/
git commit -m "feat(drawing): assembleBeliggenhedsplan service med Tier 2 tests"
```

---

## Phase 5 — SVG Renderer

### Task 10: Drawing Model + Symbols

**Files:**

- Create: `src/domain/drawing/drawing-model.ts`
- Create: `src/lib/drawing/drawing-symbols.ts`

- [x] **Step 1: Create drawing-model.ts**

```typescript
// src/domain/drawing/drawing-model.ts

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
  | "legend";

export type DrawingFeature = {
  id: string;
  kind: DrawingLayerKind;
  svgElement: string;
  label: string | null;
  labelX: number | null;
  labelY: number | null;
  zIndex: number;
};

export type DrawingTitleBlock = {
  title: string;
  address: string;
  matrikel: string;
  bygherre: string | null;
  sagNr: string | null;
  scale: string;
  paperSize: string;
  date: string;
  revision: string;
  disclaimer: string | null;
  sourceList: string[];
};

export type DrawingModel = {
  page: {
    size: "A3" | "A2" | "A1";
    orientation: "landscape" | "portrait";
    scale: 250 | 500;
    widthMm: number;
    heightMm: number;
  };
  viewport: { bbox25832: [number, number, number, number]; metersPerMm: number };
  features: DrawingFeature[];
  titleBlock: DrawingTitleBlock;
  legend: Array<{ symbol: string; label: string }>;
  northArrowRotationDeg: number;
  readinessStatus: string;
};

export const PAGE_SIZES = {
  A3: { widthMm: 420, heightMm: 297 },
  A2: { widthMm: 594, heightMm: 420 },
  A1: { widthMm: 841, heightMm: 594 },
} as const;

export function computeViewport(
  bbox25832: [number, number, number, number],
  scale: 250 | 500,
): DrawingModel["viewport"] {
  return { bbox25832, metersPerMm: scale / 1000 };
}
```

- [x] **Step 2: Create drawing-symbols.ts**

```typescript
// src/lib/drawing/drawing-symbols.ts

export function northArrowSvg(cx: number, cy: number, size: number): string {
  return `<g transform="translate(${cx},${cy})">
    <polygon points="0,${-size} ${size / 4},0 0,${size / 4}" fill="#222"/>
    <polygon points="0,${-size} ${-size / 4},0 0,${size / 4}" fill="#fff" stroke="#222" stroke-width="0.5"/>
    <text y="${size / 2 + 6}" text-anchor="middle" font-size="8" font-family="Arial">N</text>
  </g>`;
}

export function lineDashed(): string {
  return 'stroke-dasharray="4,3"';
}

export function lineDotted(): string {
  return 'stroke-dasharray="1,3"';
}
```

- [x] **Step 3: TypeScript check**

```bash
bunx tsc --noEmit
```

- [x] **Step 4: Commit**

```bash
git add src/domain/drawing/drawing-model.ts src/lib/drawing/drawing-symbols.ts
git commit -m "feat(drawing): DrawingModel types og SVG-symbolhelpers"
```

---

### Task 11: SVG Renderer + Tests

**Files:**

- Create: `src/lib/drawing/render-svg.ts`
- Create: `src/lib/drawing/render-svg.test.ts`
- Create: `src/lib/drawing/drawing-model-builder.ts`

- [x] **Step 1: Skriv failing strukturelle SVG-tests**

```typescript
// src/lib/drawing/render-svg.test.ts
import { describe, it, expect } from "bun:test";
import { renderSvg } from "./render-svg";
import type { DrawingModel } from "@/domain/drawing/drawing-model";

const model: DrawingModel = {
  page: { size: "A3", orientation: "landscape", scale: 250, widthMm: 420, heightMm: 297 },
  viewport: { bbox25832: [720000, 6170000, 720100, 6170070], metersPerMm: 0.25 },
  features: [
    {
      id: "parcel-1",
      kind: "parcel_boundary",
      svgElement:
        '<polygon points="0,0 100,0 100,70 0,70" fill="none" stroke="#000" stroke-width="1"/>',
      label: null,
      labelX: null,
      labelY: null,
      zIndex: 10,
    },
  ],
  titleBlock: {
    title: "Beliggenhedsplan",
    address: "Testvej 1, 2000 Frederiksberg",
    matrikel: "1a Frederiksberg",
    bygherre: null,
    sagNr: null,
    scale: "1:250",
    paperSize: "A3",
    date: "2026-05-25",
    revision: "A",
    disclaimer: "FORELOEBIG - ikke til myndighedsbrug",
    sourceList: ["MAT WFS 2026-05-25"],
  },
  legend: [],
  northArrowRotationDeg: 0,
  readinessStatus: "AUTO_DRAFT",
};

describe("renderSvg", () => {
  it("starter med <svg", () => {
    expect(renderSvg(model)).toStartWith("<svg");
  });
  it("indeholder parcel-feature id", () => {
    expect(renderSvg(model)).toContain("parcel-1");
  });
  it("indeholder adresse i titelblok", () => {
    expect(renderSvg(model)).toContain("Testvej 1");
  });
  it("indeholder nordpil (N)", () => {
    expect(renderSvg(model)).toContain(">N<");
  });
  it("indeholder FORELOEBIG disclaimer for AUTO_DRAFT", () => {
    expect(renderSvg(model)).toContain("FORELOEBIG");
  });
  it("indeholder kildeangivelse", () => {
    expect(renderSvg(model)).toContain("MAT WFS");
  });
});
```

- [x] **Step 2: Kjoer tests — verificer at de fejler**

```bash
bun test src/lib/drawing/render-svg.test.ts
```

- [x] **Step 3: Implementer render-svg.ts**

```typescript
// src/lib/drawing/render-svg.ts
import type { DrawingModel } from "@/domain/drawing/drawing-model";
import { northArrowSvg } from "./drawing-symbols";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderSvg(model: DrawingModel): string {
  const PX_PER_MM = 3.7795;
  const w = model.page.widthMm * PX_PER_MM;
  const h = model.page.heightMm * PX_PER_MM;
  const titleBlockW = 60 * PX_PER_MM;
  const drawW = w - titleBlockW;

  const [minX, minY, maxX, maxY] = model.viewport.bbox25832;
  const scale = Math.min(drawW / (maxX - minX), h / (maxY - minY));

  const sorted = [...model.features].sort((a, b) => a.zIndex - b.zIndex);
  const featuresSvg = sorted
    .map((f) => `<g id="${f.id}" data-kind="${f.kind}">${f.svgElement}</g>`)
    .join("\n");

  const { titleBlock: tb } = model;
  const tx = drawW;
  const titleSvg = `
    <rect x="${tx}" y="0" width="${titleBlockW}" height="${h}" fill="#f8f8f8" stroke="#ccc" stroke-width="0.5"/>
    <text x="${tx + 5}" y="18" font-family="Arial" font-size="9" font-weight="bold">${esc(tb.title)}</text>
    <text x="${tx + 5}" y="32" font-family="Arial" font-size="7">${esc(tb.address)}</text>
    <text x="${tx + 5}" y="44" font-family="Arial" font-size="7">${esc(tb.matrikel)}</text>
    <text x="${tx + 5}" y="56" font-family="Arial" font-size="7">Maalestok: ${esc(tb.scale)}</text>
    <text x="${tx + 5}" y="68" font-family="Arial" font-size="7">Dato: ${esc(tb.date)}</text>
    <text x="${tx + 5}" y="80" font-family="Arial" font-size="7">Rev.: ${esc(tb.revision)}</text>
    ${tb.disclaimer ? `<text x="${tx + 5}" y="96" font-family="Arial" font-size="6" fill="#c00">${esc(tb.disclaimer)}</text>` : ""}
    ${tb.sourceList.map((s, i) => `<text x="${tx + 5}" y="${112 + i * 10}" font-family="Arial" font-size="5" fill="#666">${esc(s)}</text>`).join("\n")}
  `;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="white"/>
  <clipPath id="draw-clip"><rect width="${drawW}" height="${h}"/></clipPath>
  <g clip-path="url(#draw-clip)">
    ${featuresSvg}
    ${northArrowSvg(drawW - 30, 30, 18)}
  </g>
  <g id="title-block">${titleSvg}</g>
</svg>`;
}
```

- [x] **Step 4: Create drawing-model-builder.ts**

```typescript
// src/lib/drawing/drawing-model-builder.ts
import type { BeliggenhedsplanInput } from "@/domain/drawing/beliggenhedsplan.types";
import type { DrawingReadinessDecision } from "@/domain/drawing/decision-engine";
import type { DrawingModel } from "@/domain/drawing/drawing-model";
import { PAGE_SIZES, computeViewport } from "@/domain/drawing/drawing-model";

export function buildDrawingModel(
  plan: BeliggenhedsplanInput,
  readiness: DrawingReadinessDecision,
): DrawingModel {
  const coords = plan.parcel.polygon25832.coordinates[0];
  const xs = coords.map((c) => c[0]);
  const ys = coords.map((c) => c[1]);
  const bbox: [number, number, number, number] = [
    Math.min(...xs),
    Math.min(...ys),
    Math.max(...xs),
    Math.max(...ys),
  ];
  const page = PAGE_SIZES[plan.metadata.paperSize];

  return {
    page: {
      size: plan.metadata.paperSize,
      orientation: "landscape",
      scale: plan.metadata.scale,
      ...page,
    },
    viewport: computeViewport(bbox, plan.metadata.scale),
    features: [],
    titleBlock: {
      title: plan.metadata.title,
      address: plan.metadata.address,
      matrikel: plan.metadata.matrikel,
      bygherre: plan.metadata.bygherre,
      sagNr: plan.metadata.sagNr,
      scale: `1:${plan.metadata.scale}`,
      paperSize: plan.metadata.paperSize,
      date: plan.metadata.date,
      revision: plan.metadata.revision,
      disclaimer: readiness.status === "AUTO_DRAFT" ? "FORELOEBIG — ikke til myndighedsbrug" : null,
      sourceList:
        readiness.reviewRequiredBy.length > 0
          ? [`Review kraevet: ${readiness.reviewRequiredBy.join(", ")}`]
          : [],
    },
    legend: [],
    northArrowRotationDeg: 0,
    readinessStatus: readiness.status,
  };
}
```

- [x] **Step 5: Kjoer SVG tests**

```bash
bun test src/lib/drawing/render-svg.test.ts
```

Expected: 6/6 passed.

- [x] **Step 6: Fuld test suite**

```bash
bun test src
```

- [x] **Step 7: Commit**

```bash
git add src/lib/drawing/render-svg.ts src/lib/drawing/render-svg.test.ts src/lib/drawing/drawing-model-builder.ts
git commit -m "feat(drawing): SVG renderer, drawing-model-builder, strukturelle snapshot tests"
```

---

## Phase 6 — PDF Eksport & Review Flow

### Forudsaetning: Database migrations

Foelgende tabeller skal eksistere i Supabase **foer Task 12 kan testes live**. Opret migrations-SQL i `supabase/migrations/`:

```sql
-- drawing_exports
create table if not exists drawing_exports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  drawing_type text not null default 'beliggenhedsplan',
  status text not null default 'draft',
  readiness_status text not null,
  svg_path text,
  pdf_path text,
  input_hash text,
  generated_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  source_quality_json jsonb
);
```

Kjoer migrationen **foer Task 12**:

```bash
# Kjoer i Supabase dashboard eller via CLI
```

---

### Task 12: Drawing Repository

**Files:**

- Create: `src/integrations/supabase/repositories/drawing.repository.ts`

- [x] **Step 1: Find den eksisterende Supabase createClient-import i et andet repository**

```bash
grep -n "createClient\|supabaseClient\|from.*supabase" src/integrations/supabase/repositories/design-iterations.repository.ts | head -5
```

Brug det samme import-maonster.

- [x] **Step 2: Create drawing.repository.ts**

```typescript
// src/integrations/supabase/repositories/drawing.repository.ts
// Tilpas import til det faktiske maonster fra andre repositories:
import { createClient } from "@/integrations/supabase/client";
import type { DrawingExportStorePort, DrawingExportRecord } from "@/domain/drawing/ports";

export class DrawingRepository implements DrawingExportStorePort {
  private get supabase() {
    return createClient();
  }

  async saveSvg(projectId: string, svg: string): Promise<string> {
    const path = `drawings/${projectId}/${Date.now()}.svg`;
    const { error } = await this.supabase.storage
      .from("project-files")
      .upload(path, new Blob([svg], { type: "image/svg+xml" }), { upsert: true });
    if (error) throw new Error(`SVG upload fejlede: ${error.message}`);
    return path;
  }

  async savePdf(projectId: string, pdf: Uint8Array): Promise<string> {
    const path = `drawings/${projectId}/${Date.now()}.pdf`;
    const { error } = await this.supabase.storage
      .from("project-files")
      .upload(path, new Blob([pdf], { type: "application/pdf" }), { upsert: true });
    if (error) throw new Error(`PDF upload fejlede: ${error.message}`);
    return path;
  }

  async getExport(exportId: string): Promise<DrawingExportRecord | null> {
    const { data, error } = await this.supabase
      .from("drawing_exports")
      .select("*")
      .eq("id", exportId)
      .single();
    if (error || !data) return null;
    return {
      id: data.id,
      projectId: data.project_id,
      svgPath: data.svg_path,
      pdfPath: data.pdf_path,
      readinessStatus: data.readiness_status,
      generatedAt: data.generated_at,
      approvedAt: data.approved_at,
    };
  }

  async saveExportRecord(params: {
    projectId: string;
    svgPath: string | null;
    pdfPath: string | null;
    readinessStatus: string;
    inputHash: string;
  }): Promise<string> {
    const { data, error } = await this.supabase
      .from("drawing_exports")
      .insert({
        project_id: params.projectId,
        svg_path: params.svgPath,
        pdf_path: params.pdfPath,
        readiness_status: params.readinessStatus,
        input_hash: params.inputHash,
        generated_at: new Date().toISOString(),
        drawing_type: "beliggenhedsplan",
        status: "draft",
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`Kunne ikke gemme export-record: ${error?.message}`);
    return data.id;
  }
}
```

- [x] **Step 3: TypeScript check**

```bash
bunx tsc --noEmit
```

- [x] **Step 4: Commit**

```bash
git add src/integrations/supabase/repositories/drawing.repository.ts
git commit -m "feat(supabase): DrawingRepository implementerer DrawingExportStorePort"
```

---

### Task 13: Export Drawing Service + Server Function

**Files:**

- Create: `src/services/drawing/export-drawing.service.ts`

- [x] **Step 1: Create export-drawing.service.ts**

```typescript
// src/services/drawing/export-drawing.service.ts
import type { BeliggenhedsplanInput } from "@/domain/drawing/beliggenhedsplan.types";
import type { DrawingExportStorePort } from "@/domain/drawing/ports";
import type { DrawingReadinessDecision } from "@/domain/drawing/decision-engine";
import { renderSvg } from "@/lib/drawing/render-svg";
import { buildDrawingModel } from "@/lib/drawing/drawing-model-builder";
import { createHash } from "crypto";

type ExportInput = {
  plan: BeliggenhedsplanInput;
  readiness: DrawingReadinessDecision;
  projectId: string;
  store: DrawingExportStorePort & {
    saveExportRecord(params: {
      projectId: string;
      svgPath: string | null;
      pdfPath: string | null;
      readinessStatus: string;
      inputHash: string;
    }): Promise<string>;
  };
};

export type ExportResult = {
  exportId: string;
  svgPath: string;
  readinessStatus: string;
  blockedFromPdf: boolean;
};

export async function exportDrawing(input: ExportInput): Promise<ExportResult> {
  const { plan, readiness, projectId, store } = input;

  if (readiness.status === "BLOCKED_MISSING_CORE_DATA") {
    throw new Error("Eksport blokeret: manglende kerndata. Se readiness.missingDataPoints.");
  }

  const model = buildDrawingModel(plan, readiness);
  const svg = renderSvg(model);
  const svgPath = await store.saveSvg(projectId, svg);
  const inputHash = createHash("sha256").update(JSON.stringify(plan)).digest("hex").slice(0, 16);
  const blockedFromPdf = readiness.status !== "AUTO_REVIEW";

  const exportId = await store.saveExportRecord({
    projectId,
    svgPath,
    pdfPath: null,
    readinessStatus: readiness.status,
    inputHash,
  });

  return { exportId, svgPath, readinessStatus: readiness.status, blockedFromPdf };
}
```

- [x] **Step 2: Find hvor andre server functions er defineret**

```bash
grep -rn "createServerFn" src --include="*.ts" --include="*.tsx" -l | head -5
```

Noer maonster-filen og brug samme struktur.

- [x] **Step 3: Tilfoej export server function til den relevante route-fil**

Foelg CLAUDE.md Rule 3 — server function maa max vaere ~20 linjer:

```typescript
// I den relevante route-fil (tilpas filsti til eksisterende maonster):
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withAuth } from "@/lib/auth";

const ExportBeliggenhedsplanInputSchema = z.object({
  projectId: z.string().uuid(),
  matrikelId: z.string().min(1),
  kommunekode: z.string().min(1),
  addressId: z.string().min(1),
});

export const exportBeliggenhedsplanFn = createServerFn("POST", async (raw: unknown) => {
  const input = ExportBeliggenhedsplanInputSchema.parse(raw);
  await withAuth();
  const { assembleBeliggenhedsplan } =
    await import("@/services/drawing/assemble-beliggenhedsplan.service");
  const { exportDrawing } = await import("@/services/drawing/export-drawing.service");
  const { GeoDanmarkDrawingLayersAdapter } =
    await import("@/integrations/geodanmark/drawing-layers");
  const { DrawingRepository } =
    await import("@/integrations/supabase/repositories/drawing.repository");

  const assembled = await assembleBeliggenhedsplan({
    matrikelId: input.matrikelId,
    kommunekode: input.kommunekode,
    addressId: input.addressId,
    proposedFootprint25832: {
      type: "Polygon",
      crs: "EPSG:25832",
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0],
        ],
      ],
    },
    projectId: input.projectId,
    metadata: {
      title: "Beliggenhedsplan",
      address: input.addressId,
      matrikel: input.matrikelId,
      bygherre: null,
      sagNr: input.projectId,
      revision: "A",
      date: new Date().toISOString().slice(0, 10),
      scale: 250,
      paperSize: "A3",
    },
    geometrySource: new GeoDanmarkDrawingLayersAdapter(),
    survey: null,
  });

  if (!assembled.plan) throw new Error(assembled.readiness.status);
  return exportDrawing({
    plan: assembled.plan,
    readiness: assembled.readiness,
    projectId: input.projectId,
    store: new DrawingRepository(),
  });
});
```

Note: Footprint-integration fra `design_iterations` og rigtig adresse fra projekt-repository er et separat follow-up.

- [x] **Step 4: TypeScript check**

```bash
bunx tsc --noEmit
```

- [x] **Step 5: Fuld test suite + build**

```bash
bun test src && bun run build
```

Expected: ingen fejl, ingen nye TypeScript-violations.

- [x] **Step 6: Commit**

```bash
git add src/services/drawing/export-drawing.service.ts
git commit -m "feat(drawing): export-drawing service + tynd server function endpoint"
```

---

## Deferred (ikke i denne plan)

Foelgende er identificeret men bevidst udsat:

- **label-placement.ts** — deterministisk labelplacering med collision detection
- **PDF render** (`render-pdf.ts` via pdf-lib) — kraever server-side renderer
- **Plandata geometri-adapter** — Plandata returnerer kun status i dag, ikke tegnbare geometrier
- **Footprint fra design_iterations** — server function henter i dag ikke rigtigt footprint fra DB
- **PostGIS migration** for `geometry_25832` — starter som JSONB, migreres naar PostGIS er aktiveret
- **`drawing_sources` og `drawing_geometries` tabeller** — bruges ikke endnu; kun `drawing_exports` er kraevet til Phase 6
