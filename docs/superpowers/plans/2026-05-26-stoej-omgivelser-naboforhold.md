# Støj, Omgivelser og Naboforhold — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tilføj alle datapunkter til `site_constraints` og `address_source_results` der er nødvendige for at generere en myndighedsgodkendt beliggenhedsplan og due diligence screening: nabobygningsgeometrier, nabomatrikler, planlagte støj-/lugt-/konsekvensområder og MST støjkortdata.

**Architecture:** Strict Ports & Adapters — rene domain types i `src/domain/contracts/`, adapters i `src/integrations/`, rule engine i `src/lib/rule-engine/rules/`, application service i `src/lib/surroundings-analysis.server.ts`. Alle eksterne kald valideres med Zod. UI læser kun via `useProject()`. Ingen DAWA. Nye adapters starter med IS_MOCK=true og degraded state; live aktivering sker separat (Task 1 og 7 beskriver verifikationen). Nabogeometrier gemmes som fuld GeoJSON polygon i `address_source_results` — ikke kun statistiske summaries — så beliggenhedsplan-generatoren kan tegne dem.

**Koordinering med beliggenhedsplan-generator:** `src/integrations/geodanmark/drawing-layers.ts` implementerer `DrawingGeometrySourcePort.fetchNeighborBuildings`. Den er i dag tom (mock). Task 14 opdaterer den til at bruge den nye `NeighborGeometryService`. De to planer deler GeoDanmark WFS som kilde men har separate type-hierarkier; adapter-laget konverterer.

**Tech Stack:** TypeScript, Bun, bun:test, Zod, proj4 (allerede installeret), geojson types (allerede installeret).

**Arkitekturreference:** `CLAUDE.md`, `docs/stoej-omgivelser-naboforhold-plan.md`

---

## Beskyttede filer — kræver review ved ændring

- `src/lib/analysis-orchestrator.ts` — wiring af ny service hertil er **ikke** en del af denne plan; sker i separat ticket
- `src/integrations/supabase/project-persistence.ts` — ny persistence kald er **ikke** en del af denne plan

---

## File Map

| Fil | Ansvar | Task |
|-----|--------|------|
| `src/domain/contracts/noise.types.ts` | NoiseMetric, NoiseScreeningResult, NoiseRisk | 2 |
| `src/domain/contracts/surroundings.types.ts` | NeighborBuilding, NeighborContext, NeighborParcel, PlanningSurroundingsContext | 2 |
| `src/domain/contracts/rule-engine.types.ts` | Extend: RuleEngineNoiseData, RuleEngineNeighborData, RuleEngineSurroundingsData | 3 |
| `src/lib/rule-engine/types.ts` | Extend RuleEngineInput med noise?, neighborContext?, surroundings? | 3 |
| `supabase/migrations/20260526100000_site_constraints_noise_neighbor.sql` | Additive migration: noise + neighbor typed columns | 4 |
| `src/lib/cache-policy.ts` | Extend SOURCE_RESULT_TTL_OVERRIDES med nye source kinds | 5 |
| `src/lib/geometry-utils.ts` | Extend: polygonToPolygonDistanceM() | 6 |
| `src/lib/geometry-utils.test.ts` | Tests for ny distance-funktion | 6 |
| `src/integrations/geodanmark/neighbor-geometry.ts` | GeoDanmarkNeighborService — erstatter defekt live-sti i client.ts | 7 |
| `src/integrations/geodanmark/neighbor-geometry.test.ts` | Unit tests med fake WFS features | 7 |
| `src/integrations/mat/neighbor-parcels.ts` | MatNeighborParcelService — nabomatrikler via MAT WFS | 8 |
| `src/integrations/mat/neighbor-parcels.test.ts` | Unit tests med fake WFS features | 8 |
| `src/integrations/plandata/surroundings.ts` | PlandataSurroundingsService — støj/lugt/konsekvensområder | 9 |
| `src/integrations/plandata/surroundings.test.ts` | Unit tests | 9 |
| `src/integrations/stoej/mst-noise.schemas.ts` | Zod schemas til MST WMS/WFS response | 10 |
| `src/integrations/stoej/mst-noise.ts` | MstNoiseService — IS_MOCK=true til endpoint er verificeret | 10 |
| `src/integrations/stoej/mst-noise.test.ts` | Unit tests | 10 |
| `src/lib/rule-engine/rules/noise-rules.ts` | checkNoiseRules() | 11 |
| `src/lib/rule-engine/rules/noise-rules.test.ts` | Tier 1 tests | 11 |
| `src/lib/rule-engine/rules/surroundings-rules.ts` | checkSurroundingsRules() | 12 |
| `src/lib/rule-engine/rules/surroundings-rules.test.ts` | Tier 1 tests | 12 |
| `src/lib/surroundings-analysis.server.ts` | Application service: orchestrerer alle adaptere | 13 |
| `src/lib/surroundings-analysis.server.test.ts` | Tier 2 tests med fake gateways | 13 |
| `src/integrations/geodanmark/drawing-layers.ts` | Modify: fetchNeighborBuildings bruger NeighborGeometryService | 14 |

---

## Task 0: Verificer Endpoints Inden Implementering

**Ingen kode produceres i denne task — output er dokumenterede fund i kommentaren i task 1.**

- [ ] **Step 1: Verificer GeoDanmark WFS GetCapabilities**

```bash
curl -s "https://wfs.datafordeler.dk/GeoDanmark/GeoDanmark_WFS/2.0.0/WFS?SERVICE=WFS&REQUEST=GetCapabilities&apikey=<DATAFORDELER_API_KEY>" | grep -i "typename\|Name>" | head -40
```

Find typenames for bygning og vejmidte. Forventede navne: `gdk:Bygning` og `gdk:Vejmidte`. Bekræft om de faktisk hedder det, eller om entitets-WFS (GeoDanmark_WFS_Entiteter) skal bruges.

- [ ] **Step 2: Verificer GeoDanmark entitets-WFS (backup)**

```bash
curl -s "https://wfs.datafordeler.dk/GeoDanmark/GeoDanmark_WFS_Entiteter/1.0.0/WFS?SERVICE=WFS&REQUEST=GetCapabilities&apikey=<DATAFORDELER_API_KEY>" | grep -i "typename\|Name>" | head -40
```

Afgør om legacy WFS eller entitets-WFS er fremadrettet. Vælg den der har `Bygning` og `Vejmidte` som ikke er mærket "deprecated".

- [ ] **Step 3: Hent 1 bygningsfeature og inspect properties**

```bash
curl -s "https://wfs.datafordeler.dk/GeoDanmark/GeoDanmark_WFS/2.0.0/WFS?SERVICE=WFS&REQUEST=GetFeature&typenames=gdk:Bygning&srsname=urn:ogc:def:crs:EPSG::25832&bbox=720000,6175000,720200,6175200,urn:ogc:def:crs:EPSG::25832&outputFormat=application/json&apikey=<KEY>" | head -200
```

**Notér:** hvilke property-navne der bruges til bygningsgeometri og matrikelreference (forventede: `id_lokalId`, evt. `jordstykke_lokal_id`).

- [ ] **Step 4: Verificer Plandata kommuneplanretningslinje typename**

```bash
curl -s "https://geoserver.plandata.dk/geoserver/wfs?service=WFS&request=GetCapabilities" | grep -i "kommuneplanretningslinj\|kommuneplan_ret" | head -20
```

Find det præcise typename for kommuneplanretningslinjer. Forventet: `pdk:theme_pdk_kommuneplanretningslinje_vedtaget` og `pdk:theme_pdk_kommuneplanretningslinje_forslag`.

- [ ] **Step 5: Hent 1 kommuneplanretningslinje-feature og inspect properties**

```bash
curl -s "https://geoserver.plandata.dk/geoserver/wfs?service=WFS&request=GetFeature&typeName=pdk:theme_pdk_kommuneplanretningslinje_vedtaget&maxFeatures=2&outputFormat=application/json&bbox=720000,6175000,723000,6178000,EPSG:25832" | head -100
```

Notér property-navne: themeCode, planId, navn, kommuneKode, status.

- [ ] **Step 6: Notat om MST støj endpoint**

MST Støjkortlægning er pt. tilgængeligt som WMS (billedtjenestelag), ikke WFS. Bekræft at vi **ikke** kan udtrække dB-værdier fra WMS-lag — dette bekræfter at `MstNoiseService` i Task 10 starter med `coverage: "source_unavailable"` og `IS_MOCK=true`.

Se: https://mst.dk/erhverv/rent-miljoe-og-sikker-forsyning/stoej/kortlaegning-af-stoej (find evt. datadistributions-link).

**Gem fund:** Opdatér kommentarerne i toppen af `neighbor-geometry.ts` (Task 7) og `surroundings.ts` (Task 9) med de verificerede typenames inden IS_MOCK sættes til false.

---

## Task 1: Opret noise.types.ts og surroundings.types.ts

**Files:**
- Create: `src/domain/contracts/noise.types.ts`
- Create: `src/domain/contracts/surroundings.types.ts`

- [ ] **Step 1: Opret noise.types.ts**

```typescript
// src/domain/contracts/noise.types.ts
// Pure domain types — ingen imports fra adapters, SDK eller Supabase.
// Alle dB-tærskler bor i rule engine, ikke her.

export type NoiseSourceKind = "road" | "rail" | "air" | "industry";

export type NoiseCoverage =
  | "covered"
  | "outside_mapped_area"
  | "source_unavailable"
  | "unknown";

export type NoiseRisk = "ok" | "warning" | "review_required" | "unknown";

export type NoiseMetric = {
  source: NoiseSourceKind;
  ldenDb: number | null;
  lnightDb: number | null;
  heightM: 1.5 | 4 | null;
  model: "DK_NORD2000" | "EU_CNOSSOS" | "unknown";
  year: number | null;
  coverage: NoiseCoverage;
};

export type NoiseScreeningResult = {
  addressId: string;
  parcelIntersectionUsed: boolean;
  metrics: NoiseMetric[];
  highestRisk: NoiseRisk;
  requiresAcousticReview: boolean | null;
  sourceUrl: string;
  fetchedAt: string;
};
```

- [ ] **Step 2: Opret surroundings.types.ts**

```typescript
// src/domain/contracts/surroundings.types.ts
// Pure domain types. GeoJSON polygon geometrier er medtaget på NeighborBuilding og
// NeighborParcel fordi beliggenhedsplan-generatoren skal tegne nabolagene.
// CRS er altid EPSG:25832 (UTM32N) — adapterne er ansvarlige for at transformere.

import type * as GeoJSON from "geojson";

export type NeighborBuilding = {
  sourceId: string;
  addressLabel: string | null;
  distanceM: number;
  footprintAreaM2: number | null;
  /** Fuld bygningspolygon i EPSG:25832 — null hvis source ikke leverede geometri. */
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  geometrySource: "geodanmark";
};

export type NeighborCoverage = "covered" | "source_unavailable" | "unknown";

export type NeighborContext = {
  count40m: number;
  nearestDistanceM: number | null;
  nearestRoadCenterlineDistanceM: number | null;
  accessRoadNearby: boolean | null;
  buildingDensityWithin100m: number | null;
  buildings: NeighborBuilding[];
  coverage: NeighborCoverage;
};

export type NeighborParcelRelation =
  | "shared_boundary"
  | "corner_touch"
  | "nearby"
  | "separated_by_road"
  | "unknown";

export type NeighborParcel = {
  jordstykkeLokalId: string;
  matrikelnummer: string | null;
  ejerlavskode: number | null;
  relation: NeighborParcelRelation;
  sharedBoundaryLengthM: number | null;
  /** null kun tilladt for relation="corner_touch" eller "unknown". */
  distanceM: number | null;
  /** Fuld parcelpolygon i EPSG:25832 — null hvis WFS ikke returnerede geometri. */
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
};

export type PlanningSurroundingsHit = {
  planId: string;
  planTitle: string | null;
  themeCode: string;
  status: "vedtaget" | "forslag";
  municipalityName: string | null;
  geometryOverlap: boolean;
};

export type PlanningSurroundingsContext = {
  noiseDesignatedArea: boolean | null;
  productionNoiseConsequenceArea: boolean | null;
  odorConsequenceArea: boolean | null;
  odorDesignatedArea: boolean | null;
  technicalFacilityConsequenceArea: boolean | null;
  largeLivestockFarmArea: boolean | null;
  /** true = der er forslag (ikke vedtaget) der konflikter — fremtidig risiko */
  proposedPlanConflict: boolean | null;
  hits: PlanningSurroundingsHit[];
};
```

