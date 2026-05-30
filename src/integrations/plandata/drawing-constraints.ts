// Henter Plandata WFS byggefelt-features MED geometri og
// konverterer koordinater fra WGS84 til EPSG:25832. Returnerer ConstraintLayer[].
// Bruges kun af drawing-adapteren — ikke af compliance-flowet.

import { z } from "zod";
import { fetchWithRetry } from "@/integrations/http/fetch-with-retry";
import { wgs84ToUtm32, utm32ToWgs84 } from "@/lib/geometry-utils";
import { registrySourceMeta } from "@/domain/drawing/source-quality";
import type {
  ConstraintLayer,
  GeoJsonPolygon25832,
  BBox25832,
} from "@/domain/drawing/beliggenhedsplan.types";

const WFS_BASE = "https://geoserver.plandata.dk/geoserver/wfs";
const BYGGEFELT_TYPE = "pdk:theme_pdk_byggefelt_vedtaget";
const WFS_RETRY = { timeoutMs: 15_000, retries: 1, retryOnStatuses: [502, 503, 504] };

const wfsGeometrySchema = z
  .object({
    type: z.string(),
    coordinates: z.unknown(),
  })
  .nullable()
  .optional();

const wfsFeatureWithGeomSchema = z.object({
  id: z.string().optional(),
  properties: z.record(z.unknown()).nullable().optional().default(null),
  geometry: wfsGeometrySchema.default(null),
});

const wfsFeatureCollectionSchema = z.object({
  features: z.array(wfsFeatureWithGeomSchema).optional().default([]),
});

export type WfsFeatureWithGeom = z.infer<typeof wfsFeatureWithGeomSchema>;

function bbox25832ToWgs84Polygon(bbox: BBox25832): string {
  const [minX, minY, maxX, maxY] = bbox;
  const corners: [number, number][] = [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
    [minX, minY],
  ];
  const wgsCorners = corners.map(([x, y]) => {
    const { lat, lng } = utm32ToWgs84(x, y);
    return `${lng} ${lat}`;
  });
  return `POLYGON((${wgsCorners.join(", ")}))`;
}

function convertWgs84RingToUtm32(ring: number[][]): [number, number][] {
  return ring.map(([lng, lat]) => {
    const { x, y } = wgs84ToUtm32(lat!, lng!);
    return [x, y] as [number, number];
  });
}

export function byggefeltWgs84ToConstraintLayers(
  features: WfsFeatureWithGeom[],
  _bbox25832: BBox25832,
): ConstraintLayer[] {
  const now = new Date().toISOString();
  const layers: ConstraintLayer[] = [];

  for (const f of features) {
    const geom = f.geometry;
    if (!geom || geom.type !== "Polygon") continue;

    const rawCoords = geom.coordinates as number[][][];
    const rings = rawCoords.map(convertWgs84RingToUtm32);

    const polygon25832: GeoJsonPolygon25832 = {
      type: "Polygon",
      coordinates: rings,
      crs: "EPSG:25832",
    };

    const props = f.properties ?? {};
    const planId = String(props["planid"] ?? props["lokplan_id"] ?? f.id ?? "");

    layers.push({
      type: "building_field",
      geometry25832: polygon25832,
      label: "Byggefelt (lokalplan)",
      ruleText: planId ? `Lokalplan ${planId}` : null,
      ruleReference: "Lokalplan",
      source: registrySourceMeta(now),
    });
  }

  return layers;
}

export async function fetchBuildingFieldConstraints(
  bbox25832: BBox25832,
): Promise<ConstraintLayer[]> {
  const polygonWkt = bbox25832ToWgs84Polygon(bbox25832);
  const cqlFilter = `INTERSECTS(geometri,SRID=4326;${polygonWkt})`;

  const params = new URLSearchParams({
    service: "WFS",
    version: "1.1.0",
    request: "GetFeature",
    typeName: BYGGEFELT_TYPE,
    outputFormat: "application/json",
    maxFeatures: "50",
    CQL_FILTER: cqlFilter,
  });

  try {
    const res = await fetchWithRetry(
      `${WFS_BASE}?${params.toString()}`,
      { headers: { Accept: "application/json" } },
      WFS_RETRY,
    );

    if (!res.ok) return [];

    const json = await res.json();
    const parsed = wfsFeatureCollectionSchema.safeParse(json);
    if (!parsed.success) return [];

    return byggefeltWgs84ToConstraintLayers(parsed.data.features, bbox25832);
  } catch {
    return [];
  }
}
