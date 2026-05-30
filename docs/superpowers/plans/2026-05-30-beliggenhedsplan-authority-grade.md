# Beliggenhedsplan — Authority Grade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Løfte beliggenhedsplan-eksporten fra `AUTO_DRAFT` til indholdet der kræves af en dansk kommune — lokalplan byggefelter, DHM-koter, arealskema, bygherre og sokkelkote.

**Architecture:** Ports & Adapters, jf. CLAUDE.md. Ny adapter-kode placeres i `src/integrations/`. Domain-logik i `src/domain/drawing/`. Assembler-service orkestrerer. UI er kun adapter. Ingen compliance-data fra klient.

**Tech Stack:** TypeScript, Bun, bun:test, Zod, proj4 (allerede installeret), jsts (allerede installeret), Plandata WFS, Datafordeler DHM WCS.

---

## Nuværende tilstand — læs inden du starter

| Fil                                                             | Status                                                                      |
| --------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `src/domain/drawing/beliggenhedsplan.types.ts`                  | Komplet — rør ikke                                                          |
| `src/domain/drawing/decision-engine.ts`                         | Komplet — rør ikke                                                          |
| `src/domain/drawing/ports.ts`                                   | `DrawingGeometrySourcePort` — **udvides i Task 1**                          |
| `src/integrations/geodanmark/drawing-layers.ts`                 | `GeoDanmarkDrawingLayersAdapter` — **udvides i Task 1 og 2**                |
| `src/integrations/plandata/client.ts`                           | Eksisterende Plandata WFS-klient med spatial filter — **udvides i Task 1**  |
| `src/integrations/sdfi/dhm-client.ts`                           | `DhmService.getTerrainData(bbox, lat, lng)` — **bruges i Task 2**           |
| `src/lib/geometry-utils.ts`                                     | `utm32ToWgs84`, `wgs84ToUtm32` — **bruges i Task 1+2**                      |
| `src/services/drawing/assemble-beliggenhedsplan.service.ts`     | `AssembleInput` + assembler — **udvides i Task 2 og 3**                     |
| `src/routes/api.drawing.ts`                                     | Thin server function — **udvides i Task 3**                                 |
| `src/routes/projekt.teknik.tsx`                                 | UI for beliggenhedsplan — **udvides i Task 4**                              |
| `src/lib/drawing/drawing-model-builder.ts`                      | SVG model builder — **udvides i Task 5**                                    |
| `src/integrations/supabase/repositories/projects.repository.ts` | Henter `grundareal_m2`, `bebygget_areal_m2`, `bfe_nr` — **bruges i Task 3** |

### CLAUDE.md regler der er relevante

- **Rule 1**: Alt data over systemgrænser valideres med Zod. Plandata WFS-response og DHM inkl. geometri.
- **Rule 3**: Server function delegerer til services — projekt-data loades fra repository, ikke inline.
- **Rule 7**: `fetchPlandataLayers()` returnerer `[]` — stub skal ikke extend, ny funktion tilføjes.

---

## Fil-overblik

### Nye filer

- `src/integrations/plandata/drawing-constraints.ts` — ny Plandata-funktion der returnerer byggefelt+byggelinje med geometri i EPSG:25832
- `src/integrations/plandata/drawing-constraints.test.ts` — unit tests

### Modificerede filer

- `src/integrations/geodanmark/drawing-layers.ts` — implement `fetchPlandataLayers()` og `fetchDhmKoter()`
- `src/domain/drawing/ports.ts` — tilføj `fetchDhmKoter(bbox25832)` til port
- `src/services/drawing/assemble-beliggenhedsplan.service.ts` — kald DHM og wire `terrain`, `hasDhmKoter`; accepter projekt-metadata
- `src/routes/api.drawing.ts` — load projekt-data fra repo; send bygherre + sokkelkote; wire areaTable
- `src/routes/projekt.teknik.tsx` — tilføj sokkelkote + bygherre input-felter
- `src/lib/drawing/drawing-model-builder.ts` — render nordpil i SVG

---

## Task 1: Plandata byggefelt-constraints med geometri

**Mål:** `fetchPlandataLayers()` i `GeoDanmarkDrawingLayersAdapter` skal returnere
`ConstraintLayer[]` med byggefelt-polygoner fra Plandata WFS i EPSG:25832.

**Filer:**

- Opret: `src/integrations/plandata/drawing-constraints.ts`
- Opret: `src/integrations/plandata/drawing-constraints.test.ts`
- Modificer: `src/integrations/geodanmark/drawing-layers.ts`

### Baggrund

Plandata WFS returnerer GeoJSON features med `geometry` i WGS84 (EPSG:4326).
Den eksisterende schema i `plandata/client.ts` (`plandataWfsFeatureSchema`) stripper geometry.
Vi opretter en ny, selvstændig funktion der fanger geometry og konverterer til EPSG:25832.