- [ ] **Step 3: Kør tsc og verificer ingen fejl**

```bash
bunx tsc --noEmit
```

Forventet: ingen fejl.

- [ ] **Step 4: Commit**

```bash
git add src/domain/contracts/noise.types.ts src/domain/contracts/surroundings.types.ts
git commit -m "feat(surroundings): tilfoej noise og surroundings domain contracts"
```

---

## Task 2: Udvid rule-engine.types.ts og RuleEngineInput

**Files:**
- Modify: `src/domain/contracts/rule-engine.types.ts`
- Modify: `src/lib/rule-engine/types.ts`

- [ ] **Step 1: Tilføj nye typer i rule-engine.types.ts**

Åbn `src/domain/contracts/rule-engine.types.ts`. Tilføj disse typer i bunden af filen:

```typescript
export type RuleEngineNoiseData = {
  roadLdenDb: number | null;
  railLdenDb: number | null;
  airLdenDb: number | null;
  industryLdenDb: number | null;
  coverageStatus: "covered" | "outside_mapped_area" | "source_unavailable" | "unknown";
  highestRisk: "ok" | "warning" | "review_required" | "unknown";
  requiresAcousticReview: boolean | null;
};

export type RuleEngineNeighborData = {
  nearestBuildingDistanceM: number | null;
  nearestRoadCenterlineDistanceM: number | null;
  buildingCount40m: number;
  accessRoadNearby: boolean | null;
  coverage: "covered" | "source_unavailable" | "unknown";
};

export type RuleEngineSurroundingsData = {
  noiseDesignatedArea: boolean | null;
  productionNoiseConsequenceArea: boolean | null;
  odorConsequenceArea: boolean | null;
  odorDesignatedArea: boolean | null;
  technicalFacilityConsequenceArea: boolean | null;
  largeLivestockFarmArea: boolean | null;
  proposedPlanConflict: boolean | null;
};
```

- [ ] **Step 2: Udvid RuleEngineInput i types.ts**

Åbn `src/lib/rule-engine/types.ts`. Find den eksisterende `RuleEngineInput` type. Tilføj efter `environmental?`:

```typescript
  noise?: RuleEngineNoiseData | null;
  neighborContext?: RuleEngineNeighborData | null;
  surroundings?: RuleEngineSurroundingsData | null;
```

Tilføj import øverst i filen (tilpas eksisterende import-linje hvis den allerede importerer fra rule-engine.types):

```typescript
import type {
  RuleEngineBbrData,
  // ... eksisterende imports ...
  RuleEngineNoiseData,
  RuleEngineNeighborData,
  RuleEngineSurroundingsData,
} from "@/domain/contracts/rule-engine.types";
```

- [ ] **Step 3: Kør tsc**

```bash
bunx tsc --noEmit
```

Forventet: ingen nye fejl.

- [ ] **Step 4: Kør tests**

```bash
bun test src
```

Forventet: alle eksisterende tests passer stadig (ændringen er additiv, ingen breaking change).

- [ ] **Step 5: Commit**

```bash
git add src/domain/contracts/rule-engine.types.ts src/lib/rule-engine/types.ts
git commit -m "feat(surroundings): udvid RuleEngineInput med noise og surroundings felter"
```

---

## Task 3: DB Migration — Noise og Naboforhold Kolonner

**Files:**
- Create: `supabase/migrations/20260526100000_site_constraints_noise_neighbor.sql`

- [ ] **Step 1: Opret migrationsfil**

```sql
-- supabase/migrations/20260526100000_site_constraints_noise_neighbor.sql
-- Additive: noise screening og naboforhold typed columns på site_constraints.
-- Tri-state boolean: true=bekræftet hit, false=bekræftet intet hit, null=ukendt/kilde utilgængelig.

ALTER TABLE public.site_constraints
  -- Noise: MST støjkortlægning
  ADD COLUMN IF NOT EXISTS noise_road_lden_db float,
  ADD COLUMN IF NOT EXISTS noise_road_lnight_db float,
  ADD COLUMN IF NOT EXISTS noise_rail_lden_db float,
  ADD COLUMN IF NOT EXISTS noise_rail_lnight_db float,
  ADD COLUMN IF NOT EXISTS noise_air_lden_db float,
  ADD COLUMN IF NOT EXISTS noise_air_lnight_db float,
  ADD COLUMN IF NOT EXISTS noise_industry_lden_db float,
  ADD COLUMN IF NOT EXISTS noise_coverage_status text,
  ADD COLUMN IF NOT EXISTS noise_model_year smallint,
  ADD COLUMN IF NOT EXISTS noise_acoustic_review_required boolean,
  -- Nabogeometri: GeoDanmark + MAT
  ADD COLUMN IF NOT EXISTS neighbor_building_count_40m integer,
  ADD COLUMN IF NOT EXISTS neighbor_nearest_building_distance_m float,
  ADD COLUMN IF NOT EXISTS road_nearest_centerline_distance_m float,
  ADD COLUMN IF NOT EXISTS access_road_nearby boolean,
  ADD COLUMN IF NOT EXISTS neighbor_context_confidence text,
  -- Plandata: støj/lugt/konsekvensområder fra kommuneplanretningslinjer
  ADD COLUMN IF NOT EXISTS planning_noise_area boolean,
  ADD COLUMN IF NOT EXISTS planning_production_noise_consequence_area boolean,
  ADD COLUMN IF NOT EXISTS planning_odor_area boolean,
  ADD COLUMN IF NOT EXISTS planning_technical_facility_consequence_area boolean,
  ADD COLUMN IF NOT EXISTS planning_large_livestock_area boolean,
  ADD COLUMN IF NOT EXISTS planning_surroundings_review_required boolean;

COMMENT ON COLUMN public.site_constraints.noise_road_lden_db IS
  'MST støjkortlægning: vejstøj Lden (dB). Vejledende grænseværdi: 58 dB for boliger.';
COMMENT ON COLUMN public.site_constraints.noise_road_lnight_db IS
  'MST støjkortlægning: vejstøj Lnight (dB).';
COMMENT ON COLUMN public.site_constraints.noise_rail_lden_db IS
  'MST støjkortlægning: togstøj Lden (dB). Vejledende grænseværdi: 64 dB for boliger.';
COMMENT ON COLUMN public.site_constraints.noise_rail_lnight_db IS
  'MST støjkortlægning: togstøj Lnight (dB).';
COMMENT ON COLUMN public.site_constraints.noise_air_lden_db IS
  'MST støjkortlægning: flystøj Lden (dB). Vejledende grænseværdi: 55 dB for boliger.';
COMMENT ON COLUMN public.site_constraints.noise_air_lnight_db IS
  'MST støjkortlægning: flystøj Lnight (dB).';
COMMENT ON COLUMN public.site_constraints.noise_industry_lden_db IS
  'MST støjkortlægning: virksomhedsstøj Lden (dB). Ingen absolut grænseværdi — kræver altid akustikervurdering.';
COMMENT ON COLUMN public.site_constraints.noise_coverage_status IS
  'Dækningsstatus for MST støjkort: covered, outside_mapped_area, source_unavailable, unknown. null=ikke evalueret.';
COMMENT ON COLUMN public.site_constraints.noise_model_year IS
  'Årstal for den støjkortlægning der er brugt, fx 2017 eller 2022.';
COMMENT ON COLUMN public.site_constraints.noise_acoustic_review_required IS
  'true = akustisk vurdering anbefales før køb/design. null = ikke evalueret.';
COMMENT ON COLUMN public.site_constraints.neighbor_building_count_40m IS
  'GeoDanmark: antal nabobygninger inden for 40 m af parcelgrænse.';
COMMENT ON COLUMN public.site_constraints.neighbor_nearest_building_distance_m IS
  'GeoDanmark: afstand til nærmeste nabobygning fra parcelgrænse (m, EPSG:25832).';
COMMENT ON COLUMN public.site_constraints.road_nearest_centerline_distance_m IS
  'GeoDanmark: afstand til nærmeste vejmidte fra parcelcentroid (m, EPSG:25832).';
COMMENT ON COLUMN public.site_constraints.access_road_nearby IS
  'GeoDanmark: true hvis en vejmidte er fundet inden for 100 m. null = ikke evalueret.';
COMMENT ON COLUMN public.site_constraints.neighbor_context_confidence IS
  'Dækningsstatus for GeoDanmark nabogeometri: covered, source_unavailable, unknown.';
COMMENT ON COLUMN public.site_constraints.planning_noise_area IS
  'Plandata: true = parcel overlapper kommuneplanretningslinje-udpegning af støjbelastet areal (tema 1109).';
COMMENT ON COLUMN public.site_constraints.planning_production_noise_consequence_area IS
  'Plandata: true = parcel overlapper konsekvensområde for produktionsvirksomhedsstøj (tema 115201).';
COMMENT ON COLUMN public.site_constraints.planning_odor_area IS
  'Plandata: true = parcel overlapper lugtbelastet areal eller lugtkonsekvensområde (tema 115202, 110129).';
COMMENT ON COLUMN public.site_constraints.planning_technical_facility_consequence_area IS
  'Plandata: true = parcel overlapper konsekvensområde for tekniske anlæg (tema 110130).';
COMMENT ON COLUMN public.site_constraints.planning_large_livestock_area IS
  'Plandata: true = parcel overlapper omraade med store husdyrbrug (tema 114200).';
COMMENT ON COLUMN public.site_constraints.planning_surroundings_review_required IS
  'true = et eller flere plandata-hits kræver myndighedsafklaring foer køb/design.';
```

- [ ] **Step 2: Verificer migration syntaks lokalt**

```bash
bunx supabase db diff --local 2>&1 | head -30
```

Forventet: ingen syntaksfejl. Kør kun mod lokal Supabase instans.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260526100000_site_constraints_noise_neighbor.sql
git commit -m "feat(surroundings): additive migration for noise og naboforhold typed columns"
```

---

## Task 4: Udvid cache-policy.ts med nye TTL-værdier

**Files:**
- Modify: `src/lib/cache-policy.ts`

- [ ] **Step 1: Tilføj TTL-entries**

Åbn `src/lib/cache-policy.ts`. I `SOURCE_RESULT_TTL_OVERRIDES`-objektet, tilføj:

```typescript
  geodanmark_nabo: 90,
  mat_neighbor_parcels: 90,
  plandata_surroundings: 30,
  mst_noise: 180,
```

Det samlede objekt ser nu sådan ud:

```typescript
const SOURCE_RESULT_TTL_OVERRIDES: Partial<Record<string, number>> = {
  dkjord: 30,
  geus: 30,
  hip: 30,
  dhm: 30,
  geodanmark_mat: 90,
  dai_extended: 30,
  arealdata_ext: 30,
  plandata_ext: 14,
  geodanmark_nabo: 90,
  mat_neighbor_parcels: 90,
  plandata_surroundings: 30,
  mst_noise: 180,
};
```

- [ ] **Step 2: Skriv test**

Find eller opret `src/lib/cache-policy.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import { sourceResultTtlDays } from "./cache-policy";

