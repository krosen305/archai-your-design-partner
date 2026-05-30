# Arealdata Client — Nyt WFS Endpoint Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Erstat det lukkede DAI WFS (`arealinformation.miljoeportal.dk`) i `arealdata/client.ts` med verificerede nye kilder for paragraph3, natura2000, diger, BNBO, OSD og råstofområder — og degrader fortidsminde/fortidsmindeBuffer korrekt til `null` da der pt. ikke er verificerede erstatningsendpoints.

**Architecture:** `arealdata/client.ts` opdateres med en diskrimineret union `LayerConfig` der afspejler fire kildetyper: GeoServer-INTERSECTS (offentlig), GeoServer-DWITHIN (linjelag kræver afstandsfilter), Miljoegis-INTERSECTS (separat offentlig WFS) og Unresolved (degraderer til `null`). `natura2000` er en OR-kombination af 3 habitat-lag. Eksisterende returtype `ArealdataContextResult` (tri-state `boolean | null`) beholdes uændret — downstream-consumers forventer den. Zod-validering tilføjes på GeoServer JSON-boundary (Rule 1).

**Tech Stack:** TypeScript, Bun:test, WFS 2.0, CQL_FILTER, DWITHIN, Zod

---

## Verificeret endpoint-mapping

### GeoServer — ingen auth påkrævet

Base URL: `https://arealeditering-dist-geo.miljoeportal.dk/geoserver/wfs`
Geometrifelt: `Shape`

| Key                | Ny typename                                                  | Filtertype     | Verificering                                        |
| ------------------ | ------------------------------------------------------------ | -------------- | --------------------------------------------------- |
| `paragraph3Nature` | `dai:bes_naturtyper`                                         | INTERSECTS     | ✅ 1 hit ved Mols Bjerge hede                       |
| `natura2000`       | `dai:habitat_omr` OR `dai:fugle_bes_omr` OR `dai:ramsar_omr` | INTERSECTS, OR | ✅ hits ved Blåvand og Mols Bjerge                  |
| `protectedDige`    | `dai:bes_sten_jorddiger_2022`                                | DWITHIN 2m     | ⚠️ MultiCurve-geometri bekræftet, semantisk korrekt |
| `bnbo`             | `dai:status_bnbo`                                            | INTERSECTS     | ⚠️ endpoint bekræftet                               |
| `rawMaterialArea`  | `dai:raastofomr`                                             | INTERSECTS     | ✅ BBOX-test 257 features                           |

### Miljoegis Grukos — ingen auth påkrævet

Base URL: `https://wfs2-miljoegis.mim.dk/grukos/ows`
Geometrifelt: `wkb_geometry`

| Key   | Typename                       | Verificering                               |
| ----- | ------------------------------ | ------------------------------------------ |
| `osd` | `grukos:drikkevandsinteresser` | ✅ returnerer GeoJSON med features ved Kbh |

### Uafklarede lag — degraderer til `null`

| Key                  | Årsag                                                                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `fortidsminde`       | `kulturarv.dk/ffgeoserver` utilgængeligt; `dai:fredede_omr` dækker naturreservater (naturbeskyttelsesloven), ikke fortidsminder (museumsloven) |
| `fortidsmindeBuffer` | Samme årsag                                                                                                                                    |

**Bemærk:** `null` er bedre end det nuværende `false` (som pt. returneres fordi alle lag fejler på det døde endpoint). `null` = ukendt, `false` = afkræftet. Downstream bør vise "data utilgængelig" snarere end "ingen restriktion".

---

## Berørte filer

| Fil                                         | Ændring                                                          |
| ------------------------------------------- | ---------------------------------------------------------------- |
| `src/integrations/arealdata/client.ts`      | Fuldt omskrevet — multi-endpoint arkitektur, Zod-validering      |
| `src/integrations/arealdata/client.test.ts` | Ny testfil — dækker alle 4 kildetyper og OR-logik for natura2000 |

---

## Task 1: Omskriv `arealdata/client.ts` med multi-endpoint arkitektur

**Files:**

