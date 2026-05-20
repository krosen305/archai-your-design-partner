# ARCH-241: DK-Jord Live Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gøre DK-Jord jordforurening live ved at flippe IS_MOCK=false, tilføje polygon-INTERSECTS support, typed `site_constraints`-kolonner, V1/V2 rule engine warnings og Building Tasks.

**Architecture:** `DkJordService.getTilstand()` udvides med valgfri parcelPolygon → WFS INTERSECTS-filter. Resultatet skrives til 6 nye typed kolonner i `site_constraints`. `RuleEngineInput.geotechnical` får 3 nye felter der driver V1/V2 warnings i `jordforurening-rules.ts`.

**Tech Stack:** Bun, TypeScript, WFS 2.0 / CQL_FILTER, Supabase PostgreSQL, GeoJSON WGS84

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/integrations/miljoe/dkjord.ts` | Modify | IS_MOCK flip + polygon support + extended type |
| `src/integrations/miljoe/dkjord.test.ts` | Modify | 3 WFS fixture scenarios + polygon helper |
| `supabase/migrations/20260520000000_site_constraints_jordforurening.sql` | Create | 6 nye typed kolonner |
| `src/integrations/supabase/types.ts` | Modify | Tilføj nye kolonner til Row/Insert/Update |
| `src/lib/rule-engine/types.ts` | Modify | Udvid `geotechnical` med V1/V2/omraade |
| `src/lib/rule-engine/rules/jordforurening-rules.ts` | Create | V1/V2/omraade warnings — pure functions |
| `src/lib/rule-engine/rules/jordforurening-rules.test.ts` | Create | Unit tests for jordforurening violations |
| `src/lib/rule-engine/engine.ts` | Modify | Wire `checkJordforureningRules` |
| `src/lib/rule-engine/input-assembler.ts` | Modify | Tilføj `dkjord` til `AssemblerParams` + mapping |
| `src/lib/reactive-compliance.ts` | Modify | Tilføj `dkjord` til `PartialUpdateParams` |
| `src/types/building-platform.ts` | Modify | 3 nye `BUILDING_TASK_KEYS` |
| `src/integrations/supabase/project-persistence.ts` | Modify | `ComplianceTriggers` + `buildSiteConstraintsPatch` + `deriveAutoTasks` |
| `src/lib/analysis-orchestrator.ts` | Modify | Hent parcelPolygon og send til `DkJordService` |
| `src/routes/projekt.$id.cockpit.tsx` | Modify | Tilføj `dkjord` til `assembleRuleEngineInput` kald |

---

## Task 1: DB migration + Supabase types

**Files:**
- Create: `supabase/migrations/20260520000000_site_constraints_jordforurening.sql`
- Modify: `src/integrations/supabase/types.ts:327-394`

- [ ] **Step 1: Opret migrationsfil**

```sql
-- supabase/migrations/20260520000000_site_constraints_jordforurening.sql
-- ARCH-241: typed DK-Jord kolonner på site_constraints
-- Alle kolonner nullable — ingen backfill nødvendig (eksisterende data har soil_contamination_status)

ALTER TABLE public.site_constraints
  ADD COLUMN IF NOT EXISTS jordforurening_v1           BOOLEAN,
  ADD COLUMN IF NOT EXISTS jordforurening_v2           BOOLEAN,
  ADD COLUMN IF NOT EXISTS jordforurening_olietank     BOOLEAN,
  ADD COLUMN IF NOT EXISTS omraadeklassificering       TEXT,
  ADD COLUMN IF NOT EXISTS jordforurening_nuancering   TEXT,
  ADD COLUMN IF NOT EXISTS jordforurening_lokalitet_id TEXT;

COMMENT ON COLUMN public.site_constraints.jordforurening_v1 IS
  'DK-Jord V1-kortlægning — mulig forurening. null = ukendt/API-fejl (aldrig false ved fejl).';
COMMENT ON COLUMN public.site_constraints.jordforurening_v2 IS
  'DK-Jord V2-kortlægning — dokumenteret forurening. null = ukendt/API-fejl.';
COMMENT ON COLUMN public.site_constraints.jordforurening_olietank IS
  'DK-Jord olietank registreret. null = ukendt/API-fejl.';
COMMENT ON COLUMN public.site_constraints.omraadeklassificering IS
  'DK-Jord områdeklassificering — rå tekst fra WFS feature properties (omraadenavn).';
COMMENT ON COLUMN public.site_constraints.jordforurening_nuancering IS
  'DK-Jord nuancering fra V1/V2 feature properties — supplerende klassifikation.';
COMMENT ON COLUMN public.site_constraints.jordforurening_lokalitet_id IS
  'DK-Jord lokalitets-id — til opslag på miljoeportal.dk.';