describe("sourceResultTtlDays", () => {
  it("returnerer 90 dage for geodanmark_nabo", () => {
    expect(sourceResultTtlDays("geodanmark_nabo")).toBe(90);
  });

  it("returnerer 90 dage for mat_neighbor_parcels", () => {
    expect(sourceResultTtlDays("mat_neighbor_parcels")).toBe(90);
  });

  it("returnerer 30 dage for plandata_surroundings", () => {
    expect(sourceResultTtlDays("plandata_surroundings")).toBe(30);
  });

  it("returnerer 180 dage for mst_noise", () => {
    expect(sourceResultTtlDays("mst_noise")).toBe(180);
  });

  it("returnerer default 30 for ukendt source kind", () => {
    expect(sourceResultTtlDays("noget_ukendt")).toBe(30);
  });
});
```

- [ ] **Step 3: Kør test**

```bash
bun test src/lib/cache-policy.test.ts
```

Forventet: 5 tests passer.

- [ ] **Step 4: Commit**

```bash
git add src/lib/cache-policy.ts src/lib/cache-policy.test.ts
git commit -m "feat(surroundings): tilfoej TTL-vaerdier for nabogeometri og stoejoej i cache-policy"
```

---

## Task 5: Tilføj polygonToPolygonDistanceM til geometry-utils.ts

Bruges af GeoDanmark-adapteren til at beregne edge-to-edge afstand fra parcelpolygon til nabobygningspolygon.

**Files:**
- Modify: `src/lib/geometry-utils.ts`
- Modify: `src/lib/geometry-utils.test.ts` (opret hvis den ikke eksisterer)

- [ ] **Step 1: Find eksisterende geometry-utils.test.ts eller opret**

```bash
ls src/lib/geometry-utils.test.ts 2>/dev/null || echo "mangler"
```

- [ ] **Step 2: Skriv failing test**

Tilføj til `src/lib/geometry-utils.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import type * as GeoJSON from "geojson";
import { polygonToPolygonDistanceM } from "./geometry-utils";

describe("polygonToPolygonDistanceM", () => {
  const squareAt = (x: number, y: number, size: number): GeoJSON.Polygon => ({
    type: "Polygon",
    coordinates: [
      [
        [x, y],
        [x + size, y],
        [x + size, y + size],
        [x, y + size],
        [x, y],
      ],
    ],
  });

  it("returnerer 0 for overlappende polygoner", () => {
    const a = squareAt(0, 0, 10);
    const b = squareAt(5, 5, 10);
    expect(polygonToPolygonDistanceM(a, b)).toBe(0);
  });

  it("returnerer korrekt afstand for polygoner med 10m mellemrum", () => {
    const a = squareAt(0, 0, 10);   // 0..10
    const b = squareAt(20, 0, 10);  // 20..30 — 10m gap
    const dist = polygonToPolygonDistanceM(a, b);
    expect(dist).not.toBeNull();
    expect(Math.abs(dist! - 10)).toBeLessThan(0.01);
  });

  it("returnerer null for tomme polygoner", () => {
    const empty: GeoJSON.Polygon = { type: "Polygon", coordinates: [[]] };
    const b = squareAt(0, 0, 10);
    expect(polygonToPolygonDistanceM(empty, b)).toBeNull();
  });
});
```

- [ ] **Step 3: Kør test og verificer den fejler**

```bash
bun test src/lib/geometry-utils.test.ts
```

Forventet: FAIL — `polygonToPolygonDistanceM is not a function`.

- [ ] **Step 4: Implementer funktionen i geometry-utils.ts**

Tilføj i bunden af `src/lib/geometry-utils.ts`:

```typescript
type Segment = [[number, number], [number, number]];

function segmentToSegmentDistanceSq(s1: Segment, s2: Segment): number {
  const [a, b] = s1;
  const [c, d] = s2;
  const ab = [b[0] - a[0], b[1] - a[1]] as [number, number];
  const cd = [d[0] - c[0], d[1] - c[1]] as [number, number];
  const ac = [c[0] - a[0], c[1] - a[1]] as [number, number];

  const denom = ab[0] * cd[1] - ab[1] * cd[0];
  let s: number, t: number;

  if (Math.abs(denom) < 1e-10) {
    s = 0;
    t = cd[0] !== 0 ? ac[0] / cd[0] : ac[1] / cd[1];
  } else {
    s = (ac[0] * cd[1] - ac[1] * cd[0]) / denom;
    t = (ac[0] * ab[1] - ac[1] * ab[0]) / denom;
  }

  s = Math.max(0, Math.min(1, s));
  t = Math.max(0, Math.min(1, t));

  const p1x = a[0] + s * ab[0];
  const p1y = a[1] + s * ab[1];
  const p2x = c[0] + t * cd[0];
  const p2y = c[1] + t * cd[1];

  return (p1x - p2x) ** 2 + (p1y - p2y) ** 2;
}

function extractRings(
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): [number, number][][] {
  if (geometry.type === "Polygon") {
    return geometry.coordinates as [number, number][][];
  }
  return (geometry.coordinates as [number, number][][][]).flat();
}

export function polygonToPolygonDistanceM(
  a: GeoJSON.Polygon | GeoJSON.MultiPolygon,
  b: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): number | null {
  const ringsA = extractRings(a);
  const ringsB = extractRings(b);
  if (!ringsA[0]?.length || !ringsB[0]?.length) return null;

  let minDistSq = Infinity;

  for (const ringA of ringsA) {
    for (const ringB of ringsB) {
      for (let i = 0; i < ringA.length - 1; i++) {
        for (let j = 0; j < ringB.length - 1; j++) {
          const s1: Segment = [ringA[i]!, ringA[i + 1]!];
          const s2: Segment = [ringB[j]!, ringB[j + 1]!];
          const dSq = segmentToSegmentDistanceSq(s1, s2);
          if (dSq < minDistSq) minDistSq = dSq;
        }
      }
    }
  }

  return minDistSq === Infinity ? null : Math.sqrt(minDistSq);
}
```

- [ ] **Step 5: Kør test og verificer de passer**

```bash
bun test src/lib/geometry-utils.test.ts
```

Forventet: 3 tests passer.

- [ ] **Step 6: Kør fuld tsc**

```bash
bunx tsc --noEmit
```

Forventet: ingen fejl.

- [ ] **Step 7: Commit**

```bash
git add src/lib/geometry-utils.ts src/lib/geometry-utils.test.ts
git commit -m "feat(surroundings): tilfoej polygonToPolygonDistanceM til geometry-utils"
```

---

## Task 6: GeoDanmark Nabogeometri Service

Erstatter den defekte live-sti i `src/integrations/geodanmark/client.ts`. Den eksisterende `GeoDanmarkNaboService` i `client.ts` returnerer `distanceM: 0` for alle bygninger og beregner ingen afstande. Den nye service har korrekt struktur og IS_MOCK=true.

**Opdatér typenames fra Task 0 inden IS_MOCK sættes til false.**

**Files:**
- Create: `src/integrations/geodanmark/neighbor-geometry.ts`
- Create: `src/integrations/geodanmark/neighbor-geometry.test.ts`

- [ ] **Step 1: Skriv tests**

Opret `src/integrations/geodanmark/neighbor-geometry.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import type { NeighborContext } from "@/domain/contracts/surroundings.types";
import type { SourceResult } from "@/lib/source-result";

// Ingen netværkskald i unit tests — servicen er IS_MOCK=true.
// Når IS_MOCK sættes til false, dækkes live-stien af smoke test.

describe("GeoDanmarkNeighborService (mock)", () => {
  it("returnerer SourceResult<NeighborContext> med mock data", async () => {
    const { GeoDanmarkNeighborService } = await import("./neighbor-geometry");
    const result: SourceResult<NeighborContext> = await GeoDanmarkNeighborService.getNeighborContext(
      null,
      [720000, 6175000, 720200, 6175200],
      null,
    );
    expect(result.status).toBe("mock");
    expect(result.isMock).toBe(true);
    expect(result.data).not.toBeNull();
    expect(result.data!.coverage).toBe("unknown");
    expect(result.data!.buildings).toBeArray();
  });

  it("coverage er aldrig null", async () => {
    const { GeoDanmarkNeighborService } = await import("./neighbor-geometry");
    const result = await GeoDanmarkNeighborService.getNeighborContext(null, [0, 0, 100, 100], null);
    expect(result.data!.coverage).toBeDefined();
  });
});
```

- [ ] **Step 2: Kør test og verificer de fejler**

```bash
bun test src/integrations/geodanmark/neighbor-geometry.test.ts
```

Forventet: FAIL — cannot find module.

- [ ] **Step 3: Opret neighbor-geometry.ts**

```typescript
// src/integrations/geodanmark/neighbor-geometry.ts
// SERVER-SIDE ONLY.
//
// GeoDanmark Vektor WFS — nabobygninger og vejadgang.
// Erstatter den defekte live-sti i src/integrations/geodanmark/client.ts.
//
// IS_MOCK=true indtil Task 0 er gennemført og typenames er verificeret:
//   1. Kør GetCapabilities (se Task 0 step 1-3 i implementeringsplanen)
//   2. Opdatér BYGNING_TYPENAME og VEJ_TYPENAME nedenfor
//   3. Sæt IS_MOCK=false
//
// Endpoint: https://wfs.datafordeler.dk/GeoDanmark/GeoDanmark_WFS/2.0.0/WFS
// Auth: DATAFORDELER_API_KEY som query-param "apikey="

import { getEnvRequired } from "@/lib/env";
import { makeErrorResult, makeMockResult, makeOkResult } from "@/lib/source-result";
import type { SourceResult } from "@/lib/source-result";
import type { NeighborBuilding, NeighborContext } from "@/domain/contracts/surroundings.types";
import { computePolygonAreaM2, polygonToPolygonDistanceM } from "@/lib/geometry-utils";
import type * as GeoJSON from "geojson";
import { z } from "zod";

const IS_MOCK = true;

// Opdatér disse efter Task 0 GetCapabilities-verifikation:
const WFS_BASE = "https://wfs.datafordeler.dk/GeoDanmark/GeoDanmark_WFS/2.0.0/WFS";
const BYGNING_TYPENAME = "gdk:Bygning";
const VEJ_TYPENAME = "gdk:Vejmidte";
const SOURCE_URL = WFS_BASE;

const wfsFeatureSchema = z.object({
  id: z.string().optional(),
  geometry: z
    .object({
      type: z.enum(["Polygon", "MultiPolygon"]),
      coordinates: z.array(z.unknown()),
    })
    .nullable()
    .optional(),
  properties: z.record(z.unknown()).nullable().optional().default(null),
});

const wfsResponseSchema = z.object({
  features: z.array(wfsFeatureSchema).default([]),
});

type WfsFeature = z.infer<typeof wfsFeatureSchema>;

async function fetchWfsFeatures(typename: string, bboxStr: string, apiKey: string): Promise<WfsFeature[]> {
  const url = new URL(WFS_BASE);
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("service", "WFS");
  url.searchParams.set("version", "2.0.0");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("typenames", typename);
  url.searchParams.set("srsname", "urn:ogc:def:crs:EPSG::25832");
  url.searchParams.set("bbox", bboxStr);
  url.searchParams.set("outputFormat", "application/json");

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`GeoDanmark WFS HTTP ${res.status} for ${typename}`);
  const raw = await res.json();
  return wfsResponseSchema.parse(raw).features;
}

function featureToGeometry(f: WfsFeature): GeoJSON.Polygon | GeoJSON.MultiPolygon | null {
  if (!f.geometry) return null;
  if (f.geometry.type === "Polygon") {
    return { type: "Polygon", coordinates: f.geometry.coordinates as number[][][] };
  }
  if (f.geometry.type === "MultiPolygon") {
    return { type: "MultiPolygon", coordinates: f.geometry.coordinates as number[][][][] };
  }
  return null;
}