- Modify: `src/integrations/arealdata/client.ts`

- [ ] **Step 1: Læs den nuværende fil og forstå strukturen**

Kør: Læs `src/integrations/arealdata/client.ts` — bemærk eksisterende returtype, tri-state `boolean | null`, og polygon-filter-logik.

- [ ] **Step 2: Erstat hele filen**

```typescript
// SERVER-SIDE ONLY.
//
// Arealdata udvidede miljølag — opdateret efter DAI WFS lukning (arealinformation.miljoeportal.dk → HTTP 308 → SPA).
//
// Data er nu splittet på tre autoritative kilder:
//
// Kilde A — Miljøportalens GeoServer (offentlig):
//   URL:      https://arealeditering-dist-geo.miljoeportal.dk/geoserver/wfs
//   Lag:      dai:bes_naturtyper, dai:habitat_omr, dai:fugle_bes_omr, dai:ramsar_omr,
//             dai:bes_sten_jorddiger_2022, dai:status_bnbo, dai:raastofomr
//   Geometri: Shape (MultiSurface eller MultiCurve afhængigt af lag)
//
// Kilde B — Miljøstyrelsen Grukos WFS (offentlig):
//   URL:      https://wfs2-miljoegis.mim.dk/grukos/ows
//   Lag:      grukos:drikkevandsinteresser (OSD)
//   Geometri: wkb_geometry
//
// Kilde C — Uafklaret (degraderer til null):
//   fortidsminde og fortidsmindeBuffer mangler verificeret erstatningsendpoint.
//   kulturarv.dk/ffgeoserver er utilgængeligt. null = ukendt, IKKE false.

import { makeErrorResult, makeOkResult } from "@/lib/source-result";
import type { SourceResult } from "@/lib/source-result";
import type * as GeoJSON from "geojson";
import { z } from "zod";

const GEOSERVER_WFS = "https://arealeditering-dist-geo.miljoeportal.dk/geoserver/wfs";
const MILJOEGIS_GRUKOS_WFS = "https://wfs2-miljoegis.mim.dk/grukos/ows";
const SOURCE_URL = `${GEOSERVER_WFS} + ${MILJOEGIS_GRUKOS_WFS}`;

export type ArealdataContextResult = {
  paragraph3Nature: boolean | null;
  natura2000: boolean | null;
  protectedDige: boolean | null;
  fortidsminde: boolean | null;
  fortidsmindeBuffer: boolean | null;
  bnbo: boolean | null;
  osd: boolean | null;
  rawMaterialArea: boolean | null;
};

type Koordinat = { lat: number; lng: number };

// ---- Zod-schema til GeoServer JSON-boundary (Rule 1) ----

const geoServerResponseSchema = z.object({
  totalFeatures: z.number().optional(),
  features: z.array(z.unknown()).optional(),
});

// ---- WFS geometry helpers ----

function wgsPointFilter(geomField: string, koordinat: Koordinat): string {
  return `INTERSECTS(${geomField},SRID=4326;POINT(${koordinat.lng} ${koordinat.lat}))`;
}

function wgsDwithinFilter(geomField: string, koordinat: Koordinat, distanceMeters: number): string {
  return `DWITHIN(${geomField},SRID=4326;POINT(${koordinat.lng} ${koordinat.lat}),${distanceMeters},meters)`;
}

function wgsPolygonFilter(
  geomField: string,
  polygon: GeoJSON.Feature | GeoJSON.FeatureCollection,
): string | null {
  const feature = polygon.type === "FeatureCollection" ? polygon.features[0] : polygon;
  if (!feature) return null;
  const geom = feature.geometry;
  if (!geom || geom.type !== "Polygon") return null;
  const ring = geom.coordinates[0];
  if (!ring || ring.length < 4) return null;
  const wkt = ring.map(([lng, lat]) => `${lng} ${lat}`).join(", ");
  return `INTERSECTS(${geomField},SRID=4326;POLYGON((${wkt})))`;
}

function buildCqlFilter(
  geomField: string,
  koordinat: Koordinat,
  polygon: GeoJSON.Feature | GeoJSON.FeatureCollection | null | undefined,
  filterType: "intersects" | "dwithin",
  dwithinMeters?: number,
): string {
  if (filterType === "dwithin") {
    return wgsDwithinFilter(geomField, koordinat, dwithinMeters ?? 2);
  }
  if (polygon) {
    const wkt = wgsPolygonFilter(geomField, polygon);
    if (wkt) return wkt;
  }
  return wgsPointFilter(geomField, koordinat);
}

// ---- GeoServer fetcher (JSON) ----

async function fetchGeoServer(typename: string, cqlFilter: string): Promise<number> {
  const url =
    `${GEOSERVER_WFS}?service=WFS&version=2.0.0&request=GetFeature` +
    `&typeName=${typename}&count=1&outputFormat=application/json` +
    `&CQL_FILTER=${encodeURIComponent(cqlFilter)}`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`GeoServer HTTP ${res.status} for ${typename}`);

  const parsed = geoServerResponseSchema.safeParse(await res.json());
  if (!parsed.success) throw new Error(`GeoServer: unexpected response shape for ${typename}`);
  return parsed.data.totalFeatures ?? parsed.data.features?.length ?? 0;
}

// ---- Miljoegis Grukos fetcher (JSON) ----

async function fetchGrukos(typename: string, cqlFilter: string): Promise<number> {
  const url =
    `${MILJOEGIS_GRUKOS_WFS}?service=WFS&version=2.0.0&request=GetFeature` +
    `&typeName=${typename}&count=1&outputFormat=application/json` +
    `&CQL_FILTER=${encodeURIComponent(cqlFilter)}`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`Grukos WFS HTTP ${res.status} for ${typename}`);

  const parsed = geoServerResponseSchema.safeParse(await res.json());
  if (!parsed.success) throw new Error(`Grukos: unexpected response shape for ${typename}`);
  return parsed.data.totalFeatures ?? parsed.data.features?.length ?? 0;
}

// ---- Per-lag fetching ----

type LayerOutcome = {
  key: keyof ArealdataContextResult;
  value: boolean | null;
  errored: boolean;
};

async function fetchLayer(
  key: keyof ArealdataContextResult,
  koordinat: Koordinat,
  polygon: GeoJSON.Feature | GeoJSON.FeatureCollection | null | undefined,
): Promise<LayerOutcome> {
  try {
    switch (key) {
      case "paragraph3Nature": {
        const filter = buildCqlFilter("Shape", koordinat, polygon, "intersects");
        const count = await fetchGeoServer("dai:bes_naturtyper", filter);
        return { key, value: count > 0, errored: false };
      }

      case "natura2000": {
        // OR på tværs af tre lag: habitat, fugle og ramsar
        const filter = buildCqlFilter("Shape", koordinat, polygon, "intersects");
        const [habitat, fugle, ramsar] = await Promise.all([
          fetchGeoServer("dai:habitat_omr", filter),
          fetchGeoServer("dai:fugle_bes_omr", filter),
          fetchGeoServer("dai:ramsar_omr", filter),
        ]);
        return { key, value: habitat > 0 || fugle > 0 || ramsar > 0, errored: false };
      }

      case "protectedDige": {
        // Laget er MultiCurve (linjer) — brug DWITHIN 2m i stedet for INTERSECTS
        const filter = buildCqlFilter("Shape", koordinat, undefined, "dwithin", 2);
        const count = await fetchGeoServer("dai:bes_sten_jorddiger_2022", filter);
        return { key, value: count > 0, errored: false };
      }

      case "bnbo": {
        const filter = buildCqlFilter("Shape", koordinat, polygon, "intersects");
        const count = await fetchGeoServer("dai:status_bnbo", filter);
        return { key, value: count > 0, errored: false };
      }

      case "osd": {
        // Grukos WFS bruger wkb_geometry som geometrifelt
        const filter = buildCqlFilter("wkb_geometry", koordinat, polygon, "intersects");
        const count = await fetchGrukos("grukos:drikkevandsinteresser", filter);
        return { key, value: count > 0, errored: false };
      }

      case "rawMaterialArea": {
        const filter = buildCqlFilter("Shape", koordinat, polygon, "intersects");
        const count = await fetchGeoServer("dai:raastofomr", filter);
        return { key, value: count > 0, errored: false };
      }

      case "fortidsminde":
      case "fortidsmindeBuffer":
        // Ingen verificeret erstatningsendpoint efter DAI WFS lukning.
        // kulturarv.dk/ffgeoserver er utilgængeligt. Returnér null (ukendt), IKKE false.
        return { key, value: null, errored: true };

      default:
        return { key, value: null, errored: true };
    }
  } catch {
    return { key, value: null, errored: true };
  }
}

function emptyResult(): ArealdataContextResult {
  return {
    paragraph3Nature: null,
    natura2000: null,
    protectedDige: null,
    fortidsminde: null,
    fortidsmindeBuffer: null,
    bnbo: null,
    osd: null,
    rawMaterialArea: null,
  };
}

const ALL_KEYS: ReadonlyArray<keyof ArealdataContextResult> = [
  "paragraph3Nature",
  "natura2000",
  "protectedDige",
  "fortidsminde",
  "fortidsmindeBuffer",
  "bnbo",
  "osd",
  "rawMaterialArea",
];

export class ArealdataService {
  static async getContext(
    koordinat: Koordinat,
    parcelPolygon?: GeoJSON.Feature | GeoJSON.FeatureCollection | null,
  ): Promise<SourceResult<ArealdataContextResult>> {
    try {
      const outcomes = await Promise.all(
        ALL_KEYS.map((key) => fetchLayer(key, koordinat, parcelPolygon)),
      );

      // Tæl kun de lag der faktisk har et live endpoint
      // fortidsminde og fortidsmindeBuffer tæller ikke som "fejl" i confidence-forstand
      // — de er eksplicit uafklarede, ikke netværksfejl
      const resolvedKeys = new Set<keyof ArealdataContextResult>([
        "paragraph3Nature",
        "natura2000",
        "protectedDige",
        "bnbo",
        "osd",
        "rawMaterialArea",
      ]);
      const resolvedOutcomes = outcomes.filter((o) => resolvedKeys.has(o.key));
      const successCount = resolvedOutcomes.filter((o) => !o.errored).length;

      if (successCount === 0) {
        return makeErrorResult(new Error("Arealdata: alle live lag fejlede"), {
          kilde: "arealdata",
          sourceUrl: SOURCE_URL,
        });
      }

      const result = emptyResult();
      for (const outcome of outcomes) {
        result[outcome.key] = outcome.value;
      }

      const someLiveFailed = resolvedOutcomes.some((o) => o.errored);
      return makeOkResult(result, {
        kilde: "arealdata",
        sourceUrl: SOURCE_URL,
        rawFeatureCount: 0,
        confidence: someLiveFailed ? "unknown" : "confirmed",
      });
    } catch (error) {
      return makeErrorResult<ArealdataContextResult>(error, {
        kilde: "arealdata",
        sourceUrl: SOURCE_URL,
      });
    }
  }
}
```

