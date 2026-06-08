# Beliggenhedsplan Authority-Grade — Phase 2: Data Adapters

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Prerequisite:** Phase 1 complete and merged. All types, schemas, and port interface in place.

**Goal:** Implement real data fetches for vejgeometri, naturbeskyttelse, LER, kloakopland, fjernvarme — cache results in `address_source_results` — expose via two new server functions.

**Architecture:** Five new adapter files implement the `DrawingGeometrySourcePort` methods. A new application service `handleFetchSiteGeometry` orchestrates them. Two thin server functions expose the data. Cache uses `address_source_results` table with five new `source_kind` values.

**Tech Stack:** TypeScript, Zod, Supabase, WFS/REST adapters, bun:test (Tier 2 with fakes).

**Spec:** `docs/superpowers/specs/2026-06-06-beliggenhedsplan-authority-grade-design.md` sections 4–5

---

### Task 11: Implement real vejgeometri fetch

**Context — read these files first:**

- `src/integrations/geodanmark/drawing-layers.ts` (full file — note existing WFS patterns)
- `src/domain/drawing/ports.ts` (for `DrawingGeometrySourcePort.fetchRoadGeometry` signature)
- `src/domain/drawing/beliggenhedsplan.types.ts` (for `VejLayer`, `BBox25832`)
- `src/domain/drawing/beliggenhedsplan.schemas.ts` (for `VejLayerSchema`)
- `src/lib/env.ts` (to find `DATAFORSYNINGEN_TOKEN` env var — use it for WFS auth)

**Files:**

- Create: `src/integrations/geodanmark/wfs-client.ts`
- Modify: `src/integrations/geodanmark/drawing-layers.ts`

- [ ] **Step 1: Create generic GeoDanmark WFS helper**

```typescript
// src/integrations/geodanmark/wfs-client.ts
// Generic WFS 2.0 GetFeature client for Dataforsyningen endpoints.
// Auth: ?token=<DATAFORSYNINGEN_TOKEN> query param.

import { env } from "@/lib/env";

export type WfsFeature = {
  type: "Feature";
  geometry: unknown;
  properties: Record<string, unknown>;
};

export type WfsFeatureCollection = {
  type: "FeatureCollection";
  features: WfsFeature[];
};

const WFS_BASE = "https://api.dataforsyningen.dk/wfs";

export async function fetchWfsFeatures(params: {
  service: string; // e.g. "GeoDanmarkVektor"
  typeName: string; // e.g. "vejmidte"
  bbox: [number, number, number, number];
  bboxSrs?: string; // default "EPSG:25832"
  maxFeatures?: number;
}): Promise<WfsFeature[]> {
  const { service, typeName, bbox, bboxSrs = "EPSG:25832", maxFeatures = 200 } = params;
  const token = env.DATAFORSYNINGEN_TOKEN;

  const url = new URL(`${WFS_BASE}/${service}`);
  url.searchParams.set("service", "WFS");
  url.searchParams.set("version", "2.0.0");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("typeName", typeName);
  url.searchParams.set("outputFormat", "application/json");
  url.searchParams.set("bbox", `${bbox.join(",")},${bboxSrs}`);
  url.searchParams.set("count", String(maxFeatures));
  url.searchParams.set("token", token);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`WFS ${service}/${typeName} failed: ${res.status}`);

  const json = (await res.json()) as WfsFeatureCollection;
  return json.features ?? [];
}
```

- [ ] **Step 2: Implement `fetchRoadGeometry` in `drawing-layers.ts`**

Replace the stub `fetchRoadGeometry` method in `GeoDanmarkDrawingLayersAdapter`:

```typescript
async fetchRoadGeometry(addressId: string, bbox25832: BBox25832): Promise<VejLayer | null> {
  // Expand bbox by 50m to capture road just outside parcel
  const expandedBbox: BBox25832 = [
    bbox25832[0] - 50,
    bbox25832[1] - 50,
    bbox25832[2] + 50,
    bbox25832[3] + 50,
  ];

  const roadNameResult = await this.fetchRoadName(addressId);
  const vejnavn = roadNameResult.name ?? "Ukendt vej";

  let centerline25832: import("@/domain/drawing/beliggenhedsplan.types").GeoJsonLineString25832 | null = null;
  let vejkant25832: import("@/domain/drawing/beliggenhedsplan.types").GeoJsonLineString25832 | null = null;
  let vejbreddeM: number | null = null;

  try {
    const { fetchWfsFeatures } = await import("./wfs-client");

    const [midtFeatures, kantFeatures] = await Promise.all([
      fetchWfsFeatures({
        service: "GeoDanmarkVektor",
        typeName: "vejmidte",
        bbox: expandedBbox,
      }),
      fetchWfsFeatures({
        service: "GeoDanmarkVektor",
        typeName: "vejkant",
        bbox: expandedBbox,
      }),
    ]);

    const midtFeature = midtFeatures[0];
    if (midtFeature?.geometry && (midtFeature.geometry as { type: string }).type === "LineString") {
      const g = midtFeature.geometry as { type: string; coordinates: [number, number][] };
      centerline25832 = { type: "LineString", crs: "EPSG:25832", coordinates: g.coordinates };
    }

    const kantFeature = kantFeatures[0];
    if (kantFeature?.geometry && (kantFeature.geometry as { type: string }).type === "LineString") {
      const g = kantFeature.geometry as { type: string; coordinates: [number, number][] };
      vejkant25832 = { type: "LineString", crs: "EPSG:25832", coordinates: g.coordinates };
    }

    // Estimate road width from two kant features if available
    if (kantFeatures.length >= 2) {
      const k1 = kantFeatures[0]!.geometry as { coordinates: [number, number][] };
      const k2 = kantFeatures[1]!.geometry as { coordinates: [number, number][] };
      if (k1.coordinates[0] && k2.coordinates[0]) {
        const dx = k1.coordinates[0][0] - k2.coordinates[0][0];
        const dy = k1.coordinates[0][1] - k2.coordinates[0][1];
        vejbreddeM = Math.round(Math.sqrt(dx * dx + dy * dy) * 10) / 10;
      }
    }
  } catch {
    // Network failure → return vejnavn-only result (not null — we still have a name)
  }

  const now = new Date().toISOString();
  return {
    vejnavn,
    centerline25832,
    vejkant25832,
    vejbreddeM,
    source: {
      source: "registry",
      confidence: centerline25832 ? "medium" : "low",
      fetchedAt: now,
      requiresReview: centerline25832 === null,
    },
  };
}
```

Also add `VejLayer` to the import from `@/domain/drawing/beliggenhedsplan.types` at the top of `drawing-layers.ts`.

- [ ] **Step 3: TypeScript check**

```bash
bunx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/integrations/geodanmark/wfs-client.ts \
        src/integrations/geodanmark/drawing-layers.ts
git commit -m "feat(geodanmark): implement real fetchRoadGeometry via GeoDanmark WFS vejmidte/vejkant"
```

---

### Task 12: Naturbeskyttelse adapter

> **2026-06-07 source-spike correction:** Do not implement this task's MIM
> `/natur` candidate as-is. Live `GetCapabilities` showed that
> `https://wfs2-miljoegis.mim.dk/natur` does not expose the five required
> protection-line feature types. Use the verified source matrix in
> `docs/superpowers/plans/2026-06-07-naturbeskyttelse-authority-grade-source-plan.md`
> instead: Danmarks Miljoeportal GeoServer for skov/aa/soe, SLKS WFS for
> fortidsmindebeskyttelse, and Datafordeler MAT WFS for strand/klit after
> credential verification.

**Context — read these files first:**

- `src/integrations/geodanmark/wfs-client.ts` (just created — reuse pattern)
- `src/domain/drawing/beliggenhedsplan.types.ts` (for `NaturbeskyttelseLayer`, `NaturbeskyttelseType`)
- `src/domain/drawing/beliggenhedsplan.schemas.ts` (for `NaturbeskyttelseLayerSchema`)
- `src/domain/drawing/geometry-engine.ts` (for `polygonsIntersect`)
- `src/domain/drawing/ports.ts` (for `DrawingGeometrySourcePort.fetchNaturbeskyttelse` signature)
- `src/integrations/geodanmark/drawing-layers.ts` (to know where to add the method)

**Files:**

- Create: `src/integrations/miljoeportalen/naturbeskyttelse-adapter.ts`
- Modify: `src/integrations/geodanmark/drawing-layers.ts`

- [ ] **Step 1: Create Miljøportalen adapter**

