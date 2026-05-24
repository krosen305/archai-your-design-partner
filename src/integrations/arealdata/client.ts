// SERVER-SIDE ONLY.
//
// Danmarks Arealinformation / Arealdata udvidede miljolag - ARCH-245.
// Adapteren er tri-state: true = overlap bekraeftet, false = ingen overlap,
// null = ukendt/API-fejl for det konkrete lag.
//
// OBS:
// Den tidligere offentlige WFS-adresse redirecter p.t. til SPA-frontenden.
// Denne adapter holder endpoint/layer-konfiguration samlet og failer korrekt
// til null/unknown, sa resten af systemet ikke tolker fejl som "ingen restriktion".

import { makeErrorResult, makeOkResult } from "@/lib/source-result";
import type { SourceResult } from "@/lib/source-result";
import type * as GeoJSON from "geojson";

const DAI_WFS = "https://arealinformation.miljoeportal.dk/gis/services/DAIdb/MapServer/WFSServer";
const SOURCE_URL = `${DAI_WFS}?SERVICE=WFS&VERSION=2.0.0`;

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

type WfsJsonResponse = {
  totalFeatures?: number;
  features?: unknown[];
};

type LayerConfig = {
  key: keyof ArealdataContextResult;
  typename: string;
};

type LayerOutcome = {
  key: keyof ArealdataContextResult;
  value: boolean | null;
  featureCount: number;
  errored: boolean;
};

// Typenames skal stadig verificeres mod den aktuelle produktionsservice.
// Hold dem samlet her, sa endpoint/layer-swap er et enkelt patch.
const LAYERS: LayerConfig[] = [
  { key: "paragraph3Nature", typename: "dmp:PARAGRAF3_NATUR" },
  { key: "natura2000", typename: "dmp:NATURA2000" },
  { key: "protectedDige", typename: "dmp:BESKYTTEDE_STEN_OG_JORDDIGER" },
  { key: "fortidsminde", typename: "dmp:FORTIDSMINDE" },
  { key: "fortidsmindeBuffer", typename: "dmp:FORTIDSMINDEBESKYTTELSESLINJE" },
  { key: "bnbo", typename: "dmp:BNBO" },
  { key: "osd", typename: "dmp:OSD" },
  { key: "rawMaterialArea", typename: "dmp:RAASTOFOMRAADER" },
];

function wfsPolygonFilter(geojson: GeoJSON.Feature | GeoJSON.FeatureCollection): string | null {
  const feature = geojson.type === "FeatureCollection" ? geojson.features[0] : geojson;
  if (!feature) return null;

  const geom = feature.geometry;
  if (!geom || geom.type !== "Polygon") return null;

  const ring = geom.coordinates[0];
  if (!ring || ring.length < 4) return null;

  const wkt = ring.map(([lng, lat]) => `${lng} ${lat}`).join(", ");
  return `POLYGON((${wkt}))`;
}

function buildCqlFilter(
  koordinat: Koordinat,
  polygon: GeoJSON.Feature | GeoJSON.FeatureCollection | null | undefined,
): string {
  if (polygon) {
    const wkt = wfsPolygonFilter(polygon);
    if (wkt) return `INTERSECTS(Shape,SRID=4326;${wkt})`;
  }

  return `INTERSECTS(Shape,SRID=4326;POINT(${koordinat.lng} ${koordinat.lat}))`;
}

async function getFeatures(
  typename: string,
  koordinat: Koordinat,
  polygon: GeoJSON.Feature | GeoJSON.FeatureCollection | null | undefined,
): Promise<WfsJsonResponse> {
  const cqlFilter = buildCqlFilter(koordinat, polygon);
  const url =
    `${DAI_WFS}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature` +
    `&TYPENAME=${typename}&COUNT=1&OUTPUTFORMAT=application/json` +
    `&CQL_FILTER=${encodeURIComponent(cqlFilter)}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });

  if (!res.ok) {
    throw new Error(`DAI WFS HTTP ${res.status} for ${typename}`);
  }

  return res.json() as Promise<WfsJsonResponse>;
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

export class ArealdataService {
  static async getContext(
    koordinat: Koordinat,
    parcelPolygon?: GeoJSON.Feature | GeoJSON.FeatureCollection | null,
  ): Promise<SourceResult<ArealdataContextResult>> {
    try {
      const outcomes = await Promise.all(
        LAYERS.map(async (layer): Promise<LayerOutcome> => {
          try {
            const response = await getFeatures(layer.typename, koordinat, parcelPolygon);
            const featureCount = response.totalFeatures ?? response.features?.length ?? 0;
            return {
              key: layer.key,
              value: featureCount > 0,
              featureCount,
              errored: false,
            };
          } catch {
            return {
              key: layer.key,
              value: null,
              featureCount: 0,
              errored: true,
            };
          }
        }),
      );

      const result = emptyResult();
      let totalFeatureCount = 0;
      let successCount = 0;

      for (const outcome of outcomes) {
        result[outcome.key] = outcome.value;
        totalFeatureCount += outcome.featureCount;
        if (!outcome.errored) successCount += 1;
      }

      if (successCount === 0) {
        return makeErrorResult(new Error("DAI ext layers failed"), {
          kilde: "arealdata",
          sourceUrl: SOURCE_URL,
        });
      }

      return makeOkResult(result, {
        kilde: "arealdata",
        sourceUrl: SOURCE_URL,
        rawFeatureCount: totalFeatureCount,
        confidence: outcomes.some((outcome) => outcome.value === null) ? "unknown" : "confirmed",
      });
    } catch (error) {
      return makeErrorResult<ArealdataContextResult>(error, {
        kilde: "arealdata",
        sourceUrl: SOURCE_URL,
      });
    }
  }
}
