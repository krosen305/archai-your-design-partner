# Beliggenhedsplan Authority-Grade — Phase 1: Domain Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish all pure-domain types, schemas, rule-engine functions and the completeness engine — zero user-visible change, zero network calls.

**Architecture:** New types extend existing `beliggenhedsplan.types.ts`. New rule functions are pure TypeScript in `src/lib/rule-engine/rules/`. `computeDrawingCompleteness` is a pure function in `src/domain/drawing/`. `reactive-compliance.ts` gets three new optional params (non-breaking). All changes are Tier 1 testable.

**Tech Stack:** TypeScript, Zod, bun:test. No React, no Supabase, no network.

**Spec:** `docs/superpowers/specs/2026-06-06-beliggenhedsplan-authority-grade-design.md`

---

### Task 1: Extend domain types

**Context — read these files first:**

- `src/domain/drawing/beliggenhedsplan.types.ts`
- `src/domain/drawing/source-quality.ts`

**Files:**

- Modify: `src/domain/drawing/beliggenhedsplan.types.ts`

- [ ] **Step 1: Add three new types after `SiteUseLayer`**

In `src/domain/drawing/beliggenhedsplan.types.ts`, add after the `SiteUseLayer` type (around line 183):

```typescript
// --- New layer types for authority-grade drawing ---

export type VejLayer = {
  vejnavn: string;
  centerline25832: GeoJsonLineString25832 | null;
  vejkant25832: GeoJsonLineString25832 | null;
  vejbreddeM: number | null;
  source: LayerSourceMeta;
};

export type NaturbeskyttelseType =
  | "strandbeskyttelse"
  | "skovbyggelinje"
  | "åbeskyttelse"
  | "fortidsmindebeskyttelse"
  | "klitfredning";

export type NaturbeskyttelseLayer = {
  type: NaturbeskyttelseType;
  geometry25832: GeoJsonPolygon25832 | GeoJsonLineString25832;
  bufferDistanceM: number;
  intersectsProposedBuilding: boolean;
  source: LayerSourceMeta;
};

export type LerLedningType =
  | "kloak_spildevand"
  | "kloak_regnvand"
  | "kloak_faelles"
  | "vand"
  | "el"
  | "naturgas"
  | "fjernvarme"
  | "telekom";

export type LerLedning = {
  type: LerLedningType;
  geometry25832: GeoJsonLineString25832;
  ejer: string | null;
  dybdeM: number | null;
  diameterMm: number | null;
  source: LayerSourceMeta;
};
```

- [ ] **Step 2: Extend `ProposedBuildingLayer` with three new fields**

Replace the existing `ProposedBuildingLayer` type:

```typescript
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
  tagform: "sadeltag" | "fladt" | "mansard" | "pulttag" | null;
  taghaldningGrad: number | null;
  rygningsKoteM: number | null;
  source: LayerSourceMeta;
};
```

- [ ] **Step 3: Add `nedrives` to `ExistingBuilding`**

Replace the existing `ExistingBuilding` type:

```typescript
export type ExistingBuilding = {
  bbrId: string | null;
  footprint25832: GeoJsonPolygon25832;
  usageCode: string | null;
  areaM2: number;
  sokkelKoteM: number | null;
  nedrives: boolean;
  source: LayerSourceMeta;
};
```

- [ ] **Step 4: Add four new fields to `BeliggenhedsplanInput`**

Replace the existing `BeliggenhedsplanInput` type:

```typescript
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
  vej: VejLayer | null;
  naturbeskyttelse: NaturbeskyttelseLayer[];
  lerLedninger: LerLedning[];
  kloakoplandType: "separat" | "faelles" | null;
};
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
bunx tsc --noEmit
```

Expected: compilation errors only in files that create `ProposedBuildingLayer` or `ExistingBuilding` objects (will be fixed in Task 2 and later tasks). Zero errors in `beliggenhedsplan.types.ts` itself.

- [ ] **Step 6: Commit**

```bash
git add src/domain/drawing/beliggenhedsplan.types.ts
git commit -m "feat(drawing): extend domain types for authority-grade beliggenhedsplan"
```

---

### Task 2: Fix schemas + add new schemas

**Context — read these files first:**

- `src/domain/drawing/beliggenhedsplan.schemas.ts` (full file)
- `src/domain/drawing/beliggenhedsplan.types.ts` (just updated)

**Files:**

- Modify: `src/domain/drawing/beliggenhedsplan.schemas.ts`

- [ ] **Step 1: Add three new exported schemas after `ConstraintLayerSchema`**

After `ConstraintLayerSchema` (around line 140), add:

```typescript
export const VejLayerSchema = z.object({
  vejnavn: z.string(),
  centerline25832: GeoJsonLineString25832Schema.nullable(),
  vejkant25832: GeoJsonLineString25832Schema.nullable(),
  vejbreddeM: z.number().positive().nullable(),
  source: LayerSourceMetaSchema,
});

export const NaturbeskyttelseLayerSchema = z.object({
  type: z.enum([
    "strandbeskyttelse",
    "skovbyggelinje",
    "åbeskyttelse",
    "fortidsmindebeskyttelse",
    "klitfredning",
  ]),
  geometry25832: z.union([GeoJsonPolygon25832Schema, GeoJsonLineString25832Schema]),
  bufferDistanceM: z.number(),
  intersectsProposedBuilding: z.boolean(),
  source: LayerSourceMetaSchema,
});

export const LerLedningSchema = z.object({
  type: z.enum([
    "kloak_spildevand",
    "kloak_regnvand",
    "kloak_faelles",
    "vand",
    "el",
    "naturgas",
    "fjernvarme",
    "telekom",
  ]),
  geometry25832: GeoJsonLineString25832Schema,
  ejer: z.string().nullable(),
  dybdeM: z.number().nullable(),
  diameterMm: z.number().nullable(),
  source: LayerSourceMetaSchema,
});
```

- [ ] **Step 2: Fix the three Rule-1 violations + extend `ProposedBuildingLayerSchema`**

Replace `ProposedBuildingLayerSchema`:

```typescript
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
  tagform: z.enum(["sadeltag", "fladt", "mansard", "pulttag"]).nullable(),
  taghaldningGrad: z.number().min(0).max(60).nullable(),
  rygningsKoteM: z.number().nullable(),
  source: LayerSourceMetaSchema,
});
```

- [ ] **Step 3: Fix `ExistingFeaturesLayerSchema` — add `nedrives`**

Replace the inline building schema inside `ExistingFeaturesLayerSchema`:

```typescript
export const ExistingFeaturesLayerSchema = z.object({
  buildings: z.array(
    z.object({
      bbrId: z.string().nullable(),
      footprint25832: GeoJsonPolygon25832Schema,
      usageCode: z.string().nullable(),
      areaM2: z.number(),
      sokkelKoteM: z.number().nullable(),
      nedrives: z.boolean().default(false),
      source: LayerSourceMetaSchema,
    }),
  ),
  fences: z.array(GeoJsonLineString25832Schema),
  source: LayerSourceMetaSchema,
});
```

- [ ] **Step 4: Fix the three Rule-1 violations in `BeliggenhedsplanInputSchema`**

Add utility/siteUse/terrain schemas before `BeliggenhedsplanInputSchema`. First, add these two schemas after `ConstraintLayerSchema` (before the three new schemas from Step 1):

```typescript
export const UtilityLayerSchema = z.object({
  type: z.enum([
    "water",
    "sewer",
    "electric",
    "gas",
    "rainwater",
    "wastewater",
    "inspection_well",
    "sand_trap",
    "rat_barrier",
  ]),
  geometry25832: z.union([GeoJsonPoint25832Schema, GeoJsonLineString25832Schema]),
  label: z.string(),
  dkKoteM: z.number().nullable(),
  diameterMm: z.number().nullable(),
  lineStyle: z.enum(["solid", "dashed", "dotted"]).nullable(),
  source: LayerSourceMetaSchema,
});

export const SiteUseLayerSchema = z.object({
  type: z.enum([
    "parking",
    "waste_sorting",
    "driveway",
    "geothermal_field",
    "terrace",
    "future_structure",
  ]),
  geometry25832: GeoJsonPolygon25832Schema,
  label: z.string(),
  widthM: z.number().nullable(),
  isExisting: z.boolean(),
  permitRequired: z.boolean().nullable(),
  legalBasis: z.enum(["br18_notification", "br18_permit_required"]).nullable(),
  note: z.string().nullable(),
  hatchPattern: z.enum(["diagonal", "cross", "dots"]).nullable(),
  source: LayerSourceMetaSchema,
});

export const TerrainLayerSchema = z.object({
  verticalDatum: z.literal("DVR90"),
  points: z.array(
    z.object({
      x: z.number(),
      y: z.number(),
      z: z.number(),
      label: z.string(),
      source: DataSourceSchema,
    }),
  ),
  slopePercent: z.number().nullable(),
  lowPointM: z.number().nullable(),
  source: LayerSourceMetaSchema,
});
```

- [ ] **Step 5: Replace `BeliggenhedsplanInputSchema` with fixed + extended version**

```typescript
export const BeliggenhedsplanInputSchema = z.object({
  crs: Crs25832Schema,
  parcel: ParcelLayerSchema,
  survey: SurveyLayerSchema.nullable(),
  existing: ExistingFeaturesLayerSchema,
  proposed: ProposedBuildingLayerSchema,
  constraints: z.array(ConstraintLayerSchema),
  utilities: z.array(UtilityLayerSchema),
  siteUse: z.array(SiteUseLayerSchema),
  terrain: TerrainLayerSchema.nullable(),
  metadata: DrawingMetadataSchema,
  mandatoryAnnotations: MandatoryAnnotationsSchema,
  vej: VejLayerSchema.nullable(),
  naturbeskyttelse: z.array(NaturbeskyttelseLayerSchema),
  lerLedninger: z.array(LerLedningSchema),
  kloakoplandType: z.enum(["separat", "faelles"]).nullable(),
});
```

- [ ] **Step 6: Fix compile errors in `assemble-beliggenhedsplan.service.ts`**

Open `src/services/drawing/assemble-beliggenhedsplan.service.ts`. Update the `plan` object construction (around line 155) to add the four new fields and fix `proposed`:

```typescript
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
    heightM: heightM,
    sokkelKoteM: sokkelKoteM,
    finishedFloorKoteM: sokkelKoteM !== null ? sokkelKoteM + 0.15 : null,
    terrainOffsetM: null,
    dimensions: [],
    tagform: null,
    taghaldningGrad: null,
    rygningsKoteM: null,
    source: generatedSourceMeta(),
  },
  constraints: allConstraints,
  utilities: [],
  siteUse: [],
  terrain: dhmTerrain,
  metadata,
  mandatoryAnnotations: buildMandatoryAnnotations(survey !== null, false),
  vej: null,
  naturbeskyttelse: [],
  lerLedninger: [],
  kloakoplandType: null,
};
```

- [ ] **Step 7: Fix compile error in `drawing-layers.ts`**

Open `src/integrations/geodanmark/drawing-layers.ts`. In `fetchNeighborBuildings`, add `nedrives: false` to each building object (around line 115):

```typescript
return {
  bbrId: b.sourceId,
  footprint25832: polygon25832,
  usageCode: null,
  areaM2: b.footprintAreaM2 ?? 0,
  sokkelKoteM: null,
  nedrives: false,
  source: perBuildingSource,
};
```

- [ ] **Step 8: Run TypeScript check**

```bash
bunx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 9: Run existing tests**

```bash
bun test src/services/drawing
```

Expected: all pass.

- [ ] **Step 10: Commit**

```bash
git add src/domain/drawing/beliggenhedsplan.schemas.ts \
        src/services/drawing/assemble-beliggenhedsplan.service.ts \
        src/integrations/geodanmark/drawing-layers.ts
git commit -m "fix(drawing): repair Rule-1 schema violations + extend schemas for authority-grade drawing"
```

---

### Task 3: Add `computeRygningsKote` and `polygonsIntersect` to geometry-engine

**Context — read these files first:**

- `src/domain/drawing/geometry-engine.ts` (full file — note existing jsts imports and pattern)

**Files:**

- Modify: `src/domain/drawing/geometry-engine.ts`
- Create: `src/domain/drawing/geometry-engine.test.ts` (if it doesn't exist)

- [ ] **Step 1: Write failing tests**

Create/open `src/domain/drawing/geometry-engine.test.ts` and add:

```typescript
import { describe, it, expect } from "bun:test";
import { computeRygningsKote, polygonsIntersect } from "./geometry-engine";