```typescript
// src/integrations/miljoeportalen/naturbeskyttelse-adapter.ts
// Fetches nature-protection lines/zones from Miljøstyrelsen WFS.
//
// SERVICE NOTE: Verify the WFS endpoint before running in production.
// Candidate: https://wfs2-miljoegis.mim.dk/natur (Miljøstyrelsen)
// Feature types to try: strandbeskyttelseslinje, skovbyggelinje,
//   aabeskyttelseslinje, fortidsmindebeskyttelseslinje, klitfredning
//
// Each type wrapped in try/catch — failure on one type does NOT block others.

import type {
  NaturbeskyttelseLayer,
  NaturbeskyttelseType,
  BBox25832,
  GeoJsonPolygon25832,
} from "@/domain/drawing/beliggenhedsplan.types";
import type { LayerSourceMeta } from "@/domain/drawing/beliggenhedsplan.types";

const NATUR_WFS_BASE = "https://wfs2-miljoegis.mim.dk/natur";

const BUFFER_DISTANCES: Record<NaturbeskyttelseType, number> = {
  strandbeskyttelse: 300,
  skovbyggelinje: 300,
  åbeskyttelse: 150,
  fortidsmindebeskyttelse: 100,
  klitfredning: 0, // variable — use geometry as-is
};

const WFS_TYPE_NAMES: Record<NaturbeskyttelseType, string> = {
  strandbeskyttelse: "strandbeskyttelseslinje",
  skovbyggelinje: "skovbyggelinje",
  åbeskyttelse: "aabeskyttelseslinje",
  fortidsmindebeskyttelse: "fortidsmindebeskyttelseslinje",
  klitfredning: "klitfredning",
};

async function fetchOneType(
  type: NaturbeskyttelseType,
  bbox: BBox25832,
  proposedFootprint: GeoJsonPolygon25832 | null,
): Promise<NaturbeskyttelseLayer[]> {
  const url = new URL(NATUR_WFS_BASE);
  url.searchParams.set("service", "WFS");
  url.searchParams.set("version", "2.0.0");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("typeName", WFS_TYPE_NAMES[type]);
  url.searchParams.set("outputFormat", "application/json");
  url.searchParams.set("bbox", `${bbox.join(",")},EPSG:25832`);
  url.searchParams.set("count", "50");

  const res = await fetch(url.toString());
  if (!res.ok) return [];

  const json = (await res.json()) as { features?: Array<{ geometry: unknown }> };
  const features = json.features ?? [];

  const { polygonsIntersect } = await import("@/domain/drawing/geometry-engine");
  const now = new Date().toISOString();
  const source: LayerSourceMeta = {
    source: "registry",
    confidence: "medium",
    fetchedAt: now,
    requiresReview: true,
  };

  return features
    .filter((f) => f.geometry != null)
    .map((f): NaturbeskyttelseLayer => {
      const geom = f.geometry as { type: string; coordinates: unknown };
      // Normalize to our typed geometry
      const geometry25832 =
        geom.type === "Polygon"
          ? {
              type: "Polygon" as const,
              crs: "EPSG:25832" as const,
              coordinates: geom.coordinates as [number, number][][],
            }
          : {
              type: "LineString" as const,
              crs: "EPSG:25832" as const,
              coordinates: geom.coordinates as [number, number][],
            };

      let intersectsProposedBuilding = false;
      if (proposedFootprint && geometry25832.type === "Polygon") {
        try {
          intersectsProposedBuilding = polygonsIntersect(
            proposedFootprint,
            geometry25832 as GeoJsonPolygon25832,
          );
        } catch {
          // jsts parse error on malformed geometry — safe default
        }
      }

      return {
        type,
        geometry25832,
        bufferDistanceM: BUFFER_DISTANCES[type],
        intersectsProposedBuilding,
        source,
      };
    });
}

export async function fetchNaturbeskyttelseLayers(
  bbox: BBox25832,
  proposedFootprint: GeoJsonPolygon25832 | null = null,
): Promise<NaturbeskyttelseLayer[]> {
  const types: NaturbeskyttelseType[] = [
    "strandbeskyttelse",
    "skovbyggelinje",
    "åbeskyttelse",
    "fortidsmindebeskyttelse",
    "klitfredning",
  ];

  const results = await Promise.allSettled(
    types.map((t) => fetchOneType(t, bbox, proposedFootprint)),
  );

  return results
    .filter((r): r is PromiseFulfilledResult<NaturbeskyttelseLayer[]> => r.status === "fulfilled")
    .flatMap((r) => r.value);
}
```

- [ ] **Step 2: Wire into `GeoDanmarkDrawingLayersAdapter`**

Replace the `fetchNaturbeskyttelse` stub in `drawing-layers.ts`:

```typescript
async fetchNaturbeskyttelse(bbox25832: BBox25832): Promise<NaturbeskyttelseLayer[]> {
  try {
    const { fetchNaturbeskyttelseLayers } = await import(
      "@/integrations/miljoeportalen/naturbeskyttelse-adapter"
    );
    return fetchNaturbeskyttelseLayers(bbox25832, null);
  } catch {
    return [];
  }
}
```

- [ ] **Step 3: TypeScript check**

```bash
bunx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/integrations/miljoeportalen/naturbeskyttelse-adapter.ts \
        src/integrations/geodanmark/drawing-layers.ts
git commit -m "feat(miljoeportalen): add naturbeskyttelse WFS adapter (5 nature protection types)"
```

