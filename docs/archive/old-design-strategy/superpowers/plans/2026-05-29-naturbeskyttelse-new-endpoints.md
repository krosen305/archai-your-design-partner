# Naturbeskyttelse — Nyt WFS Endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Erstat det lukkede DAI WFS (`arealinformation.miljoeportal.dk`) med to nye autoritative kilder — ny GeoServer for sø/å/skov/kirke og Datafordeler MAT WFS for strand/klit — og aktiver kirkebyggelinje som rigtig datakilde.

**Architecture:** `naturbeskyttelse.ts` splittes i to interne fetcher-funktioner: én mod den nye offentlige GeoServer (`arealeditering-dist-geo.miljoeportal.dk/geoserver/wfs`, JSON-output) og én mod Datafordeler MAT WFS (GML XML-output, `numberMatched`-parsing). `NaturbeskyttelsesResultat`-typen udvides med `kirkebyggelinje: boolean` som nu er en reel kilde. Ingen ændringer i downstream-konsumenter — returtypen er kompatibel.

**Tech Stack:** TypeScript, Bun:test, WFS 2.0, CQL_FILTER, GML XML string-parsing

---

## Endpoint-oversigt (verificeret live)

### GeoServer — ingen auth krævet

- URL: `https://arealeditering-dist-geo.miljoeportal.dk/geoserver/wfs`
- Output: `application/json`
- Geometry-felt: `Shape`
- Filter-syntax: `CQL_FILTER=INTERSECTS(Shape,SRID=4326;POINT(lng lat))`
- Parse: `response.totalFeatures ?? response.features?.length ?? 0`

| Lag             | typename               |
| --------------- | ---------------------- |
| Søbeskyttelse   | `dai:soe_bes_linjer`   |
| Åbeskyttelse    | `dai:aa_bes_linjer`    |
| Skovbyggelinje  | `dai:skovbyggelinjer`  |
| Kirkebyggelinje | `dai:kirkebyggelinjer` |

### Datafordeler MAT WFS — `DATAFORDELER_API_KEY` (allerede i brug)

- URL: `https://wfs.datafordeler.dk/MATRIKLEN2/MatGaeldendeOgForeloebigWFS/1.0.0/WFS`
- Output: GML XML (JSON ikke understøttet af denne service)
- Geometry-felt: `geometri`
- Filter-syntax: `CQL_FILTER=INTERSECTS(geometri,SRID=4326;POINT(lng lat))`
- Parse: regex `numberMatched="(\d+)"` på response-tekst

| Lag               | typename                               |
| ----------------- | -------------------------------------- |
| Strandbeskyttelse | `mat:StrandbeskyttelseFlade_Gaeldende` |
| Klitfredning      | `mat:KlitfredningFlade_Gaeldende`      |

---

## Berørte filer

| Fil                                              | Ændring                                                               |
| ------------------------------------------------ | --------------------------------------------------------------------- |
| `src/integrations/sdfi/naturbeskyttelse.ts`      | Fuldt omskrevet — split endpoints, ny type, kirkebyggelinje aktiveret |
| `src/integrations/sdfi/naturbeskyttelse.test.ts` | Opdateret tests — håndterer to fetch-mønstre, tester kirkebyggelinje  |

**Ikke berørt:** `src/integrations/arealdata/client.ts` bruger samme gamle endpoint — separat issue, ikke i scope her.

---

## Task 1: Opdater `naturbeskyttelse.ts` med split-endpoint arkitektur

**Files:**

- Modify: `src/integrations/sdfi/naturbeskyttelse.ts`

- [ ] **Step 1: Erstat hele filen med ny implementation**

