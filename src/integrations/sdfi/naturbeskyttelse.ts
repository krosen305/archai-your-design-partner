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

import { z } from "zod";
import { getEnvRequired } from "@/lib/env";
import { makeErrorResult, makeOkResult, type SourceResult } from "@/lib/source-result";

const GEOSERVER_WFS =
  "https://arealeditering-dist-geo.miljoeportal.dk/geoserver/wfs";
const MAT_WFS =
  "https://wfs.datafordeler.dk/MATRIKLEN2/MatGaeldendeOgForeloebigWFS/1.0.0/WFS";

const SOURCE_URL = `${GEOSERVER_WFS} + ${MAT_WFS}`;

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
  { source: "geoserver", key: "soebeskyttelse",  typename: "dai:soe_bes_linjer" },
  { source: "geoserver", key: "aabeskyttelse",   typename: "dai:aa_bes_linjer" },
  { source: "geoserver", key: "skovbyggelinje",  typename: "dai:skovbyggelinjer" },
  { source: "geoserver", key: "kirkebyggelinje", typename: "dai:kirkebyggelinjer" },
  // Kilde B — Datafordeler MAT WFS
  { source: "mat", key: "strandbeskyttelse", typename: "mat:StrandbeskyttelseFlade_Gaeldende" },
  { source: "mat", key: "klitfredning",      typename: "mat:KlitfredningFlade_Gaeldende" },
];

type LayerOutcome = {
  key: LayerKey;
  value: boolean;
  featureCount: number;
  errored: boolean;
};

// --- GeoServer fetcher (JSON output) ---

const geoServerResponseSchema = z.object({
  totalFeatures: z.number().optional(),
  features: z.array(z.unknown()).optional(),
});

async function fetchGeoServerLayer(
  typename: string,
  koordinat: Koordinat,
): Promise<number> {
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

  const parsed = geoServerResponseSchema.safeParse(await res.json());
  if (!parsed.success) throw new Error(`GeoServer: unexpected response for ${typename}`);
  return parsed.data.totalFeatures ?? parsed.data.features?.length ?? 0;
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