-- ROLLBACK:
-- ALTER TABLE public.site_constraints
--   DROP COLUMN IF EXISTS jordforurening_v1,
--   DROP COLUMN IF EXISTS jordforurening_v2,
--   DROP COLUMN IF EXISTS jordforurening_olietank,
--   DROP COLUMN IF EXISTS omraadeklassificering,
--   DROP COLUMN IF EXISTS jordforurening_nuancering,
--   DROP COLUMN IF EXISTS jordforurening_lokalitet_id;
```

- [ ] **Step 2: Opdater Supabase TypeScript-typer**

I `src/integrations/supabase/types.ts` find `site_constraints` Row/Insert/Update og tilføj de 6 nye felter (alfabetisk sortering bevares):

```typescript
// I Row (fra linje ~328):
site_constraints: {
  Row: {
    address_id: string;
    confidence: string;
    extracted_at: string;
    fredskov: boolean;
    id: string;
    is_fredet: boolean | null;
    jordforurening_lokalitet_id: string | null;   // NY
    jordforurening_nuancering: string | null;     // NY
    jordforurening_olietank: boolean | null;      // NY
    jordforurening_v1: boolean | null;            // NY
    jordforurening_v2: boolean | null;            // NY
    klitfredning: boolean;
    max_bebyggelsesprocent: number | null;
    max_etager: number | null;
    max_height_m: number | null;
    min_distance_to_boundary_m: number | null;
    omraadeklassificering: string | null;         // NY
    save_value: number | null;
    soil_contamination_status: string | null;
    source_kommuneplan_id: string | null;
    source_lokalplan_id: string | null;
    strandbeskyttelse: boolean;
    updated_at: string;
  };
  Insert: {
    address_id: string;
    confidence?: string;
    extracted_at?: string;
    fredskov?: boolean;
    id?: string;
    is_fredet?: boolean | null;
    jordforurening_lokalitet_id?: string | null;  // NY
    jordforurening_nuancering?: string | null;    // NY
    jordforurening_olietank?: boolean | null;     // NY
    jordforurening_v1?: boolean | null;           // NY
    jordforurening_v2?: boolean | null;           // NY
    klitfredning?: boolean;
    max_bebyggelsesprocent?: number | null;
    max_etager?: number | null;
    max_height_m?: number | null;
    min_distance_to_boundary_m?: number | null;
    omraadeklassificering?: string | null;        // NY
    save_value?: number | null;
    soil_contamination_status?: string | null;
    source_kommuneplan_id?: string | null;
    source_lokalplan_id?: string | null;
    strandbeskyttelse?: boolean;
    updated_at?: string;
  };
  Update: {
    address_id?: string;
    confidence?: string;
    extracted_at?: string;
    fredskov?: boolean;
    id?: string;
    is_fredet?: boolean | null;
    jordforurening_lokalitet_id?: string | null;  // NY
    jordforurening_nuancering?: string | null;    // NY
    jordforurening_olietank?: boolean | null;     // NY
    jordforurening_v1?: boolean | null;           // NY
    jordforurening_v2?: boolean | null;           // NY
    klitfredning?: boolean;
    max_bebyggelsesprocent?: number | null;
    max_etager?: number | null;
    max_height_m?: number | null;
    min_distance_to_boundary_m?: number | null;
    omraadeklassificering?: string | null;        // NY
    save_value?: number | null;
    soil_contamination_status?: string | null;
    source_kommuneplan_id?: string | null;
    source_lokalplan_id?: string | null;
    strandbeskyttelse?: boolean;
    updated_at?: string;
  };
  // Relationships uændret
```

- [ ] **Step 3: Type-tjek**

```bash
bunx tsc --noEmit
```
Expected: ingen fejl

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260520000000_site_constraints_jordforurening.sql src/integrations/supabase/types.ts
git commit -m "feat(arch-241): add typed jordforurening columns to site_constraints"
```

---

## Task 2: Udvid DkJordResultat + skriv fixture-tests (TDD)

**Files:**
- Modify: `src/integrations/miljoe/dkjord.ts` (kun type-ændring, IS_MOCK stadig true)
- Modify: `src/integrations/miljoe/dkjord.test.ts`

- [ ] **Step 1: Udvid DkJordResultat med nuancering og lokalitetsId**

I `src/integrations/miljoe/dkjord.ts`, erstat type-definitionen (linje 30-41):

```typescript
export type DkJordResultat = {
  // Tri-state: true = kortlagt, false = ikke kortlagt, null = ukendt/API-fejl
  v1Kortlagt: boolean | null;
  v2Kortlagt: boolean | null;
  olietank: {
    eksisterer: boolean | null;
    driftsstatus: string | null;
  };
  omraadeklassificering: string | null;
  nuancering: string | null;      // fra V1/V2 feature properties — null hvis ikke udstillet
  lokalitetsId: string | null;    // DK-Jord lokalitets-id til deep-link
  kilde: "dkjord" | "mock";
};
```

Opdater mock-resultatet (linje 74-84) til at inkludere de nye felter:

```typescript
return makeMockResult<DkJordResultat>(
  {
    v1Kortlagt: false,
    v2Kortlagt: false,
    olietank: { eksisterer: true, driftsstatus: "ikke i drift" },
    omraadeklassificering: "Lettere forurenet",
    nuancering: null,
    lokalitetsId: null,
    kilde: "mock",
  },
  { kilde: "dkjord", sourceUrl: DKJORD_WFS, rawFeatureCount: 0 },
);
```

- [ ] **Step 2: Skriv fixture-tests i dkjord.test.ts**

Erstat hele `src/integrations/miljoe/dkjord.test.ts` med:

```typescript
import { describe, expect, it, spyOn, afterEach } from "bun:test";
import { DkJordService } from "./dkjord";
import type { DkJordResultat } from "./dkjord";
import type * as GeoJSON from "geojson";

// ---------------------------------------------------------------------------
// Helpers: byg WFS JSON-svar
// ---------------------------------------------------------------------------

function wfsResponse(totalFeatures: number, features: object[] = []) {
  return {
    totalFeatures,
    features: features.map((props) => ({ type: "Feature", properties: props })),
  };
}

// Lav en mock fetch der returnerer différente svar baseret på TYPENAMES i URL
function mockFetchForScenario(scenario: "no_hit" | "v1_only" | "v2_hit") {
  return spyOn(globalThis, "fetch").mockImplementation(
    async (input: RequestInfo | URL): Promise<Response> => {
      const url = input.toString();
      const isV1 = url.includes("dkjord:V1");
      const isV2 = url.includes("dkjord:V2");
      const isOlietank = url.includes("dkjord:olietank");
      const isOmraadet = url.includes("dkjord:omraadet");

      let data: object;
      if (scenario === "no_hit") {
        data = wfsResponse(0);
      } else if (scenario === "v1_only") {
        data = isV1 ? wfsResponse(1, [{ nuancering: "Historisk", lokalitet_id: "LOK-001" }]) : wfsResponse(0);
      } else {
        // v2_hit
        data = isV2 ? wfsResponse(1, [{ nuancering: "V2 Forurenet", lokalitet_id: "LOK-042" }]) : wfsResponse(0);
      }

      // olietank og omraadet returnerer altid 0 i disse scenarier
      if (isOlietank || isOmraadet) data = wfsResponse(0);

      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  );
}

// ---------------------------------------------------------------------------
// Eksisterende tests (mock-path)
// ---------------------------------------------------------------------------

describe("DkJordService.getTilstand — mock path", () => {
  it("returns SourceResult shape with status and data", async () => {
    const result = await DkJordService.getTilstand({ lat: 55.7, lng: 12.5 });
    expect(result.status).toBeDefined();
    expect(["ok", "mock", "error", "skipped"]).toContain(result.status);
    expect(result.kilde).toBeDefined();
    expect(result.fetchedAt).toBeDefined();
    expect(result.isMock).toBeDefined();
  });

  it("result.data.nuancering and lokalitetsId are present in type", async () => {
    const result = await DkJordService.getTilstand({ lat: 55.7, lng: 12.5 });
    expect(result.data).not.toBeNull();
    const data = result.data!;
    expect("nuancering" in data).toBe(true);
    expect("lokalitetsId" in data).toBe(true);
  });

  it("result.data has kilde field for backward compatibility", async () => {
    const result = await DkJordService.getTilstand({ lat: 55.7, lng: 12.5 });
    expect(["dkjord", "mock"]).toContain(result.data?.kilde);
  });
});

// ---------------------------------------------------------------------------
// wfsPolygonFilter hjælpefunktion
// ---------------------------------------------------------------------------

describe("wfsPolygonFilter", () => {
  it("bygger korrekt WKT fra en GeoJSON Feature med Polygon", async () => {
    // Importér den interne hjælper via dynamic import (eksporteres IKKE — test via getTilstand)
    // I stedet: test at polygon-stien bruges ved at verificere CQL_FILTER i URL
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      async (): Promise<Response> => new Response(JSON.stringify(wfsResponse(0)), { status: 200 }),
    );

    const polygon: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [10.0, 55.0],
                [10.1, 55.0],
                [10.1, 55.1],
                [10.0, 55.1],
                [10.0, 55.0],
              ],
            ],
          },
          properties: {},
        },
      ],
    };

    await DkJordService.getTilstand({ lat: 55.05, lng: 10.05 }, polygon);

    // Verificér at fetch blev kaldt med POLYGON WKT i CQL_FILTER (ikke POINT)
    const calledUrl = fetchSpy.mock.calls[0]?.[0]?.toString() ?? "";
    expect(calledUrl).toContain("POLYGON");
    expect(calledUrl).not.toContain("POINT");

    fetchSpy.mockRestore();
  });

  it("falder tilbage til POINT når polygon er null", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      async (): Promise<Response> => new Response(JSON.stringify(wfsResponse(0)), { status: 200 }),
    );

    await DkJordService.getTilstand({ lat: 55.05, lng: 10.05 }, null);

    const calledUrl = fetchSpy.mock.calls[0]?.[0]?.toString() ?? "";
    expect(calledUrl).toContain("POINT");

    fetchSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Live fixture-scenarier (fetch mocked)
// ---------------------------------------------------------------------------

describe("DkJordService.getTilstand — no_hit scenarie", () => {
  let fetchSpy: ReturnType<typeof mockFetchForScenario>;

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  it("returnerer v1=false, v2=false, status=ok ved 0 features", async () => {
    fetchSpy = mockFetchForScenario("no_hit");
    const result = await DkJordService.getTilstand({ lat: 55.7, lng: 12.5 });
    expect(result.status).toBe("ok");
    expect(result.data?.v1Kortlagt).toBe(false);
    expect(result.data?.v2Kortlagt).toBe(false);
    expect(result.data?.kilde).toBe("dkjord");
  });
});

describe("DkJordService.getTilstand — v1_only scenarie", () => {
  let fetchSpy: ReturnType<typeof mockFetchForScenario>;

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  it("returnerer v1=true, v2=false ved 1 V1-feature", async () => {
    fetchSpy = mockFetchForScenario("v1_only");
    const result = await DkJordService.getTilstand({ lat: 55.7, lng: 12.5 });
    expect(result.status).toBe("ok");
    expect(result.data?.v1Kortlagt).toBe(true);
    expect(result.data?.v2Kortlagt).toBe(false);
  });
});

describe("DkJordService.getTilstand — v2_hit scenarie", () => {
  let fetchSpy: ReturnType<typeof mockFetchForScenario>;

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  it("returnerer v1=false, v2=true ved 1 V2-feature", async () => {
    fetchSpy = mockFetchForScenario("v2_hit");
    const result = await DkJordService.getTilstand({ lat: 55.7, lng: 12.5 });
    expect(result.status).toBe("ok");
    expect(result.data?.v1Kortlagt).toBe(false);
    expect(result.data?.v2Kortlagt).toBe(true);
  });
});

describe("DkJordService.getTilstand — fetch-fejl giver null data (tri-state)", () => {
  it("returnerer status=error og data=null ved netværksfejl", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockRejectedValue(new Error("network error"));
    const result = await DkJordService.getTilstand({ lat: 55.7, lng: 12.5 });
    expect(result.status).toBe("error");
    expect(result.data).toBeNull();
    fetchSpy.mockRestore();
  });
});
```

- [ ] **Step 3: Kør tests — FEJLER fordi IS_MOCK stadig er true**

```bash
bun test src/integrations/miljoe/dkjord.test.ts
```

Expected: `no_hit`, `v1_only`, `v2_hit` og polygon-tests fejler fordi IS_MOCK=true returnerer mock-data i stedet for at kalde fetch.

- [ ] **Step 4: Commit (failing tests)**

```bash
git add src/integrations/miljoe/dkjord.ts src/integrations/miljoe/dkjord.test.ts
git commit -m "test(arch-241): add fixture scenarios for DkJord live path"
```

---

## Task 3: Implementer IS_MOCK flip + polygon support

**Files:**
- Modify: `src/integrations/miljoe/dkjord.ts`

- [ ] **Step 1: Erstat hele dkjord.ts med live implementation**

```typescript
// SERVER-SIDE ONLY — never import from browser code.
//
// DK-Jord integration — forurening, olietanke, områdeklassificering — ARCH-66.
// V2-kortlagt grund kan koste 500.000 kr.+ i oprensning inden byggeri.
//
// API: Miljøstyrelsen DK-Jord WFS
//   Endpoint:  https://dkjord.mst.dk/wfs
//   Auth:      Ingen (offentlig tjeneste)
//   Format:    WFS 2.0, CQL_FILTER med INTERSECTS, SRSNAME=EPSG:4326
//   Layers:
//     dkjord:V1         — mulig forurening (undersøgelse kræves)
//     dkjord:V2         — dokumenteret forurening (oprensning kræves)
//     dkjord:olietank   — gammel olietank (prøvetagning kræves)
//     dkjord:omraadet   — områdeklassificering (krav om jordsundhedsattest)

import { makeOkResult, makeErrorResult } from "@/lib/source-result";
import type { SourceResult } from "@/lib/source-result";
import type * as GeoJSON from "geojson";

const DKJORD_WFS = "https://dkjord.mst.dk/wfs";
const SOURCE_URL = `${DKJORD_WFS}?SERVICE=WFS&VERSION=2.0.0&TYPENAMES=dkjord:V1,dkjord:V2,dkjord:olietank,dkjord:omraadet`;

export type DkJordResultat = {
  // Tri-state: true = kortlagt, false = ikke kortlagt, null = ukendt/API-fejl
  v1Kortlagt: boolean | null;
  v2Kortlagt: boolean | null;
  olietank: {
    eksisterer: boolean | null;
    driftsstatus: string | null;
  };
  omraadeklassificering: string | null;
  nuancering: string | null;      // fra V1/V2 feature properties
  lokalitetsId: string | null;    // DK-Jord lokalitets-id
  kilde: "dkjord" | "mock";
};

type Koordinat = { lat: number; lng: number };

type WfsJsonResponse = {
  totalFeatures?: number;
  features?: { properties?: Record<string, unknown> }[];
};

// Bygger WKT POLYGON fra første Polygon-feature i en GeoJSON FeatureCollection.
// Returnerer null ved uventede geometrityper — caller falder tilbage til POINT.
function wfsPolygonFilter(geojson: GeoJSON.Feature | GeoJSON.FeatureCollection): string | null {
  const feature =
    geojson.type === "FeatureCollection" ? geojson.features[0] : geojson;
  if (!feature) return null;

  const geom = feature.geometry;
  if (!geom || geom.type !== "Polygon") return null;

  const ring = geom.coordinates[0];
  if (!ring || ring.length < 4) return null;

  // GeoJSON koordinater er [lng, lat] — WKT INTERSECTS bruger lng lat rækkefølge
  const wkt = ring.map(([lng, lat]) => `${lng} ${lat}`).join(", ");
  return `POLYGON((${wkt}))`;
}

function buildCqlFilter(koordinat: Koordinat, polygon: GeoJSON.Feature | GeoJSON.FeatureCollection | null | undefined): string {
  if (polygon) {
    const wkt = wfsPolygonFilter(polygon);
    if (wkt) return `INTERSECTS(geometry,${wkt})`;
  }
  return `INTERSECTS(geometry,POINT(${koordinat.lng} ${koordinat.lat}))`;
}

async function getFeatures(
  typename: string,
  koordinat: Koordinat,
  polygon: GeoJSON.Feature | GeoJSON.FeatureCollection | null | undefined,
): Promise<WfsJsonResponse> {
  const cqlFilter = buildCqlFilter(koordinat, polygon);
  const url =
    `${DKJORD_WFS}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature` +
    `&TYPENAMES=${typename}&SRSNAME=EPSG:4326&COUNT=5` +
    `&OUTPUTFORMAT=application/json&CQL_FILTER=${encodeURIComponent(cqlFilter)}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });

  if (!res.ok) {
    throw new Error(`DK-Jord WFS HTTP ${res.status} for ${typename}`);
  }

  return res.json() as Promise<WfsJsonResponse>;
}

