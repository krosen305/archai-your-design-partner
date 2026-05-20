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
  nuancering: string | null; // fra V1/V2 feature properties
  lokalitetsId: string | null; // DK-Jord lokalitets-id
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
  const feature = geojson.type === "FeatureCollection" ? geojson.features[0] : geojson;
  if (!feature) return null;

  const geom = feature.geometry;
  if (!geom || geom.type !== "Polygon") return null;

  const ring = (geom as GeoJSON.Polygon).coordinates[0];
  if (!ring || ring.length < 4) return null;

  // GeoJSON koordinater er [lng, lat] — WKT INTERSECTS bruger lng lat rækkefølge
  const wkt = ring.map(([lng, lat]) => `${lng} ${lat}`).join(", ");
  return `POLYGON((${wkt}))`;
}

function buildCqlFilter(
  koordinat: Koordinat,
  polygon: GeoJSON.Feature | GeoJSON.FeatureCollection | null | undefined,
): string {
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
        getFeatures("dkjord:V1", koordinat, parcelPolygon),
        getFeatures("dkjord:V2", koordinat, parcelPolygon),
        getFeatures("dkjord:olietank", koordinat, parcelPolygon),
        getFeatures("dkjord:omraadet", koordinat, parcelPolygon),
      ]);

      const v1Count = v1Data.totalFeatures ?? v1Data.features?.length ?? 0;
      const v2Count = v2Data.totalFeatures ?? v2Data.features?.length ?? 0;
      const olietankCount = olietankData.totalFeatures ?? olietankData.features?.length ?? 0;
      const omraadeCount = omraadeData.totalFeatures ?? omraadeData.features?.length ?? 0;
      const totalFeatures = v1Count + v2Count + olietankCount + omraadeCount;

      // Udtræk nuancering og lokalitetsId fra første V2- eller V1-feature
      const hitFeature = v2Data.features?.[0] ?? v1Data.features?.[0] ?? null;
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