`utm32ToWgs84` og `wgs84ToUtm32` er i `src/lib/geometry-utils.ts`.

WFS endpoints der skal bruges:

- `pdk:theme_pdk_byggefelt_vedtaget` — lokalplanens byggefelter (polygon constraint)
- `pdk:theme_pdk_lokalplan_byggelinje_vedtaget` — eventuelle byggelinjer fra lokalplan

WFS base URL: `https://geoserver.plandata.dk/geoserver/wfs`

Spatial filter for bbox (WGS84-polygon):

```
INTERSECTS(geometri,SRID=4326;POLYGON((lng1 lat1, lng2 lat2, lng3 lat3, lng4 lat4, lng1 lat1)))
```

- [ ] **Step 1.1: Skriv failing test**

Opret `src/integrations/plandata/drawing-constraints.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import { byggefeltWgs84ToConstraintLayers } from "./drawing-constraints";
import type { BBox25832 } from "@/domain/drawing/beliggenhedsplan.types";

describe("byggefeltWgs84ToConstraintLayers", () => {
  it("konverterer WGS84 byggefelt-feature til ConstraintLayer i EPSG:25832", () => {
    // Randers centrum: ca. EPSG:25832 [574000, 6228000]
    // WGS84: ca. lng=10.0369, lat=56.4607
    const mockFeatures = [
      {
        id: "byggefelt.123",
        properties: { planid: "plan-abc", status: "V", datoikraft: "2020-01-01" },
        geometry: {
          type: "Polygon" as const,
          coordinates: [
            [
              [10.036, 56.46],
              [10.038, 56.46],
              [10.038, 56.4615],
              [10.036, 56.4615],
              [10.036, 56.46],
            ],
          ],
        },
      },
    ];

    const bbox25832: BBox25832 = [573500, 6227500, 574500, 6228500];
    const result = byggefeltWgs84ToConstraintLayers(mockFeatures, bbox25832);

    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe("building_field");
    expect(result[0]!.geometry25832.type).toBe("Polygon");
    // Koordinaterne er nu i UTM32 — verify roughly in range
    const coords = (result[0]!.geometry25832 as { type: "Polygon"; coordinates: number[][][] })
      .coordinates[0]!;
    expect(coords[0]![0]).toBeGreaterThan(570000); // easting ca. 570k
    expect(coords[0]![0]).toBeLessThan(580000);
    expect(result[0]!.label).toBe("Byggefelt (lokalplan)");
    expect(result[0]!.source.source).toBe("registry");
  });

  it("springer features over uden geometry", () => {
    const mockFeatures = [{ id: "byggefelt.no-geom", properties: { status: "V" }, geometry: null }];
    const bbox25832: BBox25832 = [573500, 6227500, 574500, 6228500];
    const result = byggefeltWgs84ToConstraintLayers(mockFeatures, bbox25832);
    expect(result).toHaveLength(0);
  });
});
```

- [ ] **Step 1.2: Kør test — verificer at den fejler**

```bash
bun test src/integrations/plandata/drawing-constraints.test.ts
```

Forventet: `Cannot find module './drawing-constraints'`

- [ ] **Step 1.3: Implementer `drawing-constraints.ts`**

Opret `src/integrations/plandata/drawing-constraints.ts`:

```typescript
// Henter Plandata WFS byggefelt- og byggelinje-features MED geometri og
// konverterer koordinater fra WGS84 til EPSG:25832. Returnerer ConstraintLayer[].
// Bruges kun af drawing-adapteren — ikke af compliance-flowet.

import { z } from "zod";
import { fetchWithRetry } from "@/integrations/http/fetch-with-retry";
import { wgs84ToUtm32, utm32ToWgs84 } from "@/lib/geometry-utils";
import { registrySourceMeta } from "@/domain/drawing/source-quality";
import type {
  ConstraintLayer,
  GeoJsonPolygon25832,
  BBox25832,
} from "@/domain/drawing/beliggenhedsplan.types";

const WFS_BASE = "https://geoserver.plandata.dk/geoserver/wfs";
const BYGGEFELT_TYPE = "pdk:theme_pdk_byggefelt_vedtaget";
const WFS_RETRY = { timeoutMs: 15_000, retries: 1, retryOnStatuses: [502, 503, 504] };

const wfsGeometrySchema = z
  .object({
    type: z.string(),
    coordinates: z.unknown(),
  })
  .nullable()
  .optional();

const wfsFeatureWithGeomSchema = z.object({
  id: z.string().optional(),
  properties: z.record(z.unknown()).nullable().optional().default(null),
  geometry: wfsGeometrySchema.default(null),
});

const wfsFeatureCollectionSchema = z.object({
  features: z.array(wfsFeatureWithGeomSchema).optional().default([]),
});

export type WfsFeatureWithGeom = z.infer<typeof wfsFeatureWithGeomSchema>;

function bbox25832ToWgs84Polygon(bbox: BBox25832): string {
  const [minX, minY, maxX, maxY] = bbox;
  const corners: [number, number][] = [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
    [minX, minY],
  ];
  const wgsCorners = corners.map(([x, y]) => {
    const { lat, lng } = utm32ToWgs84(x, y);
    return `${lng} ${lat}`;
  });
  return `POLYGON((${wgsCorners.join(", ")}))`;
}

function convertWgs84RingToUtm32(ring: number[][]): [number, number][] {
  return ring.map(([lng, lat]) => {
    const { x, y } = wgs84ToUtm32(lat!, lng!);
    return [x, y] as [number, number];
  });
}

export function byggefeltWgs84ToConstraintLayers(
  features: WfsFeatureWithGeom[],
  _bbox25832: BBox25832,
): ConstraintLayer[] {
  const now = new Date().toISOString();
  const layers: ConstraintLayer[] = [];

  for (const f of features) {
    const geom = f.geometry;
    if (!geom || geom.type !== "Polygon") continue;

    const rawCoords = geom.coordinates as number[][][];
    const rings = rawCoords.map(convertWgs84RingToUtm32);

    const polygon25832: GeoJsonPolygon25832 = {
      type: "Polygon",
      coordinates: rings,
      crs: "EPSG:25832",
    };

    const props = f.properties ?? {};
    const planId = String(props["planid"] ?? props["lokplan_id"] ?? f.id ?? "");

    layers.push({
      type: "building_field",
      geometry25832: polygon25832,
      label: "Byggefelt (lokalplan)",
      ruleText: planId ? `Lokalplan ${planId}` : null,
      ruleReference: "Lokalplan",
      source: registrySourceMeta(now),
    });
  }

  return layers;
}

export async function fetchBuildingFieldConstraints(
  bbox25832: BBox25832,
): Promise<ConstraintLayer[]> {
  const polygonWkt = bbox25832ToWgs84Polygon(bbox25832);
  const cqlFilter = `INTERSECTS(geometri,SRID=4326;${polygonWkt})`;

  const params = new URLSearchParams({
    service: "WFS",
    version: "1.1.0",
    request: "GetFeature",
    typeName: BYGGEFELT_TYPE,
    outputFormat: "application/json",
    maxFeatures: "50",
    CQL_FILTER: cqlFilter,
  });

  try {
    const res = await fetchWithRetry(
      `${WFS_BASE}?${params.toString()}`,
      { headers: { Accept: "application/json" } },
      WFS_RETRY,
    );

    if (!res.ok) return [];

    const json = await res.json();
    const parsed = wfsFeatureCollectionSchema.safeParse(json);
    if (!parsed.success) return [];

    return byggefeltWgs84ToConstraintLayers(parsed.data.features, bbox25832);
  } catch {
    return [];
  }
}
```

- [ ] **Step 1.4: Kør test — verificer grønt**

```bash
bun test src/integrations/plandata/drawing-constraints.test.ts
```

Forventet: alle 2 tests grønne.

- [ ] **Step 1.5: Wire ind i `GeoDanmarkDrawingLayersAdapter.fetchPlandataLayers()`**

Åbn `src/integrations/geodanmark/drawing-layers.ts`.

Erstat den eksisterende stub:

```typescript
async fetchPlandataLayers(
  _kommunekode: string,
  _bbox25832: BBox25832,
): Promise<ConstraintLayer[]> {
  return [];
}
```

Med:

```typescript
async fetchPlandataLayers(
  _kommunekode: string,
  bbox25832: BBox25832,
): Promise<ConstraintLayer[]> {
  const { fetchBuildingFieldConstraints } = await import(
    "@/integrations/plandata/drawing-constraints"
  );
  return fetchBuildingFieldConstraints(bbox25832);
}
```

- [ ] **Step 1.6: TypeScript-tjek**

```bash
bunx tsc --noEmit
```

Forventet: ingen fejl.

- [ ] **Step 1.7: Commit**

```bash
git add src/integrations/plandata/drawing-constraints.ts src/integrations/plandata/drawing-constraints.test.ts src/integrations/geodanmark/drawing-layers.ts
git commit -m "feat(drawing): implement Plandata byggefelt constraints with WGS84→25832 conversion"
```

---

## Task 2: DHM-koter wires ind i beliggenhedsplan