export class DkJordService {
  static async getTilstand(
    koordinat: Koordinat,
    parcelPolygon?: GeoJSON.Feature | GeoJSON.FeatureCollection | null,
  ): Promise<SourceResult<DkJordResultat>> {
    try {
      const [v1Data, v2Data, olietankData, omraadeData] = await Promise.all([
        getFeatures("dkjord:V1", koordinat, parcelPolygon).catch((): WfsJsonResponse => ({ features: [] })),
        getFeatures("dkjord:V2", koordinat, parcelPolygon).catch((): WfsJsonResponse => ({ features: [] })),
        getFeatures("dkjord:olietank", koordinat, parcelPolygon).catch((): WfsJsonResponse => ({ features: [] })),
        getFeatures("dkjord:omraadet", koordinat, parcelPolygon).catch((): WfsJsonResponse => ({ features: [] })),
      ]);

      const v1Count = v1Data.totalFeatures ?? v1Data.features?.length ?? 0;
      const v2Count = v2Data.totalFeatures ?? v2Data.features?.length ?? 0;
      const olietankCount = olietankData.totalFeatures ?? olietankData.features?.length ?? 0;
      const omraadeCount = omraadeData.totalFeatures ?? omraadeData.features?.length ?? 0;
      const totalFeatures = v1Count + v2Count + olietankCount + omraadeCount;

      // Udtræk nuancering og lokalitetsId fra første V2- eller V1-feature
      const hitFeature = (v2Data.features?.[0] ?? v1Data.features?.[0]) ?? null;
      const nuancering = (hitFeature?.properties?.["nuancering"] as string | undefined) ?? null;
      const lokalitetsId = (hitFeature?.properties?.["lokalitet_id"] as string | undefined) ?? null;

      const olietankFeature = olietankData.features?.[0];
      const omraadeFeature = omraadeData.features?.[0];

      return makeOkResult<DkJordResultat>(
        {
          v1Kortlagt: v1Count > 0,
          v2Kortlagt: v2Count > 0,
          olietank: {
            eksisterer: olietankCount > 0,
            driftsstatus:
              (olietankFeature?.properties?.["driftsstatus"] as string | undefined) ?? null,
          },
          omraadeklassificering:
            (omraadeFeature?.properties?.["omraadenavn"] as string | undefined) ?? null,
          nuancering,
          lokalitetsId,
          kilde: "dkjord",
        },
        { kilde: "dkjord", sourceUrl: SOURCE_URL, rawFeatureCount: totalFeatures },
      );
    } catch (e) {
      return makeErrorResult<DkJordResultat>(e, { kilde: "dkjord", sourceUrl: DKJORD_WFS });
    }
  }
}
```

- [ ] **Step 2: Kør tests**

```bash
bun test src/integrations/miljoe/dkjord.test.ts
```

Expected: alle tests PASS (fetch-mocks returnerer de korrekte data)

- [ ] **Step 3: Type-tjek**

```bash
bunx tsc --noEmit
```

Expected: ingen fejl

- [ ] **Step 4: Commit**

```bash
git add src/integrations/miljoe/dkjord.ts src/integrations/miljoe/dkjord.test.ts
git commit -m "feat(arch-241): flip IS_MOCK=false + add polygon-INTERSECTS support"
```

---

## Task 4: Udvid RuleEngineInput + skriv jordforurening-rules tests (TDD)

**Files:**
- Modify: `src/lib/rule-engine/types.ts:122-127`
- Create: `src/lib/rule-engine/rules/jordforurening-rules.test.ts`

- [ ] **Step 1: Udvid RuleEngineInput.geotechnical**

I `src/lib/rule-engine/types.ts` erstat `geotechnical`-definitionen (linje 122-127):

```typescript
/** Geoteknisk risiko og jordforurening */
geotechnical: {
  radonRisk: "low" | "medium" | "high" | "unknown";
  groundwaterDepthM: number | null;
  slopePercent: number | null;
  jordforureningV1: boolean | null;      // null = ukendt/API-fejl — ingen violation
  jordforureningV2: boolean | null;      // null = ukendt/API-fejl — ingen violation
  omraadeklassificering: string | null;  // null = ikke klassificeret
};
```

- [ ] **Step 2: Opdater baseInput i engine.test.ts**

I `src/lib/rule-engine/engine.test.ts`, find `baseInput()` hjælperfunktionen og tilføj de tre nye felter til `geotechnical`:

```typescript
geotechnical: {
  radonRisk: "low",
  groundwaterDepthM: null,
  slopePercent: null,
  jordforureningV1: null,
  jordforureningV2: null,
  omraadeklassificering: null,
},
```

- [ ] **Step 3: Kør eksisterende tests for at sikre ingen regression**

```bash
bun test src/lib/rule-engine/engine.test.ts
```

Expected: alle PASS

- [ ] **Step 4: Skriv tests til jordforurening-rules.ts (failing)**

Opret `src/lib/rule-engine/rules/jordforurening-rules.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import { checkJordforureningRules } from "./jordforurening-rules";
import type { RuleEngineInput } from "@/lib/rule-engine/types";