describe("computeRygningsKote", () => {
  it("sadeltag 35 grader, 9m bred, sokkel 18.20, loft 2.40", () => {
    // taghøjde = (9/2) × tan(35°) = 4.5 × 0.7002 = 3.151
    // rygning = 18.20 + 2.40 + 3.151 = 23.751 → rounded to 2 decimals
    const result = computeRygningsKote({
      sokkelKoteM: 18.2,
      loftshøjdeM: 2.4,
      fodprintBreddeM: 9,
      tagform: "sadeltag",
      taghaldningGrad: 35,
    });
    expect(result).toBeCloseTo(23.75, 1);
  });

  it("fladt tag giver 0.15m taghøjde", () => {
    const result = computeRygningsKote({
      sokkelKoteM: 10.0,
      loftshøjdeM: 2.5,
      fodprintBreddeM: 8,
      tagform: "fladt",
      taghaldningGrad: 0,
    });
    expect(result).toBeCloseTo(12.65, 2);
  });

  it("mansard er 60% af sadeltag-taghøjde", () => {
    const sadel = computeRygningsKote({
      sokkelKoteM: 0,
      loftshøjdeM: 0,
      fodprintBreddeM: 10,
      tagform: "sadeltag",
      taghaldningGrad: 40,
    });
    const mansard = computeRygningsKote({
      sokkelKoteM: 0,
      loftshøjdeM: 0,
      fodprintBreddeM: 10,
      tagform: "mansard",
      taghaldningGrad: 40,
    });
    expect(mansard).toBeCloseTo(sadel * 0.6, 1);
  });
});