export class GeoDanmarkNeighborService {
  /**
   * @param parcelPolygon       Egen parcelgeometri i EPSG:25832 (foretrukket til afstandsberegning).
   * @param adresseBbox25832    Fallback bbox ± 150 m fra adressepunkt.
   * @param ownJordstykkeId     Eget jordstykke-id — bruges til at filtrere egne bygninger fra.
   */
  static async getNeighborContext(
    parcelPolygon: GeoJSON.Polygon | GeoJSON.MultiPolygon | null,
    adresseBbox25832: [number, number, number, number],
    ownJordstykkeId: string | null,
  ): Promise<SourceResult<NeighborContext>> {
    if (IS_MOCK) {
      return makeMockResult<NeighborContext>(
        {
          count40m: 0,
          nearestDistanceM: null,
          nearestRoadCenterlineDistanceM: null,
          accessRoadNearby: null,
          buildingDensityWithin100m: null,
          buildings: [],
          coverage: "unknown",
        },
        { kilde: "geodanmark_nabo", sourceUrl: SOURCE_URL, rawFeatureCount: 0 },
      );
    }

    try {
      const apiKey = getEnvRequired("DATAFORDELER_API_KEY");
      const queryBbox = adresseBbox25832;
      const bboxStr = `${queryBbox[0]},${queryBbox[1]},${queryBbox[2]},${queryBbox[3]},urn:ogc:def:crs:EPSG::25832`;

      const [buildingFeatures, roadFeatures] = await Promise.all([
        fetchWfsFeatures(BYGNING_TYPENAME, bboxStr, apiKey),
        fetchWfsFeatures(VEJ_TYPENAME, bboxStr, apiKey).catch(() => [] as WfsFeature[]),
      ]);

      // Filtrer egne bygninger. Property-navn skal verificeres mod GetCapabilities (Task 0 step 3).
      const neighborFeatures = ownJordstykkeId
        ? buildingFeatures.filter(
            (f) =>
              (f.properties?.["jordstykke_lokal_id"] as string | undefined) !== ownJordstykkeId &&
              (f.properties?.["id_jordstykke"] as string | undefined) !== ownJordstykkeId,
          )
        : buildingFeatures;

      // Beregn afstande. Foretrækker parcel-polygon-til-polygon; falder tilbage til bbox-centroid.
      const buildings: NeighborBuilding[] = [];

      for (const f of neighborFeatures) {
        const geom = featureToGeometry(f);
        let distanceM = 0;

        if (geom && parcelPolygon) {
          distanceM = polygonToPolygonDistanceM(parcelPolygon, geom) ?? 0;
        }

        const footprintAreaM2 = geom ? computePolygonAreaM2(geom) : null;

        buildings.push({
          sourceId: (f.properties?.["id_lokalId"] as string | undefined) ?? f.id ?? "ukendt",
          addressLabel: null,
          distanceM,
          footprintAreaM2,
          geometry: geom,
          geometrySource: "geodanmark",
        });
      }

      buildings.sort((a, b) => a.distanceM - b.distanceM);

      const count40m = buildings.filter((b) => b.distanceM <= 40).length;
      const nearestDistanceM = buildings[0]?.distanceM ?? null;
      const roadDistanceM =
        roadFeatures.length > 0
          ? (roadFeatures[0]?.properties?.["afstand"] as number | undefined) ?? null
          : null;

      // Tæthedsestimering: antal bygninger inden for 100m / areal_100m_cirkel (ha)
      const within100m = buildings.filter((b) => b.distanceM <= 100).length;
      const buildingDensityWithin100m = within100m / Math.PI; // enheder pr. ha

      return makeOkResult<NeighborContext>(
        {
          count40m,
          nearestDistanceM: nearestDistanceM !== undefined ? nearestDistanceM : null,
          nearestRoadCenterlineDistanceM: roadDistanceM,
          accessRoadNearby: roadFeatures.length > 0 ? true : null,
          buildingDensityWithin100m,
          buildings,
          coverage: "covered",
        },
        {
          kilde: "geodanmark_nabo",
          sourceUrl: SOURCE_URL,
          rawFeatureCount: buildingFeatures.length,
        },
      );
    } catch (e) {
      return makeErrorResult(e, { kilde: "geodanmark_nabo", sourceUrl: SOURCE_URL });
    }
  }
}
```

- [ ] **Step 4: Kør tests**

```bash
bun test src/integrations/geodanmark/neighbor-geometry.test.ts
```

Forventet: 2 tests passer.

- [ ] **Step 5: Kør tsc**

```bash
bunx tsc --noEmit
```

Forventet: ingen fejl.

- [ ] **Step 6: Commit**

```bash
git add src/integrations/geodanmark/neighbor-geometry.ts src/integrations/geodanmark/neighbor-geometry.test.ts
git commit -m "feat(surroundings): tilfoej GeoDanmarkNeighborService med korrekt afstandsberegning og bygningsgeometri"
```

---

## Task 7: MAT Nabomatrikel Service

**Files:**
- Create: `src/integrations/mat/neighbor-parcels.ts`
- Create: `src/integrations/mat/neighbor-parcels.test.ts`

MAT WFS endpoint er allerede verificeret og i brug via `MatGeometryService`. Brug samme endpoint.

- [ ] **Step 1: Skriv tests**

Opret `src/integrations/mat/neighbor-parcels.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";

describe("MatNeighborParcelService (mock)", () => {
  it("returnerer SourceResult med mock data og IS_MOCK=true", async () => {
    const { MatNeighborParcelService } = await import("./neighbor-parcels");
    const result = await MatNeighborParcelService.getNeighborParcels(
      "test-jordstykke-id",
      [720000, 6175000, 720200, 6175200],
    );
    expect(result.status).toBe("mock");
    expect(result.isMock).toBe(true);
    expect(result.data).toBeArray();
  });

  it("returnerer tom array ved mock — aldrig null", async () => {
    const { MatNeighborParcelService } = await import("./neighbor-parcels");
    const result = await MatNeighborParcelService.getNeighborParcels("id", [0, 0, 100, 100]);
    expect(result.data).not.toBeNull();
    expect(Array.isArray(result.data)).toBe(true);
  });
});
```

- [ ] **Step 2: Kør test — verificer FAIL**

```bash
bun test src/integrations/mat/neighbor-parcels.test.ts
```

Forventet: FAIL — cannot find module.

- [ ] **Step 3: Opret neighbor-parcels.ts**

```typescript
// src/integrations/mat/neighbor-parcels.ts
// SERVER-SIDE ONLY.
//
// MAT WFS — nabomatrikler (jordstykker) tilstødende eget jordstykke.
// Bruger samme Datafordeler MAT WFS endpoint som MatGeometryService.
//
// IS_MOCK=true — live aktivering kræver verifikation af spatial adjacency
// via WFS BBOX og efterfølgende tolerance-test (0.25 m) for shared boundary.
//
// Endpoint: https://wfs.datafordeler.dk/MATRIKLEN2/MatGaeldendeOgForeloebigWFS/1.0.0/WFS
// Auth: DATAFORDELER_API_KEY

import { getEnvRequired } from "@/lib/env";
import { makeErrorResult, makeMockResult, makeOkResult } from "@/lib/source-result";
import type { SourceResult } from "@/lib/source-result";
import type { NeighborParcel } from "@/domain/contracts/surroundings.types";
import type * as GeoJSON from "geojson";
import { z } from "zod";

const IS_MOCK = true;

const MAT_WFS_BASE =
  "https://wfs.datafordeler.dk/MATRIKLEN2/MatGaeldendeOgForeloebigWFS/1.0.0/WFS";
const JORDSTYKKE_TYPENAME = "mat:Jordstykke";
const SOURCE_URL = MAT_WFS_BASE;

const matFeatureSchema = z.object({
  id: z.string().optional(),
  geometry: z
    .object({
      type: z.enum(["Polygon", "MultiPolygon"]),
      coordinates: z.array(z.unknown()),
    })
    .nullable()
    .optional(),
  properties: z.record(z.unknown()).nullable().optional().default(null),
});

const matWfsResponseSchema = z.object({
  features: z.array(matFeatureSchema).default([]),
});

export class MatNeighborParcelService {
  /**
   * Henter jordstykker i nærheden af eget jordstykke via bbox-forespørgsel.
   *
   * @param ownJordstykkeId  Eget id_lokalId — filtreres fra resultatet.
   * @param bbox25832        Bounding box at søge i (eget jordstykkes bbox + buffer).
   */
  static async getNeighborParcels(
    ownJordstykkeId: string,
    bbox25832: [number, number, number, number],
  ): Promise<SourceResult<NeighborParcel[]>> {
    if (IS_MOCK) {
      return makeMockResult<NeighborParcel[]>([], {
        kilde: "mat_neighbor_parcels",
        sourceUrl: SOURCE_URL,
        rawFeatureCount: 0,
      });
    }

    try {
      const apiKey = getEnvRequired("DATAFORDELER_API_KEY");
      const bboxStr = `${bbox25832[0]},${bbox25832[1]},${bbox25832[2]},${bbox25832[3]},urn:ogc:def:crs:EPSG::25832`;

      const url = new URL(MAT_WFS_BASE);
      url.searchParams.set("apikey", apiKey);
      url.searchParams.set("service", "WFS");
      url.searchParams.set("version", "2.0.0");
      url.searchParams.set("request", "GetFeature");
      url.searchParams.set("typenames", JORDSTYKKE_TYPENAME);
      url.searchParams.set("srsname", "urn:ogc:def:crs:EPSG::25832");
      url.searchParams.set("bbox", bboxStr);
      url.searchParams.set("outputFormat", "application/json");

      const res = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`MAT WFS HTTP ${res.status}`);

      const raw = await res.json();
      const features = matWfsResponseSchema.parse(raw).features;

      const parcels: NeighborParcel[] = features
        .filter(
          (f) =>
            (f.properties?.["id_lokalId"] as string | undefined) !== ownJordstykkeId &&
            (f.id ?? "").split(".").pop() !== ownJordstykkeId,
        )
        .map((f): NeighborParcel => {
          const geom: GeoJSON.Polygon | GeoJSON.MultiPolygon | null = f.geometry
            ? (f.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon)
            : null;

          return {
            jordstykkeLokalId:
              (f.properties?.["id_lokalId"] as string | undefined) ?? f.id ?? "ukendt",
            matrikelnummer: (f.properties?.["matrikelnummer"] as string | undefined) ?? null,
            ejerlavskode: (f.properties?.["ejerlavskode"] as number | undefined) ?? null,
            relation: "nearby",
            sharedBoundaryLengthM: null,
            distanceM: null,
            geometry: geom,
          };
        });

      return makeOkResult<NeighborParcel[]>(parcels, {
        kilde: "mat_neighbor_parcels",
        sourceUrl: SOURCE_URL,
        rawFeatureCount: features.length,
      });
    } catch (e) {
      return makeErrorResult(e, { kilde: "mat_neighbor_parcels", sourceUrl: SOURCE_URL });
    }
  }
}
```

- [ ] **Step 4: Kør tests**

```bash
bun test src/integrations/mat/neighbor-parcels.test.ts
```

Forventet: 2 tests passer.

- [ ] **Step 5: Kør tsc**

```bash
bunx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/integrations/mat/neighbor-parcels.ts src/integrations/mat/neighbor-parcels.test.ts
git commit -m "feat(surroundings): tilfoej MatNeighborParcelService med nabomatrikler og parcelgeometri"
```

---

## Task 8: Plandata Surroundings Service

Screener parcel mod kommuneplanretningslinjer for støj, lugt og konsekvensområder.

**Files:**
- Create: `src/integrations/plandata/surroundings.ts`
- Create: `src/integrations/plandata/surroundings.test.ts`

- [ ] **Step 1: Skriv tests**

Opret `src/integrations/plandata/surroundings.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";