---

### Task 13: LER adapter

**Context — read these files first:**

- `src/domain/drawing/beliggenhedsplan.types.ts` (for `LerLedning`, `LerLedningType`)
- `src/domain/drawing/beliggenhedsplan.schemas.ts` (for `LerLedningSchema`)

**Files:**

- Create: `src/integrations/ler/ler-adapter.ts`
- Modify: `src/integrations/geodanmark/drawing-layers.ts`

- [ ] **Step 1: Create LER adapter**

```typescript
// src/integrations/ler/ler-adapter.ts
// Fetches utility line (ledning) data from LER 2.0 (Ledningsejerregistret).
//
// SERVICE NOTE: Verify endpoint before production use.
// Candidate: https://lerdataservices.dk/api/v1/  or  https://ler.forsyningstilsynet.dk/
// The bbox query should return primary network (primærnet) only.
// Stikledninger (house connections) are NOT available in any public register.
//
// LER 2.0 may require registration — check current auth requirements.

import type {
  LerLedning,
  LerLedningType,
  BBox25832,
} from "@/domain/drawing/beliggenhedsplan.types";

// Map from LER type codes to our domain type
const LER_TYPE_MAP: Record<string, LerLedningType> = {
  spildevand: "kloak_spildevand",
  regnvand: "kloak_regnvand",
  faelleskloak: "kloak_faelles",
  vand: "vand",
  el: "el",
  naturgas: "naturgas",
  fjernvarme: "fjernvarme",
  telekommunikation: "telekom",
};

function mapLerType(raw: string | null): LerLedningType | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  for (const [key, val] of Object.entries(LER_TYPE_MAP)) {
    if (lower.includes(key)) return val;
  }
  return null;
}

// Candidate LER REST endpoint — verify and update before production
const LER_API_BASE = "https://lerdataservices.dk/api/v1";

export async function fetchLerLedninger(bbox: BBox25832): Promise<LerLedning[]> {
  try {
    const bboxParam = bbox.join(",");
    const url = `${LER_API_BASE}/ledninger?bbox=${bboxParam}&srs=EPSG:25832&format=geojson`;

    const res = await fetch(url);
    if (!res.ok) return [];

    const json = (await res.json()) as {
      features?: Array<{
        geometry: { type: string; coordinates: [number, number][] };
        properties: Record<string, unknown>;
      }>;
    };

    const now = new Date().toISOString();

    return (json.features ?? [])
      .filter((f) => f.geometry?.type === "LineString")
      .map((f): LerLedning | null => {
        const rawType = f.properties["ledningstype"] as string | undefined;
        const mappedType = mapLerType(rawType ?? null);
        if (!mappedType) return null;

        return {
          type: mappedType,
          geometry25832: {
            type: "LineString",
            crs: "EPSG:25832",
            coordinates: f.geometry.coordinates,
          },
          ejer: (f.properties["ejer"] as string | undefined) ?? null,
          dybdeM: (f.properties["dybde"] as number | undefined) ?? null,
          diameterMm: (f.properties["diameter_mm"] as number | undefined) ?? null,
          source: {
            source: "registry",
            confidence: "medium",
            fetchedAt: now,
            requiresReview: true,
          },
        };
      })
      .filter((l): l is LerLedning => l !== null);
  } catch {
    return [];
  }
}
```

- [ ] **Step 2: Wire into adapter**

Replace `fetchLerLedninger` stub in `drawing-layers.ts`:

```typescript
async fetchLerLedninger(bbox25832: BBox25832): Promise<LerLedning[]> {
  const { fetchLerLedninger } = await import("@/integrations/ler/ler-adapter");
  return fetchLerLedninger(bbox25832);
}
```

- [ ] **Step 3: TypeScript check + commit**

```bash
bunx tsc --noEmit
git add src/integrations/ler/ler-adapter.ts \
        src/integrations/geodanmark/drawing-layers.ts
git commit -m "feat(ler): add LER 2.0 adapter for utility lines (primærnet)"
```

---

### Task 14: Kloakopland adapter

**Context — read these files first:**

- `src/domain/drawing/ports.ts` (for `fetchKloakopland` signature)

**Files:**

- Create: `src/integrations/plandata/kloakopland-adapter.ts`
- Modify: `src/integrations/geodanmark/drawing-layers.ts`

- [ ] **Step 1: Create kloakopland adapter**