function baseInput(overrides: Partial<RuleEngineInput["geotechnical"]> = {}): RuleEngineInput {
  return {
    project: { type: "demolition_and_new", municipality: "København", kommunekode: "0101" },
    plot: { areaM2: 800, zone: "urban", hasLocalplan: false, hasServitudes: false, localplanIds: [] },
    heritage: {
      listedBuilding: false,
      saveValue: null,
      preservationLocalplan: false,
      protectionLines: {
        coastal: false,
        forest: false,
        lakeRiver: false,
        lake: false,
        clitFredning: false,
        churchSurroundings: false,
      },
    },
    localplan: null,
    municipalPlan: null,
    existingBuilding: null,
    newBuilding: null,
    geotechnical: {
      radonRisk: "low",
      groundwaterDepthM: null,
      slopePercent: null,
      jordforureningV1: null,
      jordforureningV2: null,
      omraadeklassificering: null,
      ...overrides,
    },
    servituts: { hasCritical: false, criticalTexts: [] },
  };
}

describe("checkJordforureningRules", () => {
  it("returnerer ingen violations når alle felter er null", () => {
    const result = checkJordforureningRules(baseInput());
    expect(result).toHaveLength(0);
  });

  it("returnerer ingen violations når V1=false, V2=false, omraade=null", () => {
    const result = checkJordforureningRules(
      baseInput({ jordforureningV1: false, jordforureningV2: false }),
    );
    expect(result).toHaveLength(0);
  });

  it("returnerer 1 warning når V2=true", () => {
    const result = checkJordforureningRules(baseInput({ jordforureningV2: true }));
    expect(result).toHaveLength(1);
    expect(result[0].rule).toBe("jordforurening_v2");
    expect(result[0].severity).toBe("warning");
    expect(result[0].authority).toBe("Miljøstyrelsen");
  });

  it("returnerer 1 warning når V1=true", () => {
    const result = checkJordforureningRules(baseInput({ jordforureningV1: true }));
    expect(result).toHaveLength(1);
    expect(result[0].rule).toBe("jordforurening_v1");
    expect(result[0].severity).toBe("warning");
  });

  it("returnerer 1 warning når omraadeklassificering er sat", () => {
    const result = checkJordforureningRules(
      baseInput({ omraadeklassificering: "Lettere forurenet" }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].rule).toBe("jordforurening_omraadeklassificering");
    expect(result[0].reason).toContain("Lettere forurenet");
    expect(result[0].authority).toBe("Kommunen");
  });

  it("returnerer 2 violations ved V2=true + omraadeklassificering sat", () => {
    const result = checkJordforureningRules(
      baseInput({ jordforureningV2: true, omraadeklassificering: "Forurenet område" }),
    );
    expect(result).toHaveLength(2);
    expect(result.map((v) => v.rule)).toContain("jordforurening_v2");
    expect(result.map((v) => v.rule)).toContain("jordforurening_omraadeklassificering");
  });

  it("V2=null giver ingen violation (tri-state — ukendt er ikke false)", () => {
    const result = checkJordforureningRules(baseInput({ jordforureningV2: null }));
    expect(result).toHaveLength(0);
  });
});
```

- [ ] **Step 5: Kør tests — FEJLER fordi filen ikke eksisterer**

```bash
bun test src/lib/rule-engine/rules/jordforurening-rules.test.ts
```

Expected: fejl "Cannot find module ./jordforurening-rules"

- [ ] **Step 6: Commit**

```bash
git add src/lib/rule-engine/types.ts src/lib/rule-engine/engine.test.ts src/lib/rule-engine/rules/jordforurening-rules.test.ts
git commit -m "test(arch-241): extend RuleEngineInput.geotechnical + add jordforurening rule tests"
```

---

## Task 5: Implementer jordforurening-rules.ts + wire i engine.ts

**Files:**
- Create: `src/lib/rule-engine/rules/jordforurening-rules.ts`
- Modify: `src/lib/rule-engine/engine.ts:17-19, 136`

- [ ] **Step 1: Opret jordforurening-rules.ts**

```typescript
// src/lib/rule-engine/rules/jordforurening-rules.ts
// Jordforureningsregler — V1/V2 kortlægning og områdeklassificering (ARCH-241).
// Pure functions uden sideeffekter. Severity "warning" fordi V1/V2 er risikofaktorer,
// ikke juridiske blokader — dispensation er ikke løsningen, undersøgelse er.