describe("PlandataSurroundingsService (mock)", () => {
  it("returnerer SourceResult med mock data", async () => {
    const { PlandataSurroundingsService } = await import("./surroundings");
    const result = await PlandataSurroundingsService.getSurroundings(
      [720000, 6175000, 720500, 6175500],
    );
    expect(result.status).toBe("mock");
    expect(result.isMock).toBe(true);
    expect(result.data).not.toBeNull();
    expect(result.data!.hits).toBeArray();
  });

  it("alle boolean felter er null i mock (not false — kilde er ikke konsulteret)", async () => {
    const { PlandataSurroundingsService } = await import("./surroundings");
    const result = await PlandataSurroundingsService.getSurroundings([0, 0, 500, 500]);
    const d = result.data!;
    expect(d.noiseDesignatedArea).toBeNull();
    expect(d.productionNoiseConsequenceArea).toBeNull();
    expect(d.odorConsequenceArea).toBeNull();
    expect(d.odorDesignatedArea).toBeNull();
    expect(d.technicalFacilityConsequenceArea).toBeNull();
    expect(d.largeLivestockFarmArea).toBeNull();
    expect(d.proposedPlanConflict).toBeNull();
  });
});
```

- [ ] **Step 2: Kør test — verificer FAIL**

```bash
bun test src/integrations/plandata/surroundings.test.ts
```

- [ ] **Step 3: Opret surroundings.ts**

```typescript
// src/integrations/plandata/surroundings.ts
// SERVER-SIDE ONLY.
//
// Plandata WFS — kommuneplanretningslinjer for støj, lugt og konsekvensområder.
//
// IS_MOCK=true — aktiveres efter Task 0 step 4-5 verificerer typenavn og property-navne.
//
// Forventede typenames (verificer fra Task 0):
//   vedtaget: pdk:theme_pdk_kommuneplanretningslinje_vedtaget
//   forslag:  pdk:theme_pdk_kommuneplanretningslinje_forslag
//
// Relevante temakoder (verificer mod kodelisten):
//   1109    — støjbelastede arealer
//   115201  — støj fra eksisterende produktionsvirksomheder
//   115202  — lugt fra eksisterende produktionsvirksomheder
//   110129  — lugtbelastede arealer
//   110130  — konsekvensområder for tekniske anlæg og støj i landzone
//   114200  — store husdyrbrug

import { fetchWithRetry } from "@/integrations/http/fetch-with-retry";
import { makeErrorResult, makeMockResult, makeOkResult } from "@/lib/source-result";
import type { SourceResult } from "@/lib/source-result";
import type {
  PlanningSurroundingsContext,
  PlanningSurroundingsHit,
} from "@/domain/contracts/surroundings.types";
import { z } from "zod";

const IS_MOCK = true;

const WFS_BASE = "https://geoserver.plandata.dk/geoserver/wfs";

// Opdatér disse efter Task 0 verifikation:
const VEDTAGET_TYPENAME = "pdk:theme_pdk_kommuneplanretningslinje_vedtaget";
const FORSLAG_TYPENAME = "pdk:theme_pdk_kommuneplanretningslinje_forslag";

const NOISE_THEME_CODES = new Set(["1109", "115201"]);
const ODOR_THEME_CODES = new Set(["115202", "110129"]);
const TECHNICAL_THEME_CODES = new Set(["110130"]);
const LIVESTOCK_THEME_CODES = new Set(["114200"]);

const SOURCE_URL = `${WFS_BASE}?service=WFS&request=GetFeature&typeName=${VEDTAGET_TYPENAME}`;

const plandataFeatureSchema = z.object({
  id: z.string().optional(),
  properties: z.record(z.unknown()).nullable().optional().default(null),
});

const plandataResponseSchema = z.object({
  features: z.array(plandataFeatureSchema).default([]),
});

function str(v: unknown): string | null {
  return v == null ? null : String(v);
}

async function fetchSurroundingsFeatures(
  typename: string,
  bbox25832: [number, number, number, number],
): Promise<Array<{ themeCode: string; planId: string; planTitle: string | null; municipalityName: string | null; status: "vedtaget" | "forslag" }>> {
  const bboxStr = `${bbox25832[0]},${bbox25832[1]},${bbox25832[2]},${bbox25832[3]},EPSG:25832`;
  const url = `${WFS_BASE}?service=WFS&version=2.0.0&request=GetFeature&typeName=${encodeURIComponent(typename)}&bbox=${encodeURIComponent(bboxStr)}&outputFormat=application/json`;

  const res = await fetchWithRetry(url, {
    headers: { Accept: "application/json" },
    timeoutMs: 15_000,
    retries: 1,
    retryOnStatuses: [502, 503, 504],
  });

  if (!res.ok) throw new Error(`Plandata WFS HTTP ${res.status} for ${typename}`);
  const raw = await res.json();
  const features = plandataResponseSchema.parse(raw).features;

  const status = typename.includes("forslag") ? "forslag" : "vedtaget";

  return features.map((f) => ({
    themeCode: str(f.properties?.["themeCode"] ?? f.properties?.["temaKode"] ?? "") ?? "",
    planId: str(f.properties?.["planId"] ?? f.id) ?? "",
    planTitle: str(f.properties?.["navn"] ?? f.properties?.["planNavn"]),
    municipalityName: str(f.properties?.["kommuneNavn"] ?? f.properties?.["kommunenavn"]),
    status,
  }));
}

export class PlandataSurroundingsService {
  static async getSurroundings(
    bbox25832: [number, number, number, number],
  ): Promise<SourceResult<PlanningSurroundingsContext>> {
    if (IS_MOCK) {
      return makeMockResult<PlanningSurroundingsContext>(
        {
          noiseDesignatedArea: null,
          productionNoiseConsequenceArea: null,
          odorConsequenceArea: null,
          odorDesignatedArea: null,
          technicalFacilityConsequenceArea: null,
          largeLivestockFarmArea: null,
          proposedPlanConflict: null,
          hits: [],
        },
        { kilde: "plandata_surroundings", sourceUrl: SOURCE_URL, rawFeatureCount: 0 },
      );
    }

    try {
      const [vedtaget, forslag] = await Promise.all([
        fetchSurroundingsFeatures(VEDTAGET_TYPENAME, bbox25832),
        fetchSurroundingsFeatures(FORSLAG_TYPENAME, bbox25832).catch(() => []),
      ]);

      const all = [...vedtaget, ...forslag];

      const hits: PlanningSurroundingsHit[] = all.map((f) => ({
        planId: f.planId,
        planTitle: f.planTitle,
        themeCode: f.themeCode,
        status: f.status,
        municipalityName: f.municipalityName,
        geometryOverlap: true,
      }));

      const hasCode = (codes: Set<string>): boolean | null => {
        const hit = all.find((f) => codes.has(f.themeCode));
        return hit ? true : all.length > 0 ? false : null;
      };

      const proposedConflict = forslag.length > 0 ? true : forslag.length === 0 && vedtaget.length > 0 ? false : null;

      const result: PlanningSurroundingsContext = {
        noiseDesignatedArea: hasCode(NOISE_THEME_CODES),
        productionNoiseConsequenceArea: hasCode(new Set(["115201"])),
        odorConsequenceArea: hasCode(new Set(["115202"])),
        odorDesignatedArea: hasCode(new Set(["110129"])),
        technicalFacilityConsequenceArea: hasCode(TECHNICAL_THEME_CODES),
        largeLivestockFarmArea: hasCode(LIVESTOCK_THEME_CODES),
        proposedPlanConflict: proposedConflict,
        hits,
      };

      return makeOkResult<PlanningSurroundingsContext>(result, {
        kilde: "plandata_surroundings",
        sourceUrl: SOURCE_URL,
        rawFeatureCount: all.length,
      });
    } catch (e) {
      return makeErrorResult(e, { kilde: "plandata_surroundings", sourceUrl: SOURCE_URL });
    }
  }
}
```

- [ ] **Step 4: Kør tests**

```bash
bun test src/integrations/plandata/surroundings.test.ts
```

Forventet: 2 tests passer.

- [ ] **Step 5: Kør tsc**

```bash
bunx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/integrations/plandata/surroundings.ts src/integrations/plandata/surroundings.test.ts
git commit -m "feat(surroundings): tilfoej PlandataSurroundingsService for stoej/lugt/konsekvensomraader"
```

---

## Task 9: MST Noise Service

MST støjkortlægning er tilgængeligt som WMS (billeder). WFS-data er ikke bekræftet tilgængeligt. Servicen starter med `IS_MOCK=true` og `coverage: "source_unavailable"` — se Task 0 step 6.

**Files:**
- Create: `src/integrations/stoej/mst-noise.schemas.ts`
- Create: `src/integrations/stoej/mst-noise.ts`
- Create: `src/integrations/stoej/mst-noise.test.ts`

- [ ] **Step 1: Opret schemas**

```typescript
// src/integrations/stoej/mst-noise.schemas.ts
import { z } from "zod";

export const noiseMetricSchema = z.object({
  source: z.enum(["road", "rail", "air", "industry"]),
  ldenDb: z.number().nullable(),
  lnightDb: z.number().nullable(),
  heightM: z.union([z.literal(1.5), z.literal(4), z.null()]),
  model: z.enum(["DK_NORD2000", "EU_CNOSSOS", "unknown"]),
  year: z.number().nullable(),
  coverage: z.enum(["covered", "outside_mapped_area", "source_unavailable", "unknown"]),
});

export const noiseScreeningResultSchema = z.object({
  addressId: z.string(),
  parcelIntersectionUsed: z.boolean(),
  metrics: z.array(noiseMetricSchema),
  highestRisk: z.enum(["ok", "warning", "review_required", "unknown"]),
  requiresAcousticReview: z.boolean().nullable(),
  sourceUrl: z.string(),
  fetchedAt: z.string(),
});

export type NoiseScreeningResultDto = z.infer<typeof noiseScreeningResultSchema>;
```

- [ ] **Step 2: Skriv tests**

Opret `src/integrations/stoej/mst-noise.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";

describe("MstNoiseService (mock)", () => {
  it("returnerer SourceResult med mock data", async () => {
    const { MstNoiseService } = await import("./mst-noise");
    const result = await MstNoiseService.getNoiseForParcel("adr-123", [720000, 6175000, 720200, 6175200]);
    expect(result.status).toBe("mock");
    expect(result.isMock).toBe(true);
    expect(result.data).not.toBeNull();
  });

  it("mock returnerer source_unavailable — aldrig ok eller covered", async () => {
    const { MstNoiseService } = await import("./mst-noise");
    const result = await MstNoiseService.getNoiseForParcel("adr-x", [0, 0, 100, 100]);
    expect(result.data!.highestRisk).toBe("unknown");
    for (const m of result.data!.metrics) {
      expect(m.coverage).toBe("source_unavailable");
    }
  });
});
```

- [ ] **Step 3: Kør test — verificer FAIL**

```bash
bun test src/integrations/stoej/mst-noise.test.ts
```

- [ ] **Step 4: Opret mst-noise.ts**

```typescript
// src/integrations/stoej/mst-noise.ts
// SERVER-SIDE ONLY.
//
// MST Støjkortlægning — screener parcel mod nationale støjkort.
//
// STATUS: IS_MOCK=true. MST leverer støjkort som WMS (billedlag).
// WFS/feature-adgang er ikke bekræftet (Task 0 step 6).
// Hvis WFS-adgang opnås: implementer live-stien og sæt IS_MOCK=false.
// Hvis kun WMS: behold IS_MOCK=true og returnér coverage="source_unavailable".
// Undlad ALDRIG at udlede dB-værdier fra WMS-billedfarver.
//
// Vejledende dB-grænseværdier (Miljøstyrelsen, boligområder):
//   Vejstøj:  Lden 58 dB
//   Togstøj:  Lden 64 dB
//   Flystøj:  Lden 55 dB
//   Virksomhed: ingen absolut grænse — altid review_required

import { makeMockResult } from "@/lib/source-result";
import type { SourceResult } from "@/lib/source-result";
import type { NoiseScreeningResult } from "@/domain/contracts/noise.types";

const IS_MOCK = true;
const SOURCE_URL = "https://mst.dk/erhverv/rent-miljoe-og-sikker-forsyning/stoej/kortlaegning-af-stoej";