- [ ] **Step 3: Kør TypeScript check**

```bash
bunx tsc --noEmit
```

Forventet: ingen fejl. Hvis `parcelPolygon` har en anden type i polygon-helper, justér typen til at matche den eksisterende `GeoJSON.Feature | GeoJSON.FeatureCollection | null | undefined`.

- [ ] **Step 4: Commit**

```bash
git add src/integrations/arealdata/client.ts
git commit -m "fix(arealdata): split endpoints after DAI WFS closure

Old endpoint permanently redirected to SPA frontend.
New sources:
- GeoServer (public): paragraph3, natura2000 (3 sub-layers OR),
  protectedDige (DWITHIN 2m), bnbo, rawMaterialArea
- Miljoegis Grukos (public): osd (wkb_geometry)
- Unresolved (null): fortidsminde, fortidsmindeBuffer

natura2000 now correctly checks habitat+fugle+ramsar separately.
protectedDige uses DWITHIN 2m (MultiCurve geometry, not surface).
Zod validation added on all JSON boundaries (Rule 1)."
```

---

## Task 2: Opret `arealdata/client.test.ts`

Tjek om der allerede eksisterer en testfil: `src/integrations/arealdata/client.test.ts`. Opret den hvis den mangler.

**Files:**

- Create/Modify: `src/integrations/arealdata/client.test.ts`

