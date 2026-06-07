import { z } from "zod";
import type {
  BBox25832,
  GeoJsonLineString25832,
  GeoJsonPolygon25832,
  VejLayer,
} from "@/domain/drawing/beliggenhedsplan.types";
import { VejLayerSchema } from "@/domain/drawing/beliggenhedsplan.schemas";
import { registrySourceMeta } from "@/domain/drawing/source-quality";
import {
  calculateRoadWidthM,
  selectRelevantRoadCenterline,
  selectRelevantRoadEdges,
} from "@/domain/drawing/road-geometry";
import { fetchWithRetry } from "@/integrations/http/fetch-with-retry";
import { getEnvRequired } from "@/lib/env";

const DEFAULT_ENDPOINT = "https://wfs.datafordeler.dk/GEODKV/GEODKV_WFS/1.0.0/WFS";
const ROAD_CENTERLINE_TYPE_NAMES = [
  "geodkv:vejmidte_current",
  "GEODKV:vejmidte_current",
  "vejmidte_current",
];
const ROAD_EDGE_TYPE_NAMES = [
  "geodkv:vejkant_current",
  "GEODKV:vejkant_current",
  "vejkant_current",
];
const WFS_RETRY = {
  timeoutMs: 10_000,
  retries: 1,
  retryOnAbort: false,
  retryOnStatuses: [502, 503, 504],
};

const geoJsonLineStringSchema = z.object({
  type: z.literal("LineString"),
  coordinates: z.array(z.tuple([z.number(), z.number()])).min(2),
});

const geoJsonMultiLineStringSchema = z.object({
  type: z.literal("MultiLineString"),
  coordinates: z.array(z.array(z.tuple([z.number(), z.number()])).min(2)).min(1),
});

const roadFeatureSchema = z.object({
  type: z.literal("Feature").optional(),
  id: z.union([z.string(), z.number()]).optional(),
  properties: z.record(z.unknown()).nullable().optional(),
  geometry: z.union([geoJsonLineStringSchema, geoJsonMultiLineStringSchema]).nullable(),
});

const roadFeatureCollectionSchema = z.object({
  type: z.literal("FeatureCollection").optional(),
  features: z.array(roadFeatureSchema).default([]),
});

export type GeoDanmarkRoadGeometryConfig = {
  apiKey?: string;
  endpoint?: string;
  now?: Date;
};

function expandBbox(bbox: BBox25832, paddingM: number): BBox25832 {
  return [bbox[0] - paddingM, bbox[1] - paddingM, bbox[2] + paddingM, bbox[3] + paddingM];
}

function bboxToPolygon(bbox: BBox25832): GeoJsonPolygon25832 {
  const [minX, minY, maxX, maxY] = bbox;
  return {
    type: "Polygon",
    crs: "EPSG:25832",
    coordinates: [
      [
        [minX, minY],
        [maxX, minY],
        [maxX, maxY],
        [minX, maxY],
        [minX, minY],
      ],
    ],
  };
}

function bboxParam(bbox: BBox25832): string {
  return `${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]},urn:ogc:def:crs:EPSG::25832`;
}

function buildWfsUrl(endpoint: string, apiKey: string, typeName: string, bbox: BBox25832): string {
  const url = new URL(endpoint);
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("service", "WFS");
  url.searchParams.set("version", "2.0.0");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("typeNames", typeName);
  url.searchParams.set("srsName", "urn:ogc:def:crs:EPSG::25832");
  url.searchParams.set("bbox", bboxParam(bbox));
  url.searchParams.set("outputFormat", "application/json");
  url.searchParams.set("count", "200");
  return url.toString();
}

function featureToLineStrings(
  feature: z.infer<typeof roadFeatureSchema>,
): GeoJsonLineString25832[] {
  const geometry = feature.geometry;
  if (!geometry) return [];

  if (geometry.type === "LineString") {
    return [{ type: "LineString", crs: "EPSG:25832", coordinates: geometry.coordinates }];
  }

  return geometry.coordinates.map((coordinates) => ({
    type: "LineString" as const,
    crs: "EPSG:25832" as const,
    coordinates,
  }));
}

function parseRoadFeatureCollection(payload: unknown): GeoJsonLineString25832[] {
  const parsed = roadFeatureCollectionSchema.parse(payload);
  return parsed.features.flatMap(featureToLineStrings);
}

async function fetchRoadLines(
  typeNameCandidates: string[],
  bbox25832: BBox25832,
  config: Required<Omit<GeoDanmarkRoadGeometryConfig, "now">>,
): Promise<GeoJsonLineString25832[]> {
  for (const typeName of typeNameCandidates) {
    const url = buildWfsUrl(config.endpoint, config.apiKey, typeName, bbox25832);
    try {
      const res = await fetchWithRetry(
        url,
        { headers: { Accept: "application/json, application/geo+json;q=0.9" } },
        WFS_RETRY,
        {
          service: "GeoDanmark WFS",
          operation: `GetFeature ${typeName}`,
          phase: "drawing",
          metadata: { typeName },
        },
      );
      if (!res.ok) continue;

      const contentType = res.headers.get("content-type") ?? "";
      const text = await res.text();
      if (!contentType.includes("json") && !text.trim().startsWith("{")) continue;
      return parseRoadFeatureCollection(JSON.parse(text));
    } catch {
      continue;
    }
  }

  return [];
}

export async function fetchGeoDanmarkRoadGeometry(
  input: {
    vejnavn: string | null;
    bbox25832: BBox25832;
  },
  config: GeoDanmarkRoadGeometryConfig = {},
): Promise<VejLayer | null> {
  const resolvedConfig = {
    apiKey: config.apiKey ?? getEnvRequired("DATAFORDELER_API_KEY"),
    endpoint: config.endpoint ?? DEFAULT_ENDPOINT,
  };
  const now = config.now ?? new Date();
  const queryBbox = expandBbox(input.bbox25832, 50);
  const bboxPolygon = bboxToPolygon(input.bbox25832);

  const [centerlineCandidates, edgeCandidates] = await Promise.all([
    fetchRoadLines(ROAD_CENTERLINE_TYPE_NAMES, queryBbox, resolvedConfig),
    fetchRoadLines(ROAD_EDGE_TYPE_NAMES, queryBbox, resolvedConfig),
  ]);

  const centerline = selectRelevantRoadCenterline(centerlineCandidates, bboxPolygon);
  const edges = selectRelevantRoadEdges(edgeCandidates, bboxPolygon, centerline);
  if (!centerline && edges.length === 0 && !input.vejnavn) return null;

  const layer: VejLayer = {
    vejnavn: input.vejnavn,
    centerline25832: centerline,
    vejkant25832: edges,
    vejbreddeM: calculateRoadWidthM(centerline, edges),
    source: {
      ...registrySourceMeta(now.toISOString()),
      requiresReview: centerline === null || edges.length < 2,
    },
  };

  return VejLayerSchema.parse(layer);
}