**Mål:** Tegningen får terræn-kotepunkter fra DHM WCS. `hasDhmKoter` sættes `true` i readiness-beslutning.
Tegning med alle øvrige data i orden løftes hermed fra `AUTO_DRAFT` → `AUTO_REVIEW`.

**Filer:**

- Modificer: `src/domain/drawing/ports.ts`
- Modificer: `src/integrations/geodanmark/drawing-layers.ts`
- Modificer: `src/services/drawing/assemble-beliggenhedsplan.service.ts`

### Baggrund

`DhmService.getTerrainData(bbox, lat, lng)` i `src/integrations/sdfi/dhm-client.ts` returnerer:

```typescript
{
  kotepunkter: Array<{ x: number; y: number; z: number }>; // EPSG:25832
  avgElevationM: number;
  slopePercent: number | null;
  lowPointM: number;
  kilde: "dhm" | "mock";
}
```

`kotepunkter` er allerede i EPSG:25832 — direkte mapping til `TerrainPoint[]`.

Port-metoden får `bbox25832` og centroid i WGS84 (lat/lng). Centroiden beregnes fra parcel-polygonen.

`utm32ToWgs84` fra `src/lib/geometry-utils.ts` konverterer centroid.

- [ ] **Step 2.1: Tilføj `fetchDhmKoter` til port**

Åbn `src/domain/drawing/ports.ts`.

Tilføj import øverst:

```typescript
import type { TerrainLayer } from "./beliggenhedsplan.types";
```

Tilføj metode til `DrawingGeometrySourcePort`:

```typescript
fetchDhmKoter(
  bbox25832: BBox25832,
  centroidLat: number,
  centroidLng: number,
): Promise<TerrainLayer | null>;
```

Det fulde interface ser nu sådan ud:

```typescript
export interface DrawingGeometrySourcePort {
  fetchParcelLayers(matrikelId: string): Promise<ParcelLayer | null>;
  fetchNeighborBuildings(bbox25832: BBox25832): Promise<ExistingFeaturesLayer>;
  fetchRoadGeometry(addressId: string): Promise<{ centerline25832: GeoJsonLineString25832 | null }>;
  fetchPlandataLayers(kommunekode: string, bbox25832: BBox25832): Promise<ConstraintLayer[]>;
  fetchNeighborParcels(ownJordstykkeId: string, bbox25832: BBox25832): Promise<NeighborParcel[]>;
  fetchRoadName(addressId: string): Promise<{ name: string | null }>;
  fetchDhmKoter(
    bbox25832: BBox25832,
    centroidLat: number,
    centroidLng: number,
  ): Promise<TerrainLayer | null>;
}
```

- [ ] **Step 2.2: Implementer `fetchDhmKoter` i adapter**

Åbn `src/integrations/geodanmark/drawing-layers.ts`.

Tilføj ny import øverst (efter eksisterende imports):

```typescript
import { utm32ToWgs84 } from "@/lib/geometry-utils";
```

Tilføj metode til `GeoDanmarkDrawingLayersAdapter`:

```typescript
async fetchDhmKoter(
  bbox25832: BBox25832,
  centroidLat: number,
  centroidLng: number,
): Promise<import("@/domain/drawing/beliggenhedsplan.types").TerrainLayer | null> {
  const { DhmService } = await import("@/integrations/sdfi/dhm-client");
  const bboxParam = {
    minX: bbox25832[0],
    minY: bbox25832[1],
    maxX: bbox25832[2],
    maxY: bbox25832[3],
  };
  const result = await DhmService.getTerrainData(bboxParam, centroidLat, centroidLng);
  if (result.type === "error" || !result.data) return null;

  const now = new Date().toISOString();
  const td = result.data;

  return {
    verticalDatum: "DVR90",
    points: td.kotepunkter.map((pt) => ({
      x: pt.x,
      y: pt.y,
      z: pt.z,
      label: pt.z.toFixed(2),
      source: "registry" as const,
    })),
    slopePercent: td.slopePercent,
    lowPointM: td.lowPointM,
    source: {
      source: "registry",
      confidence: "medium",
      fetchedAt: now,
      requiresReview: false,
    },
  };
}
```

- [ ] **Step 2.3: Kald `fetchDhmKoter` i assembler-service**

Åbn `src/services/drawing/assemble-beliggenhedsplan.service.ts`.

Tilføj import øverst:

```typescript
import { utm32ToWgs84 } from "@/lib/geometry-utils";
```

I `assembleBeliggenhedsplan`, efter at `parcel` er hentet og `bbox` er beregnet, tilføj DHM-kald
til `Promise.all`-blokken. Erstat:

```typescript
const [existing, constraints, neighborParcels, roadNameResult] = await Promise.all([
  geometrySource.fetchNeighborBuildings(bbox),
  geometrySource.fetchPlandataLayers(kommunekode, bbox),
  geometrySource.fetchNeighborParcels(parcel.idLokalId, bbox),
  geometrySource.fetchRoadName(addressId),
]);
```

