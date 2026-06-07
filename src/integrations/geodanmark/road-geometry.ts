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
  assessRoadGeometryQuality,
  calculateRoadWidthM,
  selectRelevantRoadCenterline,
  selectRelevantRoadEdges,
} from "@/domain/drawing/road-geometry";
import { fetchWithRetry } from "@/integrations/http/fetch-with-retry";
import { getEnvRequired } from "@/lib/env";

const DEFAULT_ENDPOINT = "https://wfs.datafordeler.dk/GEODKV/GEODKV_WFS/1.0.0/WFS";
const ROAD_CENTERLINE_TYPE_NAMES = [
  "geodkv_v001:vejmidte_current",
  "geodkv:vejmidte_current",
  "GEODKV:vejmidte_current",
  "vejmidte_current",
];
const ROAD_EDGE_TYPE_NAMES = [
  "geodkv_v001:vejkant_current",
  "geodkv:vejkant_current",
  "GEODKV:vejkant_current",
  "vejkant_current",
];
const ROAD_TYPE_NAME_NEEDLES = {
  centerline: "vejmidte",
  edge: "vejkant",
} as const;
const WFS_RETRY = {
  timeoutMs: 10_000,
  retries: 1,
  retryOnAbort: false,
  retryOnStatuses: [502, 503, 504],
};

type RoadTypeKind = keyof typeof ROAD_TYPE_NAME_NEEDLES;

type RoadLineFetchDiagnostics = {
  attemptedTypeNames: string[];
  selectedTypeName: string | null;
  discoveredTypeNames: string[];
  capabilitiesAttempted: boolean;
  capabilitiesUnavailable: boolean;
  httpErrorTypeNames: string[];
  requestErrorTypeNames: string[];
  parseErrorTypeNames: string[];
};

type RoadLineFetchResult = {
  lines: GeoJsonLineString25832[];
  diagnostics: RoadLineFetchDiagnostics;
};

type ResolvedRoadGeometryConfig = {
  apiKey: string;
  endpoint: string;
  discoverTypeNames: boolean;
  typeNameOverrides?: {
    centerline?: string[];
    edge?: string[];
  };
};

const capabilitiesTypeNamesCache = new Map<string, string[]>();

const geoJsonPosition25832Schema = z
  .tuple([z.number(), z.number()])
  .rest(z.number())
  .transform((coordinate): [number, number] => [coordinate[0], coordinate[1]]);

const geoJsonLineStringSchema = z.object({
  type: z.literal("LineString"),
  coordinates: z.array(geoJsonPosition25832Schema).min(2),
});