```typescript
// SERVER-SIDE ONLY — never import from browser code.
//
// SDFI naturbeskyttelseslinjer — opdateret med nyt endpoint efter DAI WFS lukning.
//
// Det gamle endpoint (arealinformation.miljoeportal.dk) er permanent lukket (HTTP 308 → SPA).
// Data er nu splittet på to autoritative kilder:
//
// Kilde A — Miljøportalens GeoServer (offentlig, ingen auth):
//   URL:      https://arealeditering-dist-geo.miljoeportal.dk/geoserver/wfs
//   Lag:      dai:soe_bes_linjer, dai:aa_bes_linjer, dai:skovbyggelinjer, dai:kirkebyggelinjer
//   Output:   application/json
//   Geometri: Shape
//
// Kilde B — Datafordeler MAT WFS (DATAFORDELER_API_KEY, allerede i brug til parcelgeometri):
//   URL:      https://wfs.datafordeler.dk/MATRIKLEN2/MatGaeldendeOgForeloebigWFS/1.0.0/WFS
//   Lag:      mat:StrandbeskyttelseFlade_Gaeldende, mat:KlitfredningFlade_Gaeldende
//   Output:   GML XML (JSON ikke understøttet)
//   Geometri: geometri

import { getEnvRequired } from "@/lib/env";
import { makeErrorResult, makeOkResult, type SourceResult } from "@/lib/source-result";

const GEOSERVER_WFS = "https://arealeditering-dist-geo.miljoeportal.dk/geoserver/wfs";
const MAT_WFS = "https://wfs.datafordeler.dk/MATRIKLEN2/MatGaeldendeOgForeloebigWFS/1.0.0/WFS";

const SOURCE_URL = GEOSERVER_WFS;

export type NaturbeskyttelsesResultat = {
  strandbeskyttelse: boolean;
  skovbyggelinje: boolean;
  soebeskyttelse: boolean;
  aabeskyttelse: boolean;
  klitfredning: boolean;
  kirkebyggelinje: boolean; // aktiveret: dai:kirkebyggelinjer på GeoServer
};

type Koordinat = { lat: number; lng: number };

type LayerKey = keyof NaturbeskyttelsesResultat;

type GeoServerLayer = { source: "geoserver"; key: LayerKey; typename: string };
type MatWfsLayer = { source: "mat"; key: LayerKey; typename: string };
type LayerConfig = GeoServerLayer | MatWfsLayer;

const LAYERS: ReadonlyArray<LayerConfig> = [
  // Kilde A — GeoServer
  { source: "geoserver", key: "soebeskyttelse", typename: "dai:soe_bes_linjer" },
  { source: "geoserver", key: "aabeskyttelse", typename: "dai:aa_bes_linjer" },
  { source: "geoserver", key: "skovbyggelinje", typename: "dai:skovbyggelinjer" },
  { source: "geoserver", key: "kirkebyggelinje", typename: "dai:kirkebyggelinjer" },
  // Kilde B — Datafordeler MAT WFS
  { source: "mat", key: "strandbeskyttelse", typename: "mat:StrandbeskyttelseFlade_Gaeldende" },
  { source: "mat", key: "klitfredning", typename: "mat:KlitfredningFlade_Gaeldende" },
];

type LayerOutcome = {
  key: LayerKey;
  value: boolean;
  featureCount: number;
  errored: boolean;
};

// --- GeoServer fetcher (JSON output) ---

type GeoServerJsonResponse = {
  totalFeatures?: number;
  features?: unknown[];
};

async function fetchGeoServerLayer(typename: string, koordinat: Koordinat): Promise<number> {
  const { lat, lng } = koordinat;
  const filter = `INTERSECTS(Shape,SRID=4326;POINT(${lng} ${lat}))`;
  const url =
    `${GEOSERVER_WFS}?service=WFS&version=2.0.0&request=GetFeature` +
    `&typeName=${typename}&count=1&outputFormat=application/json` +
    `&CQL_FILTER=${encodeURIComponent(filter)}`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });

  if (!res.ok) throw new Error(`GeoServer WFS HTTP ${res.status} for ${typename}`);

  const data = (await res.json()) as GeoServerJsonResponse;
  return data.totalFeatures ?? data.features?.length ?? 0;
}

// --- MAT WFS fetcher (GML XML output) ---

async function fetchMatWfsLayer(
  typename: string,
  koordinat: Koordinat,
  apiKey: string,
): Promise<number> {
  const { lat, lng } = koordinat;
  const filter = `INTERSECTS(geometri,SRID=4326;POINT(${lng} ${lat}))`;
  const url =
    `${MAT_WFS}?service=WFS&version=2.0.0&request=GetFeature` +
    `&typenames=${typename}&count=1&apikey=${apiKey}` +
    `&CQL_FILTER=${encodeURIComponent(filter)}`;

  const res = await fetch(url, {
    headers: { Accept: "application/xml, text/xml, */*;q=0.8" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw new Error(`MAT WFS HTTP ${res.status} for ${typename}`);

  const text = await res.text();
  // GML root element indeholder numberMatched="N" som attribut.
  // Eks: <wfs:FeatureCollection ... numberMatched="0" ...>
  const match = /numberMatched="(\d+)"/.exec(text);
  return match ? parseInt(match[1], 10) : 0;
}

// --- Service ---

export class NaturbeskyttelseService {
  static async getTilstand(koordinat: Koordinat): Promise<SourceResult<NaturbeskyttelsesResultat>> {
    try {
      const apiKey = getEnvRequired("DATAFORDELER_API_KEY");

      const outcomes = await Promise.all(
        LAYERS.map(async (layer): Promise<LayerOutcome> => {
          try {
            const count =
              layer.source === "geoserver"
                ? await fetchGeoServerLayer(layer.typename, koordinat)
                : await fetchMatWfsLayer(layer.typename, koordinat, apiKey);
            return { key: layer.key, value: count > 0, featureCount: count, errored: false };
          } catch {
            return { key: layer.key, value: false, featureCount: 0, errored: true };
          }
        }),
      );

      const successCount = outcomes.filter((o) => !o.errored).length;
      if (successCount === 0) {
        return makeErrorResult<NaturbeskyttelsesResultat>(
          new Error("Naturbeskyttelse: alle lag fejlede"),
          { kilde: "naturbeskyttelse", sourceUrl: SOURCE_URL },
          { kind: "all_layers_failed" },
        );
      }

      const result: NaturbeskyttelsesResultat = {
        strandbeskyttelse: false,
        skovbyggelinje: false,
        soebeskyttelse: false,
        aabeskyttelse: false,
        klitfredning: false,
        kirkebyggelinje: false,
      };
      let totalFeatureCount = 0;
      for (const outcome of outcomes) {
        result[outcome.key] = outcome.value;
        totalFeatureCount += outcome.featureCount;
      }

      const someErrored = outcomes.some((o) => o.errored);
      return makeOkResult(result, {
        kilde: "naturbeskyttelse",
        sourceUrl: SOURCE_URL,
        rawFeatureCount: totalFeatureCount,
        confidence: someErrored ? "unknown" : "confirmed",
      });
    } catch (error) {
      return makeErrorResult<NaturbeskyttelsesResultat>(error, {
        kilde: "naturbeskyttelse",
        sourceUrl: SOURCE_URL,
      });
    }
  }
}
```