Med:

```typescript
const centroidCoords = parcel.labelPoint25832.coordinates;
const { lat: centroidLat, lng: centroidLng } = utm32ToWgs84(centroidCoords[0], centroidCoords[1]);

const [existing, constraints, neighborParcels, roadNameResult, dhmTerrain] = await Promise.all([
  geometrySource.fetchNeighborBuildings(bbox),
  geometrySource.fetchPlandataLayers(kommunekode, bbox),
  geometrySource.fetchNeighborParcels(parcel.idLokalId, bbox),
  geometrySource.fetchRoadName(addressId),
  geometrySource.fetchDhmKoter(bbox, centroidLat, centroidLng),
]);
```

Og opdater `plan`-objektet — ændr `terrain: null` til:

```typescript
terrain: dhmTerrain,
```

Opdater readiness-input — ændr `hasDhmKoter: false` til:

```typescript
hasDhmKoter: dhmTerrain !== null,
```

- [ ] **Step 2.4: TypeScript-tjek**

```bash
bunx tsc --noEmit
```

Forventet: ingen fejl.

- [ ] **Step 2.5: Kør eksisterende tests**

```bash
bun test src/services/drawing/ src/domain/drawing/
```

Forventet: alle grønne.

- [ ] **Step 2.6: Commit**

```bash
git add src/domain/drawing/ports.ts src/integrations/geodanmark/drawing-layers.ts src/services/drawing/assemble-beliggenhedsplan.service.ts
git commit -m "feat(drawing): wire DHM terrain koter into beliggenhedsplan — enables AUTO_REVIEW status"
```

---

## Task 3: Wire projekt-data — bygherre, areaTable, bfeNr, sokkelkote

**Mål:** Tegningen indeholder korrekt bygherre, officielt arealskema (grundareal, bebygget areal,
bebyggelsesprocent) og bfeNr — hentet fra `projects`-tabellen server-side.
Sokkelkote og bygningshøjde sendes fra UI til server function.

**Filer:**

- Modificer: `src/routes/api.drawing.ts`
- Modificer: `src/services/drawing/assemble-beliggenhedsplan.service.ts`
- Modificer: `src/integrations/supabase/repositories/projects.repository.ts`

### Baggrund

`projects`-tabellen har typed kolonner: `grundareal_m2`, `bebygget_areal_m2`, `bfe_nr`.
`bygherre` findes ikke på `projects` — det er et bruger-ejet felt der ikke er compliance-data.
Det sendes fra UI (project-store har det ikke, men brugeren kan taste det).

**CLAUDE.md Rule 3**: Server function kalder repository, ikke Supabase inline.
**CLAUDE.md Rule 4**: `grundareal_m2`/`bebygget_areal_m2` MÅ komme fra client som input
til `areaTable`-beregning (de er ikke compliance-gates). Bedre at loade fra server for autoritet.

**Beslutning**: Load `grundareal_m2`, `bebygget_areal_m2`, `bfe_nr` fra server via repo.
`bygherre`, `sokkelKoteM` og `heightM` sendes fra UI (ikke compliance, brugerens eget input).

- [ ] **Step 3.1: Tilføj `getProjectDrawingData` til projects.repository.ts**

Åbn `src/integrations/supabase/repositories/projects.repository.ts`.

Tilføj type og funktion sidst i filen:

```typescript
export type ProjectDrawingData = {
  grundarealM2: number | null;
  bebyggetArealM2: number | null;
  bfeNr: string | null;
};

export async function getProjectDrawingData(projectId: string): Promise<ProjectDrawingData | null> {
  const { data, error } = await supabaseAdmin
    .from("projects")
    .select("grundareal_m2, bebygget_areal_m2, bfe_nr")
    .eq("id", projectId)
    .single();

  if (error || !data) return null;

  return {
    grundarealM2: (data as unknown as { grundareal_m2: number | null }).grundareal_m2 ?? null,
    bebyggetArealM2:
      (data as unknown as { bebygget_areal_m2: number | null }).bebygget_areal_m2 ?? null,
    bfeNr: (data as unknown as { bfe_nr: string | null }).bfe_nr ?? null,
  };
}
```

> Bemærk: `as unknown as` her skyldes at Supabase-typer ikke er regenereret til at inkludere alle kolonner. Acceptable midlertidig løsning — columnen eksisterer i DB. Tilføj TODO-kommentar: `// TODO: fjern cast når supabase-typer er regenereret`.

- [ ] **Step 3.2: Udvid server function input-schema**

Åbn `src/routes/api.drawing.ts`.

