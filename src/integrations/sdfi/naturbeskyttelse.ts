// SERVER-SIDE ONLY — never import from browser code.
//
// SDFI naturbeskyttelseslinjer — ARCH-65.
// Hårde bygge-stop fra naturbeskyttelsesloven der gælder OVENI lokalplanen.
//
// Endpoint verificeret 2026-05-08 (ARCH-65): alle 5 typenames returnerer HTTP 200.
//
// API: Danmarks Arealinformation (DAI) WFS via Miljøportalen.
//   Endpoint:   https://arealinformation.miljoeportal.dk/gis/services/DAIdb/MapServer/WFSServer
//   Auth:       Ingen (offentlig tjeneste)
//   Format:     WFS 2.0, CQL_FILTER med INTERSECTS(Shape,...), outputformat=application/json
//   Typenames:  dmp:STRANDBESKYTTELSESLINJE, dmp:SKOVBYGGELINJE,
//               dmp:SOEBESKYTTELSESLINJE, dmp:AABESKYTTELSESLINJE, dmp:KLITFREDNING
//
// OBS: strandbeskyttelse + klitfredning dækkes OGSÅ af MAT_Jordstykke (live).
// DAI WFS er den spatiale kilde; MAT er den registrerede kilde — komplementære checks.

import { makeErrorResult, makeOkResult, type SourceResult } from "@/lib/source-result";

const DAI_WFS = "https://arealinformation.miljoeportal.dk/gis/services/DAIdb/MapServer/WFSServer";
const SOURCE_URL = `${DAI_WFS}?service=WFS&typenames=dmp:STRANDBESKYTTELSESLINJE,SKOVBYGGELINJE,SOEBESKYTTELSESLINJE,AABESKYTTELSESLINJE,KLITFREDNING`;

export type NaturbeskyttelsesResultat = {
  strandbeskyttelse: boolean;
  skovbyggelinje: boolean;
  soebeskyttelse: boolean;
  aabeskyttelse: boolean;
  klitfredning: boolean;
  kirkebyggelinje: boolean; // ikke i DAI — kræver separat kilde
};

type Koordinat = { lat: number; lng: number };

type LayerKey = Exclude<keyof NaturbeskyttelsesResultat, "kirkebyggelinje">;

const LAYERS: ReadonlyArray<{ typename: string; key: LayerKey }> = [
  { typename: "dmp:STRANDBESKYTTELSESLINJE", key: "strandbeskyttelse" },
  { typename: "dmp:SKOVBYGGELINJE", key: "skovbyggelinje" },
  { typename: "dmp:SOEBESKYTTELSESLINJE", key: "soebeskyttelse" },
  { typename: "dmp:AABESKYTTELSESLINJE", key: "aabeskyttelse" },
  { typename: "dmp:KLITFREDNING", key: "klitfredning" },
];

async function erIndenforLag(typename: string, koordinat: Koordinat): Promise<number> {
  const { lat, lng } = koordinat;
  const filter = encodeURIComponent(`INTERSECTS(Shape,SRID=4326;POINT(${lng} ${lat}))`);
  const url =
    `${DAI_WFS}?service=WFS&version=2.0.0&request=GetFeature` +
    `&typename=${typename}&count=1&outputformat=application%2Fjson` +
    `&CQL_FILTER=${filter}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });

  if (!res.ok) {
    throw new Error(`DAI WFS HTTP ${res.status} for ${typename}`);
  }

  const data = (await res.json()) as { totalFeatures?: number; features?: unknown[] };
  return data.totalFeatures ?? data.features?.length ?? 0;
}

type LayerOutcome = { key: LayerKey; value: boolean; featureCount: number; errored: boolean };

export class NaturbeskyttelseService {
  static async getTilstand(koordinat: Koordinat): Promise<SourceResult<NaturbeskyttelsesResultat>> {
    try {
      const outcomes = await Promise.all(
        LAYERS.map(async (layer): Promise<LayerOutcome> => {
          try {
            const count = await erIndenforLag(layer.typename, koordinat);
            return { key: layer.key, value: count > 0, featureCount: count, errored: false };
          } catch {
            // Per-lag fejl mappes til false for at bevare downstream-kontrakten,
            // men confidence sættes til "unknown" hvis nogen lag fejlede.
            return { key: layer.key, value: false, featureCount: 0, errored: true };
          }
        }),
      );

      const successCount = outcomes.filter((o) => !o.errored).length;
      if (successCount === 0) {
        return makeErrorResult<NaturbeskyttelsesResultat>(
          new Error("DAI Naturbeskyttelse: alle lag fejlede"),
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