```typescript
// src/integrations/plandata/kloakopland-adapter.ts
// Resolves kloakopland type (separat/faelles) for a location.
//
// Strategy:
//   Layer 1: Plandata WFS — spildevandsplan layer (where available)
//   Layer 2: Return null (municipal endpoint mapping is a future enhancement)
//
// SERVICE NOTE: Verify Plandata WFS typename for spildevandsplan.
// Candidate: Plandata OGC API / WFS with typename "spildevandsplan_opland"

import { env } from "@/lib/env";
import type { BBox25832 } from "@/domain/drawing/beliggenhedsplan.types";

const PLANDATA_WFS = "https://plandata.dk/geoserver/wfs";

export async function fetchKloakopland(
  _kommunekode: string,
  bbox: BBox25832,
): Promise<"separat" | "faelles" | null> {
  try {
    const token = env.DATAFORSYNINGEN_TOKEN;
    const url = new URL(PLANDATA_WFS);
    url.searchParams.set("service", "WFS");
    url.searchParams.set("version", "2.0.0");
    url.searchParams.set("request", "GetFeature");
    url.searchParams.set("typeName", "spildevandsplan_opland");
    url.searchParams.set("outputFormat", "application/json");
    url.searchParams.set("bbox", `${bbox.join(",")},EPSG:25832`);
    url.searchParams.set("count", "5");
    url.searchParams.set("token", token);

    const res = await fetch(url.toString());
    if (!res.ok) return null;

    const json = (await res.json()) as {
      features?: Array<{ properties: Record<string, unknown> }>;
    };

    const feature = json.features?.[0];
    if (!feature) return null;

    const kloaktype = feature.properties["kloaktype"] as string | undefined;
    if (!kloaktype) return null;

    const lower = kloaktype.toLowerCase();
    if (lower.includes("separat")) return "separat";
    if (lower.includes("fælles") || lower.includes("faelles")) return "faelles";

    return null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Wire into adapter**

Replace stub in `drawing-layers.ts`:

```typescript
async fetchKloakopland(kommunekode: string, bbox25832: BBox25832): Promise<"separat" | "faelles" | null> {
  const { fetchKloakopland } = await import("@/integrations/plandata/kloakopland-adapter");
  return fetchKloakopland(kommunekode, bbox25832);
}
```

- [ ] **Step 3: TypeScript check + commit**

```bash
bunx tsc --noEmit
git add src/integrations/plandata/kloakopland-adapter.ts \
        src/integrations/geodanmark/drawing-layers.ts
git commit -m "feat(plandata): add kloakopland adapter (separat/faelles from spildevandsplan WFS)"
```

---

### Task 15: Fjernvarme adapter

**Context — read these files first:**

- `src/domain/drawing/ports.ts` (for `fetchFjernvarmeDaekning` signature)

**Files:**

- Create: `src/integrations/energistyrelsen/fjernvarme-adapter.ts`
- Modify: `src/integrations/geodanmark/drawing-layers.ts`

- [ ] **Step 1: Create fjernvarme adapter**

```typescript
// src/integrations/energistyrelsen/fjernvarme-adapter.ts
// Resolves whether an address has fjernvarme coverage.
//
// SERVICE NOTE: Verify endpoint.
// Candidate: Energistyrelsens Energi Data Service (EDS) varmeplan API
// or Varmeplan Danmark. Fallback: return null (placeholder shown on drawing).
//
// For now this returns null (stub) — the adapter is wired but real
// endpoint requires API investigation. null → placeholder on drawing.

export async function fetchFjernvarmeDaekning(
  _centroidLat: number,
  _centroidLng: number,
): Promise<boolean | null> {
  // TODO: Implement when EDS/Varmeplan API endpoint is confirmed.
  // The drawing will show a placeholder annotation when this returns null.
  return null;
}
```

- [ ] **Step 2: Wire into adapter**

Replace stub in `drawing-layers.ts`:

```typescript
async fetchFjernvarmeDaekning(centroidLat: number, centroidLng: number): Promise<boolean | null> {
  const { fetchFjernvarmeDaekning } = await import(
    "@/integrations/energistyrelsen/fjernvarme-adapter"
  );
  return fetchFjernvarmeDaekning(centroidLat, centroidLng);
}
```

- [ ] **Step 3: TypeScript check + commit**

```bash
bunx tsc --noEmit
git add src/integrations/energistyrelsen/fjernvarme-adapter.ts \
        src/integrations/geodanmark/drawing-layers.ts
