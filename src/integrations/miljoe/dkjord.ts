// SERVER-SIDE ONLY — never import from browser code.
//
// DK-Jord integration — forurening, olietanke, områdeklassificering — ARCH-66.
// V2-kortlagt grund kan koste 500.000 kr.+ i oprensning inden byggeri.
//
// API: Miljøportalen DK-Jord WFS (P0/P1 #4 — endpoint flyttet maj 2026 fra
// dkjord.mst.dk/wfs til jord.miljoeportal.dk/geo/wfs, nye typenames i View_*-
// mønstret og nyt geometri-felt Fladegeometri).
//   Endpoint:  https://jord.miljoeportal.dk/geo/wfs
//   Auth:      Ingen (offentlig tjeneste)
//   Format:    WFS 2.0, CQL_FILTER med INTERSECTS, SRSNAME=EPSG:4326
//   Geometri:  Fladegeometri (tidligere `geometry`)
//   Layers:
//     DKJord:View_V1Flader      — mulig forurening (undersøgelse kræves)
//     DKJord:View_V2Flader      — dokumenteret forurening (oprensning kræves)
//     DKJord:View_Olietanke     — gammel olietank (prøvetagning kræves)
//     DKJord:View_Omraadeklassificering — områdeklassificering
//
// Per-lag error-handling: hvis ét typename er forkert eller endpointet
// midlertidigt afviser ét lag, returneres tri-state null for det lag i stedet
// for at vælte hele kaldet. Hvis ALLE lag fejler returneres SourceResult error.

import { makeOkResult, makeErrorResult } from "@/lib/source-result";
import type { SourceResult } from "@/lib/source-result";
import type * as GeoJSON from "geojson";

const DKJORD_WFS = "https://jord.miljoeportal.dk/geo/wfs";
const TYPENAMES = {
  v1: "DKJord:View_V1Flader",
  v2: "DKJord:View_V2Flader",
  olietank: "DKJord:View_Olietanke",
  omraadeklassificering: "DKJord:View_Omraadeklassificering",
} as const;
const GEOMETRY_FIELD = "Fladegeometri";
const SOURCE_URL = `${DKJORD_WFS}?SERVICE=WFS&VERSION=2.0.0&TYPENAMES=${Object.values(TYPENAMES).join(",")}`;

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

type WfsFeature = { properties?: Record<string, unknown> };
type WfsJsonResponse = {
  totalFeatures?: number;
  features?: WfsFeature[];
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
    if (wkt) return `INTERSECTS(${GEOMETRY_FIELD},${wkt})`;
  }
  return `INTERSECTS(${GEOMETRY_FIELD},POINT(${koordinat.lng} ${koordinat.lat}))`;
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

type LayerOutcome = {
  data: WfsJsonResponse | null;
  errored: boolean;
};

async function tryGetFeatures(
  typename: string,
  koordinat: Koordinat,
  polygon: GeoJSON.Feature | GeoJSON.FeatureCollection | null | undefined,
): Promise<LayerOutcome> {
  try {
    const data = await getFeatures(typename, koordinat, polygon);
    return { data, errored: false };
  } catch {
    return { data: null, errored: true };
  }
}

function countFeatures(outcome: LayerOutcome): number {
  if (!outcome.data) return 0;
  return outcome.data.totalFeatures ?? outcome.data.features?.length ?? 0;
}

export class DkJordService {
  static async getTilstand(
    koordinat: Koordinat,
    parcelPolygon?: GeoJSON.Feature | GeoJSON.FeatureCollection | null,
  ): Promise<SourceResult<DkJordResultat>> {
    try {
      const [v1, v2, olietank, omraade] = await Promise.all([
        tryGetFeatures(TYPENAMES.v1, koordinat, parcelPolygon),
        tryGetFeatures(TYPENAMES.v2, koordinat, parcelPolygon),
        tryGetFeatures(TYPENAMES.olietank, koordinat, parcelPolygon),
        tryGetFeatures(TYPENAMES.omraadeklassificering, koordinat, parcelPolygon),
      ]);

      const outcomes = [v1, v2, olietank, omraade];
      const successCount = outcomes.filter((o) => !o.errored).length;

      if (successCount === 0) {
        return makeErrorResult<DkJordResultat>(new Error("DK-Jord WFS: alle lag fejlede"), {
          kilde: "dkjord",
          sourceUrl: DKJORD_WFS,
        });
      }

      const v1Count = countFeatures(v1);
      const v2Count = countFeatures(v2);
      const olietankCount = countFeatures(olietank);
      const omraadeCount = countFeatures(omraade);
      const totalFeatures = v1Count + v2Count + olietankCount + omraadeCount;

      // Udtræk nuancering og lokalitetsId fra første V2- eller V1-feature
      const hitFeature = v2.data?.features?.[0] ?? v1.data?.features?.[0] ?? null;
      const nuancering = (hitFeature?.properties?.["nuancering"] as string | undefined) ?? null;
      const lokalitetsId = (hitFeature?.properties?.["lokalitet_id"] as string | undefined) ?? null;

      const olietankFeature = olietank.data?.features?.[0];
      const omraadeFeature = omraade.data?.features?.[0];

      const someErrored = outcomes.some((o) => o.errored);

      return makeOkResult<DkJordResultat>(
        {
          v1Kortlagt: v1.errored ? null : v1Count > 0,
          v2Kortlagt: v2.errored ? null : v2Count > 0,
          olietank: {
            eksisterer: olietank.errored ? null : olietankCount > 0,
            driftsstatus:
              (olietankFeature?.properties?.["driftsstatus"] as string | undefined) ?? null,
          },
          omraadeklassificering:
            (omraadeFeature?.properties?.["omraadenavn"] as string | undefined) ?? null,
          nuancering,
          lokalitetsId,
          kilde: "dkjord",
        },
        {
          kilde: "dkjord",
          sourceUrl: SOURCE_URL,
          rawFeatureCount: totalFeatures,
          confidence: someErrored ? "unknown" : "confirmed",
        },
      );
    } catch (e) {
      return makeErrorResult<DkJordResultat>(e, { kilde: "dkjord", sourceUrl: DKJORD_WFS });
    }
  }
}