- [ ] **Step 2: Kør TypeScript check**

```bash
bunx tsc --noEmit
```

Forventet: ingen fejl relateret til `naturbeskyttelse.ts`. Hvis `kirkebyggelinje` var sat til `false` andre steder med kommentaren "not in DAI", opdater de kommentarer.

- [ ] **Step 3: Commit**

```bash
git add src/integrations/sdfi/naturbeskyttelse.ts
git commit -m "fix(naturbeskyttelse): split endpoints after DAI WFS closure

Old endpoint (arealinformation.miljoeportal.dk) permanently redirects to SPA.
Replace with:
- GeoServer (public): soe/aa/skov/kirke layers via JSON
- MAT WFS (apikey): strand/klit via GML XML numberMatched

Activates kirkebyggelinje as real data source."
```

---

## Task 2: Opdater tests til to-kilde arkitektur

**Files:**

- Modify: `src/integrations/sdfi/naturbeskyttelse.test.ts`

- [ ] **Step 1: Erstat hele testfilen**

Bemærk: To fetch-mønstre skal mockes — GeoServer returnerer JSON, MAT WFS returnerer GML XML tekst.

```typescript
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { NaturbeskyttelseService } from "./naturbeskyttelse";

// Hjælpefunktioner til at bygge mock-responses
function geoServerJson(totalFeatures: number): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ totalFeatures, features: [] }),
  } as unknown as Response;
}

function matWfsGml(numberMatched: number): Response {
  const body = `<?xml version="1.0"?><wfs:FeatureCollection numberMatched="${numberMatched}" numberReturned="0"/>`;
  return {
    ok: true,
    status: 200,
    text: async () => body,
  } as unknown as Response;
}

function errorResponse(status = 500): Response {
  return { ok: false, status } as unknown as Response;
}

// Rækkefølgen af fetch-kald matcher LAYERS-arrayet i naturbeskyttelse.ts:
// [0] soe_bes_linjer    → GeoServer JSON
// [1] aa_bes_linjer     → GeoServer JSON
// [2] skovbyggelinjer   → GeoServer JSON
// [3] kirkebyggelinjer  → GeoServer JSON
// [4] StrandbeskyttelseFlade_Gaeldende → MAT WFS GML
// [5] KlitfredningFlade_Gaeldende      → MAT WFS GML

describe("NaturbeskyttelseService.getTilstand", () => {
  beforeEach(() => {
    process.env["DATAFORDELER_API_KEY"] = "test-key";
    globalThis.fetch = fetch;
  });

  it("returnerer status=ok med confirmed confidence når alle 6 lag lykkes", async () => {
    let call = 0;
    globalThis.fetch = mock(async () => {
      const responses = [
        geoServerJson(0), // soe
        geoServerJson(0), // aa
        geoServerJson(1), // skov — hit
        geoServerJson(0), // kirke
        matWfsGml(1), // strand — hit
        matWfsGml(0), // klit
      ];
      return responses[call++]!;
    }) as unknown as typeof fetch;

    const result = await NaturbeskyttelseService.getTilstand({ lat: 55.7, lng: 12.5 });

    expect(result.status).toBe("ok");
    expect(result.confidence).toBe("confirmed");
    expect(result.data?.skovbyggelinje).toBe(true);
    expect(result.data?.strandbeskyttelse).toBe(true);
    expect(result.data?.soebeskyttelse).toBe(false);
    expect(result.data?.kirkebyggelinje).toBe(false);
    expect(result.data?.klitfredning).toBe(false);
  });

  it("returnerer kirkebyggelinje=true når GeoServer returnerer features", async () => {
    let call = 0;
    globalThis.fetch = mock(async () => {
      // kirkebyggelinjer er lag [3] — alle andre er 0
      const counts = [0, 0, 0, 1, 0, 0];
      const isMatLayer = call >= 4;
      const n = counts[call++]!;
      return isMatLayer ? matWfsGml(n) : geoServerJson(n);
    }) as unknown as typeof fetch;

    const result = await NaturbeskyttelseService.getTilstand({ lat: 55.7, lng: 12.5 });

    expect(result.status).toBe("ok");
    expect(result.data?.kirkebyggelinje).toBe(true);
  });

  it("returnerer status=error med kind=all_layers_failed når alle lag fejler", async () => {
    globalThis.fetch = mock(async () => errorResponse(503)) as unknown as typeof fetch;

    const result = await NaturbeskyttelseService.getTilstand({ lat: 55.7, lng: 12.5 });

    expect(result.status).toBe("error");
    expect(result.confidence).toBe("unknown");
    expect(result.data).toBeNull();
  });

  it("returnerer ok med confidence=unknown når nogen lag fejler men andre lykkes", async () => {
    let call = 0;
    globalThis.fetch = mock(async () => {
      // Første kald fejler, resten lykkes med 0 features
      if (call++ === 0) return errorResponse(500);
      const isMatLayer = call > 4;
      return isMatLayer ? matWfsGml(0) : geoServerJson(0);
    }) as unknown as typeof fetch;

    const result = await NaturbeskyttelseService.getTilstand({ lat: 55.7, lng: 12.5 });

    expect(result.status).toBe("ok");
    expect(result.confidence).toBe("unknown");
    expect(result.data?.soebeskyttelse).toBe(false);
  });

  it("parser MAT WFS GML numberMatched korrekt for strandbeskyttelse og klitfredning", async () => {
    let call = 0;
    globalThis.fetch = mock(async () => {
      const isMatLayer = call >= 4;
      const n = call >= 4 ? 2 : 0; // MAT-lag har 2 features
      call++;
      return isMatLayer ? matWfsGml(n) : geoServerJson(n);
    }) as unknown as typeof fetch;

    const result = await NaturbeskyttelseService.getTilstand({ lat: 56.0, lng: 8.5 });

    expect(result.status).toBe("ok");
    expect(result.data?.strandbeskyttelse).toBe(true);
    expect(result.data?.klitfredning).toBe(true);
  });
});
```