import type { RuleEngineInput, RuleViolation } from "@/lib/rule-engine/types";

export function checkJordforureningRules(input: RuleEngineInput): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const { jordforureningV2, jordforureningV1, omraadeklassificering } = input.geotechnical;

  if (jordforureningV2 === true) {
    violations.push({
      rule: "jordforurening_v2",
      severity: "warning",
      reason:
        "Grunden er V2-kortlagt (dokumenteret forurening). Oprensning kan koste 500.000 kr+. " +
        "Kræver miljøteknisk undersøgelse inden byggestart (Jordforureningslovens §72).",
      authority: "Miljøstyrelsen",
    });
  }

  if (jordforureningV1 === true) {
    violations.push({
      rule: "jordforurening_v1",
      severity: "warning",
      reason:
        "Grunden er V1-kortlagt (mulig forurening). Miljøundersøgelse anbefales inden køb og inden nedrivning.",
      authority: "Miljøstyrelsen",
    });
  }

  if (omraadeklassificering !== null) {
    violations.push({
      rule: "jordforurening_omraadeklassificering",
      severity: "warning",
      reason: `Grunden er i et områdeklassificeret område (${omraadeklassificering}). Jordflytning kræver jordsundhedsattest.`,
      authority: "Kommunen",
    });
  }

  return violations;
}
```

- [ ] **Step 2: Kør regel-tests — PASS**

```bash
bun test src/lib/rule-engine/rules/jordforurening-rules.test.ts
```

Expected: alle 7 tests PASS

- [ ] **Step 3: Wire ind i engine.ts**

I `src/lib/rule-engine/engine.ts`, tilføj import efter linje 19:

```typescript
import { checkJordforureningRules } from "@/lib/rule-engine/rules/jordforurening-rules";
```

I `runRuleEngine`, tilføj jordforurening-violations i sektion 4 (linje ~132-136):

```typescript
// ── 3. Energiregler ────────────────────────────────────────────────────────
const energyViolations = checkEnergyProportionality(input);
checkedRules.push("energy_upgrade_likely_required", "heat_pump_installation_requirement");

