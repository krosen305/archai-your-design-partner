# ARCH-240: MAT + GeoDanmark Parcel Geometry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace bbox-based parcel geometry with a canonical MAT WFS parcel polygon, compute skel-metrics from it, and replace the disabled DAWA neighbor lookup with a GeoDanmark Vektor WFS service.

**Architecture:** The MAT GraphQL client already fetches `MAT_Jordstykke` data but doesn't return `id_lokalId` — adding this field unlocks the existing `fetchParcelGeometryByJordstykkeId` WFS function. `MatGeometryService` wraps the WFS call and computes area/centroid/bbox using a new pure-function `geometry-utils.ts` (shoelace formula on EPSG:25832 coordinates). `GeoDanmarkNaboService` replaces the disabled `NaboService`, ships IS_MOCK=true, and is wired into the orchestrator replacing the old DAWA step.

**Tech Stack:** Bun + TypeScript, Datafordeler MAT WFS (EPSG:25832), GeoDanmark Vektor WFS, proj4 (already installed), bun:test, SourceResult contract from ARCH-239.

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src/integrations/mat/client.ts` | Add `id_lokalId` to JORDSTYKKE_QUERY + `jordstykkeLokalId` to result type |
| Modify | `src/lib/compliance-layer1.ts` | Capture `jordstykkeLokalId` from primary MAT path |
| Modify | `src/integrations/mat/mat.test.ts` | Update mock + add `jordstykkeLokalId` assertion |
| Create | `src/lib/geometry-utils.ts` | Shoelace area, centroid, bbox, dist-to-boundary for EPSG:25832 polygons |
| Create | `src/lib/geometry-utils.test.ts` | Tests with known UTM32 coordinate inputs |
| Create | `src/integrations/mat/geometry.ts` | `MatGeometryService` → `SourceResult<MatParcelGeometryPayload>` |
| Create | `src/integrations/mat/mat-geometry.test.ts` | Tests: normal parcel, no geometry, WFS error |
| Modify | `src/integrations/bbr/neighbor-client.ts` | Add `kilde`, `accessRoadNearby`, `roadDistanceM` to `NeighborBuildingData` |
| Create | `src/integrations/geodanmark/client.ts` | `GeoDanmarkNaboService` (IS_MOCK=true), live skeleton for buildings + road |
| Create | `src/integrations/geodanmark/geodanmark.test.ts` | Tests: mock returns, kilde field, own building excluded |
| Modify | `src/lib/analysis-orchestrator.ts` 🔒 | Add `matGeometri` step; replace `NaboService` with `GeoDanmarkNaboService`; update `ComplianceResult` |
| Modify | `src/lib/project-store.ts` 🔒 | Add `"matGeometri"` to `DataSourceKind` union + all three `Record` objects |
| Modify | `docs/INTEGRATIONS.md` | Add GeoDanmark service row |
| Modify | `docs/data-ingestion-contract.md` | Update pre-check table for MAT geometry / GeoDanmark |

---

## Task 1: MAT GraphQL — expose `jordstykkeLokalId`

The JORDSTYKKE_QUERY currently returns `registreretAreal` + protection flags but not `id_lokalId`. Without it, `jordstykke_lokal_id` in `BbrKompliantData` is always null from the primary path (only the `GrundarealResolver` fallback populates it). This fix is the prerequisite for everything else.

**Files:**
- Modify: `src/integrations/mat/client.ts`
- Modify: `src/lib/compliance-layer1.ts`
- Modify: `src/integrations/mat/mat.test.ts`

- [ ] **Step 1.1: Write the failing test**

Add to `src/integrations/mat/mat.test.ts`. First, update the `jordstykkeResponse` helper to include `id_lokalId`:

```typescript
// Replace the existing jordstykkeResponse helper:
const JORDSTYKKE_LOKAL_ID = "mat-jordstykke-0000-0000-000000000001";

const jordstykkeResponse = (areal: number, matr = "48a") => ({
  data: {
    MAT_Jordstykke: {
      nodes: [
        {
          id_lokalId: JORDSTYKKE_LOKAL_ID,
          registreretAreal: areal,
          matrikelnummer: matr,
        },
      ],
    },
  },
});
```

Then add this test inside `describe("MatService.getGrundareal", ...)`:

```typescript
it("returnerer jordstykkeLokalId fra MAT_Jordstykke", async () => {
  mockFetch([ejerlavResponse(), jordstykkeResponse(850)]);

  const result = await MatService.getGrundareal(12352, "48a", MOCK_CONFIG);

  expect(result.jordstykkeLokalId).toBe(JORDSTYKKE_LOKAL_ID);
});

it("returnerer jordstykkeLokalId null når MAT_Jordstykke mangler", async () => {
  mockFetch([{ data: { MAT_Ejerlav: { nodes: [] } } }]);

  const result = await MatService.getGrundareal(12352, "48a", MOCK_CONFIG);

  expect(result.jordstykkeLokalId).toBeNull();
});
```

- [ ] **Step 1.2: Run test to verify it fails**

```bash
bun test src/integrations/mat/mat.test.ts
```

Expected: FAIL — `result.jordstykkeLokalId` is `undefined`.

- [ ] **Step 1.3: Update JORDSTYKKE_QUERY in `src/integrations/mat/client.ts`**

Locate the `JORDSTYKKE_QUERY` constant (line ~83). Add `id_lokalId` to the nodes selection:

```typescript
const JORDSTYKKE_QUERY = `
query GetJordstykke($ejerlavLokalId: String!, $matrikelnummer: String!, $virkningstid: DafDateTime!, $registreringstid: DafDateTime!) {
  MAT_Jordstykke(
    where: {
      ejerlavLokalId: { eq: $ejerlavLokalId }
      matrikelnummer: { eq: $matrikelnummer }
    }
    virkningstid: $virkningstid
    registreringstid: $registreringstid
    first: 1
  ) {
    nodes {
      id_lokalId
      registreretAreal
      matrikelnummer
      strandbeskyttelse_omfang
      fredskov_omfang
      klitfredning_omfang
    }
  }
}`;
```

- [ ] **Step 1.4: Add `jordstykkeLokalId` to `MatGrundarealResult` type**

Locate the `MatGrundarealResult` type (line ~158). Add the new field:

```typescript
export type MatGrundarealResult = {
  registreretAreal: number | null;
  ejerlavLokalId: string | null;
  ejerlavsnavn: string | null;
  jordstykkeLokalId: string | null; // MAT_Jordstykke.id_lokalId — bruges til parcelpolygon WFS-opslag
  fejl: string | null;
  strandbeskyttelse: boolean | null;
  fredskov: boolean | null;
  klitfredning: boolean | null;
};
```

- [ ] **Step 1.5: Update all return sites in `getGrundareal`**

There are three return sites. Add `jordstykkeLokalId: null` to the two early-return error cases (missing params + ejerlav not found + jordstykke not found), and `jordstykkeLokalId: js.id_lokalId ?? null` to the success return:

Early returns (missing params, ejerlav not found, jordstykke not found) — add `jordstykkeLokalId: null` to each:
```typescript
return {
  registreretAreal: null,
  ejerlavLokalId: null,
  ejerlavsnavn: null,
  jordstykkeLokalId: null,
  fejl: "...",
  strandbeskyttelse: null,
  fredskov: null,
  klitfredning: null,
};
```

Success return (after `const js = jordstykker[0];`):
```typescript
return {
  registreretAreal: js.registreretAreal ?? null,
  ejerlavLokalId,
  ejerlavsnavn,
  jordstykkeLokalId: js.id_lokalId ?? null,
  fejl: null,
  strandbeskyttelse: omfangToBool(js.strandbeskyttelse_omfang),
  fredskov: omfangToBool(js.fredskov_omfang),
  klitfredning: omfangToBool(js.klitfredning_omfang),
};
```

Also add `jordstykkeLokalId: null` to the catch return at the bottom.

- [ ] **Step 1.6: Update `compliance-layer1.ts` — capture `jordstykkeLokalId` from primary MAT path**

In `fetchBbrWithMat`, locate the `if (ejerlavskode && matrikelnummer)` block (line ~58–76). After the existing lines that set `mat_strandbeskyttelse`, `mat_fredskov`, `mat_klitfredning`, add:

```typescript
jordstykkeLokalId = mat.jordstykkeLokalId;
```

The variable is already declared as `let jordstykkeLokalId: string | null = null;` earlier in the function.

- [ ] **Step 1.7: Run tests**

```bash
bun test src/integrations/mat/mat.test.ts
```

Expected: All tests PASS, including the two new ones.

- [ ] **Step 1.8: Typecheck**

```bash
bunx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 1.9: Commit**