git commit -m "feat(adapters): add fjernvarme adapter stub (returns null → placeholder until EDS endpoint confirmed)"
```

---

### Task 16: handleFetchSiteGeometry service + cache

**Context — read these files first:**

- `src/domain/drawing/ports.ts` (for `DrawingGeometrySourcePort`)
- `src/domain/drawing/beliggenhedsplan.schemas.ts` (for `VejLayerSchema`, `NaturbeskyttelseLayerSchema`, `LerLedningSchema`)
- `supabase/migrations/20260519120000_address_source_results.sql` (for table schema — keyed by `address_id` + `source_kind`)
- `src/integrations/supabase/repositories/` (glob to find an example repository to follow for DB access pattern)

**Files:**

- Create: `src/services/drawing/fetch-site-geometry.service.ts`

- [ ] **Step 1: Read one existing repository for pattern**

Before writing, read `src/integrations/supabase/repositories/projects.repository.ts` to understand the Supabase client import pattern.

- [ ] **Step 2: Create the service**

```typescript
// src/services/drawing/fetch-site-geometry.service.ts
// Application service: fetch 5 site geometry sources in parallel, cache results
// in address_source_results. Called once per address at Matriklen phase.

import { z } from "zod";
import type { DrawingGeometrySourcePort } from "@/domain/drawing/ports";
import {
  VejLayerSchema,
  NaturbeskyttelseLayerSchema,
  LerLedningSchema,
} from "@/domain/drawing/beliggenhedsplan.schemas";
import type { BBox25832 } from "@/domain/drawing/beliggenhedsplan.types";

const KloakoplandPayloadSchema = z.object({
  type: z.enum(["separat", "faelles"]).nullable(),
});

const FjernvarmePayloadSchema = z.object({
  daekning: z.boolean().nullable(),
});

type FetchSiteGeometryInput = {
  addressId: string;
  matrikelId: string;
  kommunekode: string;
  bbox25832: BBox25832;
  centroidLat: number;
  centroidLng: number;
  geometrySource: DrawingGeometrySourcePort;
};

type FetchSiteGeometryResult = {
  status: "ok" | "partial";
  fetchedSources: string[];
  failedSources: string[];
};

const TTL_30_DAYS = 30 * 24 * 60 * 60 * 1000;

async function upsertCacheRow(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  addressId: string,
  sourceKind: string,
  payload: unknown,
): Promise<void> {
  const expiresAt = new Date(Date.now() + TTL_30_DAYS).toISOString();
  await supabase.from("address_source_results").upsert(
    {
      address_id: addressId,
      source_kind: sourceKind,
      status: "ok",
      confidence: "estimated",
      is_mock: false,
      payload,
      expires_at: expiresAt,
    },
    { onConflict: "address_id,source_kind" },
  );
}

export async function handleFetchSiteGeometry(
  input: FetchSiteGeometryInput,
): Promise<FetchSiteGeometryResult> {
  const { createSupabaseServerClient } = await import("@/integrations/supabase/server-client");
  const supabase = createSupabaseServerClient();

  const {
    addressId,
    matrikelId: _matrikelId,
    kommunekode,
    bbox25832,
    centroidLat,
    centroidLng,
    geometrySource,
  } = input;

  const [vejResult, naturResult, lerResult, kloakResult, fjernvarmeResult] =
    await Promise.allSettled([
      geometrySource.fetchRoadGeometry(addressId, bbox25832),
      geometrySource.fetchNaturbeskyttelse(bbox25832),
      geometrySource.fetchLerLedninger(bbox25832),
      geometrySource.fetchKloakopland(kommunekode, bbox25832),
      geometrySource.fetchFjernvarmeDaekning(centroidLat, centroidLng),
    ]);

  const fetchedSources: string[] = [];
  const failedSources: string[] = [];

  if (vejResult.status === "fulfilled") {
    const parsed =
      vejResult.value !== null
        ? VejLayerSchema.safeParse(vejResult.value)
        : { success: true, data: null };
    if (parsed.success) {
      await upsertCacheRow(supabase, addressId, "vej_geometry", parsed.data);
      fetchedSources.push("vej_geometry");
    } else {
      failedSources.push("vej_geometry");
    }
  } else {
    failedSources.push("vej_geometry");
  }

  if (naturResult.status === "fulfilled") {
    const parsed = z.array(NaturbeskyttelseLayerSchema).safeParse(naturResult.value);
    if (parsed.success) {
      await upsertCacheRow(supabase, addressId, "naturbeskyttelse", parsed.data);
      fetchedSources.push("naturbeskyttelse");
    } else {
      failedSources.push("naturbeskyttelse");
    }
  } else {
    failedSources.push("naturbeskyttelse");
  }

  if (lerResult.status === "fulfilled") {
    const parsed = z.array(LerLedningSchema).safeParse(lerResult.value);
    if (parsed.success) {
      await upsertCacheRow(supabase, addressId, "ler_ledninger", parsed.data);
      fetchedSources.push("ler_ledninger");
    } else {
      failedSources.push("ler_ledninger");
    }
  } else {
    failedSources.push("ler_ledninger");
  }

  if (kloakResult.status === "fulfilled") {
    const payload = { type: kloakResult.value };
    const parsed = KloakoplandPayloadSchema.safeParse(payload);
    if (parsed.success) {
      await upsertCacheRow(supabase, addressId, "kloakopland", parsed.data);
      fetchedSources.push("kloakopland");
    } else {
      failedSources.push("kloakopland");
    }
  } else {
    failedSources.push("kloakopland");
  }

  if (fjernvarmeResult.status === "fulfilled") {
    const payload = { daekning: fjernvarmeResult.value };
    const parsed = FjernvarmePayloadSchema.safeParse(payload);
    if (parsed.success) {
      await upsertCacheRow(supabase, addressId, "fjernvarme", parsed.data);
      fetchedSources.push("fjernvarme");
    } else {
      failedSources.push("fjernvarme");
    }
  } else {
    failedSources.push("fjernvarme");
  }

  return {
    status: failedSources.length === 0 ? "ok" : "partial",
    fetchedSources,
    failedSources,
  };
}
```

- [ ] **Step 3: TypeScript check + commit**

```bash
bunx tsc --noEmit
git add src/services/drawing/fetch-site-geometry.service.ts
git commit -m "feat(drawing): add handleFetchSiteGeometry orchestrator with cache writes to address_source_results"
```

---

### Task 17: api.site-geometry.ts server function

**Context — read these files first:**

- `src/routes/api.drawing.ts` (follow the thin server-function pattern exactly)
- `src/services/drawing/fetch-site-geometry.service.ts` (just created)

**Files:**

- Create: `src/routes/api.site-geometry.ts`

- [ ] **Step 1: Create server function**

```typescript
// src/routes/api.site-geometry.ts
// Thin server-function adapter: validate → auth → delegate to handleFetchSiteGeometry.