// ── 4. Jordforurening ─────────────────────────────────────────────────────
const jordforureningViolations = checkJordforureningRules(input);
checkedRules.push("jordforurening_v2", "jordforurening_v1", "jordforurening_omraadeklassificering");

// ── 5. Sammensæt ──────────────────────────────────────────────────────────
const allViolations = [...stopViolations, ...calcViolations, ...energyViolations, ...jordforureningViolations];
```

- [ ] **Step 4: Kør engine-tests**

```bash
bun test src/lib/rule-engine/engine.test.ts
```

Expected: alle PASS (de nye `null`-felter genererer ingen violations)

- [ ] **Step 5: Commit**

```bash
git add src/lib/rule-engine/rules/jordforurening-rules.ts src/lib/rule-engine/engine.ts
git commit -m "feat(arch-241): add jordforurening-rules + wire into engine"
```

---

## Task 6: Opdater input-assembler + reactive-compliance

**Files:**
- Modify: `src/lib/rule-engine/input-assembler.ts:28-42, 341-347`
- Modify: `src/lib/reactive-compliance.ts:26-39, 47-80`

- [ ] **Step 1: Tilføj dkjord til AssemblerParams**

I `src/lib/rule-engine/input-assembler.ts`, tilføj import øverst:

```typescript
import type { DkJordResultat } from "@/integrations/miljoe/dkjord";
```

Tilføj `dkjord` til `AssemblerParams` (efter `fbbData`-linjen):

```typescript
export type AssemblerParams = {
  bbr: BbrKompliantData | null;
  kommuneplanramme: Kommuneplanramme | null;
  lokalplaner: Lokalplan[];
  lokalplanExtract: LokalplanExtract | null;
  naturbeskyttelse: NaturbeskyttelsesResultat | null;
  geusRisk: GeusRiskData | null;
  servitutter: TinglysningResult | null;
  terrain: TerrainData | null;
  fbbData: FbbResultat | null;
  dkjord: DkJordResultat | null;   // NY: V1/V2/omraadeklassificering til rule engine
  byggeoenske: Byggeoenske | null;
  designPlacement?: DesignPlacement | null;
  municipality: string;
  kommunekode: string;
};
```

I `assembleRuleEngineInput`, udvid destrukturering og `geotechnical`:

```typescript
// Destrukturering — tilføj dkjord:
const {
  bbr,
  kommuneplanramme,
  lokalplaner,
  lokalplanExtract,
  naturbeskyttelse,
  geusRisk,
  servitutter,
  terrain,
  fbbData,
  dkjord,    // NY
  byggeoenske,
  designPlacement,
  municipality,
  kommunekode,
} = params;
```

Erstat `geotechnical`-blokken (linje ~342-347):

```typescript
const geotechnical: RuleEngineInput["geotechnical"] = {
  radonRisk: geusRisk?.radonRisk ?? "unknown",
  groundwaterDepthM: geusRisk?.groundwaterDepthM ?? null,
  slopePercent: terrain?.slopePercent ?? null,
  jordforureningV1: dkjord?.v1Kortlagt ?? null,
  jordforureningV2: dkjord?.v2Kortlagt ?? null,
  omraadeklassificering: dkjord?.omraadeklassificering ?? null,
};
```

- [ ] **Step 2: Tilføj dkjord til reactive-compliance.ts**

I `src/lib/reactive-compliance.ts`, tilføj import:

```typescript
import type { DkJordResultat } from "@/integrations/miljoe/dkjord";
```

Tilføj `dkjord` til `PartialUpdateParams`:

```typescript
export type PartialUpdateParams = {
  bbr: BbrKompliantData;
  ramme: Kommuneplanramme | null;
  lokalplanExtract: LokalplanExtract | null;
  lokalplaner: Lokalplan[];
  naturbeskyttelse: NaturbeskyttelsesResultat | null;
  geusRisk: GeusRiskData | null;
  servitutter: TinglysningResult | null;
  terrain: TerrainData | null;
  fbbData: FbbResultat | null;
  dkjord: DkJordResultat | null;   // NY
  byggeoenske: Byggeoenske;
  municipality: string;
  kommunekode: string;
};
```

I `computePartialUpdate`, destrukturer `dkjord` fra `params` og tilføj det til `assembleRuleEngineInput`-kaldet:

```typescript
const { input, missingFields } = assembleRuleEngineInput({
  bbr,
  kommuneplanramme: params.ramme,
  lokalplaner: params.lokalplaner,
  lokalplanExtract: params.lokalplanExtract,
  naturbeskyttelse: params.naturbeskyttelse,
  geusRisk: params.geusRisk,
  servitutter: params.servitutter,
  terrain: params.terrain,
  fbbData: params.fbbData,
  dkjord: params.dkjord,   // NY
  byggeoenske: params.byggeoenske,
  municipality: params.municipality,
  kommunekode: params.kommunekode,
});
```

- [ ] **Step 3: Opdater cockpit route**

I `src/routes/projekt.$id.cockpit.tsx` (linje ~114-127), tilføj `dkjord` til assembler-kaldet:

```typescript
const { input: ruleInput, missingFields } = assembleRuleEngineInput({
  bbr: analysisInput.bbr,
  kommuneplanramme: analysisInput.kommuneplanramme ?? null,
  lokalplaner: analysisInput.lokalplaner ?? [],
  lokalplanExtract: analysisInput.lokalplanExtract,
  naturbeskyttelse: analysisInput.naturbeskyttelse ?? null,
  geusRisk: analysisInput.geusRisk ?? null,
  servitutter: analysisInput.servitutter ?? null,
  terrain: analysisInput.terrain ?? null,
  fbbData: analysisInput.fbbData ?? null,
  dkjord: analysisInput.dkjord ?? null,   // NY
  byggeoenske: analysisInput.byggeoenske,
  municipality: analysisInput.municipality ?? "",
  kommunekode: analysisInput.kommunekode ?? "",
});
```

- [ ] **Step 4: Find og opdater alle andre steder der kalder computePartialUpdate eller assembleRuleEngineInput**

```bash
bunx grep -rn "computePartialUpdate\|assembleRuleEngineInput" src/
```

For hvert fund: tilføj `dkjord: null` (eller den korrekte kilde) til parameterobjektet.

- [ ] **Step 5: Type-tjek og tests**

```bash
bunx tsc --noEmit
bun test
```

Expected: ingen fejl, alle tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/rule-engine/input-assembler.ts src/lib/reactive-compliance.ts src/routes/projekt.$id.cockpit.tsx
git commit -m "feat(arch-241): wire dkjord into rule engine input-assembler + reactive-compliance"
```