```bash
git add src/integrations/mat/client.ts src/lib/compliance-layer1.ts src/integrations/mat/mat.test.ts
git commit -m "feat(arch-240): expose jordstykkeLokalId from MAT_Jordstykke GraphQL → BbrKompliantData"
```

---

## Task 2: Geometry utilities (EPSG:25832)

Pure functions that operate on UTM32 coordinates returned by the Datafordeler MAT WFS. No turf — only proj4 (already installed) and the shoelace formula.

**Files:**
- Create: `src/lib/geometry-utils.ts`
- Create: `src/lib/geometry-utils.test.ts`

- [ ] **Step 2.1: Write the failing tests**

Create `src/lib/geometry-utils.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import {
  computePolygonAreaM2,
  computeCentroidUtm32,
  computeBbox25832,
  minDistanceToBoundaryM,
  utm32ToWgs84,
} from "./geometry-utils";
import type * as GeoJSON from "geojson";

// 100×100 m square in UTM32 near Copenhagen — area = 10 000 m²
const SQUARE: GeoJSON.Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [724000, 6172000],
      [724100, 6172000],
      [724100, 6172100],
      [724000, 6172100],
      [724000, 6172000], // closed ring
    ],
  ],
};

// Square with a 10×10 m hole → area = 9 900 m²
const SQUARE_WITH_HOLE: GeoJSON.Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [724000, 6172000],
      [724100, 6172000],
      [724100, 6172100],
      [724000, 6172100],
      [724000, 6172000],
    ],
    [
      [724045, 6172045],
      [724055, 6172045],
      [724055, 6172055],
      [724045, 6172055],
      [724045, 6172045],
    ],
  ],
};

describe("computePolygonAreaM2", () => {
  it("beregner areal for 100×100 m kvadrat", () => {
    expect(computePolygonAreaM2(SQUARE)).toBeCloseTo(10000, 0);
  });

  it("trækker hul fra ydre ring", () => {
    expect(computePolygonAreaM2(SQUARE_WITH_HOLE)).toBeCloseTo(9900, 0);
  });

  it("returnerer null for tom polygon", () => {
    const empty: GeoJSON.Polygon = { type: "Polygon", coordinates: [] };
    expect(computePolygonAreaM2(empty)).toBeNull();
  });

  it("håndterer MultiPolygon", () => {
    const mp: GeoJSON.MultiPolygon = {
      type: "MultiPolygon",
      coordinates: [SQUARE.coordinates, SQUARE.coordinates],
    };
    expect(computePolygonAreaM2(mp)).toBeCloseTo(20000, 0);
  });
});

describe("computeCentroidUtm32", () => {
  it("beregner centroid for kvadrat til midtpunkt", () => {
    const c = computeCentroidUtm32(SQUARE);
    expect(c).not.toBeNull();
    expect(c![0]).toBeCloseTo(724050, 0);
    expect(c![1]).toBeCloseTo(6172050, 0);
  });

  it("returnerer null for tom polygon", () => {
    const empty: GeoJSON.Polygon = { type: "Polygon", coordinates: [] };
    expect(computeCentroidUtm32(empty)).toBeNull();
  });
});

describe("computeBbox25832", () => {
  it("beregner korrekt bounding box for kvadrat", () => {
    const bbox = computeBbox25832(SQUARE);
    expect(bbox).toEqual([724000, 6172000, 724100, 6172100]);
  });
});

describe("minDistanceToBoundaryM", () => {
  it("centroid af kvadrat er 50 m fra alle sider", () => {
    const centroid: [number, number] = [724050, 6172050];
    const dist = minDistanceToBoundaryM(centroid, SQUARE);
    expect(dist).toBeCloseTo(50, 1);
  });

  it("hjørne af kvadrat er 0 m fra grænsen", () => {
    const corner: [number, number] = [724000, 6172000];
    const dist = minDistanceToBoundaryM(corner, SQUARE);
    expect(dist).toBeCloseTo(0, 1);
  });
});

describe("utm32ToWgs84", () => {
  it("konverterer UTM32 koordinater til WGS84 nær København", () => {
    // Known: UTM32 (724050, 6172050) ≈ WGS84 (55.68°N, 12.57°E)
    const { lat, lng } = utm32ToWgs84(724050, 6172050);
    expect(lat).toBeGreaterThan(55);
    expect(lat).toBeLessThan(57);
    expect(lng).toBeGreaterThan(9);
    expect(lng).toBeLessThan(16);
  });
});
```

- [ ] **Step 2.2: Run tests to verify they fail**