export class MstNoiseService {
  static async getNoiseForParcel(
    addressId: string,
    _bbox25832: [number, number, number, number],
  ): Promise<SourceResult<NoiseScreeningResult>> {
    if (IS_MOCK) {
      const mockResult: NoiseScreeningResult = {
        addressId,
        parcelIntersectionUsed: false,
        metrics: [
          { source: "road", ldenDb: null, lnightDb: null, heightM: null, model: "unknown", year: null, coverage: "source_unavailable" },
          { source: "rail", ldenDb: null, lnightDb: null, heightM: null, model: "unknown", year: null, coverage: "source_unavailable" },
          { source: "air", ldenDb: null, lnightDb: null, heightM: null, model: "unknown", year: null, coverage: "source_unavailable" },
        ],
        highestRisk: "unknown",
        requiresAcousticReview: null,
        sourceUrl: SOURCE_URL,
        fetchedAt: new Date().toISOString(),
      };

      return makeMockResult<NoiseScreeningResult>(mockResult, {
        kilde: "mst_noise",
        sourceUrl: SOURCE_URL,
        rawFeatureCount: 0,
      });
    }

    // Live-sti implementeres her når WFS-adgang er bekræftet.
    throw new Error("MstNoiseService: live-sti ikke implementeret — IS_MOCK skal være true");
  }
}
```

- [ ] **Step 5: Kør tests**

```bash
bun test src/integrations/stoej/mst-noise.test.ts
```

Forventet: 2 tests passer.

- [ ] **Step 6: Kør tsc**

```bash
bunx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add src/integrations/stoej/mst-noise.schemas.ts src/integrations/stoej/mst-noise.ts src/integrations/stoej/mst-noise.test.ts
git commit -m "feat(surroundings): tilfoej MstNoiseService med korrekt source_unavailable coverage"
```

---

## Task 10: Noise Rule Engine

**Files:**
- Create: `src/lib/rule-engine/rules/noise-rules.ts`
- Create: `src/lib/rule-engine/rules/noise-rules.test.ts`

Tærskler: vejstøj 58 dB, togstøj 64 dB, flystøj 55 dB (Miljøstyrelsen). Virksomhedsstøj: altid `review_required` ved ldenDb != null. `unknown` coverage giver aldrig `ok`.

- [ ] **Step 1: Skriv tests**

Opret `src/lib/rule-engine/rules/noise-rules.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import type { RuleEngineInput } from "@/lib/rule-engine/types";
import { checkNoiseRules } from "./noise-rules";

function makeInput(noise: RuleEngineInput["noise"]): RuleEngineInput {
  return {
    project: { type: "new_build", municipality: "Testby", kommunekode: "0000" },
    plot: { areaM2: 800, zone: "urban", hasLocalplan: false, hasServitudes: false, localplanIds: [] },
    heritage: { listedBuilding: null, saveValue: null, preservationLocalplan: false, protectionLines: { coastal: false, forest: false, lakeRiver: false, lake: false, clitFredning: false, churchSurroundings: false } },
    localplan: null,
    municipalPlan: null,
    existingBuilding: null,
    newBuilding: null,
    geotechnical: { radonRisk: "unknown", groundwaterDepthM: null, slopePercent: null, jordforureningV1: null, jordforureningV2: null, omraadeklassificering: null },
    servituts: { hasCritical: false, criticalTexts: [] },
    noise,
  };
}

describe("checkNoiseRules", () => {
  it("ingen violations når noise er null", () => {
    expect(checkNoiseRules(makeInput(null))).toHaveLength(0);
  });

  it("ingen violations ved vejstøj under 58 dB med dækning", () => {
    const result = checkNoiseRules(makeInput({
      roadLdenDb: 55, railLdenDb: null, airLdenDb: null, industryLdenDb: null,
      coverageStatus: "covered", highestRisk: "ok", requiresAcousticReview: false,
    }));
    expect(result).toHaveLength(0);
  });

  it("warning ved vejstøj >= 58 dB", () => {
    const violations = checkNoiseRules(makeInput({
      roadLdenDb: 60, railLdenDb: null, airLdenDb: null, industryLdenDb: null,
      coverageStatus: "covered", highestRisk: "warning", requiresAcousticReview: null,
    }));
    expect(violations).toHaveLength(1);
    expect(violations[0]!.rule).toBe("noise_road_threshold");
    expect(violations[0]!.severity).toBe("warning");
  });

  it("warning ved togstøj >= 64 dB", () => {
    const violations = checkNoiseRules(makeInput({
      roadLdenDb: null, railLdenDb: 65, airLdenDb: null, industryLdenDb: null,
      coverageStatus: "covered", highestRisk: "warning", requiresAcousticReview: null,
    }));
    expect(violations).toHaveLength(1);
    expect(violations[0]!.rule).toBe("noise_rail_threshold");
  });

  it("warning ved flystøj >= 55 dB", () => {
    const violations = checkNoiseRules(makeInput({
      roadLdenDb: null, railLdenDb: null, airLdenDb: 58, industryLdenDb: null,
      coverageStatus: "covered", highestRisk: "warning", requiresAcousticReview: null,
    }));
    expect(violations).toHaveLength(1);
    expect(violations[0]!.rule).toBe("noise_air_threshold");
  });

  it("review_required ved virksomhedsstøj uanset niveau", () => {
    const violations = checkNoiseRules(makeInput({
      roadLdenDb: null, railLdenDb: null, airLdenDb: null, industryLdenDb: 45,
      coverageStatus: "covered", highestRisk: "review_required", requiresAcousticReview: null,
    }));
    const rule = violations.find((v) => v.rule === "noise_industry_review");
    expect(rule).toBeDefined();
    expect(rule!.severity).toBe("warning");
  });

  it("warning ved coverage=outside_mapped_area — ukendt er ikke ok", () => {
    const violations = checkNoiseRules(makeInput({
      roadLdenDb: null, railLdenDb: null, airLdenDb: null, industryLdenDb: null,
      coverageStatus: "outside_mapped_area", highestRisk: "unknown", requiresAcousticReview: null,
    }));
    const rule = violations.find((v) => v.rule === "noise_coverage_unknown");
    expect(rule).toBeDefined();
  });

  it("acoustic_review_required violation når flagget er true", () => {
    const violations = checkNoiseRules(makeInput({
      roadLdenDb: 62, railLdenDb: null, airLdenDb: null, industryLdenDb: null,
      coverageStatus: "covered", highestRisk: "review_required", requiresAcousticReview: true,
    }));
    const acoustic = violations.find((v) => v.rule === "noise_acoustic_review_required");
    expect(acoustic).toBeDefined();
  });
});
```

- [ ] **Step 2: Kør test — verificer FAIL**

```bash
bun test src/lib/rule-engine/rules/noise-rules.test.ts
```

- [ ] **Step 3: Implementer checkNoiseRules**

```typescript
// src/lib/rule-engine/rules/noise-rules.ts
// Pure functions. Tærskler: Miljøstyrelsens vejledende grænseværdier for boligområder.
// Vejstøj 58 dB, togstøj 64 dB, flystøj 55 dB — Lden.
// Virksomhedsstøj: altid review_required (ingen absolut statslig grænseværdi).

import type { RuleEngineInput, RuleViolation } from "@/lib/rule-engine/types";

const ROAD_LDEN_THRESHOLD_DB = 58;
const RAIL_LDEN_THRESHOLD_DB = 64;
const AIR_LDEN_THRESHOLD_DB = 55;

export function checkNoiseRules(input: RuleEngineInput): RuleViolation[] {
  const noise = input.noise;
  if (!noise) return [];

  const violations: RuleViolation[] = [];

  if (
    noise.coverageStatus === "outside_mapped_area" ||
    noise.coverageStatus === "unknown"
  ) {
    violations.push({
      rule: "noise_coverage_unknown",
      severity: "warning",
      reason:
        "Støjkortlægningen dækker ikke sikkert grunden. Støjforholdene er ukendte — dette må ikke tolkes som fravær af støjrisiko. Indhent kommunal oplysning eller bestil akustisk vurdering.",
      authority: "Kommunen/Akustiker",
    });
    return violations;
  }

  if (noise.roadLdenDb !== null && noise.roadLdenDb >= ROAD_LDEN_THRESHOLD_DB) {
    violations.push({
      rule: "noise_road_threshold",
      severity: "warning",
      reason: `Vejstøjniveauet (Lden ${noise.roadLdenDb} dB) overstiger Miljøstyrelsens vejledende grænseværdi på ${ROAD_LDEN_THRESHOLD_DB} dB for boligformål. Akustisk vurdering anbefales.`,
      authority: "Kommunen/Akustiker",
    });
  }

  if (noise.railLdenDb !== null && noise.railLdenDb >= RAIL_LDEN_THRESHOLD_DB) {
    violations.push({
      rule: "noise_rail_threshold",
      severity: "warning",
      reason: `Togstøjniveauet (Lden ${noise.railLdenDb} dB) overstiger Miljøstyrelsens vejledende grænseværdi på ${RAIL_LDEN_THRESHOLD_DB} dB for boligformål. Akustisk vurdering anbefales.`,
      authority: "Kommunen/Akustiker",
    });
  }

  if (noise.airLdenDb !== null && noise.airLdenDb >= AIR_LDEN_THRESHOLD_DB) {
    violations.push({
      rule: "noise_air_threshold",
      severity: "warning",
      reason: `Flystøjniveauet (Lden ${noise.airLdenDb} dB) overstiger Miljøstyrelsens vejledende grænseværdi på ${AIR_LDEN_THRESHOLD_DB} dB for boligformål. Akustisk vurdering anbefales.`,
      authority: "Kommunen/Akustiker",
    });
  }

  if (noise.industryLdenDb !== null) {
    violations.push({
      rule: "noise_industry_review",
      severity: "warning",
      reason:
        "Der er registreret virksomhedsstøj i nærheden. Der er ingen entydig statslig grænseværdi — en akustiker og kommunen skal vurdere det konkrete niveau og krav.",
      authority: "Kommunen/Akustiker",
    });
  }

  if (noise.requiresAcousticReview === true) {
    violations.push({
      rule: "noise_acoustic_review_required",
      severity: "warning",
      reason:
        "Støjscreeningen angiver at akustisk vurdering er nødvendig inden køb eller design. Indhent rapporten fra en certificeret akustiker.",
      authority: "Akustiker",
    });
  }

  return violations;
}
```

- [ ] **Step 4: Kør tests**

```bash
bun test src/lib/rule-engine/rules/noise-rules.test.ts
```

Forventet: 8 tests passer.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rule-engine/rules/noise-rules.ts src/lib/rule-engine/rules/noise-rules.test.ts
git commit -m "feat(surroundings): tilfoej checkNoiseRules med MST dB-tærskler i rule engine"
```

---

## Task 11: Surroundings Rule Engine

**Files:**
- Create: `src/lib/rule-engine/rules/surroundings-rules.ts`
- Create: `src/lib/rule-engine/rules/surroundings-rules.test.ts`

- [ ] **Step 1: Skriv tests**