import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FetchSiteGeometryInputSchema = z.object({
  projectId: z.string().uuid(),
  addressId: z.string().min(1),
  matrikelId: z.string().min(1),
  kommunekode: z.string().min(1),
  bbox25832: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  centroidLat: z.number(),
  centroidLng: z.number(),
});

type FetchSiteGeometryInput = z.infer<typeof FetchSiteGeometryInputSchema>;

export const fetchSiteGeometryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: FetchSiteGeometryInput) => FetchSiteGeometryInputSchema.parse(data))
  .handler(async ({ data }) => {
    const { handleFetchSiteGeometry } =
      await import("@/services/drawing/fetch-site-geometry.service");
    const { GeoDanmarkDrawingLayersAdapter } =
      await import("@/integrations/geodanmark/drawing-layers");

    return handleFetchSiteGeometry({
      addressId: data.addressId,
      matrikelId: data.matrikelId,
      kommunekode: data.kommunekode,
      bbox25832: data.bbox25832,
      centroidLat: data.centroidLat,
      centroidLng: data.centroidLng,
      geometrySource: new GeoDanmarkDrawingLayersAdapter(),
    });
  });

function ApiSiteGeometryRoute() {
  return null;
}

export const Route = createFileRoute("/api/site-geometry")({
  component: ApiSiteGeometryRoute,
});
```

- [ ] **Step 2: TypeScript check + commit**

```bash
bunx tsc --noEmit
git add src/routes/api.site-geometry.ts
git commit -m "feat(api): add api.site-geometry.ts thin server function for site geometry caching"
```

---

### Task 18: api.drawing-readiness.ts server function

**Context — read these files first:**

- `src/routes/api.drawing.ts` (follow pattern)
- `src/domain/drawing/completeness-engine.ts` (for `computeDrawingCompleteness`, `CompletenessInput`)
- `src/integrations/supabase/repositories/projects.repository.ts` (to understand `getProjectDrawingData` — or find equivalent for reading the 5 new columns)
- `supabase/migrations/20260606200000_drawing_params.sql` (for column names: `tagform`, `taghaldning_grad`, `har_kaelder`, `kaelder_gulv_kote_m`, `har_jordvarme`)

**Files:**

- Create: `src/routes/api.drawing-readiness.ts`

- [ ] **Step 1: Add `getProjectDrawingParams` to projects.repository.ts**

Open `src/integrations/supabase/repositories/projects.repository.ts`. Add a new exported function that reads the 5 new columns alongside existing drawing data:

```typescript
export async function getProjectDrawingParams(projectId: string): Promise<{
  tagform: "sadeltag" | "fladt" | "mansard" | "pulttag" | null;
  taghaldningGrad: number | null;
  harKælder: boolean;
  kælderGulvKoteM: number | null;
  harJordvarme: boolean;
  sokkelKoteM: number | null;
  grundarealM2: number | null;
} | null> {
  const { createSupabaseServerClient } = await import("@/integrations/supabase/server-client");
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("projects")
    .select(
      "tagform, taghaldning_grad, har_kaelder, kaelder_gulv_kote_m, har_jordvarme, sokkelkote_m, grundareal_m2",
    )
    .eq("id", projectId)
    .single();

  if (error || !data) return null;

  const validTagforms = ["sadeltag", "fladt", "mansard", "pulttag"] as const;
  const rawTagform = data.tagform as string | null;
  const tagform = validTagforms.includes(rawTagform as (typeof validTagforms)[number])
    ? (rawTagform as (typeof validTagforms)[number])
    : null;

  return {
    tagform,
    taghaldningGrad: data.taghaldning_grad ?? null,
    harKælder: data.har_kaelder ?? false,
    kælderGulvKoteM: data.kaelder_gulv_kote_m ?? null,
    harJordvarme: data.har_jordvarme ?? false,
    sokkelKoteM: data.sokkelkote_m ?? null,
    grundarealM2: data.grundareal_m2 ?? null,
  };
}
```

Note: verify the exact column name for sokkelkote in the `projects` table by checking existing migrations. Adjust `sokkelkote_m` if the column is named differently.

- [ ] **Step 2: Create the readiness server function**

```typescript
// src/routes/api.drawing-readiness.ts
// Fast readiness check: reads cache + typed columns, computes completeness.
// No SVG generation. Target: < 200ms.