```bash
bun test src/lib/geometry-utils.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 2.3: Create `src/lib/geometry-utils.ts`**

```typescript
// SERVER- AND CLIENT-SAFE — no env access, no Datafordeler calls.
// All functions operate on EPSG:25832 (UTM32N, metres) coordinate pairs,
// which is the CRS returned by Datafordeler MAT WFS.
// Coordinates: [easting_m, northing_m] — same convention as proj4's output.

import proj4 from "proj4";
import type * as GeoJSON from "geojson";

const EPSG25832 = "+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs +type=crs";
const WGS84 = "EPSG:4326";

type Ring = [number, number][];

function ringAreaM2(ring: Ring): number {
  let area = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = ring[i]!;
    const [x2, y2] = ring[(i + 1) % n]!;
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

/**
 * Area of a Polygon or MultiPolygon in m².
 * Expects EPSG:25832 (metre-based) coordinates — the CRS from Datafordeler MAT WFS.
 * Holes are subtracted from the outer ring.
 */
export function computePolygonAreaM2(
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): number | null {
  if (geometry.type === "Polygon") {
    const [outer, ...holes] = geometry.coordinates as Ring[];
    if (!outer?.length) return null;
    return ringAreaM2(outer) - holes.reduce((s, h) => s + ringAreaM2(h), 0);
  }
  if (geometry.type === "MultiPolygon") {
    let total = 0;
    for (const poly of geometry.coordinates as Ring[][]) {
      const [outer, ...holes] = poly;
      if (!outer?.length) continue;
      total += ringAreaM2(outer) - holes.reduce((s, h) => s + ringAreaM2(h), 0);
    }
    return total > 0 ? total : null;
  }
  return null;
}

/**
 * Centroid of the exterior ring using the standard polygon centroid formula.
 * Returns [easting, northing] in EPSG:25832.
 */
export function computeCentroidUtm32(
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): [number, number] | null {
  const ring: Ring | undefined =
    geometry.type === "Polygon"
      ? (geometry.coordinates[0] as Ring)
      : (geometry.coordinates[0]?.[0] as Ring | undefined);
  if (!ring?.length) return null;
  const n = ring.length;
  let area = 0,
    cx = 0,
    cy = 0;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = ring[i]!;
    const [x2, y2] = ring[(i + 1) % n]!;
    const cross = x1 * y2 - x2 * y1;
    area += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  area /= 2;
  if (Math.abs(area) < 1e-10) return null;
  return [cx / (6 * area), cy / (6 * area)];
}

/** Convert EPSG:25832 [easting, northing] to WGS84 { lat, lng }. */
export function utm32ToWgs84(x: number, y: number): { lat: number; lng: number } {
  const [lng, lat] = proj4(EPSG25832, WGS84, [x, y]) as [number, number];
  return { lat, lng };
}

/** Axis-aligned bounding box of the first exterior ring in EPSG:25832. */
export function computeBbox25832(
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): [number, number, number, number] | null {
  const ring: Ring | undefined =
    geometry.type === "Polygon"
      ? (geometry.coordinates[0] as Ring)
      : (geometry.coordinates[0]?.[0] as Ring | undefined);
  if (!ring?.length) return null;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

/**
 * Minimum distance in metres from a UTM32 point to the exterior ring boundary.
 * Used by the rule engine to validate footprint vs. skel.
 */
export function minDistanceToBoundaryM(
  point: [number, number],
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): number | null {
  const ring: Ring | undefined =
    geometry.type === "Polygon"
      ? (geometry.coordinates[0] as Ring)
      : (geometry.coordinates[0]?.[0] as Ring | undefined);
  if (!ring?.length) return null;
  const [px, py] = point;
  let minDist = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i]!;
    const [bx, by] = ring[(i + 1) % ring.length]!;
    const dx = bx - ax,
      dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq > 0 ? ((px - ax) * dx + (py - ay) * dy) / lenSq : 0;
    t = Math.max(0, Math.min(1, t));
    const nearX = ax + t * dx,
      nearY = ay + t * dy;
    const d = Math.sqrt((px - nearX) ** 2 + (py - nearY) ** 2);
    if (d < minDist) minDist = d;
  }
  return minDist === Infinity ? null : minDist;
}
```

- [ ] **Step 2.4: Run tests**

```bash
bun test src/lib/geometry-utils.test.ts
```

Expected: All 9 tests PASS.

- [ ] **Step 2.5: Typecheck**

```bash
bunx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 2.6: Commit**

```bash
git add src/lib/geometry-utils.ts src/lib/geometry-utils.test.ts
git commit -m "feat(arch-240): add geometry-utils — shoelace area, centroid, bbox, dist-to-boundary (EPSG:25832)"
```

---

## Task 3: `MatGeometryService` — parcel polygon + metrics

Wraps the existing `fetchParcelGeometryByJordstykkeId` WFS function and computes metrics. Returns `SourceResult<MatParcelGeometryPayload>`. No new DB migration needed — polygon is cached in `address_analysis.jordstykke_polygon` (already exists), metrics are cached in `address_source_results` with source_kind `"mat_geometry"`.

**Files:**
- Create: `src/integrations/mat/geometry.ts`
- Create: `src/integrations/mat/mat-geometry.test.ts`

- [ ] **Step 3.1: Write the failing tests**

Create `src/integrations/mat/mat-geometry.test.ts`:

```typescript
import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";

// We mock map-proxy before importing MatGeometryService
const mockFetchParcelGeometry = mock(async (_id: string) => ({
  featureCollection: null as import("geojson").FeatureCollection | null,
  source: "notfound" as "wfs" | "notfound",
}));

mock.module("@/lib/map-proxy", () => ({
  fetchParcelGeometryByJordstykkeId: mockFetchParcelGeometry,
}));

import { MatGeometryService } from "./geometry";
import type * as GeoJSON from "geojson";

// 100×100 m square in UTM32
const SQUARE_FC: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [724000, 6172000],
            [724100, 6172000],
            [724100, 6172100],
            [724000, 6172100],
            [724000, 6172000],
          ],
        ],
      },
      properties: { id_lokalId: "mat-js-abc123", matrikelnummer: "48a" },
    },
  ],
};

describe("MatGeometryService.getParcelGeometry", () => {
  beforeEach(() => {
    mockFetchParcelGeometry.mockReset();
  });

  it("returnerer metrics for normal parcel (ét feature)", async () => {
    mockFetchParcelGeometry.mockResolvedValue({
      featureCollection: SQUARE_FC,
      source: "wfs",
    });

    const result = await MatGeometryService.getParcelGeometry("mat-js-abc123", 9800);

    expect(result.status).toBe("ok");
    expect(result.data).not.toBeNull();
    expect(result.data!.polygonAreaM2).toBeCloseTo(10000, 0);
    expect(result.data!.registreretArealM2).toBe(9800);
    expect(result.data!.areaDiscrepancyM2).toBeCloseTo(200, 0);
    expect(result.data!.centroidLat).toBeGreaterThan(55);
    expect(result.data!.bbox25832).not.toBeNull();
    expect(result.data!.featureCount).toBe(1);
    expect(result.data!.hasCanonicalPolygon).toBe(true);
    expect(result.kilde).toBe("mat_wfs");
    expect(result.rawFeatureCount).toBe(1);
  });

  it("returnerer confidence=missing når WFS returnerer ingen features", async () => {
    mockFetchParcelGeometry.mockResolvedValue({
      featureCollection: null,
      source: "notfound",
    });

    const result = await MatGeometryService.getParcelGeometry("ukendt-id", null);

    expect(result.status).toBe("ok");
    expect(result.confidence).toBe("missing");
    expect(result.data!.hasCanonicalPolygon).toBe(false);
    expect(result.data!.polygonAreaM2).toBeNull();
    expect(result.rawFeatureCount).toBe(0);
  });

  it("returnerer status=error når WFS kaster exception", async () => {
    mockFetchParcelGeometry.mockRejectedValue(new Error("WFS timeout"));

    const result = await MatGeometryService.getParcelGeometry("any-id", null);

    expect(result.status).toBe("error");
    expect(result.data).toBeNull();
  });

  it("hasCanonicalPolygon=false når WFS returnerer flere features", async () => {
    const multiFC: GeoJSON.FeatureCollection = {
      ...SQUARE_FC,
      features: [SQUARE_FC.features[0]!, SQUARE_FC.features[0]!],
    };
    mockFetchParcelGeometry.mockResolvedValue({
      featureCollection: multiFC,
      source: "wfs",
    });

    const result = await MatGeometryService.getParcelGeometry("any-id", null);

    expect(result.data!.hasCanonicalPolygon).toBe(false);
    expect(result.data!.featureCount).toBe(2);
  });
});
```

- [ ] **Step 3.2: Run tests to verify they fail**

```bash
bun test src/integrations/mat/mat-geometry.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3.3: Create `src/integrations/mat/geometry.ts`**

```typescript
// SERVER-SIDE ONLY — calls Datafordeler WFS via fetchParcelGeometryByJordstykkeId.
//
// Returns SourceResult<MatParcelGeometryPayload>. The GeoJSON FeatureCollection
// is cached separately in address_analysis.jordstykke_polygon (90-day TTL).
// Computed metrics (area, centroid, bbox) are the payload of this service.

import { fetchParcelGeometryByJordstykkeId } from "@/lib/map-proxy";
import {
  computePolygonAreaM2,
  computeCentroidUtm32,
  computeBbox25832,
  utm32ToWgs84,
} from "@/lib/geometry-utils";
import { makeErrorResult, makeOkResult } from "@/lib/source-result";
import type { SourceResult } from "@/lib/source-result";
import type * as GeoJSON from "geojson";

export type MatParcelGeometryPayload = {
  polygonAreaM2: number | null;
  registreretArealM2: number | null;
  areaDiscrepancyM2: number | null;
  centroidLat: number | null;
  centroidLng: number | null;
  bbox25832: [number, number, number, number] | null;
  featureCount: number;
  hasCanonicalPolygon: boolean;
};

const SOURCE_URL =
  "https://wfs.datafordeler.dk/MATRIKLEN2/MatGaeldendeOgForeloebigWFS/1.0.0/WFS";

export class MatGeometryService {
  /**
   * Henter parcelpolygon for ét jordstykke og beregner skel-metrics.
   *
   * @param jordstykkeLokalId  MAT_Jordstykke.id_lokalId fra MatService/GrundarealResolver
   * @param registreretArealM2 Registreret areal fra MAT GraphQL — til area-sammenligning
   */
  static async getParcelGeometry(
    jordstykkeLokalId: string,
    registreretArealM2: number | null,
  ): Promise<SourceResult<MatParcelGeometryPayload>> {
    try {
      const { featureCollection, source } =
        await fetchParcelGeometryByJordstykkeId(jordstykkeLokalId);

      if (source === "notfound" || !featureCollection) {
        return makeOkResult<MatParcelGeometryPayload>(
          {
            polygonAreaM2: null,
            registreretArealM2,
            areaDiscrepancyM2: null,
            centroidLat: null,
            centroidLng: null,
            bbox25832: null,
            featureCount: 0,
            hasCanonicalPolygon: false,
          },
          { kilde: "mat_wfs", sourceUrl: SOURCE_URL, rawFeatureCount: 0, confidence: "missing" },
        );
      }

      const geometry = featureCollection.features[0]
        ?.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon | null;

      const polygonAreaM2 = geometry ? computePolygonAreaM2(geometry) : null;
      const centroidUtm32 = geometry ? computeCentroidUtm32(geometry) : null;
      const centroidWgs84 = centroidUtm32
        ? utm32ToWgs84(centroidUtm32[0], centroidUtm32[1])
        : null;
      const bbox25832 = geometry ? computeBbox25832(geometry) : null;
      const areaDiscrepancyM2 =
        polygonAreaM2 !== null && registreretArealM2 !== null
          ? polygonAreaM2 - registreretArealM2
          : null;

      return makeOkResult<MatParcelGeometryPayload>(
        {
          polygonAreaM2,
          registreretArealM2,
          areaDiscrepancyM2,
          centroidLat: centroidWgs84?.lat ?? null,
          centroidLng: centroidWgs84?.lng ?? null,
          bbox25832,
          featureCount: featureCollection.features.length,
          hasCanonicalPolygon: featureCollection.features.length === 1,
        },
        {
          kilde: "mat_wfs",
          sourceUrl: SOURCE_URL,
          rawFeatureCount: featureCollection.features.length,
        },
      );
    } catch (e) {
      return makeErrorResult(e, { kilde: "mat_wfs", sourceUrl: SOURCE_URL });
    }
  }
}
```

- [ ] **Step 3.4: Run tests**

```bash
bun test src/integrations/mat/mat-geometry.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 3.5: Typecheck**

```bash
bunx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3.6: Commit**

```bash
git add src/integrations/mat/geometry.ts src/integrations/mat/mat-geometry.test.ts
git commit -m "feat(arch-240): add MatGeometryService — canonical parcel polygon + area/centroid/bbox metrics"
```

---

## Task 4: `NeighborBuildingData` — add `kilde` + road fields

The existing type needs three new fields to satisfy the acceptance criteria and to accommodate the GeoDanmark service in the next task. The `NaboService` (still disabled) returns null for all three new fields.

**Files:**
- Modify: `src/integrations/bbr/neighbor-client.ts`

- [ ] **Step 4.1: Update `NeighborBuildingData` type**

Replace the existing type definition with:

```typescript
export type NeighborBuilding = {
  adgangsadresseid: string;
  adresse: string;
  distanceM: number;
};