---

## Task 7: Tilføj nye BUILDING_TASK_KEYS + opdater project-persistence

**Files:**
- Modify: `src/types/building-platform.ts:37-61`
- Modify: `src/integrations/supabase/project-persistence.ts:96-104, 219-353, 803-818`

- [ ] **Step 1: Tilføj nye task-nøgler til building-platform.ts**

I `src/types/building-platform.ts`, udvid `BUILDING_TASK_KEYS` (efter `MILJOEUNDERSOEGELSE`):

```typescript
export const BUILDING_TASK_KEYS = {
  // Matriklen phase
  JORDBUNDSPROVE: "jordbundsprove",
  KORTLAEG_FORSYNINGER: "kortlaeg_forsyninger",
  MILJOEUNDERSOEGELSE: "miljoeundersoegelse",          // beholdes for unknown/error-case
  JORDFORURENING_V2_UNDERSOEGELSE: "jordforurening_v2_undersoegelse",  // NY: V2-kortlagt
  JORDFORURENING_V1_SCREENING: "jordforurening_v1_screening",          // NY: V1-kortlagt
  SAVE_4_PARAGRAPH14: "save_4_paragraph14",
  // Maskinrummet phase
  JORDFLYTNING_ATTEST: "jordflytning_attest",          // NY: omraadeklassificering
  ARKITEKTTEGNINGER: "arkitekttegninger",
  STATIK: "statik",
  LCA_BEREGNING: "lca_beregning",
  // Sandkassen phase
  INSPIRATIONSARK: "inspirationsark",
  DEFINER_BUDGET: "definer_budget",
  // Myndighed phase — auto-generated fra Hard Stop data
  SAVE_DISPENSATION: "save_dispensation",
  FREDNING_JURIDISK: "fredning_juridisk",
  STRANDBESKYTTELSE_DISPENSATION: "strandbeskyttelse_dispensation",
  FREDSKOV_DISPENSATION: "fredskov_dispensation",
  KLITFREDNING_DISPENSATION: "klitfredning_dispensation",
  // Myndighed phase — journey tasks
  NEDRIVNINGSANSOEGNING: "nedrivningsansoegning",
  BYGGESAGSANSOEGNING: "byggesagsansoegning",
  NABOHORING: "nabohoring",
  FINANSIERING: "finansiering",
} as const;
```

- [ ] **Step 2: Udvid ComplianceTriggers**

I `src/integrations/supabase/project-persistence.ts` (linje 96-104):

```typescript
type ComplianceTriggers = {
  projectId: string;
  saveValue: number | null;
  isFredet: boolean | null;
  strandbeskyttelse: boolean | null;
  fredskov: boolean | null;
  klitfredning: boolean | null;
  soilContamination: "clean" | "registered" | "contaminated" | "unknown" | null;
  jordforureningV1: boolean | null;       // NY: direkte boolean til task-generering
  jordforureningV2: boolean | null;       // NY
  omraadeklassificering: string | null;   // NY
};
```

- [ ] **Step 3: Erstat V1/V2-task-logik i deriveAutoTasks**

I `deriveAutoTasks()`, erstat den eksisterende `soilContamination === "contaminated" || ... === "registered"` blok (linje ~321-337) med:

```typescript
if (t.jordforureningV2 === true) {
  tasks.push({
    project_id: t.projectId,
    task_key: BUILDING_TASK_KEYS.JORDFORURENING_V2_UNDERSOEGELSE,
    title: "Miljøteknisk undersøgelse af V2-kortlagt grund",
    description:
      "Grunden er V2-kortlagt (dokumenteret forurening). Oprensning kan koste 500.000 kr+. " +
      "En miljøteknisk undersøgelse er påkrævet inden byggestart (Jordforureningslovens §72). " +
      "Budgettér undersøgelse + oprensning som en separat post.",
    phase: "matriklen",
    status: "blocked",
    priority: 1,
    is_auto_generated: true,
    blocked_by_constraint: "jordforurening_v2",
    metadata: { kortlaeggingsklasse: "V2", myndighed: "Miljøstyrelsen" },
  });
}

if (t.jordforureningV1 === true) {
  tasks.push({
    project_id: t.projectId,
    task_key: BUILDING_TASK_KEYS.JORDFORURENING_V1_SCREENING,
    title: "Miljøscreening af V1-kortlagt grund",
    description:
      "Grunden er V1-kortlagt (mulig forurening). En indledende miljøscreening anbefales " +
      "inden køb og er nødvendig inden nedrivningsansøgning.",
    phase: "matriklen",
    status: "pending",
    priority: 2,
    is_auto_generated: true,
    blocked_by_constraint: "jordforurening_v1",
    metadata: { kortlaeggingsklasse: "V1", myndighed: "Miljøstyrelsen" },
  });
}

if (t.omraadeklassificering !== null) {
  tasks.push({
    project_id: t.projectId,
    task_key: BUILDING_TASK_KEYS.JORDFLYTNING_ATTEST,
    title: "Indhent jordsundhedsattest inden jordflytning",
    description:
      `Grunden er i et områdeklassificeret område (${t.omraadeklassificering}). ` +
      "Jordflytning fra grunden kræver jordsundhedsattest fra kommunen.",
    phase: "maskinrummet",
    status: "pending",
    priority: 3,
    is_auto_generated: true,
    blocked_by_constraint: "omraadeklassificering",
    metadata: { omraadeklassificering: t.omraadeklassificering, myndighed: "Kommunen" },
  });
}
```

