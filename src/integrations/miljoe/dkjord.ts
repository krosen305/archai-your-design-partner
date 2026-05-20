// SERVER-SIDE ONLY — never import from browser code.
//
// DK-Jord integration — forurening, olietanke, områdeklassificering — ARCH-66.
// V2-kortlagt grund kan koste 500.000 kr.+ i oprensning inden byggeri.
//
// ⚠️  IS_MOCK=true — live API afventer netværksadgang til dkjord.mst.dk.
// Flip IS_MOCK = false i ARCH-241 (DK-Jord live).
//
// Reference implementation for the SourceResult<T> contract (ARCH-239).
// New services should follow this pattern exactly.
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

import { makeOkResult, makeErrorResult, makeMockResult } from "@/lib/source-result";
import type { SourceResult } from "@/lib/source-result";
import type * as GeoJSON from "geojson";

const IS_MOCK = true;

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
  nuancering: string | null; // fra V1/V2 feature properties — null hvis ikke udstillet
  lokalitetsId: string | null; // DK-Jord lokalitets-id til deep-link
  kilde: "dkjord" | "mock";
};

type Koordinat = { lat: number; lng: number };

type WfsJsonResponse = {
  totalFeatures?: number;
  features?: { properties?: Record<string, unknown> }[];
};

function buildWktFromPolygon(
  geojson: GeoJSON.Feature | GeoJSON.FeatureCollection,
): string | null {
  let geometry: GeoJSON.Geometry | null = null;
  if (geojson.type === "Feature") {
    geometry = geojson.geometry;
  } else if (geojson.type === "FeatureCollection" && geojson.features.length > 0) {
    geometry = geojson.features[0]!.geometry;
  }
  if (!geometry || geometry.type !== "Polygon") return null;
  const ring = geometry.coordinates[0];
  if (!ring || ring.length === 0) return null;
  const coords = ring.map((c) => `${c[0]} ${c[1]}`).join(",");
  return `POLYGON((${coords}))`;
}

async function getFeatures(
  typename: string,
  koordinat: Koordinat,
  parcelPolygon?: GeoJSON.Feature | GeoJSON.FeatureCollection | null,
): Promise<WfsJsonResponse> {
  const { lat, lng } = koordinat;
  const wkt =
    parcelPolygon != null ? buildWktFromPolygon(parcelPolygon) : null;
  const spatialPredicate = wkt
    ? `INTERSECTS(geometry,${wkt})`
    : `INTERSECTS(geometry,POINT(${lng} ${lat}))`;
  const filter = encodeURIComponent(spatialPredicate);
  const url =
    `${DKJORD_WFS}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature` +
    `&TYPENAMES=${typename}&SRSNAME=EPSG:4326&COUNT=5` +
    `&OUTPUTFORMAT=application/json&CQL_FILTER=${filter}`;

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
    if (IS_MOCK) {
      // Realistisk resultat for Hasselvej 48, Skovlunde (jf. Resights-data)
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
    }

    try {
      const [v1Data, v2Data, olietankData, omraadeData] = await Promise.all([
        getFeatures("dkjord:V1", koordinat, parcelPolygon).catch((): WfsJsonResponse => ({ features: [] })),
        getFeatures("dkjord:V2", koordinat, parcelPolygon).catch((): WfsJsonResponse => ({ features: [] })),
        getFeatures("dkjord:olietank", koordinat, parcelPolygon).catch((): WfsJsonResponse => ({ features: [] })),
        getFeatures("dkjord:omraadet", koordinat, parcelPolygon).catch((): WfsJsonResponse => ({ features: [] })),
      ]);

      const olietankFeature = olietankData.features?.[0];
      const omraadeFeature = omraadeData.features?.[0];
      const totalFeatures =
        (v1Data.totalFeatures ?? v1Data.features?.length ?? 0) +
        (v2Data.totalFeatures ?? v2Data.features?.length ?? 0) +
        (olietankData.totalFeatures ?? olietankData.features?.length ?? 0) +
        (omraadeData.totalFeatures ?? omraadeData.features?.length ?? 0);

      return makeOkResult<DkJordResultat>(
        {
          v1Kortlagt: (v1Data.totalFeatures ?? v1Data.features?.length ?? 0) > 0,
          v2Kortlagt: (v2Data.totalFeatures ?? v2Data.features?.length ?? 0) > 0,
          olietank: {
            eksisterer: (olietankData.totalFeatures ?? olietankData.features?.length ?? 0) > 0,
            driftsstatus:
              (olietankFeature?.properties?.["driftsstatus"] as string | undefined) ?? null,
          },
          omraadeklassificering:
            (omraadeFeature?.properties?.["omraadenavn"] as string | undefined) ?? null,
          nuancering: null,
          lokalitetsId: null,
          kilde: "dkjord",
        },
        { kilde: "dkjord", sourceUrl: SOURCE_URL, rawFeatureCount: totalFeatures },
      );
    } catch (e) {
      return makeErrorResult<DkJordResultat>(e, { kilde: "dkjord", sourceUrl: DKJORD_WFS });
    }
  }
}