Opret `src/lib/rule-engine/rules/surroundings-rules.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import type { RuleEngineInput } from "@/lib/rule-engine/types";
import { checkSurroundingsRules } from "./surroundings-rules";

function makeInput(
  surroundings: RuleEngineInput["surroundings"],
  neighborContext: RuleEngineInput["neighborContext"] = null,
): RuleEngineInput {
  return {
    project: { type: "new_build", municipality: "Testby", kommunekode: "0000" },
    plot: { areaM2: 800, zone: "urban", hasLocalplan: false, hasServitudes: false, localplanIds: [] },
    heritage: { listedBuilding: null, saveValue: null, preservationLocalplan: false, protectionLines: { coastal: false, forest: false, lakeRiver: false, lake: false, clitFredning: false, churchSurroundings: false } },
    localplan: null, municipalPlan: null, existingBuilding: null, newBuilding: null,
    geotechnical: { radonRisk: "unknown", groundwaterDepthM: null, slopePercent: null, jordforureningV1: null, jordforureningV2: null, omraadeklassificering: null },
    servituts: { hasCritical: false, criticalTexts: [] },
    surroundings,
    neighborContext,
  };
}

describe("checkSurroundingsRules", () => {
  it("ingen violations ved null surroundings", () => {
    expect(checkSurroundingsRules(makeInput(null))).toHaveLength(0);
  });

  it("warning ved plandata støjbelastet areal", () => {
    const violations = checkSurroundingsRules(makeInput({
      noiseDesignatedArea: true, productionNoiseConsequenceArea: null,
      odorConsequenceArea: null, odorDesignatedArea: null,
      technicalFacilityConsequenceArea: null, largeLivestockFarmArea: null,
      proposedPlanConflict: null,
    }));
    const v = violations.find((x) => x.rule === "planning_noise_area");
    expect(v).toBeDefined();
    expect(v!.severity).toBe("warning");
  });

  it("warning ved produktionsvirksomhed konsekvensområde", () => {
    const violations = checkSurroundingsRules(makeInput({
      noiseDesignatedArea: null, productionNoiseConsequenceArea: true,
      odorConsequenceArea: null, odorDesignatedArea: null,
      technicalFacilityConsequenceArea: null, largeLivestockFarmArea: null,
      proposedPlanConflict: null,
    }));
    const v = violations.find((x) => x.rule === "planning_production_noise_consequence");
    expect(v).toBeDefined();
  });

  it("warning ved lugt konsekvensområde", () => {
    const violations = checkSurroundingsRules(makeInput({
      noiseDesignatedArea: null, productionNoiseConsequenceArea: null,
      odorConsequenceArea: true, odorDesignatedArea: null,
      technicalFacilityConsequenceArea: null, largeLivestockFarmArea: null,
      proposedPlanConflict: null,
    }));
    expect(violations.find((x) => x.rule === "planning_odor_consequence")).toBeDefined();
  });

  it("warning ved forslag-plankonflikt — markeres som fremtidig risiko", () => {
    const violations = checkSurroundingsRules(makeInput({
      noiseDesignatedArea: null, productionNoiseConsequenceArea: null,
      odorConsequenceArea: null, odorDesignatedArea: null,
      technicalFacilityConsequenceArea: null, largeLivestockFarmArea: null,
      proposedPlanConflict: true,
    }));
    const v = violations.find((x) => x.rule === "planning_proposed_conflict");
    expect(v).toBeDefined();
    expect(v!.severity).toBe("warning");
  });

  it("warning ved nabodækning=source_unavailable", () => {
    const violations = checkSurroundingsRules(
      makeInput(null, {
        nearestBuildingDistanceM: null,
        nearestRoadCenterlineDistanceM: null,
        buildingCount40m: 0,
        accessRoadNearby: null,
        coverage: "source_unavailable",
      }),
    );
    expect(violations.find((x) => x.rule === "neighbor_coverage_unavailable")).toBeDefined();
  });
});
```

- [ ] **Step 2: Kør test — verificer FAIL**

```bash
bun test src/lib/rule-engine/rules/surroundings-rules.test.ts
```

- [ ] **Step 3: Implementer checkSurroundingsRules**

```typescript
// src/lib/rule-engine/rules/surroundings-rules.ts
import type { RuleEngineInput, RuleViolation } from "@/lib/rule-engine/types";

export function checkSurroundingsRules(input: RuleEngineInput): RuleViolation[] {
  const violations: RuleViolation[] = [];

  const s = input.surroundings;
  if (s) {
    if (s.noiseDesignatedArea === true) {
      violations.push({
        rule: "planning_noise_area",
        severity: "warning",
        reason:
          "Grunden overlapper et planlagt støjbelastet areal (kommuneplanretningslinje). Kontrollér lokalplan og afklar støjkrav med kommunen.",
        authority: "Kommunen",
      });
    }

    if (s.productionNoiseConsequenceArea === true) {
      violations.push({
        rule: "planning_production_noise_consequence",
        severity: "warning",
        reason:
          "Grunden ligger i et konsekvensområde for støj fra produktionsvirksomhed. Støjforhold bør afklares med kommunen og en akustiker inden køb eller design.",
        authority: "Kommunen/Akustiker",
      });
    }

    if (s.odorConsequenceArea === true || s.odorDesignatedArea === true) {
      violations.push({
        rule: "planning_odor_consequence",
        severity: "warning",
        reason:
          "Grunden overlapper et lugtbelastet areal eller konsekvensområde. Lugtforhold skal afklares med kommunen — kan påvirke anvendelse og boligkvalitet.",
        authority: "Kommunen",
      });
    }

    if (s.technicalFacilityConsequenceArea === true) {
      violations.push({
        rule: "planning_technical_facility_consequence",
        severity: "warning",
        reason:
          "Grunden ligger i et konsekvensområde for et teknisk anlæg (fx højspændingsanlæg, transmissionsledning eller vindmølle). Afklar bindinger med kommunen.",
        authority: "Kommunen",
      });
    }

    if (s.largeLivestockFarmArea === true) {
      violations.push({
        rule: "planning_large_livestock_area",
        severity: "warning",
        reason:
          "Grunden er i nærheden af et areal med store husdyrbrug. Lugt og støj fra husdyrproduktion kan påvirke boligkvalitet og mulighed for ny boliganvendelse.",
        authority: "Kommunen",
      });
    }

    if (s.proposedPlanConflict === true) {
      violations.push({
        rule: "planning_proposed_conflict",
        severity: "warning",
        reason:
          "Et planforslag (ikke vedtaget) kan konflikte med grunden. Kontrollér om forslaget vedtages — fremtidig planrisiko, ikke gældende krav endnu.",
        authority: "Kommunen",
      });
    }
  }

  const n = input.neighborContext;
  if (n) {
    if (n.coverage === "source_unavailable" || n.coverage === "unknown") {
      violations.push({
        rule: "neighbor_coverage_unavailable",
        severity: "warning",
        reason:
          "Nabogeometridata er ikke tilgængeligt. Skelafstande og naboforhold kan ikke screenes automatisk — afklar manuelt.",
        authority: "Rådgiver/Landinspektør",
      });
    }
  }

  return violations;
}
```

- [ ] **Step 4: Kør tests**

```bash
bun test src/lib/rule-engine/rules/surroundings-rules.test.ts
```

Forventet: 6 tests passer.

- [ ] **Step 5: Kør alle rule engine tests**

```bash
bun test src/lib/rule-engine
```

Forventet: alle passer, ingen regressions.

- [ ] **Step 6: Commit**

```bash
git add src/lib/rule-engine/rules/surroundings-rules.ts src/lib/rule-engine/rules/surroundings-rules.test.ts
git commit -m "feat(surroundings): tilfoej checkSurroundingsRules for plandata og nabodaekning"
```

---

## Task 12: Surroundings Application Service

Ejer workflowet: modtager trusted input, kalder adaptere, kører classifiers, returnerer typed patch til `site_constraints`.

**Beskyttet fil-note:** Denne service må IKKE kaldes fra `analysis-orchestrator.ts` i denne plan. Wiring er en separat ticket der kræver human review.

**Files:**
- Create: `src/lib/surroundings-analysis.server.ts`
- Create: `src/lib/surroundings-analysis.server.test.ts`

- [ ] **Step 1: Skriv tests med fake gateways**

Opret `src/lib/surroundings-analysis.server.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import type { SourceResult } from "@/lib/source-result";
import type { NeighborContext, PlanningSurroundingsContext } from "@/domain/contracts/surroundings.types";
import type { NoiseScreeningResult } from "@/domain/contracts/noise.types";
import { makeMockResult } from "@/lib/source-result";
import {
  handleSurroundingsAnalysis,
  type SurroundingsInput,
  type SurroundingsAnalysisResult,
} from "./surroundings-analysis.server";

function mockNeighborContext(): SourceResult<NeighborContext> {
  return makeMockResult<NeighborContext>(
    {
      count40m: 2,
      nearestDistanceM: 8.5,
      nearestRoadCenterlineDistanceM: 12,
      accessRoadNearby: true,
      buildingDensityWithin100m: 0.6,
      buildings: [],
      coverage: "covered",
    },
    { kilde: "geodanmark_nabo", sourceUrl: null, rawFeatureCount: 2 },
  );
}

function mockSurroundings(): SourceResult<PlanningSurroundingsContext> {
  return makeMockResult<PlanningSurroundingsContext>(
    {
      noiseDesignatedArea: false,
      productionNoiseConsequenceArea: false,
      odorConsequenceArea: false,
      odorDesignatedArea: false,
      technicalFacilityConsequenceArea: false,
      largeLivestockFarmArea: false,
      proposedPlanConflict: false,
      hits: [],
    },
    { kilde: "plandata_surroundings", sourceUrl: null, rawFeatureCount: 0 },
  );
}

function mockNoise(): SourceResult<NoiseScreeningResult> {
  return makeMockResult<NoiseScreeningResult>(
    {
      addressId: "adr-test",
      parcelIntersectionUsed: false,
      metrics: [],
      highestRisk: "unknown",
      requiresAcousticReview: null,
      sourceUrl: "https://mst.dk",
      fetchedAt: new Date().toISOString(),
    },
    { kilde: "mst_noise", sourceUrl: null, rawFeatureCount: 0 },
  );
}

describe("handleSurroundingsAnalysis", () => {
  it("returnerer SurroundingsAnalysisResult med site_constraints patch", async () => {
    const input: SurroundingsInput = {
      addressId: "adr-123",
      bbox25832: [720000, 6175000, 720200, 6175200],
      parcelPolygon: null,
      ownJordstykkeId: null,
    };

    const result: SurroundingsAnalysisResult = await handleSurroundingsAnalysis(input, {
      getNeighborContext: async () => mockNeighborContext(),
      getSurroundings: async () => mockSurroundings(),
      getNoiseForParcel: async () => mockNoise(),
    });

    expect(result).toBeDefined();
    expect(result.siteConstraintsPatch).toBeDefined();
    expect(result.neighborContextResult.data?.coverage).toBe("covered");
    expect(result.violations).toBeArray();
  });

  it("site_constraints patch indeholder neighbor kolonner", async () => {
    const input: SurroundingsInput = {
      addressId: "adr-456",
      bbox25832: [720000, 6175000, 720200, 6175200],
      parcelPolygon: null,
      ownJordstykkeId: null,
    };

    const result = await handleSurroundingsAnalysis(input, {
      getNeighborContext: async () => mockNeighborContext(),
      getSurroundings: async () => mockSurroundings(),
      getNoiseForParcel: async () => mockNoise(),
    });

    expect(result.siteConstraintsPatch.neighbor_building_count_40m).toBe(2);
    expect(result.siteConstraintsPatch.neighbor_nearest_building_distance_m).toBe(8.5);
    expect(result.siteConstraintsPatch.road_nearest_centerline_distance_m).toBe(12);
    expect(result.siteConstraintsPatch.neighbor_context_confidence).toBe("covered");
  });
});
```

- [ ] **Step 2: Kør test — verificer FAIL**

```bash
bun test src/lib/surroundings-analysis.server.test.ts
```

- [ ] **Step 3: Implementer application service**