import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InputSchema = z.object({
  projectId: z.string().uuid(),
  addressId: z.string().min(1),
});

type Input = z.infer<typeof InputSchema>;

export const fetchDrawingReadinessFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: Input) => InputSchema.parse(data))
  .handler(async ({ data }) => {
    const { computeDrawingCompleteness } = await import("@/domain/drawing/completeness-engine");
    const { getProjectDrawingParams } =
      await import("@/integrations/supabase/repositories/projects.repository");
    const { createSupabaseServerClient } = await import("@/integrations/supabase/server-client");
    const { VejLayerSchema, NaturbeskyttelseLayerSchema } =
      await import("@/domain/drawing/beliggenhedsplan.schemas");
    const { z } = await import("zod");

    const supabase = createSupabaseServerClient();

    const [params, cacheRows] = await Promise.all([
      getProjectDrawingParams(data.projectId),
      supabase
        .from("address_source_results")
        .select("source_kind, payload, fetched_at")
        .eq("address_id", data.addressId)
        .in("source_kind", ["vej_geometry", "naturbeskyttelse"])
        .gt("expires_at", new Date().toISOString()),
    ]);

    const cache = Object.fromEntries((cacheRows.data ?? []).map((r) => [r.source_kind, r]));

    const vejRow = cache["vej_geometry"];
    const vejLayer = vejRow
      ? (VejLayerSchema.nullable().safeParse(vejRow.payload).data ?? null)
      : null;

    const naturRow = cache["naturbeskyttelse"];
    const naturLayers = naturRow
      ? (z.array(NaturbeskyttelseLayerSchema).safeParse(naturRow.payload).data ?? [])
      : [];

    return computeDrawingCompleteness({
      hasParcelPolygon: true, // if we got this far, parcel exists
      proposedFootprintSource: params ? "generated" : null,
      sokkelKoteM: params?.sokkelKoteM ?? null,
      sokkelSource: params?.sokkelKoteM != null ? "registry" : null,
      tagform: params?.tagform ?? null,
      taghaldningGrad: params?.taghaldningGrad ?? null,
      rygningsKoteM: null, // computed client-side from the above
      vejLayer,
      terrainLayer: null, // simplified — full assembly in api.drawing.ts
      surveyTerrainPointCount: 0,
      kloakoplandType: null, // TODO: read from cache row
      siteUseLayers: [],
      naturbeskyttelseFetchedAt: naturRow?.fetched_at ?? null,
    });
  });

function ApiDrawingReadinessRoute() {
  return null;
}

export const Route = createFileRoute("/api/drawing-readiness")({
  component: ApiDrawingReadinessRoute,
});
```

- [ ] **Step 3: TypeScript check + build**

```bash
bunx tsc --noEmit && bun run build
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/routes/api.drawing-readiness.ts \
        src/integrations/supabase/repositories/projects.repository.ts
git commit -m "feat(api): add api.drawing-readiness.ts fast completeness endpoint + getProjectDrawingParams"
```

---

### Phase 2 complete ✓

```bash
bunx tsc --noEmit && bun test src && bunx eslint . && bun run build
```

All must pass. Phase 3 plan: `docs/superpowers/plans/2026-06-06-beliggenhedsplan-authority-grade-phase3.md`