describe("polygonsIntersect", () => {
  const square: import("./beliggenhedsplan.types").GeoJsonPolygon25832 = {
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
  };
  const overlapping: import("./beliggenhedsplan.types").GeoJsonPolygon25832 = {
    type: "Polygon",
    crs: "EPSG:25832",
    coordinates: [
      [
        [5, 5],
        [15, 5],
        [15, 15],
        [5, 15],
        [5, 5],
      ],
    ],
  };
  const separate: import("./beliggenhedsplan.types").GeoJsonPolygon25832 = {
    type: "Polygon",
    crs: "EPSG:25832",
    coordinates: [
      [
        [20, 20],
        [30, 20],
        [30, 30],
        [20, 30],
        [20, 20],
      ],
    ],
  };

  it("overlapping polygons → true", () => {
    expect(polygonsIntersect(square, overlapping)).toBe(true);
  });
  it("separate polygons → false", () => {
    expect(polygonsIntersect(square, separate)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
bun test src/domain/drawing/geometry-engine.test.ts
```

Expected: FAIL with "computeRygningsKote is not a function".

- [ ] **Step 3: Add functions to `geometry-engine.ts`**

Append to the end of `src/domain/drawing/geometry-engine.ts`:

```typescript
export function computeRygningsKote(input: {
  sokkelKoteM: number;
  loftshøjdeM: number;
  fodprintBreddeM: number;
  tagform: "sadeltag" | "pulttag" | "mansard" | "fladt";
  taghaldningGrad: number;
}): number {
  const { sokkelKoteM, loftshøjdeM, fodprintBreddeM, tagform, taghaldningGrad } = input;
  const halvBredde = fodprintBreddeM / 2;
  const haldningRad = (taghaldningGrad * Math.PI) / 180;

  let taghøjde: number;
  switch (tagform) {
    case "sadeltag":
    case "pulttag":
      taghøjde = halvBredde * Math.tan(haldningRad);
      break;
    case "mansard":
      taghøjde = halvBredde * Math.tan(haldningRad) * 0.6;
      break;
    case "fladt":
      taghøjde = 0.15;
      break;
  }

  return Math.round((sokkelKoteM + loftshøjdeM + taghøjde) * 100) / 100;
}

export function polygonsIntersect(a: GeoJsonPolygon25832, b: GeoJsonPolygon25832): boolean {
  return toJsts(a).intersects(toJsts(b));
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
bun test src/domain/drawing/geometry-engine.test.ts
```

Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/domain/drawing/geometry-engine.ts \
        src/domain/drawing/geometry-engine.test.ts
git commit -m "feat(drawing): add computeRygningsKote and polygonsIntersect to geometry-engine"
```

---

### Task 4: Nature-protection rule

**Context — read these files first:**

- `src/domain/drawing/decision-engine.ts` (to understand `ReadinessReason` type — it lives there)
- `src/domain/drawing/beliggenhedsplan.types.ts` (for `NaturbeskyttelseType`)

**Files:**

- Create: `src/lib/rule-engine/rules/nature-protection-rules.ts`
- Create: `src/lib/rule-engine/rules/nature-protection-rules.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/lib/rule-engine/rules/nature-protection-rules.test.ts
import { describe, it, expect } from "bun:test";
import { validateNaturbeskyttelse } from "./nature-protection-rules";
import type { NaturbeskyttelseLayer } from "@/domain/drawing/beliggenhedsplan.types";

const mockLayer = (
  type: NaturbeskyttelseLayer["type"],
  intersects: boolean,
): NaturbeskyttelseLayer => ({
  type,
  geometry25832: {
    type: "LineString",
    crs: "EPSG:25832",
    coordinates: [
      [0, 0],
      [100, 0],
    ],
  },
  bufferDistanceM: 300,
  intersectsProposedBuilding: intersects,
  source: { source: "registry", confidence: "medium", fetchedAt: null, requiresReview: false },
});

describe("validateNaturbeskyttelse", () => {
  it("empty list → no reasons", () => {
    expect(validateNaturbeskyttelse([])).toHaveLength(0);
  });

  it("non-intersecting layer → no reasons", () => {
    expect(validateNaturbeskyttelse([mockLayer("strandbeskyttelse", false)])).toHaveLength(0);
  });

  it("strandbeskyttelse intersection → blocking reason with §15", () => {
    const reasons = validateNaturbeskyttelse([mockLayer("strandbeskyttelse", true)]);
    expect(reasons).toHaveLength(1);
    expect(reasons[0]!.severity).toBe("blocking");
    expect(reasons[0]!.message).toContain("NBL §15");
  });

  it("two intersecting layers → two reasons", () => {
    const reasons = validateNaturbeskyttelse([
      mockLayer("strandbeskyttelse", true),
      mockLayer("skovbyggelinje", true),
    ]);
    expect(reasons).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
bun test src/lib/rule-engine/rules/nature-protection-rules.test.ts
```

- [ ] **Step 3: Implement**

```typescript
// src/lib/rule-engine/rules/nature-protection-rules.ts
import type { NaturbeskyttelseLayer } from "@/domain/drawing/beliggenhedsplan.types";
import type { ReadinessReason } from "@/domain/drawing/decision-engine";

const LAW_REFS: Record<NaturbeskyttelseLayer["type"], string> = {
  strandbeskyttelse: "NBL §15 — dispensation fra Kystdirektoratet kræves",
  skovbyggelinje: "NBL §17 — dispensation fra Miljøstyrelsen kræves",
  åbeskyttelse: "NBL §16 — dispensation kræves",
  fortidsmindebeskyttelse: "NBL §18 — Slots- og Kulturstyrelsen",
  klitfredning: "NBL §8 — dispensation fra Kystdirektoratet kræves",
};

const DISPLAY_NAMES: Record<NaturbeskyttelseLayer["type"], string> = {
  strandbeskyttelse: "Strandbeskyttelseslinje",
  skovbyggelinje: "Skovbyggelinje",
  åbeskyttelse: "Åbeskyttelseslinje",
  fortidsmindebeskyttelse: "Fortidsmindebeskyttelseslinje",
  klitfredning: "Klitfredning",
};

export function validateNaturbeskyttelse(
  naturbeskyttelse: NaturbeskyttelseLayer[],
): ReadinessReason[] {
  return naturbeskyttelse
    .filter((layer) => layer.intersectsProposedBuilding)
    .map((layer) => ({
      code: `NATURBESKYTTELSE_${layer.type.toUpperCase()}`,
      severity: "blocking" as const,
      message: `${DISPLAY_NAMES[layer.type]} krydser foreslået bygning — ${LAW_REFS[layer.type]}`,
      affectedLayer: "naturbeskyttelse",
    }));
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
bun test src/lib/rule-engine/rules/nature-protection-rules.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/rule-engine/rules/nature-protection-rules.ts \
        src/lib/rule-engine/rules/nature-protection-rules.test.ts
git commit -m "feat(rule-engine): add validateNaturbeskyttelse with NBL law references"
```

---

### Task 5: Basement feasibility rule

**Context — read these files first:**

- `src/domain/drawing/decision-engine.ts` (for `ReadinessReason` type)
- `src/domain/contracts/rule-engine.types.ts` lines 108–117 (for `RuleEngineGeusRiskData` — note: the field is `groundwaterDepthM`, depth below surface in meters, NOT an absolute kote)

**Files:**

- Create: `src/lib/rule-engine/rules/basement-rules.ts`
- Create: `src/lib/rule-engine/rules/basement-rules.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/rule-engine/rules/basement-rules.test.ts
import { describe, it, expect } from "bun:test";
import { validateKælderFeasibility } from "./basement-rules";

describe("validateKælderFeasibility", () => {
  it("no kælder → empty", () => {
    expect(
      validateKælderFeasibility({
        hasKælder: false,
        kælderGulvKoteM: null,
        groundwaterDepthM: 2,
        terrainKoteM: 20,
      }),
    ).toHaveLength(0);
  });

  it("kælder with safe depth → empty", () => {
    // terrain 20m, groundwater 3m deep → water table kote = 17m
    // basement floor at 15m → safely above 17-0.5=16.5 → wait, 15 < 16.5 → should warn
    // Let me recalculate: safe floor must be >= waterTableKote + 0.5
    // waterTableKote = 20 - 3 = 17, safe floor >= 17 + 0.5 = 17.5
    // basement floor at 18 → 18 >= 17.5 → safe
    const result = validateKælderFeasibility({
      hasKælder: true,
      kælderGulvKoteM: 18,
      groundwaterDepthM: 3,
      terrainKoteM: 20,
    });
    expect(result).toHaveLength(0);
  });

  it("kælder below water table → blocking Hard Stop", () => {
    // terrain 20, groundwater 2m deep → water table = 18m, safe floor >= 18.5
    // basement at 17 → below safe level → blocking
    const result = validateKælderFeasibility({
      hasKælder: true,
      kælderGulvKoteM: 17,
      groundwaterDepthM: 2,
      terrainKoteM: 20,
    });
    expect(result.some((r) => r.severity === "blocking")).toBe(true);
  });

  it("kælder likely below sewer → warning", () => {
    // terrain 20, sewer est. at 20-1.2=18.8, basement at 18 → 18 < 18.8 → pump warning
    const result = validateKælderFeasibility({
      hasKælder: true,
      kælderGulvKoteM: 18,
      groundwaterDepthM: null, // no groundwater data
      terrainKoteM: 20,
    });
    expect(result.some((r) => r.severity === "warning" && r.code === "KAELDER_PUMP_LIKELY")).toBe(
      true,
    );
  });

  it("kælder floor null → warning about missing kote", () => {
    const result = validateKælderFeasibility({
      hasKælder: true,
      kælderGulvKoteM: null,
      groundwaterDepthM: null,
      terrainKoteM: null,
    });
    expect(result.some((r) => r.code === "KAELDER_GULVKOTE_MISSING")).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
bun test src/lib/rule-engine/rules/basement-rules.test.ts
```

- [ ] **Step 3: Implement**

```typescript
// src/lib/rule-engine/rules/basement-rules.ts
import type { ReadinessReason } from "@/domain/drawing/decision-engine";

export function validateKælderFeasibility(input: {
  hasKælder: boolean;
  kælderGulvKoteM: number | null;
  groundwaterDepthM: number | null; // from RuleEngineGeusRiskData.groundwaterDepthM (depth from surface)
  terrainKoteM: number | null; // from RuleEngineTerrainData.avgElevationM
}): ReadinessReason[] {
  const { hasKælder, kælderGulvKoteM, groundwaterDepthM, terrainKoteM } = input;

  if (!hasKælder) return [];

  const reasons: ReadinessReason[] = [];

  if (kælderGulvKoteM === null) {
    reasons.push({
      code: "KAELDER_GULVKOTE_MISSING",
      severity: "warning",
      message:
        "Kælderens gulvkote (DVR90) er ikke angivet — kloak- og grundvandscheck kan ikke udføres",
      affectedLayer: "proposed",
    });
    return reasons;
  }

  // Groundwater Hard Stop: basement floor must be ≥ water table kote + 0.5m safety
  if (terrainKoteM !== null && groundwaterDepthM !== null) {
    const waterTableKoteM = terrainKoteM - groundwaterDepthM;
    const safeFloorKoteM = waterTableKoteM + 0.5;
    if (kælderGulvKoteM < safeFloorKoteM) {
      reasons.push({
        code: "KAELDER_UNDER_GRUNDVAND",
        severity: "blocking",
        message: `Kældergulv (DVR90 +${kælderGulvKoteM.toFixed(2)} m) er under estimeret grundvandsspejl + 0,5 m sikkerhed (DVR90 +${safeFloorKoteM.toFixed(2)} m). Kræver geoteknisk undersøgelse.`,
        affectedLayer: "proposed",
      });
    }
  }

  // Sewer pump warning: conservative nationwide sewer depth = 1.2m below terrain
  if (terrainKoteM !== null) {
    const estimatedSewerInvertKoteM = terrainKoteM - 1.2;
    if (kælderGulvKoteM < estimatedSewerInvertKoteM) {
      reasons.push({
        code: "KAELDER_PUMP_LIKELY",
        severity: "warning",
        message: `Kældergulv (DVR90 +${kælderGulvKoteM.toFixed(2)} m) er sandsynligvis under kloakledningens bundkote (estimeret DVR90 +${estimatedSewerInvertKoteM.toFixed(2)} m, 1,2 m konservativt estimat). Pumpebrønd sandsynligvis nødvendig — bekræftes af aut. kloakmester.`,
        affectedLayer: "utilities",
      });
    }
  }

  return reasons;
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
bun test src/lib/rule-engine/rules/basement-rules.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/rule-engine/rules/basement-rules.ts \
        src/lib/rule-engine/rules/basement-rules.test.ts
git commit -m "feat(rule-engine): add validateKælderFeasibility with groundwater and sewer checks"
```

---

### Task 6: Jordvarme permit rule

**Context — read these files first:**

- `src/domain/drawing/decision-engine.ts` (for `ReadinessReason` type)

**Files:**

- Create: `src/lib/rule-engine/rules/utility-rules.ts`
- Create: `src/lib/rule-engine/rules/utility-rules.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/rule-engine/rules/utility-rules.test.ts
import { describe, it, expect } from "bun:test";
import { validateJordvarmePermit } from "./utility-rules";

describe("validateJordvarmePermit", () => {
  it("no jordvarme → empty", () => {
    expect(validateJordvarmePermit({ hasJordvarme: false })).toHaveLength(0);
  });

  it("jordvarme → two info reasons", () => {
    const result = validateJordvarmePermit({ hasJordvarme: true });
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.severity === "info")).toBe(true);
    expect(result.some((r) => r.code === "JORDVARME_PARAGRAPH19_PERMIT")).toBe(true);
    expect(result.some((r) => r.code === "JORDVARME_JUPITER_REGISTRATION")).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
bun test src/lib/rule-engine/rules/utility-rules.test.ts
```

- [ ] **Step 3: Implement**

```typescript
// src/lib/rule-engine/rules/utility-rules.ts
import type { ReadinessReason } from "@/domain/drawing/decision-engine";

export function validateJordvarmePermit(input: { hasJordvarme: boolean }): ReadinessReason[] {
  if (!input.hasJordvarme) return [];

  return [
    {
      code: "JORDVARME_PARAGRAPH19_PERMIT",
      severity: "info",
      message:
        "Jordvarmeboring (> 10 m) kræver §19-tilladelse fra kommunen jf. Miljøbeskyttelsesloven",
      affectedLayer: "siteUse",
    },
    {
      code: "JORDVARME_JUPITER_REGISTRATION",
      severity: "info",
      message: "Jordvarmeanlæg skal registreres i GEUS Jupiter-boringsdatabase efter etablering",
      affectedLayer: "siteUse",
    },
  ];
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
bun test src/lib/rule-engine/rules/utility-rules.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/rule-engine/rules/utility-rules.ts \
        src/lib/rule-engine/rules/utility-rules.test.ts
git commit -m "feat(rule-engine): add validateJordvarmePermit with §19 and Jupiter info reasons"
```

---

### Task 7: Completeness engine

**Context — read these files first:**

- `src/domain/drawing/beliggenhedsplan.types.ts` (for `TerrainLayer`, `SiteUseLayer`, `VejLayer`)
- `src/domain/drawing/source-quality.ts` (for `DataSource`, `DataConfidence`)

**Files:**

- Create: `src/domain/drawing/completeness-engine.ts`
- Create: `src/domain/drawing/completeness-engine.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/domain/drawing/completeness-engine.test.ts
import { describe, it, expect } from "bun:test";
import { computeDrawingCompleteness } from "./completeness-engine";
import type { CompletenessInput } from "./completeness-engine";

const minimalBlocking: CompletenessInput = {
  hasParcelPolygon: true,
  proposedFootprintSource: null,
  sokkelKoteM: null,
  sokkelSource: null,
  tagform: null,
  taghaldningGrad: null,
  rygningsKoteM: null,
  vejLayer: null,
  terrainLayer: null,
  surveyTerrainPointCount: 0,
  kloakoplandType: null,
  siteUseLayers: [],
  naturbeskyttelseFetchedAt: null,
};

describe("computeDrawingCompleteness", () => {
  it("footprint null → overallStatus draft", () => {
    const result = computeDrawingCompleteness(minimalBlocking);
    expect(result.overallStatus).toBe("draft");
  });

  it("tinglysteServitutter is always placeholder in permanentWarnings", () => {
    const result = computeDrawingCompleteness(minimalBlocking);
    expect(result.permanentWarnings.length).toBeGreaterThan(0);
    expect(result.permanentWarnings[0]).toContain("tinglysning.dk");
  });

  it("kloakStikledning is always placeholder", () => {
    const result = computeDrawingCompleteness(minimalBlocking);
    expect(result.fields.kloakStikledning.status).toBe("placeholder");
  });

  it("regnvandsløsning placeholder when kloakopland null", () => {
    const result = computeDrawingCompleteness({ ...minimalBlocking, kloakoplandType: null });
    expect(result.fields.regnvandsløsning.status).toBe("placeholder");
  });

  it("regnvandsløsning placeholder when separat", () => {
    const result = computeDrawingCompleteness({ ...minimalBlocking, kloakoplandType: "separat" });
    expect(result.fields.regnvandsløsning.status).toBe("placeholder");
  });

  it("regnvandsløsning auto when faelles", () => {
    const result = computeDrawingCompleteness({
      ...minimalBlocking,
      kloakoplandType: "faelles",
      proposedFootprintSource: "generated",
    });
    expect(result.fields.regnvandsløsning.status).toBe("auto");
  });

  it("sokkelKote estimated when sokkelKoteM present with registry source", () => {
    const result = computeDrawingCompleteness({
      ...minimalBlocking,
      sokkelKoteM: 18.2,
      sokkelSource: "registry",
      proposedFootprintSource: "generated",
    });
    expect(result.fields.sokkelKote.status).toBe("estimated");
  });

  it("complete plan → overallStatus ready", () => {
    const result = computeDrawingCompleteness({
      hasParcelPolygon: true,
      proposedFootprintSource: "generated",
      sokkelKoteM: 18.2,
      sokkelSource: "registry",
      tagform: "sadeltag",
      taghaldningGrad: 35,
      rygningsKoteM: 23.75,
      vejLayer: {
        vejnavn: "Testvej",
        centerline25832: {
          type: "LineString",
          crs: "EPSG:25832",
          coordinates: [
            [0, 0],
            [100, 0],
          ],
        },
        vejkant25832: null,
        vejbreddeM: null,
        source: {
          source: "registry",
          confidence: "medium",
          fetchedAt: "2026-06-06",
          requiresReview: false,
        },
      },
      terrainLayer: {
        verticalDatum: "DVR90",
        points: [],
        slopePercent: null,
        lowPointM: null,
        source: {
          source: "registry",
          confidence: "medium",
          fetchedAt: "2026-06-06",
          requiresReview: false,
        },
      },
      surveyTerrainPointCount: 0,
      kloakoplandType: "faelles",
      siteUseLayers: [],
      naturbeskyttelseFetchedAt: "2026-06-06",
    });
    expect(result.overallStatus).toBe("ready");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
bun test src/domain/drawing/completeness-engine.test.ts
```

- [ ] **Step 3: Implement**

```typescript
// src/domain/drawing/completeness-engine.ts
import type { DataSource, TerrainLayer, VejLayer, SiteUseLayer } from "./beliggenhedsplan.types";

export type ResponsibleParty = "kloakmester" | "landinspektør" | "arkitekt" | "bruger";

export type FieldStatus =
  | { status: "auto" }
  | { status: "estimated"; note: string }
  | { status: "placeholder"; responsibleParty: ResponsibleParty; displayLabel: string }
  | { status: "missing"; blocksSubmission: boolean; displayLabel: string };

export type DrawingFields = {
  parcelPolygon: FieldStatus;
  proposedFootprint: FieldStatus;
  sokkelKote: FieldStatus;
  rygningsKote: FieldStatus;
  vejGeometry: FieldStatus;
  koterTerræn: FieldStatus;
  kloakStikledning: FieldStatus;
  regnvandsløsning: FieldStatus;
  overkørsel: FieldStatus;
  naturbeskyttelse: FieldStatus;
  tinglysteServitutter: FieldStatus;
};

export type DrawingCompleteness = {
  overallStatus: "ready" | "draft";
  fields: DrawingFields;
  blockingCount: number;
  placeholderCount: number;
  permanentWarnings: string[];
};

export type CompletenessInput = {
  hasParcelPolygon: boolean;
  proposedFootprintSource: DataSource | null;
  sokkelKoteM: number | null;
  sokkelSource: DataSource | null;
  tagform: "sadeltag" | "fladt" | "mansard" | "pulttag" | null;
  taghaldningGrad: number | null;
  rygningsKoteM: number | null;
  vejLayer: VejLayer | null;
  terrainLayer: TerrainLayer | null;
  surveyTerrainPointCount: number;
  kloakoplandType: "separat" | "faelles" | null;
  siteUseLayers: SiteUseLayer[];
  naturbeskyttelseFetchedAt: string | null;
};

export function computeDrawingCompleteness(input: CompletenessInput): DrawingCompleteness {
  const fields: DrawingFields = {
    parcelPolygon: { status: "auto" },

    proposedFootprint: (() => {
      if (!input.proposedFootprintSource)
        return {
          status: "missing",
          blocksSubmission: true,
          displayLabel: "Bygningsfodprint mangler — angiv i Maskinrummet",
        };
      if (
        input.proposedFootprintSource === "survey" ||
        input.proposedFootprintSource === "cad_upload"
      )
        return { status: "auto" };
      return { status: "estimated", note: "Genereret fra dimensioner" };
    })(),

    sokkelKote: (() => {
      if (input.sokkelKoteM === null)
        return {
          status: "placeholder",
          responsibleParty: "kloakmester",
          displayLabel: "Sokkelkote DVR90 [af kloakmester]",
        };
      if (input.sokkelSource === "survey") return { status: "auto" };
      return {
        status: "estimated",
        note: `ca. DVR90 +${input.sokkelKoteM.toFixed(2)} m (DHM + 0,30 m)`,
      };
    })(),

    rygningsKote: (() => {
      if (!input.tagform)
        return {
          status: "placeholder",
          responsibleParty: "arkitekt",
          displayLabel: "Rygningskote DVR90 [angives af arkitekt]",
        };
      if (input.rygningsKoteM !== null)
        return {
          status: "estimated",
          note: `ca. DVR90 +${input.rygningsKoteM.toFixed(2)} m (beregnet)`,
        };
      return {
        status: "placeholder",
        responsibleParty: "arkitekt",
        displayLabel: "Rygningskote DVR90 [angives af arkitekt]",
      };
    })(),

    vejGeometry: (() => {
      if (!input.vejLayer) return { status: "estimated", note: "Vejgeometri ikke hentet" };
      if (input.vejLayer.centerline25832 !== null) return { status: "auto" };
      if (input.vejLayer.vejkant25832 !== null)
        return { status: "estimated", note: "Vejkant tilgængeligt, vejmidte ikke kortlagt" };
      return { status: "estimated", note: "Vejnavn fra DAR — geometri ikke kortlagt" };
    })(),

    koterTerræn: (() => {
      if (input.surveyTerrainPointCount > 0) return { status: "auto" };
      if (input.terrainLayer) return { status: "estimated", note: "DHM estimat (SDFI)" };
      return {
        status: "placeholder",
        responsibleParty: "landinspektør",
        displayLabel: "Terrænkoter [landinspektør]",
      };
    })(),

    kloakStikledning: {
      status: "placeholder",
      responsibleParty: "kloakmester",
      displayLabel: "Stikledning og bundkote [aut. kloakmester]",
    },

    regnvandsløsning: (() => {
      if (input.kloakoplandType === "faelles") return { status: "auto" };
      return {
        status: "placeholder",
        responsibleParty: "kloakmester",
        displayLabel: "Regnvandsløsning [kloakmester]",
      };
    })(),

    overkørsel: (() => {
      const hasDriveway = input.siteUseLayers.some(
        (l) => l.type === "driveway" && l.source.source !== "estimated",
      );
      if (hasDriveway) return { status: "auto" };
      return {
        status: "placeholder",
        responsibleParty: "bruger",
        displayLabel: "Overkørsel [placering bekræftes af kommunen]",
      };
    })(),

    naturbeskyttelse: (() => {
      if (input.naturbeskyttelseFetchedAt) return { status: "auto" };
      return { status: "estimated", note: "Naturbeskyttelse ikke hentet — kør adresseanalyse" };
    })(),

    tinglysteServitutter: {
      status: "placeholder",
      responsibleParty: "bruger",
      displayLabel: "Kontroller tinglysning.dk",
    },
  };

  const blockingCount = Object.values(fields).filter(
    (f) => f.status === "missing" && (f as { blocksSubmission: boolean }).blocksSubmission,
  ).length;

  const placeholderCount = Object.values(fields).filter((f) => f.status === "placeholder").length;

  return {
    overallStatus: blockingCount === 0 ? "ready" : "draft",
    fields,
    blockingCount,
    placeholderCount,
    permanentWarnings: [
      "Kontroller tinglyste servitutter og privatretlige deklarationer via tinglysning.dk inden indgivelse til kommunen.",
    ],
  };
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
bun test src/domain/drawing/completeness-engine.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/domain/drawing/completeness-engine.ts \
        src/domain/drawing/completeness-engine.test.ts
git commit -m "feat(drawing): add computeDrawingCompleteness pure domain function"
```

---

### Task 8: SQL migration

**Context:** No files to read. Pure SQL.

**Files:**

- Create: `supabase/migrations/20260606200000_drawing_params.sql`

- [ ] **Step 1: Create migration file**

```sql
-- supabase/migrations/20260606200000_drawing_params.sql
-- Five new typed columns on projects for authority-grade beliggenhedsplan.
-- Rule 6: domain-critical design values must be typed SQL columns, not JSONB.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS taghaldning_grad    numeric
    CONSTRAINT taghaldning_grad_range CHECK (taghaldning_grad BETWEEN 0 AND 60),
  ADD COLUMN IF NOT EXISTS tagform             text
    CONSTRAINT tagform_values CHECK (tagform IN ('sadeltag','fladt','mansard','pulttag')),
  ADD COLUMN IF NOT EXISTS har_jordvarme       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS har_kaelder         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kaelder_gulv_kote_m numeric;

COMMENT ON COLUMN projects.taghaldning_grad    IS 'Taghaldning i grader (0-60). Null = ikke angivet.';
COMMENT ON COLUMN projects.tagform             IS 'Tagtype: sadeltag, fladt, mansard eller pulttag.';
COMMENT ON COLUMN projects.har_jordvarme       IS 'Jordvarme planlagt — udløser §19-påmindelser.';
COMMENT ON COLUMN projects.har_kaelder         IS 'Kælder inkluderet — udløser kloak/grundvand-valideringer.';
COMMENT ON COLUMN projects.kaelder_gulv_kote_m IS 'Kælderens gulvkote DVR90 i meter.';

-- ROLLBACK:
-- ALTER TABLE projects
--   DROP COLUMN IF EXISTS taghaldning_grad,
--   DROP COLUMN IF EXISTS tagform,
--   DROP COLUMN IF EXISTS har_jordvarme,
--   DROP COLUMN IF EXISTS har_kaelder,
--   DROP COLUMN IF EXISTS kaelder_gulv_kote_m;
```

- [ ] **Step 2: Apply migration locally**

```bash
bunx supabase db push
```

Expected: migration applied without errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260606200000_drawing_params.sql
git commit -m "feat(db): add 5 typed columns for authority-grade drawing params (tagform, kælder, jordvarme)"
```

---

### Task 9: Extend reactive-compliance.ts (PROTECTED FILE)

> **PROTECTED FILE — PR must include: `Rører beskyttet fil — kræver review`**

**Context — read these files first:**

- `src/lib/reactive-compliance.ts` (full file — 103 lines)
- `src/domain/drawing/decision-engine.ts` (for `ReadinessReason`)
- `src/lib/rule-engine/rules/nature-protection-rules.ts` (just created)
- `src/lib/rule-engine/rules/basement-rules.ts` (just created)
- `src/lib/rule-engine/rules/utility-rules.ts` (just created)
- `src/domain/contracts/rule-engine.types.ts` lines 108–117 (for `RuleEngineGeusRiskData` — note: field is `groundwaterDepthM`)
- `src/domain/contracts/rule-engine.types.ts` lines 133–143 (for `RuleEngineTerrainData` — note: field is `avgElevationM`)

**Files:**

- Modify: `src/lib/reactive-compliance.ts`

- [ ] **Step 1: Add new imports at top of `reactive-compliance.ts`**

Add after the existing imports (after line 28, before `export type PartialUpdateParams`):

```typescript
import type {
  GeoJsonPolygon25832,
  NaturbeskyttelseLayer,
} from "@/domain/drawing/beliggenhedsplan.types";
import type { ReadinessReason } from "@/domain/drawing/decision-engine";
import { validateNaturbeskyttelse } from "@/lib/rule-engine/rules/nature-protection-rules";
import { validateKælderFeasibility } from "@/lib/rule-engine/rules/basement-rules";
import { validateJordvarmePermit } from "@/lib/rule-engine/rules/utility-rules";
```

- [ ] **Step 2: Extend `PartialUpdateParams` with five new optional fields**

Replace the closing `};` of `PartialUpdateParams` — add new fields before it:

```typescript
export type PartialUpdateParams = {
  bbr: RuleEngineBbrData;
  ramme: RuleEngineKommuneplanramme | null;
  lokalplanExtract: RuleEngineLokalplanExtract | null;
  lokalplaner: RuleEngineLokalplan[];
  naturbeskyttelse: RuleEngineNaturbeskyttelsesResultat | null;
  geusRisk: RuleEngineGeusRiskData | null;
  servitutter: RuleEngineTinglysningResult | null;
  terrain: RuleEngineTerrainData | null;
  fbbData: RuleEngineFbbResult | null;
  dkjord: RuleEngineDkJordResultat | null;
  byggeoenske: Byggeoenske;
  municipality: string;
  kommunekode: string;
  // Drawing validations — alle valgfrie, breaking change undgås
  proposedFootprint25832?: GeoJsonPolygon25832 | null;
  naturbeskyttelseZoner?: NaturbeskyttelseLayer[];
  harKælder?: boolean;
  kælderGulvKoteM?: number | null;
  harJordvarme?: boolean;
};
```

- [ ] **Step 3: Extend `PartialUpdateResult` with new optional field**

```typescript
export type PartialUpdateResult = {
  complianceMetrics: ComplianceMetrics;
  complianceFlags: ComplianceFlag[];
  ruleEngineResult: RuleEngineResult;
  drawingReasons?: ReadinessReason[];
};
```

- [ ] **Step 4: Add drawing validation logic to `computePartialUpdate`**

At the end of `computePartialUpdate`, before `return`, replace the return statement:

```typescript
const drawingReasons: ReadinessReason[] = [
  ...validateNaturbeskyttelse(params.naturbeskyttelseZoner ?? []),
  ...validateKælderFeasibility({
    hasKælder: params.harKælder ?? false,
    kælderGulvKoteM: params.kælderGulvKoteM ?? null,
    groundwaterDepthM: geusRisk?.groundwaterDepthM ?? null,
    terrainKoteM: terrain?.avgElevationM ?? null,
  }),
  ...validateJordvarmePermit({ hasJordvarme: params.harJordvarme ?? false }),
];

return { complianceMetrics, complianceFlags, ruleEngineResult, drawingReasons };
```

- [ ] **Step 5: TypeScript check**

```bash
bunx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 6: Run full test suite**

```bash
bun test src
```

Expected: all pass. No regressions.

- [ ] **Step 7: Commit**

```bash
git add src/lib/reactive-compliance.ts
git commit -m "feat(compliance): extend reactive-compliance with drawing validations (kælder, jordvarme, naturbeskyttelse)

Rører beskyttet fil — kræver review"
```

---

### Task 10: Update ports interface

**Context — read these files first:**

- `src/domain/drawing/ports.ts` (full file)
- `src/domain/drawing/beliggenhedsplan.types.ts` (for new types)

**Files:**

- Modify: `src/domain/drawing/ports.ts`

- [ ] **Step 1: Replace `DrawingGeometrySourcePort` with extended interface**

```typescript
import type {
  ParcelLayer,
  ExistingFeaturesLayer,
  ConstraintLayer,
  SurveyLayer,
  BBox25832,
  NeighborParcel,
  TerrainLayer,
  VejLayer,
  NaturbeskyttelseLayer,
  LerLedning,
} from "./beliggenhedsplan.types";

export interface DrawingGeometrySourcePort {
  fetchParcelLayers(matrikelId: string): Promise<ParcelLayer | null>;
  fetchNeighborBuildings(bbox25832: BBox25832): Promise<ExistingFeaturesLayer>;
  fetchRoadGeometry(addressId: string, bbox25832: BBox25832): Promise<VejLayer | null>;
  fetchPlandataLayers(kommunekode: string, bbox25832: BBox25832): Promise<ConstraintLayer[]>;
  fetchNeighborParcels(ownJordstykkeId: string, bbox25832: BBox25832): Promise<NeighborParcel[]>;
  fetchRoadName(addressId: string): Promise<{ name: string | null }>;
  fetchDhmKoter(
    bbox25832: BBox25832,
    centroidLat: number,
    centroidLng: number,
  ): Promise<TerrainLayer | null>;
  fetchNaturbeskyttelse(bbox25832: BBox25832): Promise<NaturbeskyttelseLayer[]>;
  fetchLerLedninger(bbox25832: BBox25832): Promise<LerLedning[]>;
  fetchKloakopland(
    kommunekode: string,
    bbox25832: BBox25832,
  ): Promise<"separat" | "faelles" | null>;
  fetchFjernvarmeDaekning(centroidLat: number, centroidLng: number): Promise<boolean | null>;
}
```

Keep `SurveyUploadDecoderPort`, `DrawingExportRecord`, and `DrawingExportStorePort` unchanged.

Note: `fetchRoadGeometry` signature changes (adds `bbox25832` param) and return type changes from `{ centerline25832: ... }` to `VejLayer | null`. This will cause a compile error in `drawing-layers.ts` — fix in next step.

- [ ] **Step 2: Fix compile error in `drawing-layers.ts` — update stub signature**

In `src/integrations/geodanmark/drawing-layers.ts`, replace the stub method:

```typescript
async fetchRoadGeometry(_addressId: string, _bbox25832: BBox25832): Promise<VejLayer | null> {
  return null;
}
```

Also add `VejLayer` and `BBox25832` to the imports from `@/domain/drawing/beliggenhedsplan.types`.

Add stub implementations for the 4 new methods (to be replaced in Phase 2):

```typescript
async fetchNaturbeskyttelse(_bbox25832: BBox25832): Promise<NaturbeskyttelseLayer[]> {
  return [];
}

async fetchLerLedninger(_bbox25832: BBox25832): Promise<LerLedning[]> {
  return [];
}

async fetchKloakopland(_kommunekode: string, _bbox25832: BBox25832): Promise<"separat" | "faelles" | null> {
  return null;
}

async fetchFjernvarmeDaekning(_centroidLat: number, _centroidLng: number): Promise<boolean | null> {
  return null;
}
```

Also add `NaturbeskyttelseLayer`, `LerLedning` to imports.

- [ ] **Step 3: Fix `assemble-beliggenhedsplan.service.ts` — update `fetchRoadGeometry` call**

The service currently calls `fetchRoadName` but not `fetchRoadGeometry`. Add `fetchRoadGeometry` to the parallel fetch block (around line 127):

```typescript
const [existing, constraints, neighborParcels, roadNameResult, dhmTerrain, vejLayer] =
  await Promise.all([
    geometrySource.fetchNeighborBuildings(bbox),
    geometrySource.fetchPlandataLayers(kommunekode, bbox),
    geometrySource.fetchNeighborParcels(parcel.idLokalId, bbox),
    geometrySource.fetchRoadName(addressId),
    geometrySource.fetchDhmKoter(bbox, centroidLat, centroidLng),
    geometrySource.fetchRoadGeometry(addressId, bbox),
  ]);
```

Then update the plan object to use `vejLayer`:

```typescript
const plan: BeliggenhedsplanInput = {
  // ... existing fields unchanged ...
  vej: vejLayer,
  naturbeskyttelse: [],
  lerLedninger: [],
  kloakoplandType: null,
};
```

Also update the `AssembleInput` type to remove `sokkelKoteM`/`heightM` direct passing and keep as-is (no change needed).

- [ ] **Step 4: TypeScript check**

```bash
bunx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 5: Run all tests**

```bash
bun test src
```

Expected: all pass.

- [ ] **Step 6: Run build**

```bash
bun run build
```

Expected: succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/domain/drawing/ports.ts \
        src/integrations/geodanmark/drawing-layers.ts \
        src/services/drawing/assemble-beliggenhedsplan.service.ts
git commit -m "feat(drawing): extend DrawingGeometrySourcePort with 5 new methods + stubs in adapter"
```

---

### Phase 1 complete ✓

Run final checks:

```bash
bunx tsc --noEmit && bun test src && bunx eslint . && bun run build
```

All must pass. Phase 2 plan: `docs/superpowers/plans/2026-06-06-beliggenhedsplan-authority-grade-phase2.md`