- [ ] **Step 1: Skriv testfil**

```typescript
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { ArealdataService } from "./client";

// GeoServer JSON mock
function geoServerJson(totalFeatures: number): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ totalFeatures, features: [] }),
  } as unknown as Response;
}

function errorResponse(status = 500): Response {
  return { ok: false, status } as unknown as Response;
}

// Hjælper: lav en mock der returnerer responses baseret på URL-indhold
function urlMock(map: Record<string, Response>, fallback: Response): typeof fetch {
  return mock(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    for (const [key, res] of Object.entries(map)) {
      if (url.includes(key)) return res;
    }
    return fallback;
  }) as unknown as typeof fetch;
}

describe("ArealdataService.getContext", () => {
  beforeEach(() => {
    globalThis.fetch = fetch;
  });

  it("returnerer status=ok med confirmed confidence når alle live lag lykkes", async () => {
    globalThis.fetch = urlMock(
      {
        bes_naturtyper: geoServerJson(0),
        habitat_omr: geoServerJson(0),
        fugle_bes_omr: geoServerJson(0),
        ramsar_omr: geoServerJson(0),
        bes_sten_jorddiger: geoServerJson(0),
        status_bnbo: geoServerJson(0),
        drikkevandsinteresser: geoServerJson(0),
        raastofomr: geoServerJson(0),
      },
      errorResponse(404),
    );

    const result = await ArealdataService.getContext({ lat: 55.7, lng: 12.5 });

    expect(result.status).toBe("ok");
    expect(result.confidence).toBe("confirmed");
    expect(result.data?.paragraph3Nature).toBe(false);
    expect(result.data?.natura2000).toBe(false);
    expect(result.data?.osd).toBe(false);
    // fortidsminde/fortidsmindeBuffer er altid null (ingen endpoint)
    expect(result.data?.fortidsminde).toBeNull();
    expect(result.data?.fortidsmindeBuffer).toBeNull();
  });

  it("returnerer natura2000=true når et af de tre sub-lag har features", async () => {
    globalThis.fetch = urlMock(
      {
        bes_naturtyper: geoServerJson(0),
        habitat_omr: geoServerJson(0),
        fugle_bes_omr: geoServerJson(1), // hit på fugle
        ramsar_omr: geoServerJson(0),
        bes_sten_jorddiger: geoServerJson(0),
        status_bnbo: geoServerJson(0),
        drikkevandsinteresser: geoServerJson(0),
        raastofomr: geoServerJson(0),
      },
      errorResponse(404),
    );

    const result = await ArealdataService.getContext({ lat: 55.5, lng: 8.1 });

    expect(result.status).toBe("ok");
    expect(result.data?.natura2000).toBe(true);
  });

  it("returnerer osd=true ved OSD-koordinat via Grukos endpoint", async () => {
    globalThis.fetch = urlMock(
      {
        bes_naturtyper: geoServerJson(0),
        habitat_omr: geoServerJson(0),
        fugle_bes_omr: geoServerJson(0),
        ramsar_omr: geoServerJson(0),
        bes_sten_jorddiger: geoServerJson(0),
        status_bnbo: geoServerJson(0),
        drikkevandsinteresser: geoServerJson(1), // OSD hit
        raastofomr: geoServerJson(0),
      },
      errorResponse(404),
    );

    const result = await ArealdataService.getContext({ lat: 55.75, lng: 12.45 });

    expect(result.status).toBe("ok");
    expect(result.data?.osd).toBe(true);
  });

  it("returnerer fortidsminde=null og fortidsmindeBuffer=null altid (ingen endpoint)", async () => {
    globalThis.fetch = urlMock({}, geoServerJson(0));

    const result = await ArealdataService.getContext({ lat: 55.7, lng: 12.5 });

    expect(result.data?.fortidsminde).toBeNull();
    expect(result.data?.fortidsmindeBuffer).toBeNull();
  });

  it("returnerer confidence=unknown når et live lag fejler", async () => {
    globalThis.fetch = urlMock(
      {
        bes_naturtyper: errorResponse(503), // paragraph3 fejler
        habitat_omr: geoServerJson(0),
        fugle_bes_omr: geoServerJson(0),
        ramsar_omr: geoServerJson(0),
        bes_sten_jorddiger: geoServerJson(0),
        status_bnbo: geoServerJson(0),
        drikkevandsinteresser: geoServerJson(0),
        raastofomr: geoServerJson(0),
      },
      errorResponse(404),
    );

    const result = await ArealdataService.getContext({ lat: 55.7, lng: 12.5 });

    expect(result.status).toBe("ok");
    expect(result.confidence).toBe("unknown");
    expect(result.data?.paragraph3Nature).toBeNull();
  });

  it("returnerer status=error når alle live lag fejler", async () => {
    globalThis.fetch = mock(async () => errorResponse(503)) as unknown as typeof fetch;

    const result = await ArealdataService.getContext({ lat: 55.7, lng: 12.5 });

    expect(result.status).toBe("error");
  });
});
```