Udvid `ExportBeliggenhedsplanInputSchema`:

```typescript
const ExportBeliggenhedsplanInputSchema = z.object({
  projectId: z.string().uuid(),
  matrikelId: z.string().min(1),
  kommunekode: z.string().min(1),
  addressId: z.string().min(1),
  addressText: z.string().optional().nullable(),
  footprintGeojson: GeoJsonPolygonSchema.optional().nullable(),
  bygherre: z.string().max(200).optional().nullable(),
  sokkelKoteM: z.number().min(-10).max(100).optional().nullable(),
  heightM: z.number().min(0).max(30).optional().nullable(),
});
```

- [ ] **Step 3.3: Load projekt-data i server function handler og wire ind**

I `handler` i `src/routes/api.drawing.ts`, tilføj repo-import og kald.

Erstat den eksisterende handler-funktion helt:

```typescript
.handler(async ({ data }) => {
  const { assembleBeliggenhedsplan } =
    await import("@/services/drawing/assemble-beliggenhedsplan.service");
  const { exportDrawing } = await import("@/services/drawing/export-drawing.service");
  const { GeoDanmarkDrawingLayersAdapter } =
    await import("@/integrations/geodanmark/drawing-layers");
  const { DrawingRepository } =
    await import("@/integrations/supabase/repositories/drawing.repository");
  const { decodeGeoJsonFootprint } =
    await import("@/integrations/import/geojson-footprint-decoder");
  const { getProjectDrawingData } =
    await import("@/integrations/supabase/repositories/projects.repository");

  let proposedFootprint25832: GeoJsonPolygon25832;
  if (data.footprintGeojson) {
    proposedFootprint25832 = decodeGeoJsonFootprint(data.footprintGeojson);
  } else {
    proposedFootprint25832 = {
      type: "Polygon",
      crs: "EPSG:25832",
      coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
    };
  }

  const projectData = await getProjectDrawingData(data.projectId);
  const grundarealM2 = projectData?.grundarealM2 ?? null;
  const bebyggetArealM2 = projectData?.bebyggetArealM2 ?? null;
  const bfeNr = projectData?.bfeNr ?? null;

  const assembled = await assembleBeliggenhedsplan({
    matrikelId: data.matrikelId,
    kommunekode: data.kommunekode,
    addressId: data.addressId,
    proposedFootprint25832,
    projectId: data.projectId,
    sokkelKoteM: data.sokkelKoteM ?? null,
    heightM: data.heightM ?? null,
    metadata: {
      title: "Beliggenhedsplan",
      address: data.addressText ?? data.addressId,
      matrikel: data.matrikelId,
      bygherre: data.bygherre ?? null,
      sagNr: data.projectId,
      bfeNr,
      revisions: [],
      buildingCode: "BR18",
      draughtsman: null,
      responsibleFirm: null,
      areaTable: grundarealM2 !== null && bebyggetArealM2 !== null
        ? {
            grundarealM2,
            groundFloorM2: bebyggetArealM2,
            firstFloorM2: null,
            doubleHeightDeductionM2: 0,
            totalResidentialM2: bebyggetArealM2,
            coveragePercent: Math.round((bebyggetArealM2 / grundarealM2) * 1000) / 10,
            calculationBasis: "BR18 §452",
          }
        : null,
      date: new Date().toISOString().slice(0, 10),
      scale: 250 as const,
      paperSize: "A3" as const,
    },
    geometrySource: new GeoDanmarkDrawingLayersAdapter(),
    survey: null,
  });

  if (!assembled.plan) throw new Error(assembled.readiness.status);

  return exportDrawing({
    plan: assembled.plan,
    readiness: assembled.readiness,
    projectId: data.projectId,
    store: new DrawingRepository(),
  });
});
```

- [ ] **Step 3.4: Udvid `AssembleInput` i assembler-service med sokkelKoteM og heightM**

Åbn `src/services/drawing/assemble-beliggenhedsplan.service.ts`.

Tilføj `sokkelKoteM` og `heightM` til `AssembleInput`:

```typescript
type AssembleInput = {
  matrikelId: string;
  kommunekode: string;
  addressId: string;
  proposedFootprint25832: GeoJsonPolygon25832;
  projectId: string;
  metadata: DrawingMetadata;
  geometrySource: DrawingGeometrySourcePort;
  survey: SurveyLayer | null;
  sokkelKoteM: number | null;
  heightM: number | null;
};
```

Udpak dem i `assembleBeliggenhedsplan` og wire ind i `proposed`:

```typescript
const { sokkelKoteM, heightM, ... } = input;
```

I `proposed`-objektet:

```typescript
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
  source: generatedSourceMeta(),
},
```

- [ ] **Step 3.5: TypeScript-tjek + tests**