export type NeighborBuildingData = {
  count: number;
  nearestDistanceM: number | null;
  buildings: NeighborBuilding[];
  fejl: string | null;
  kilde: string | null;             // "geodanmark" | null — tri-state source tag
  accessRoadNearby: boolean | null; // true/false/null — null = ukendt
  roadDistanceM: number | null;     // meter til nærmeste vej, null = ukendt
};
```

- [ ] **Step 4.2: Update `NaboService.getNaboer` return value**

```typescript
export class NaboService {
  static async getNaboer(lat: number, lng: number, ownId?: string): Promise<NeighborBuildingData> {
    // ARCH-226: dawa.aws.dk er forbudt. Naboopslag er deaktiveret.
    // GeoDanmarkNaboService erstatter dette — se src/integrations/geodanmark/client.ts
    void lat;
    void lng;
    void ownId;
    return {
      count: 0,
      nearestDistanceM: null,
      buildings: [],
      fejl: null,
      kilde: null,
      accessRoadNearby: null,
      roadDistanceM: null,
    };
  }
}
```

- [ ] **Step 4.3: Typecheck (catches any callers that miss the new fields)**

```bash
bunx tsc --noEmit
```

Expected: No errors (all new fields are nullable — no existing callers break).

- [ ] **Step 4.4: Run full test suite**

```bash
bun test
```

Expected: No failures.

- [ ] **Step 4.5: Commit**

```bash
git add src/integrations/bbr/neighbor-client.ts
git commit -m "feat(arch-240): add kilde + accessRoadNearby + roadDistanceM to NeighborBuildingData"
```

---

## Task 5: `GeoDanmarkNaboService` (IS_MOCK=true)

New service file. IS_MOCK=true until the GeoDanmark Vektor WFS endpoint and layer names are verified. The live implementation skeleton is present but gated. Uses the same `SourceResult<NeighborBuildingData>` contract from ARCH-239 and the updated `NeighborBuildingData` from Task 4.

**Files:**
- Create: `src/integrations/geodanmark/client.ts`
- Create: `src/integrations/geodanmark/geodanmark.test.ts`

- [ ] **Step 5.1: Write the failing tests**

Create `src/integrations/geodanmark/geodanmark.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import { GeoDanmarkNaboService } from "./client";

const PARCEL_BBOX: [number, number, number, number] = [724000, 6172000, 724100, 6172100];
const ADDRESS_BBOX: [number, number, number, number] = [723900, 6171900, 724200, 6172200];

describe("GeoDanmarkNaboService.getNabobygninger", () => {
  it("returnerer mock-resultat med kilde=geodanmark (IS_MOCK=true)", async () => {
    const result = await GeoDanmarkNaboService.getNabobygninger(
      PARCEL_BBOX,
      ADDRESS_BBOX,
      "mat-js-abc123",
    );

    expect(result.status).toBe("mock");
    expect(result.data).not.toBeNull();
    expect(result.data!.kilde).toBe("geodanmark");
    expect(result.isMock).toBe(true);
    expect(result.kilde).toBe("geodanmark");
  });

  it("accepterer null parcel bbox og bruger address bbox som fallback", async () => {
    const result = await GeoDanmarkNaboService.getNabobygninger(null, ADDRESS_BBOX, null);

    expect(result.status).toBe("mock");
    expect(result.data!.kilde).toBe("geodanmark");
  });

  it("returnerer tri-state felter (null = ukendt, ikke false)", async () => {
    const result = await GeoDanmarkNaboService.getNabobygninger(
      PARCEL_BBOX,
      ADDRESS_BBOX,
      null,
    );

    // IS_MOCK returnerer null for ukendte felter — aldrig false
    expect(result.data!.accessRoadNearby).toBeNull();
    expect(result.data!.roadDistanceM).toBeNull();
    expect(result.data!.nearestDistanceM).toBeNull();
  });
});
```

- [ ] **Step 5.2: Run tests to verify they fail**

```bash
bun test src/integrations/geodanmark/geodanmark.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 5.3: Create `src/integrations/geodanmark/client.ts`**