- [ ] **Step 2: Kør tests**

```bash
bun test src/integrations/arealdata/client.test.ts
```

Forventet: 6 tests PASS.

Hvis URL-mock ikke matcher fordi GeoServer-URL'en ikke indeholder lag-nøglen direkte, tilpas mock-nøglerne til at matche typenames som de fremgår af `fetch`-URL'en (f.eks. `dai%3Abes_naturtyper` eller `bes_naturtyper`).

- [ ] **Step 3: Kør hele test-suite**

```bash
bun test src
```

Forventet: ingen regressions.

- [ ] **Step 4: Kør TypeScript + lint**

```bash
bunx tsc --noEmit && bunx eslint src/integrations/arealdata/
```

- [ ] **Step 5: Commit**

```bash
git add src/integrations/arealdata/client.test.ts
git commit -m "test(arealdata): add tests for multi-endpoint architecture"
```

---

## Arkitektoniske beslutninger og begrænsninger

### Hvorfor `fortidsminde` og `fortidsmindeBuffer` returnerer `null` og ikke `false`

Den semantiske forskel er afgørende for et compliance-system:

- `false` = "vi har tjekket, der er ingen restriktion"
- `null` = "vi ved det ikke"

Med det lukkede DAI WFS returnerede koden pt. `null` for alle lag (de fejlede alle). Med den nye implementering er `null` en _eksplicit_ degradering for de to uafklarede lag, mens de øvrige lag giver pålidelige `true`/`false`.

### Hvorfor `protectedDige` bruger `DWITHIN 2m`

Laget `dai:bes_sten_jorddiger_2022` er registreret som `MultiCurve` (linjer). Et adressepunkt rammer næsten aldrig en linje præcist med `INTERSECTS`. Lovgivningsmæssigt er der to relevante afstande for diger: 2 m beskyttelseszone (byggeforbud) og 50 m kirkebeskyttelseszone. Vi bruger 2 m til at detektere om adressepunktet er inden for den umiddelbare beskyttelseszone.

### Hvorfor `natura2000` er split på tre lag

Det gamle `dmp:NATURA2000` dækkede sandsynligvis alle tre undertyper. De tre GeoServer-lag er separate og OR-kombineres: en adresse er inden for Natura 2000 hvis den rammer ét eller flere af habitat, fugle- eller Ramsar-område.

### OSD på separat Miljoegis endpoint

`dai:status_bnbo` er BNBO (Boringsnære Beskyttelsesområder), mens OSD (Områder med Særlige Drikkevandsinteresser) er på Miljoegis Grukos. Disse er to forskellige databeskyttelsesniveauer og må ikke forveksles.