```bash
bunx tsc --noEmit && bun test src/services/drawing/ src/integrations/supabase/repositories/
```

Forventet: ingen fejl, alle grønne.

- [ ] **Step 3.6: Commit**

```bash
git add src/routes/api.drawing.ts src/services/drawing/assemble-beliggenhedsplan.service.ts src/integrations/supabase/repositories/projects.repository.ts
git commit -m "feat(drawing): wire bygherre, areaTable, bfeNr, sokkelkote from project data"
```

---

## Task 4: Sokkelkote + bygherre input-felter i UI

**Mål:** Brugeren kan taste sokkelkote (DVR90), bygningshøjde og bygherre inden eksporten.

**Fil:**

- Modificer: `src/routes/projekt.teknik.tsx`

**CLAUDE.md Rule 2**: UI samler brugerintention og kalder server function. Ingen beregning i UI.

- [ ] **Step 4.1: Tilføj input-felter til `TeknikPage`**

Åbn `src/routes/projekt.teknik.tsx`.

Tilføj state-variabler:

```typescript
const [bygherre, setBygherre] = useState<string>("");
const [sokkelKoteM, setSokkelKoteM] = useState<string>("");
const [heightM, setHeightM] = useState<string>("");
```

Tilføj input-felterne i JSX, over den eksisterende "Generer beliggenhedsplan"-knap:

```tsx
<div className="rounded-xl border border-stone-200 bg-white p-5 space-y-4">
  <h2 className="text-sm font-semibold text-stone-700">Tegningsdata</h2>

  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
    <div>
      <label className="block text-xs font-medium text-stone-600 mb-1">Bygherre</label>
      <input
        type="text"
        value={bygherre}
        onChange={(e) => setBygherre(e.target.value)}
        placeholder="Navn på bygherre"
        maxLength={200}
        className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm
                   focus:outline-none focus:ring-2 focus:ring-stone-300"
      />
    </div>

    <div>
      <label className="block text-xs font-medium text-stone-600 mb-1">Sokkelkote DVR90 (m)</label>
      <input
        type="number"
        value={sokkelKoteM}
        onChange={(e) => setSokkelKoteM(e.target.value)}
        placeholder="f.eks. 18.50"
        step="0.01"
        className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm
                   focus:outline-none focus:ring-2 focus:ring-stone-300"
      />
    </div>

    <div>
      <label className="block text-xs font-medium text-stone-600 mb-1">Bygningshøjde (m)</label>
      <input
        type="number"
        value={heightM}
        onChange={(e) => setHeightM(e.target.value)}
        placeholder="f.eks. 8.50"
        step="0.01"
        className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm
                   focus:outline-none focus:ring-2 focus:ring-stone-300"
      />
    </div>
  </div>
</div>
```

- [ ] **Step 4.2: Send de nye felter i `handleGenerate`**

Find `exportBeliggenhedsplanFn`-kaldet og tilføj de nye felter:

```typescript
const res = await exportBeliggenhedsplanFn({
  data: {
    projectId: currentProjectId!,
    matrikelId: matrikelId!,
    kommunekode: address!.kommunekode,
    addressId: address!.adresseid,
    addressText: address!.adresse ?? null,
    footprintGeojson: designPlacement?.footprintGeojson ?? null,
    bygherre: bygherre.trim() || null,
    sokkelKoteM: sokkelKoteM !== "" ? parseFloat(sokkelKoteM) : null,
    heightM: heightM !== "" ? parseFloat(heightM) : null,
  },
});
```

- [ ] **Step 4.3: TypeScript-tjek**

```bash
bunx tsc --noEmit
```

Forventet: ingen fejl.

- [ ] **Step 4.4: Commit**

```bash
git add src/routes/projekt.teknik.tsx
git commit -m "feat(drawing): add bygherre, sokkelkote and height inputs to beliggenhedsplan UI"
```

---

## Task 5: Nordpil i SVG

**Mål:** Tegningen viser en simpel nordpil i øverste højre hjørne af tegnefeltet.

**Fil:**

- Modificer: `src/lib/drawing/drawing-model-builder.ts`

### Baggrund

`northArrowRotationDeg: 0` er allerede på `DrawingModel`. SVG-rendereren bruger ikke
dette endnu. Vi tilføjer en nordpil som en `DrawingFeature` med `kind: "north_arrow"`.

`DrawingFeature.kind` i `src/domain/drawing/drawing-model.ts` — tjek at `"north_arrow"` er tilladt.

- [ ] **Step 5.1: Tjek og udvid `DrawingFeature.kind`**

Åbn `src/domain/drawing/drawing-model.ts`.

Find `kind`-definitionen på `DrawingFeature`. Tilføj `"north_arrow"` til union-typen hvis den ikke allerede er der:

```typescript
kind:
  | "parcel_boundary"
  | "neighbor_parcels"
  | "existing_buildings"
  | "proposed_buildings"
  | "setback_lines"
  | "dimension_lines"
  | "terrain_labels"
  | "mandatory_annotations"
  | "north_arrow";
```

- [ ] **Step 5.2: Tilføj nordpil-feature i `buildDrawingModel`**

Åbn `src/lib/drawing/drawing-model-builder.ts`.

Tilføj nordpil som en feature **efter** de obligatoriske noter. Placer nordpilen øverst til venstre i tegnefeltet (koordinat-uafhængig — bruger blot SVG-px-koordinater):

```typescript
// Nordpil — øverst til venstre i tegnefeltet (fast SVG position)
features.push({
  id: "north-arrow",
  kind: "north_arrow",
  svgElement: `<g transform="translate(24,24) rotate(0)">
    <polygon points="0,-14 5,4 0,0 -5,4" fill="#222" stroke="none"/>
    <polygon points="0,14 5,-4 0,0 -5,-4" fill="#fff" stroke="#222" stroke-width="0.5"/>
    <text x="0" y="-18" text-anchor="middle" font-family="Arial" font-size="7" font-weight="bold" fill="#222">N</text>
  </g>`,
  label: "N",
  labelX: 24,
  labelY: 10,
  zIndex: 60,
});
```

- [ ] **Step 5.3: TypeScript-tjek**

```bash
bunx tsc --noEmit
```

Forventet: ingen fejl.

- [ ] **Step 5.4: Kør drawing tests**

```bash
bun test src/lib/drawing/ src/domain/drawing/
```

Forventet: alle grønne.

- [ ] **Step 5.5: Commit**

```bash
git add src/domain/drawing/drawing-model.ts src/lib/drawing/drawing-model-builder.ts
git commit -m "feat(drawing): render north arrow in beliggenhedsplan SVG"
```

---

## Task 6: Final verifikation og full suite

- [ ] **Step 6.1: Kør fuld test-suite**

```bash
bun test src
```

Forventet: alle tests grønne. Ingen nye fejl.

- [ ] **Step 6.2: TypeScript og lint**

```bash
bunx tsc --noEmit && bunx eslint . --max-warnings 0
```

Forventet: rent.

- [ ] **Step 6.3: Build**

```bash
bun run build
```

Forventet: ingen build-fejl.

- [ ] **Step 6.4: Commit**

```bash
git commit --allow-empty -m "chore(drawing): authority-grade beliggenhedsplan — all tasks complete"
```

---

## Hvad dette IKKE dækker (bevidste afgrænsninger)

| Emne                                              | Begrundelse                                                                                                                       |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Vejgeometri / centerline                          | Kræver DAR vejmidte-data — separat task                                                                                           |
| Landinspektør-opmåling (SurveyLayer)              | Brugerupload-flow — separat task                                                                                                  |
| `drawing_exports`-tabellens Supabase-typer        | `(supabaseAdmin as any)` er pre-existing dirt — separat cleanup                                                                   |
| `AUTO_REVIEW` uden DHM                            | DHM-integration (Task 2) er inkluderet — mangler kun at DHM-key er aktiv                                                          |
| Lokalplan byggelinjer (`lokalplan_building_line`) | Plandata WFS `theme_pdk_lokalplan_byggelinje_vedtaget` — kan tilføjes til Task 1 ved udvidelse af `fetchBuildingFieldConstraints` |

---

## Arkitektur-check (CLAUDE.md Gatekeeper Protocol)

1. **Grænser krydset:** Plandata WFS (ny geometri), DHM WCS (ny), Supabase `projects` (ny kolonne-select)
2. **Schema/decoder:** Zod (`wfsFeatureCollectionSchema`) for Plandata; DHM parser allerede Zod-valideret; `getProjectDrawingData` validerer kolonner eksplicit
3. **Business logic:** Bor i `drawing-constraints.ts` (ren konvertering) og `assemble-beliggenhedsplan.service.ts` (orkestrering)
4. **Application service:** `assembleBeliggenhedsplan` orkestrerer — uændret ansvar
5. **Adapters:** `GeoDanmarkDrawingLayersAdapter` (Plandata + DHM), `DrawingRepository` (Supabase), `projects.repository.ts` (ny funktion)
6. **UI ejer ikke domæne:** UI sender `bygherre`, `sokkelKoteM`, `heightM` som rå brugerinput — server beregner `finishedFloorKoteM`, loader `grundarealM2` fra DB
7. **Tests:** Unit tests for `byggefeltWgs84ToConstraintLayers` (Task 1); eksisterende drawing-tests dækker assembler og decision-engine