const geoJsonMultiLineStringSchema = z.object({
  type: z.literal("MultiLineString"),
  coordinates: z.array(z.array(geoJsonPosition25832Schema).min(2)).min(1),
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
  discoverTypeNames?: boolean;
  typeNameOverrides?: {
    centerline?: string[];
    edge?: string[];
  };
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

function buildCapabilitiesUrl(endpoint: string, apiKey: string): string {
  const url = new URL(endpoint);
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("service", "WFS");
  url.searchParams.set("version", "2.0.0");
  url.searchParams.set("request", "GetCapabilities");
  return url.toString();
}

function decodeXmlText(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

export function extractWfsTypeNamesFromCapabilitiesXml(xml: string): string[] {
  const names = new Set<string>();
  const nameTag = /<(?:[^:>\s]+:)?Name(?:\s[^>]*)?>([^<]+)<\/(?:[^:>\s]+:)?Name>/g;
  let match: RegExpExecArray | null;

  while ((match = nameTag.exec(xml)) !== null) {
    const rawName = match[1]?.trim();
    if (!rawName) continue;
    const name = decodeXmlText(rawName);
    if (name.includes(":") || name.includes("_")) names.add(name);
  }

  return [...names];
}

function typeNameScore(typeName: string, needle: string): number {
  const normalized = typeName.toLowerCase();
  let score = 0;
  if (normalized.includes(`${needle}_current`)) score += 6;
  if (normalized.includes(needle)) score += 4;
  if (normalized.includes("current")) score += 2;
  if (normalized.includes("geodkv")) score += 1;
  return score;
}

export function selectRoadTypeNamesFromCapabilities(
  typeNames: string[],
  kind: RoadTypeKind,
): string[] {
  const needle = ROAD_TYPE_NAME_NEEDLES[kind];
  return [...new Set(typeNames)]
    .filter((typeName) => typeName.toLowerCase().includes(needle))
    .sort((a, b) => typeNameScore(b, needle) - typeNameScore(a, needle));
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

function uniqueTypeNames(typeNames: string[]): string[] {
  return [...new Set(typeNames.filter((typeName) => typeName.trim().length > 0))];
}

async function fetchCapabilitiesTypeNames(
  config: ResolvedRoadGeometryConfig,
): Promise<{ typeNames: string[]; attempted: boolean; unavailable: boolean }> {
  const cached = capabilitiesTypeNamesCache.get(config.endpoint);
  if (cached) return { typeNames: cached, attempted: false, unavailable: false };

  const url = buildCapabilitiesUrl(config.endpoint, config.apiKey);
  try {
    const res = await fetchWithRetry(
      url,
      { headers: { Accept: "application/xml, text/xml, */*", "Accept-Encoding": "identity" } },
      WFS_RETRY,
      {
        service: "GeoDanmark WFS",
        operation: "GetCapabilities",
        phase: "drawing",
      },
    );
    if (!res.ok) return { typeNames: [], attempted: true, unavailable: true };

    const text = await res.text();
    const typeNames = extractWfsTypeNamesFromCapabilitiesXml(text);
    if (typeNames.length > 0) capabilitiesTypeNamesCache.set(config.endpoint, typeNames);
    return { typeNames, attempted: true, unavailable: typeNames.length === 0 };
  } catch {
    return { typeNames: [], attempted: true, unavailable: true };
  }
}

async function requestRoadLinesForTypeName(
  typeName: string,
  bbox25832: BBox25832,
  config: ResolvedRoadGeometryConfig,
): Promise<
  | { status: "ok"; lines: GeoJsonLineString25832[] }
  | { status: "http_error" }
  | { status: "request_error" }
  | { status: "parse_error" }
> {
  const url = buildWfsUrl(config.endpoint, config.apiKey, typeName, bbox25832);
  let res: Response;
  try {
    res = await fetchWithRetry(
      url,
      {
        headers: {
          Accept: "application/json, application/geo+json;q=0.9",
          "Accept-Encoding": "identity",
        },
      },
      WFS_RETRY,
      {
        service: "GeoDanmark WFS",
        operation: `GetFeature ${typeName}`,
        phase: "drawing",
        metadata: { typeName },
      },
    );
  } catch {
    return { status: "request_error" };
  }

  if (!res.ok) return { status: "http_error" };

  try {
    const contentType = res.headers.get("content-type") ?? "";
    const text = await res.text();
    if (!contentType.includes("json") && !text.trim().startsWith("{")) {
      return { status: "parse_error" };
    }

    const payload: unknown = JSON.parse(text);
    return { status: "ok", lines: parseRoadFeatureCollection(payload) };
  } catch {
    return { status: "parse_error" };
  }
}

async function fetchRoadLines(
  typeNameCandidates: string[],
  kind: RoadTypeKind,
  bbox25832: BBox25832,
  config: ResolvedRoadGeometryConfig,
): Promise<RoadLineFetchResult> {
  const diagnostics: RoadLineFetchDiagnostics = {
    attemptedTypeNames: [],
    selectedTypeName: null,
    discoveredTypeNames: [],
    capabilitiesAttempted: false,
    capabilitiesUnavailable: false,
    httpErrorTypeNames: [],
    requestErrorTypeNames: [],
    parseErrorTypeNames: [],
  };

  const tryTypeNames = async (typeNames: string[]): Promise<GeoJsonLineString25832[] | null> => {
    for (const typeName of uniqueTypeNames(typeNames)) {
      if (diagnostics.attemptedTypeNames.includes(typeName)) continue;
      diagnostics.attemptedTypeNames.push(typeName);

      const result = await requestRoadLinesForTypeName(typeName, bbox25832, config);
      if (result.status === "http_error") {
        diagnostics.httpErrorTypeNames.push(typeName);
        continue;
      }
      if (result.status === "request_error") {
        diagnostics.requestErrorTypeNames.push(typeName);
        continue;
      }
      if (result.status === "parse_error") {
        diagnostics.parseErrorTypeNames.push(typeName);
        continue;
      }
      if (result.lines.length === 0) continue;

      diagnostics.selectedTypeName = typeName;
      return result.lines;
    }

    return null;
  };

  const directLines = await tryTypeNames(typeNameCandidates);
  if (directLines) return { lines: directLines, diagnostics };

  if (config.discoverTypeNames) {
    const capabilities = await fetchCapabilitiesTypeNames(config);
    diagnostics.capabilitiesAttempted = capabilities.attempted;
    diagnostics.capabilitiesUnavailable = capabilities.unavailable;
    diagnostics.discoveredTypeNames = selectRoadTypeNamesFromCapabilities(
      capabilities.typeNames,
      kind,
    );

    const discoveredLines = await tryTypeNames(diagnostics.discoveredTypeNames);
    if (discoveredLines) return { lines: discoveredLines, diagnostics };
  }

  return { lines: [], diagnostics };
}

function addFetchDiagnosticsReviewReasons(
  kind: RoadTypeKind,
  diagnostics: RoadLineFetchDiagnostics,
  reviewReasons: Set<string>,
): void {
  const prefix = kind === "centerline" ? "centerline" : "road_edges";
  if (diagnostics.capabilitiesUnavailable) {
    reviewReasons.add(`geodanmark.${prefix}_capabilities_unavailable`);
  }
  if (diagnostics.httpErrorTypeNames.length > 0 && diagnostics.selectedTypeName === null) {
    reviewReasons.add(`geodanmark.${prefix}_wfs_unavailable`);
  }
  if (diagnostics.requestErrorTypeNames.length > 0 && diagnostics.selectedTypeName === null) {
    reviewReasons.add(`geodanmark.${prefix}_wfs_unavailable`);
  }
  if (diagnostics.parseErrorTypeNames.length > 0 && diagnostics.selectedTypeName === null) {
    reviewReasons.add(`geodanmark.${prefix}_response_invalid`);
  }
  if (
    diagnostics.capabilitiesAttempted &&
    !diagnostics.capabilitiesUnavailable &&
    diagnostics.discoveredTypeNames.length === 0 &&
    diagnostics.selectedTypeName === null
  ) {
    reviewReasons.add(`geodanmark.${prefix}_type_not_found`);
  }
}

export async function fetchGeoDanmarkRoadGeometry(
  input: {
    vejnavn: string | null;
    bbox25832: BBox25832;
  },
  config: GeoDanmarkRoadGeometryConfig = {},
): Promise<VejLayer | null> {
  const resolvedConfig: ResolvedRoadGeometryConfig = {
    apiKey: config.apiKey ?? getEnvRequired("DATAFORDELER_API_KEY"),
    endpoint: config.endpoint ?? DEFAULT_ENDPOINT,
    discoverTypeNames: config.discoverTypeNames ?? true,
    typeNameOverrides: config.typeNameOverrides,
  };
  const now = config.now ?? new Date();
  const queryBbox = expandBbox(input.bbox25832, 50);
  const bboxPolygon = bboxToPolygon(input.bbox25832);
  const centerlineTypeNames =
    resolvedConfig.typeNameOverrides?.centerline ?? ROAD_CENTERLINE_TYPE_NAMES;
  const edgeTypeNames = resolvedConfig.typeNameOverrides?.edge ?? ROAD_EDGE_TYPE_NAMES;

  const [centerlineResult, edgeResult] = await Promise.all([
    fetchRoadLines(centerlineTypeNames, "centerline", queryBbox, resolvedConfig),
    fetchRoadLines(edgeTypeNames, "edge", queryBbox, resolvedConfig),
  ]);

  const centerline = selectRelevantRoadCenterline(centerlineResult.lines, bboxPolygon);
  const edges = selectRelevantRoadEdges(edgeResult.lines, bboxPolygon, centerline);
  if (!centerline && edges.length === 0 && !input.vejnavn) return null;

  const widthM = calculateRoadWidthM(centerline, edges);
  const quality = assessRoadGeometryQuality(centerline, edges, widthM);
  const reviewReasons = new Set(quality.reviewReasons);
  addFetchDiagnosticsReviewReasons("centerline", centerlineResult.diagnostics, reviewReasons);
  addFetchDiagnosticsReviewReasons("edge", edgeResult.diagnostics, reviewReasons);

  const layer: VejLayer = {
    vejnavn: input.vejnavn,
    centerline25832: centerline,
    vejkant25832: edges,
    vejbreddeM: widthM,
    source: {
      ...registrySourceMeta(now.toISOString()),
      confidence: quality.confidence,
      requiresReview: quality.requiresReview || reviewReasons.size > 0,
      ...(reviewReasons.size > 0 ? { reviewReasons: [...reviewReasons].sort() } : {}),
    },
  };

  return VejLayerSchema.parse(layer);
}