```typescript
// SERVER-SIDE ONLY — credentials must never be exposed to the browser.
//
// GeoDanmark Vektor WFS via Datafordeler — nabobygninger og vejadgang.
// Erstatter den deaktiverede NaboService (ARCH-226).
//
// IS_MOCK=true indtil GeoDanmark WFS endpoint og layer-navne er verificeret.
// For at aktivere live kald:
//   1. Kør GetCapabilities: GET https://wfs.datafordeler.dk/GeoDanmark/GeoDanmark_WFS/2.0.0/WFS?SERVICE=WFS&REQUEST=GetCapabilities&apikey=<DIN_NØGLE>
//   2. Bekræft typename for bygninger (sandsynligvis "gdk:Bygning") og veje (sandsynligvis "gdk:Vejmidte")
//   3. Sæt IS_MOCK=false herunder
//
// Datafordeler-regler (samme som MAT/BBR):
//   - API-nøgle som query-param "apikey=" (ikke Authorization header)
//   - Ingen aliases, én root-felt pr. GraphQL-query (ikke relevant for WFS)

import { getEnvRequired } from "@/lib/env";
import { makeErrorResult, makeMockResult, makeOkResult } from "@/lib/source-result";
import type { SourceResult } from "@/lib/source-result";
import type {
  NeighborBuilding,
  NeighborBuildingData,
} from "@/integrations/bbr/neighbor-client";

const IS_MOCK = true;

const GEODANMARK_WFS_URL =
  "https://wfs.datafordeler.dk/GeoDanmark/GeoDanmark_WFS/2.0.0/WFS";
const BYGNING_TYPENAME = "gdk:Bygning";
const VEJ_TYPENAME = "gdk:Vejmidte";

type WfsFeatureCollection = { features?: unknown[] };

async function wfsGetFeatures(
  typename: string,
  bboxStr: string,
  apiKey: string,
): Promise<unknown[]> {
  const url = new URL(GEODANMARK_WFS_URL);
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("service", "WFS");
  url.searchParams.set("version", "2.0.0");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("typenames", typename);
  url.searchParams.set("srsname", "urn:ogc:def:crs:EPSG::25832");
  url.searchParams.set("bbox", bboxStr);
  url.searchParams.set("outputFormat", "application/json");

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json, application/geo+json;q=0.9" },
  });
  if (!res.ok) throw new Error(`GeoDanmark WFS HTTP ${res.status} for ${typename}`);
  const fc = (await res.json()) as WfsFeatureCollection;
  return fc.features ?? [];
}

export class GeoDanmarkNaboService {
  /**
   * Henter nabobygninger og vejadgang fra GeoDanmark Vektor WFS.
   *
   * @param parcelBbox25832   Bounding box fra parcelpolygon (MatGeometryService). Foretrukket.
   * @param adresseBbox25832  Fallback bbox ± 150 m fra adressepunkt.
   * @param ownJordstykkeLokalId  Matrikel-ID — forsøg at filtrere egne bygninger fra.
   */
  static async getNabobygninger(
    parcelBbox25832: [number, number, number, number] | null,
    adresseBbox25832: [number, number, number, number],
    ownJordstykkeLokalId: string | null,
  ): Promise<SourceResult<NeighborBuildingData>> {
    if (IS_MOCK) {
      return makeMockResult<NeighborBuildingData>(
        {
          count: 0,
          nearestDistanceM: null,
          buildings: [],
          fejl: null,
          kilde: "geodanmark",
          accessRoadNearby: null,
          roadDistanceM: null,
        },
        { kilde: "geodanmark", sourceUrl: GEODANMARK_WFS_URL, rawFeatureCount: 0 },
      );
    }

    try {
      const apiKey = getEnvRequired("DATAFORDELER_API_KEY");
      const queryBbox = parcelBbox25832 ?? adresseBbox25832;
      const bboxStr = `${queryBbox[0]},${queryBbox[1]},${queryBbox[2]},${queryBbox[3]},urn:ogc:def:crs:EPSG::25832`;

      const [buildingFeatures, roadFeatures] = await Promise.all([
        wfsGetFeatures(BYGNING_TYPENAME, bboxStr, apiKey),
        wfsGetFeatures(VEJ_TYPENAME, bboxStr, apiKey).catch(() => [] as unknown[]),
      ]);

      // Exclude buildings on own parcel by matching a jordstykke reference property.
      // The actual property name must be verified against GetCapabilities/schema.
      const neighborFeatures = ownJordstykkeLokalId
        ? buildingFeatures.filter(
            (f: any) =>
              f.properties?.jordstykke_lokal_id !== ownJordstykkeLokalId &&
              f.properties?.id_jordstykke !== ownJordstykkeLokalId,
          )
        : buildingFeatures;

      const buildings: NeighborBuilding[] = neighborFeatures.map((f: any, i: number) => ({
        adgangsadresseid: f.properties?.id_lokalId ?? `gdk-${i}`,
        adresse: f.properties?.husnummer ?? "ukendt",
        distanceM: 0, // distance computation requires parcel geometry — extend when live
      }));

      return makeOkResult<NeighborBuildingData>(
        {
          count: neighborFeatures.length,
          nearestDistanceM: buildings.length > 0 ? 0 : null,
          buildings,
          fejl: null,
          kilde: "geodanmark",
          accessRoadNearby: roadFeatures.length > 0 ? true : null,
          roadDistanceM: null,
        },
        {
          kilde: "geodanmark",
          sourceUrl: GEODANMARK_WFS_URL,
          rawFeatureCount: buildingFeatures.length,
        },
      );
    } catch (e) {
      return makeErrorResult(e, { kilde: "geodanmark", sourceUrl: GEODANMARK_WFS_URL });
    }
  }
}
```

- [ ] **Step 5.4: Run tests**

```bash
bun test src/integrations/geodanmark/geodanmark.test.ts
```

Expected: All 3 tests PASS.

- [ ] **Step 5.5: Typecheck**

```bash
bunx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5.6: Commit**

```bash
git add src/integrations/geodanmark/client.ts src/integrations/geodanmark/geodanmark.test.ts
git commit -m "feat(arch-240): add GeoDanmarkNaboService (IS_MOCK=true) — replaces disabled NaboService"
```

---

## Task 6: Wire into orchestrator 🔒

**Protected file.** Flags in PR: `🔒 Rører beskyttet fil — kræver review`.

Changes:
1. Add `matGeometri: MatParcelGeometryPayload | null` to `ComplianceResult`
2. Run `MatGeometryService` in Layer 4 before the parallel block
3. Replace `NaboService.getNaboer` with `GeoDanmarkNaboService.getNabobygninger`
4. Update `ComplianceBase` Omit, `setCachedCompliance` call, `states` assignments

**Files:**
- Modify: `src/lib/analysis-orchestrator.ts`

- [ ] **Step 6.1: Add imports to orchestrator**

At the top of `src/lib/analysis-orchestrator.ts`, add two new type imports after the existing imports:

```typescript
import type { MatParcelGeometryPayload } from "@/integrations/mat/geometry";
```

(Keep existing imports unchanged.)

- [ ] **Step 6.2: Add `matGeometri` to `ComplianceResult` type**

Locate `ComplianceResult` type (line ~67). Add after `fbbData`:

```typescript
export type ComplianceResult = {
  bbr: BbrKompliantData | null;
  lokalplaner: Lokalplan[];
  kommuneplanramme: Kommuneplanramme | null;
  analysedAt: string;
  lokalplanExtract: LokalplanExtract | null;
  naturbeskyttelse: NaturbeskyttelsesResultat | null;
  dkjord: DkJordResultat | null;
  geusRisk: GeusRiskData | null;
  servitutter: TinglysningResult | null;
  terrain: TerrainData | null;
  naboer: NeighborBuildingData | null;
  fjernvarme: FjernvarmeResultat | null;
  fbbData: FbbResultat | null;
  matGeometri: MatParcelGeometryPayload | null; // ARCH-240: parcelpolygon + skel-metrics
  vurderingData: VurData | null;
  ruleEngine?: RuleEngineResult;
  analysisRunId?: string | null;
  serviceStates?: Partial<
    Record<
      import("@/lib/project-store").DataSourceKind,
      import("@/lib/project-store").PipelineServiceState
    >
  >;
};
```

- [ ] **Step 6.3: Add `matGeometri` to `ComplianceBase` Omit**

Locate `type ComplianceBase = Omit<ComplianceResult, ...>` (line ~184). Add `| "matGeometri"` to the union:

```typescript
type ComplianceBase = Omit<
  ComplianceResult,
  | "lokalplanExtract"
  | "naturbeskyttelse"
  | "dkjord"
  | "geusRisk"
  | "servitutter"
  | "terrain"
  | "naboer"
  | "fjernvarme"
  | "fbbData"
  | "matGeometri"
  | "ruleEngine"
>;
```

- [ ] **Step 6.4: Add `matGeometri: null` to `setCachedCompliance` call**

Locate the `setCachedCompliance(addressId, { ...computedBase, ... })` call (line ~290). Add `matGeometri: null` to the patched object:

```typescript
() =>
  setCachedCompliance(addressId, {
    ...computedBase,
    lokalplanExtract: null,
    naturbeskyttelse: null,
    dkjord: null,
    geusRisk: null,
    servitutter: null,
    terrain: null,
    naboer: null,
    fjernvarme: null,
    fbbData: null,
    matGeometri: null,  // ← ADD THIS
    vurderingData: computedBase.vurderingData,
  }),