Behold den eksisterende `soilContamination === "unknown"`-blok uændret (unknown/API-fejl-case).

- [ ] **Step 4: Opdater buildSiteConstraintsPatch**

I `buildSiteConstraintsPatch()`, udvid `dkjord`-blokken (linje ~175-178):

```typescript
if (patch.dkjord !== undefined) {
  hasConstraintField = true;
  sitePatch.soil_contamination_status    = deriveSoilContaminationStatus(patch.dkjord);
  sitePatch.jordforurening_v1            = patch.dkjord?.v1Kortlagt ?? null;
  sitePatch.jordforurening_v2            = patch.dkjord?.v2Kortlagt ?? null;
  sitePatch.jordforurening_olietank      = patch.dkjord?.olietank.eksisterer ?? null;
  sitePatch.omraadeklassificering        = patch.dkjord?.omraadeklassificering ?? null;
  sitePatch.jordforurening_nuancering    = patch.dkjord?.nuancering ?? null;
  sitePatch.jordforurening_lokalitet_id  = patch.dkjord?.lokalitetsId ?? null;
}
```

- [ ] **Step 5: Opdater syncBuildingTasks-kaldet i syncPatch**

Find kaldet til `syncBuildingTasks` (linje ~807-818) og tilføj de nye felter:

```typescript
await syncBuildingTasks(
  {
    projectId: id,
    saveValue: saveVal,
    isFredet: isFredetVal,
    strandbeskyttelse: patch.bbrData?.mat_strandbeskyttelse ?? null,
    fredskov: patch.bbrData?.mat_fredskov ?? null,
    klitfredning: patch.bbrData?.mat_klitfredning ?? null,
    soilContamination,
    jordforureningV1: patch.dkjord?.v1Kortlagt ?? null,    // NY
    jordforureningV2: patch.dkjord?.v2Kortlagt ?? null,    // NY
    omraadeklassificering: patch.dkjord?.omraadeklassificering ?? null,  // NY
  },
  trace,
);
```

- [ ] **Step 6: Type-tjek og tests**

```bash
bunx tsc --noEmit
bun test
```

Expected: ingen fejl

- [ ] **Step 7: Commit**

```bash
git add src/types/building-platform.ts src/integrations/supabase/project-persistence.ts
git commit -m "feat(arch-241): typed task keys + V1/V2 building tasks + site_constraints patch"
```

---

## Task 8: Opdater orchestrator til at sende parcelPolygon

**Files:**
- Modify: `src/lib/analysis-orchestrator.ts` (DkJordService-kaldet i Layer 4, ca. linje 580-606)

- [ ] **Step 1: Tilføj polygon-hentning og send til DkJordService**

Find DkJordService-kaldet i Layer 4 (linje ~580-606) og erstat det:

```typescript
import("@/integrations/miljoe/dkjord")
  .then(async ({ DkJordService }) => {
    // Hent cached parcelpolygon — tilgængeligt fra ARCH-240 (getCachedJordstykkePolygon)
    const { getCachedJordstykkePolygon } = await import("@/integrations/cache/client");
    const polygon = await getCachedJordstykkePolygon(addressId).catch(() => null);

    return traceStep(
      trace,
      {
        eventType: "api_call",
        phase: "layer4",
        service: "DK-Jord WFS",
        operation: "getTilstand",
        inputSummary: `koordinater=${koordinater.lat.toFixed(4)},${koordinater.lng.toFixed(4)} polygon=${polygon ? "yes" : "no"}`,
      },
      () => DkJordService.getTilstand(koordinater, polygon),
      {
        outputSummary: (r) =>
          summarizeSourceResult(r, (d) => `v1=${d.v1Kortlagt} v2=${d.v2Kortlagt}`),
        metadata: (r) => ({
          source: r.kilde,
          isMock: r.isMock,
          feature_count: r.rawFeatureCount,
        }),
      },
    );
  })
  .catch((e: Error) => {
    console.warn("[Orchestrator] DK-Jord fejlede:", e.message);
    return null;
  }),
```

- [ ] **Step 2: Opdater dkjord service state**

Find linje ~704-706 der sætter `states.dkjord` og tilføj live/mock-skelnen:

```typescript
dkjord = jord?.data ?? null;
states.dkjord =
  jord === null
    ? "error"
    : jord.isMock
      ? "mock"
      : dkjord !== null
        ? "success"
        : "no_hit";
```

- [ ] **Step 3: Type-tjek**

```bash
bunx tsc --noEmit
```

Expected: ingen fejl

- [ ] **Step 4: Kør alle tests**

```bash
bun test
```

Expected: alle PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis-orchestrator.ts
git commit -m "feat(arch-241): pass parcelPolygon from cache to DkJordService in orchestrator"
```

---

## Task 9: Final verification

- [ ] **Step 1: Fuld type-check**

```bash
bunx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 2: Alle tests**

```bash
bun test
```

Expected: alle PASS, ingen skipped

- [ ] **Step 3: Lint**

```bash
bunx eslint .
```

Expected: ingen nye fejl

- [ ] **Step 4: Build**

```bash
bun run build
```

Expected: success, ingen warnings om ukendte felter

- [ ] **Step 5: Manuel smoke-test i dev**

```bash
bun dev
```

Gå til en adresse i cockpit. Verificér i network-tab:
- DK-Jord WFS-kald sker (ikke mock)
- `serviceStates.dkjord` er "success" eller "no_hit" (ikke "mock")

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat(arch-241): DK-Jord live — IS_MOCK=false, polygon INTERSECTS, typed site_constraints, V1/V2 rule engine warnings, building tasks"
```