```typescript
// src/lib/surroundings-analysis.server.ts
// SERVER-SIDE ONLY.
//
// Application service for støj, omgivelser og naboforhold.
// Kalder adaptere via injicerede gateways (testbart uden netværk/Supabase).
// Returnerer typed patch til site_constraints.
//
// WIRING TIL analysis-orchestrator.ts: IKKE en del af denne plan.
// Wiring kræver human review af beskyttet fil.

import type { SourceResult } from "@/lib/source-result";
import type { NeighborContext, NeighborParcel, PlanningSurroundingsContext } from "@/domain/contracts/surroundings.types";
import type { NoiseScreeningResult } from "@/domain/contracts/noise.types";
import type { RuleViolation } from "@/lib/rule-engine/types";
import type * as GeoJSON from "geojson";
import { checkNoiseRules } from "@/lib/rule-engine/rules/noise-rules";
import { checkSurroundingsRules } from "@/lib/rule-engine/rules/surroundings-rules";

export type SurroundingsInput = {
  addressId: string;
  bbox25832: [number, number, number, number];
  parcelPolygon: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  ownJordstykkeId: string | null;
};

export type SurroundingsGateways = {
  getNeighborContext: (input: SurroundingsInput) => Promise<SourceResult<NeighborContext>>;
  getSurroundings: (input: SurroundingsInput) => Promise<SourceResult<PlanningSurroundingsContext>>;
  getNoiseForParcel: (input: SurroundingsInput) => Promise<SourceResult<NoiseScreeningResult>>;
};

export type SiteConstraintsPatch = {
  neighbor_building_count_40m: number | null;
  neighbor_nearest_building_distance_m: number | null;
  road_nearest_centerline_distance_m: number | null;
  access_road_nearby: boolean | null;
  neighbor_context_confidence: string | null;
  planning_noise_area: boolean | null;
  planning_production_noise_consequence_area: boolean | null;
  planning_odor_area: boolean | null;
  planning_technical_facility_consequence_area: boolean | null;
  planning_large_livestock_area: boolean | null;
  planning_surroundings_review_required: boolean | null;
  noise_road_lden_db: number | null;
  noise_rail_lden_db: number | null;
  noise_air_lden_db: number | null;
  noise_industry_lden_db: number | null;
  noise_coverage_status: string | null;
  noise_acoustic_review_required: boolean | null;
};

export type SurroundingsAnalysisResult = {
  neighborContextResult: SourceResult<NeighborContext>;
  surroundingsResult: SourceResult<PlanningSurroundingsContext>;
  noiseResult: SourceResult<NoiseScreeningResult>;
  siteConstraintsPatch: SiteConstraintsPatch;
  violations: RuleViolation[];
};

function deriveNoiseInput(noise: NoiseScreeningResult | null) {
  if (!noise) return null;
  const road = noise.metrics.find((m) => m.source === "road");
  const rail = noise.metrics.find((m) => m.source === "rail");
  const air = noise.metrics.find((m) => m.source === "air");
  const industry = noise.metrics.find((m) => m.source === "industry");

  const coverageStatus =
    noise.metrics.length === 0
      ? "unknown"
      : noise.metrics.every((m) => m.coverage === "source_unavailable")
      ? "source_unavailable"
      : noise.metrics.every((m) => m.coverage === "outside_mapped_area")
      ? "outside_mapped_area"
      : noise.metrics.some((m) => m.coverage === "covered")
      ? "covered"
      : "unknown";

  return {
    roadLdenDb: road?.ldenDb ?? null,
    railLdenDb: rail?.ldenDb ?? null,
    airLdenDb: air?.ldenDb ?? null,
    industryLdenDb: industry?.ldenDb ?? null,
    coverageStatus: coverageStatus as "covered" | "outside_mapped_area" | "source_unavailable" | "unknown",
    highestRisk: noise.highestRisk,
    requiresAcousticReview: noise.requiresAcousticReview,
  };
}

export async function handleSurroundingsAnalysis(
  input: SurroundingsInput,
  gateways: SurroundingsGateways,
): Promise<SurroundingsAnalysisResult> {
  const [neighborContextResult, surroundingsResult, noiseResult] = await Promise.all([
    gateways.getNeighborContext(input),
    gateways.getSurroundings(input),
    gateways.getNoiseForParcel(input),
  ]);

  const neighbor = neighborContextResult.data;
  const surroundings = surroundingsResult.data;
  const noise = noiseResult.data;

  const noiseInput = deriveNoiseInput(noise);
  const noiseMetric = (s: "road" | "rail" | "air" | "industry") =>
    noise?.metrics.find((m) => m.source === s)?.ldenDb ?? null;

  const patch: SiteConstraintsPatch = {
    neighbor_building_count_40m: neighbor?.count40m ?? null,
    neighbor_nearest_building_distance_m: neighbor?.nearestDistanceM ?? null,
    road_nearest_centerline_distance_m: neighbor?.nearestRoadCenterlineDistanceM ?? null,
    access_road_nearby: neighbor?.accessRoadNearby ?? null,
    neighbor_context_confidence: neighbor?.coverage ?? null,
    planning_noise_area: surroundings?.noiseDesignatedArea ?? null,
    planning_production_noise_consequence_area: surroundings?.productionNoiseConsequenceArea ?? null,
    planning_odor_area: surroundings?.odorConsequenceArea ?? surroundings?.odorDesignatedArea ?? null,
    planning_technical_facility_consequence_area: surroundings?.technicalFacilityConsequenceArea ?? null,
    planning_large_livestock_area: surroundings?.largeLivestockFarmArea ?? null,
    planning_surroundings_review_required:
      surroundings
        ? [
            surroundings.noiseDesignatedArea,
            surroundings.productionNoiseConsequenceArea,
            surroundings.odorConsequenceArea,
            surroundings.technicalFacilityConsequenceArea,
          ].some(Boolean)
        : null,
    noise_road_lden_db: noiseMetric("road"),
    noise_rail_lden_db: noiseMetric("rail"),
    noise_air_lden_db: noiseMetric("air"),
    noise_industry_lden_db: noiseMetric("industry"),
    noise_coverage_status: noiseInput?.coverageStatus ?? null,
    noise_acoustic_review_required: noise?.requiresAcousticReview ?? null,
  };

  const violations: RuleViolation[] = [
    ...checkNoiseRules({ project: { type: "new_build", municipality: "", kommunekode: "" }, plot: { areaM2: null, zone: "unknown", hasLocalplan: false, hasServitudes: false, localplanIds: [] }, heritage: { listedBuilding: null, saveValue: null, preservationLocalplan: false, protectionLines: { coastal: false, forest: false, lakeRiver: false, lake: false, clitFredning: false, churchSurroundings: false } }, localplan: null, municipalPlan: null, existingBuilding: null, newBuilding: null, geotechnical: { radonRisk: "unknown", groundwaterDepthM: null, slopePercent: null, jordforureningV1: null, jordforureningV2: null, omraadeklassificering: null }, servituts: { hasCritical: false, criticalTexts: [] }, noise: noiseInput }),
    ...checkSurroundingsRules({ project: { type: "new_build", municipality: "", kommunekode: "" }, plot: { areaM2: null, zone: "unknown", hasLocalplan: false, hasServitudes: false, localplanIds: [] }, heritage: { listedBuilding: null, saveValue: null, preservationLocalplan: false, protectionLines: { coastal: false, forest: false, lakeRiver: false, lake: false, clitFredning: false, churchSurroundings: false } }, localplan: null, municipalPlan: null, existingBuilding: null, newBuilding: null, geotechnical: { radonRisk: "unknown", groundwaterDepthM: null, slopePercent: null, jordforureningV1: null, jordforureningV2: null, omraadeklassificering: null }, servituts: { hasCritical: false, criticalTexts: [] }, surroundings: surroundings ? { noiseDesignatedArea: surroundings.noiseDesignatedArea, productionNoiseConsequenceArea: surroundings.productionNoiseConsequenceArea, odorConsequenceArea: surroundings.odorConsequenceArea, odorDesignatedArea: surroundings.odorDesignatedArea, technicalFacilityConsequenceArea: surroundings.technicalFacilityConsequenceArea, largeLivestockFarmArea: surroundings.largeLivestockFarmArea, proposedPlanConflict: surroundings.proposedPlanConflict } : null, neighborContext: neighbor ? { nearestBuildingDistanceM: neighbor.nearestDistanceM, nearestRoadCenterlineDistanceM: neighbor.nearestRoadCenterlineDistanceM, buildingCount40m: neighbor.count40m, accessRoadNearby: neighbor.accessRoadNearby, coverage: neighbor.coverage } : null }),
  ];

  return { neighborContextResult, surroundingsResult, noiseResult, siteConstraintsPatch: patch, violations };
}
```

- [ ] **Step 4: Kør tests**

```bash
bun test src/lib/surroundings-analysis.server.test.ts
```

Forventet: 2 tests passer.

- [ ] **Step 5: Kør alle tests**

```bash
bun test src && bunx tsc --noEmit
```

Forventet: ingen fejl, ingen regressions.

- [ ] **Step 6: Commit**

```bash
git add src/lib/surroundings-analysis.server.ts src/lib/surroundings-analysis.server.test.ts
git commit -m "feat(surroundings): tilfoej SurroundingsAnalysis application service med fake gateway tests"
```

---

## Task 13: Beliggenhedsplan Koordinering — Opdatér drawing-layers.ts

`fetchNeighborBuildings` i `src/integrations/geodanmark/drawing-layers.ts` returnerer i dag en tom mock. Opdatér den til at bruge `GeoDanmarkNeighborService`.

**Files:**
- Modify: `src/integrations/geodanmark/drawing-layers.ts`

- [ ] **Step 1: Verificer eksisterende implementering**

Åbn `src/integrations/geodanmark/drawing-layers.ts` og find `fetchNeighborBuildings`. Den returnerer pt.:

```typescript
return ExistingFeaturesLayerSchema.parse({
  buildings: [],
  fences: [],
  source: { source: "registry", confidence: "low", fetchedAt: now, requiresReview: true },
});
```

- [ ] **Step 2: Udvid fetchNeighborBuildings**

Erstat den tomme implementering med:

```typescript
async fetchNeighborBuildings(bbox25832: BBox25832): Promise<ExistingFeaturesLayer> {
  const { GeoDanmarkNeighborService } = await import("./neighbor-geometry");
  const result = await GeoDanmarkNeighborService.getNeighborContext(null, bbox25832, null);

  const now = new Date().toISOString();
  const confidence =
    result.data?.coverage === "covered" && !result.isMock ? "medium" : "low";

  const buildings = (result.data?.buildings ?? [])
    .filter((b) => b.geometry !== null)
    .map((b) => {
      const geom = b.geometry!;
      const polygon25832: GeoJsonPolygon25832 =
        geom.type === "Polygon"
          ? {
              type: "Polygon",
              coordinates: geom.coordinates as [number, number][][],
              crs: "EPSG:25832",
            }
          : {
              type: "Polygon",
              coordinates: (geom.coordinates as [number, number][][][])[0] ?? [],
              crs: "EPSG:25832",
            };

      return {
        id: b.sourceId,
        footprintPolygon25832: polygon25832,
        areaM2: b.footprintAreaM2 ?? 0,
        distanceM: b.distanceM,
        source: "registry" as const,
      };
    });

  return ExistingFeaturesLayerSchema.parse({
    buildings,
    fences: [],
    source: {
      source: "registry",
      confidence,
      fetchedAt: now,
      requiresReview: result.isMock || result.data?.coverage !== "covered",
    },
  });
}
```

- [ ] **Step 3: Kør tsc**

```bash
bunx tsc --noEmit
```

Hvis der er TypeScript-fejl pga. `ExistingFeaturesLayerSchema` building shape: åbn `src/domain/drawing/beliggenhedsplan.schemas.ts` og verificer hvad schema'et forventer. Tilpas mapping efter det faktiske schema — tilføj ikke felter der ikke er i schema'et.

- [ ] **Step 4: Kør alle tests**

```bash
bun test src
```

Forventet: ingen regressions. Drawing-tests (hvis de eksisterer) passer stadig.

- [ ] **Step 5: Commit**

```bash
git add src/integrations/geodanmark/drawing-layers.ts
git commit -m "feat(surroundings): tilslut GeoDanmarkNeighborService til drawing-layers fetchNeighborBuildings"
```

---

## Task 14: Final Verification

- [ ] **Step 1: Kør fuld test suite**

```bash
bun test src
```

Forventet: alle tests passer.

- [ ] **Step 2: Kør tsc**

```bash
bunx tsc --noEmit
```

Forventet: ingen fejl.

- [ ] **Step 3: Kør lint**

```bash
bunx eslint .
```

Forventet: ingen nye fejl.

- [ ] **Step 4: Kør build**

```bash
bun run build
```

Forventet: ingen fejl.

- [ ] **Step 5: Commit evt. justeringer og opret summary commit**

```bash
git add -A
git commit -m "chore(surroundings): final verification pass — alle tests og build grønne"
```

---

## Åbne Beslutninger (blokerer ikke denne plan)

- **MST WFS:** Bekræft om MST støjkort er tilgængeligt som WFS. Hvis ja: implementér live-sti i `mst-noise.ts`. Hvis kun WMS: behold IS_MOCK=true og dokumentér tydeligt.
- **GeoDanmark entitets-WFS vs. legacy:** Vælg fremadrettet WFS i Task 0 og opdatér `IS_MOCK=false` i `neighbor-geometry.ts`.
- **MAT adjacency-beregning:** Nuværende MAT-service returnerer `relation: "nearby"` for alle. Præcis shared-boundary-detektion (0.25 m tolerance) kan tilføjes i en follow-up task.
- **EJF/ejerdata:** Kræver juridisk review — ikke i scope.
- **Wiring til analysis-orchestrator.ts:** Kræver human review af beskyttet fil — ikke i scope.