- [ ] **Step 2: Kør tests**

```bash
bun test src/integrations/sdfi/naturbeskyttelse.test.ts
```

Forventet: 5 tests PASS.

- [ ] **Step 3: Kør hele test-suite for at sikre ingen regressions**

```bash
bun test src
```

Forventet: alle eksisterende tests passer stadig. `naturbeskyttelse`-relaterede consumer-tests bruger stadig samme returtype — `kirkebyggelinje` var allerede i typen som `false`.

- [ ] **Step 4: Kør TypeScript + lint**

```bash
bunx tsc --noEmit && bunx eslint src/integrations/sdfi/
```

Forventet: ingen fejl.

- [ ] **Step 5: Commit**

```bash
git add src/integrations/sdfi/naturbeskyttelse.test.ts
git commit -m "test(naturbeskyttelse): opdater tests til split GeoServer/MAT WFS arkitektur

Tests dækker: alle 6 lag bekræftet, kirkebyggelinje aktiveret,
all_layers_failed, partial confidence, MAT XML parsing."
```

---

## Verificering efter implementering

Kør en test-analyse og tjek at debug-viewet nu viser:

```
DAI WFS naturbeskyttelse.getTilstand
out: status=ok confidence=confirmed features=N error_kind=(absent)
```

I stedet for det nuværende:

```
out: status=error confidence=unknown features=null error_kind=all_layers_failed
```

---

## Kendte begrænsninger

- `src/integrations/arealdata/client.ts` bruger samme gamle DAI-endpoint for paragraph3/natura2000/diger/fortidsminde/BNBO/OSD/råstof — separat issue, ikke i dette scope.
- MAT WFS for strand/klit returnerer ikke JSON — `numberMatched` parser fra GML root-attribut er tilstrækkeligt for boolean overlap-check.
- Kirkebyggelinje var tidligere kommenteret som "ikke i DAI — kræver separat kilde". Den er nu aktiveret fra GeoServer. Downstream-konsumenter fik allerede `kirkebyggelinje: false` — nu kan de få `true`.