```

- [ ] **Step 6.5: Add `matGeometri` variable to Layer 4 and run `MatGeometryService`**

In the Layer 4 async closure (line ~431), add `matGeometri` to the declared variables and run it before the parallel block. Locate the block that declares `let naturbeskyttelse`, `let dkjord`, etc., and add:

```typescript
let matGeometri: MatParcelGeometryPayload | null = null;
```

Then, before the `if (bbrHardStop)` guard and before the `Promise.all`, add:

```typescript
// MAT geometry: fetch canonical parcel polygon + compute metrics.
// Runs before the parallel block so bbox25832 is available for GeoDanmark.
const jordstykkeId = complianceBase.bbr?.jordstykke_lokal_id ?? null;
if (jordstykkeId) {
  const matGeoResult = await traceStep(
    trace,
    {
      eventType: "api_call",
      phase: "layer4",
      service: "Datafordeler MAT WFS",
      operation: "MatGeometryService.getParcelGeometry",
      inputSummary: `jordstykkeId=${jordstykkeId}`,
    },
    () =>
      import("@/integrations/mat/geometry").then(({ MatGeometryService }) =>
        MatGeometryService.getParcelGeometry(
          jordstykkeId,
          complianceBase.bbr?.grundareal ?? null,
        ),
      ),
    {
      outputSummary: (r) =>
        summarizeSourceResult(
          r,
          (d) =>
            `area=${d.polygonAreaM2?.toFixed(0) ?? "null"} canonical=${d.hasCanonicalPolygon}`,
        ),
      metadata: (r) => ({
        source: r.kilde,
        isMock: r.isMock,
        feature_count: r.rawFeatureCount,
      }),
    },
  ).catch((e: Error) => {
    console.warn("[Orchestrator] MatGeometryService fejlede:", e.message);
    return null;
  });
  matGeometri = matGeoResult?.data ?? null;
  states.matGeometri =
    matGeoResult == null
      ? "error"
      : matGeoResult.status === "mock"
        ? "mock"
        : matGeoResult.status === "error"
          ? "error"
          : matGeoResult.data != null
            ? "success"
            : "no_hit";
} else {
  states.matGeometri = "no_hit";
}
```

- [ ] **Step 6.6: Replace `NaboService` with `GeoDanmarkNaboService` in the parallel block**

Locate the `import("@/integrations/bbr/neighbor-client")` call in the `Promise.all` (line ~576). Replace it with:

```typescript
import("@/integrations/geodanmark/client")
  .then(({ GeoDanmarkNaboService }) => {
    const parcelBbox = matGeometri?.bbox25832 ?? null;
    const { createBboxAroundPoint } = require("@/lib/map-proxy") as typeof import("@/lib/map-proxy");
    const fallbackBboxRaw = koordinater ? createBboxAroundPoint(koordinater, 150) : null;
    const fallbackBbox: [number, number, number, number] | null = fallbackBboxRaw
      ? [fallbackBboxRaw.minX, fallbackBboxRaw.minY, fallbackBboxRaw.maxX, fallbackBboxRaw.maxY]
      : null;
    if (!fallbackBbox) return Promise.resolve(null);
    return traceStep(
      trace,
      {
        eventType: "api_call",
        phase: "layer4",
        service: "GeoDanmark WFS",
        operation: "getNabobygninger",
        inputSummary: `hasParcelBbox=${!!parcelBbox}`,
      },
      () =>
        GeoDanmarkNaboService.getNabobygninger(
          parcelBbox,
          fallbackBbox,
          complianceBase.bbr?.jordstykke_lokal_id ?? null,
        ),
      {
        outputSummary: (r) =>
          summarizeSourceResult(r, (d) => `count=${d.count} kilde=${d.kilde}`),
        metadata: (r) => ({ source: r.kilde, isMock: r.isMock, feature_count: r.rawFeatureCount }),
      },
    );
  })
  .catch((e: Error) => {
    console.warn("[Orchestrator] GeoDanmarkNaboService fejlede:", e.message);
    return null;
  }),
```

**Note:** The `require` in the middle of an async function works in Cloudflare Workers because it's a static module reference, not a dynamic load. Alternatively, add `import { createBboxAroundPoint } from "@/lib/map-proxy";` at the top of the file.

Actually, cleaner approach — add a top-level dynamic import at the start of the Layer 4 closure:

```typescript
// Top of Layer 4 closure, before the matGeometri block:
const { createBboxAroundPoint } = await import("@/lib/map-proxy");
```

Use this approach instead of `require`.

- [ ] **Step 6.7: Update `naboer` unwrapping**

After the `Promise.all` completes (around line ~610), locate:

```typescript
naboer = nabo;
```

Change to:

```typescript
naboer = nabo?.data ?? null;
states.naboer =
  nabo == null
    ? "error"
    : nabo.status === "mock"
      ? "mock"
      : nabo.status === "error"
        ? "error"
        : nabo.data != null
          ? "success"
          : "no_hit";
```

Remove the old `states.naboer = bbrHardStop ? "skipped" : "no_hit";` line at the bottom (line ~646).

- [ ] **Step 6.8: Add `matGeometri` to the return value**

Locate the final `return { ...complianceBase, ... }` (line ~650). Add `matGeometri`:

```typescript
return {
  ...complianceBase,
  lokalplanExtract,
  naturbeskyttelse,
  dkjord,
  geusRisk,
  servitutter,
  terrain,
  naboer,
  fjernvarme,
  fbbData,
  matGeometri,  // ← ADD
  vurderingData: complianceBase.vurderingData,
  serviceStates: states,
};
```

- [ ] **Step 6.9: Add `matGeometri` to the bbrHardStop early-return**

Locate the early return in the `bbrHardStop` block (line ~492):

```typescript
return { naturbeskyttelse, dkjord, geusRisk, terrain, naboer, fjernvarme, fbbData };
```

Change to:

```typescript
return { naturbeskyttelse, dkjord, geusRisk, terrain, naboer, fjernvarme, fbbData, matGeometri };
```

- [ ] **Step 6.10: Typecheck**

```bash
bunx tsc --noEmit
```

Expected: No errors. Fix any type errors before proceeding.

- [ ] **Step 6.11: Run full test suite**

```bash
bun test
```

Expected: No failures.

- [ ] **Step 6.12: Commit**

```bash
git add src/lib/analysis-orchestrator.ts
git commit -m "feat(arch-240): 🔒 wire MatGeometryService + GeoDanmarkNaboService into orchestrator — replaces DAWA nabo"
```

---

## Task 7: `DataSourceKind` — add `"matGeometri"` 🔒

**Protected file.** There are three `Record<DataSourceKind, ...>` objects that all require a new entry.

**Files:**
- Modify: `src/lib/project-store.ts`

- [ ] **Step 7.1: Add `"matGeometri"` to the union type (line ~182)**

```typescript
export type DataSourceKind =
  | "bbr"
  | "lokalplaner"
  | "kommuneplanramme"
  | "fbb"
  | "naturbeskyttelse"
  | "dkjord"
  | "geusRisk"
  | "servitutter"
  | "terrain"
  | "fjernvarme"
  | "naboer"
  | "matGeometri"  // ← ADD: ARCH-240 parcelpolygon + skel-metrics
  | "vurdering"
  | "byggeanalyse"
  | "billedanalyse"
  | "husDna";
```

- [ ] **Step 7.2: Add `"matGeometri"` to `DATA_SOURCE_LABELS` (line ~199)**

```typescript
export const DATA_SOURCE_LABELS: Record<DataSourceKind, string> = {
  // ... existing entries ...
  matGeometri: "Parcelgeometri (MAT WFS)",
  // ...
};
```

- [ ] **Step 7.3: Add `"matGeometri"` to `DEFAULT_DATA_STATUS` (line ~217)**

```typescript
const DEFAULT_DATA_STATUS: Record<DataSourceKind, DataSourceStatus> = {
  // ... existing entries ...
  matGeometri: "missing",
  // ...
};
```

- [ ] **Step 7.4: Add `"matGeometri"` to `STALE_DAYS` (line ~496)**

```typescript
const STALE_DAYS: Record<DataSourceKind, number> = {
  // ... existing entries ...
  matGeometri: 90, // matches jordstykke TTL in cache/client.ts
  // ...
};
```

- [ ] **Step 7.5: Typecheck**

```bash
bunx tsc --noEmit
```

Expected: No errors. TypeScript's exhaustiveness check on `Record<DataSourceKind, ...>` will catch any missed entries.

- [ ] **Step 7.6: Run full test suite**

```bash
bun test
```

Expected: No failures.

- [ ] **Step 7.7: Commit**

```bash
git add src/lib/project-store.ts
git commit -m "feat(arch-240): 🔒 add matGeometri to DataSourceKind — parcel geometry pipeline state"
```

---

## Task 8: Documentation

**Files:**
- Modify: `docs/INTEGRATIONS.md`
- Modify: `docs/data-ingestion-contract.md`

- [ ] **Step 8.1: Add GeoDanmark row to INTEGRATIONS.md service table**

Locate the `NaboService` row in the table. Add a new row above it:

```markdown
| `GeoDanmarkNaboService` | `geodanmark/client.ts`  | 🟡 IS_MOCK=true | Nabobygninger og vejadgang via GeoDanmark Vektor WFS. Erstatter NaboService (ARCH-240). Aktivér ved at verificere typenames via GetCapabilities. |
```

Update the `NaboService` row to note it's superseded:

```markdown
| `NaboService`           | `bbr/neighbor-client.ts` | ⚠️ Superseded    | Returnerer tom liste. Superseded by GeoDanmarkNaboService (ARCH-240). Keep until GeoDanmarkNaboService goes live. |
```

- [ ] **Step 8.2: Add `MatGeometryService` row to INTEGRATIONS.md**

Add after `MatService`:

```markdown
| `MatGeometryService`    | `mat/geometry.ts`        | ✅ Live         | Parcel polygon + metrics (area, centroid, bbox) via MAT WFS CQL_FILTER on jordstykke id_lokalId. |
```

- [ ] **Step 8.3: Update pre-check table in `docs/data-ingestion-contract.md`**

The pre-check table already has `MAT geometry / GeoDanmark | ✅ (polygon only) | ✅`. Add a note that MatGeometryService runs in full analysis (Layer 4); pre-check integration is a follow-up.

Also add ARCH-240 to the planned column groups section:

```markdown
- **ARCH-240 (MAT geometry + GeoDanmark)**: `matGeometri` in `ComplianceResult` — `MatParcelGeometryPayload` (area, centroid, bbox, featureCount, hasCanonicalPolygon). Persisted via `address_source_results` source_kind `"mat_geometry"` and `"geodanmark_nabo"` (90-day TTL). No new `site_constraints` columns — geometry data is screening context, not Hard Stop input.
```

- [ ] **Step 8.4: Commit**

```bash
git add docs/INTEGRATIONS.md docs/data-ingestion-contract.md
git commit -m "docs(arch-240): add GeoDanmarkNaboService + MatGeometryService to INTEGRATIONS.md + data-ingestion-contract"
```

---

## Final Verification

- [ ] **Full build**

```bash
bun run build
```

Expected: No errors.

- [ ] **Type check**

```bash
bunx tsc --noEmit
```

Expected: No errors.

- [ ] **Full test suite**

```bash
bun test
```

Expected: No failures.

- [ ] **Lint**

```bash
bunx eslint .
```

Expected: No new errors.

- [ ] **Mark ARCH-240 Done in Linear**

---

## Self-Review Against Spec

| Acceptance Criterion | Task |
|---|---|
| Én kanonisk parcelpolygon, ikke bbox-samling | Task 1 (fixes `jordstykke_lokal_id` population) + Task 3 (`MatGeometryService` uses CQL_FILTER WFS) |
| Naboanalyse virker uden DAWA | Task 5 (`GeoDanmarkNaboService`) + Task 6 (replaces `NaboService` in orchestrator) |
| `NeighborBuildingData` har `kilde: "geodanmark"` og tri-state status | Task 4 (type update) + Task 5 (service returns `kilde: "geodanmark"`) |
| Design footprint kan valideres mod skel | Task 2 (`minDistanceToBoundaryM` utility — used by rule engine client-side) |
| `analysis_events` viser separate MAT/GeoDanmark summaries | Task 6 (traceStep calls with outputSummary) |
| Tests: normal parcel, flere features, ingen geometri, nabobygninger, egen bygning ekskluderes | Tasks 2, 3, 5 |
| `bunx tsc --noEmit`, `bun test`, `bunx eslint .`, `bun run build` | Final Verification |

**Note on pre-check integration:** `data-ingestion-contract.md` marks MAT geometry as pre-check scope. Wiring `MatGeometryService` into `pre-check-adresse.ts` is a follow-up task — `pre-check-adresse.ts` is a protected file and the pre-check path is deliberately kept fast. The polygon call adds ~300ms when uncached, which may be acceptable. That decision belongs in a separate ARCH issue.
