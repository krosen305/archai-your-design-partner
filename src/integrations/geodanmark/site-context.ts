// SERVER-SIDE ONLY.
//
// GeoDanmark Vektor via Datafordeler GraphQL (GEODKV/v2).
// Source documentation:
// https://confluence.sdfi.dk/pages/viewpage.action?pageId=234782942

import { z } from "zod";
import type * as GeoJSON from "geojson";
import { currentBitemporalArgs } from "@/integrations/datafordeler/bitemporal";
import { datafordelerGraphqlFetch } from "@/integrations/datafordeler/graphql-client";
import type {
  GeoDanmarkBuildingFeature,
  GeoDanmarkSiteContext,
} from "@/domain/contracts/geodanmark.types";
import { getEnvRequired } from "@/lib/env";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import {
  computeCentroidUtm32,
  computePolygonAreaM2,
  polygonToLineStringDistanceM,
  polygonToPolygonDistanceM,
} from "@/lib/geometry-utils";
import { logServerEvent } from "@/lib/server-logger";
import { makeErrorResult, makeMockResult, makeOkResult } from "@/lib/source-result";
import type { SourceErrorDetails, SourceResult } from "@/lib/source-result";
import { bboxToPolygonWkt25832, parseGeoDanmarkGeometryWkt } from "./wkt";

const DEFAULT_ENDPOINT = "https://graphql.datafordeler.dk/GEODKV/v2";
const SOURCE_KIND = "geodanmark_nabo";
const DEFAULT_FIRST = 250;

export type BBox25832 = [number, number, number, number];

export type GeoDanmarkSiteContextInput = {
  bbox25832: BBox25832;
  roadBbox25832?: BBox25832;
  parcelPolygon?: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  ownBbrUuids?: string[];
  first?: number;
};

export type GeoDanmarkSiteContextConfig = {
  apiKey?: string;
  endpoint?: string;
  now?: Date;
  mock?: boolean;
};

const geometryNodeSchema = z.object({
  wkt: z.string(),
  crs: z.union([z.number(), z.string()]).nullable().optional(),
  type: z.string().nullable().optional(),
});

const buildingNodeSchema = z.object({
  id_lokalId: z.string(),
  BBRUUID: z.string().nullable().optional(),
  geometri: geometryNodeSchema.nullable().optional(),
});

const buildingResponseSchema = z.object({
  GEODKV_Bygning: z.object({
    nodes: z.array(buildingNodeSchema),
  }),
});

const roadNodeSchema = z.object({
  id_lokalId: z.string(),
  geometri: geometryNodeSchema.nullable().optional(),
});

const roadResponseSchema = z.object({
  GEODKV_Vejmidte: z.object({
    nodes: z.array(roadNodeSchema),
  }),
});

type GeometryNode = z.infer<typeof geometryNodeSchema>;
type BuildingNode = z.infer<typeof buildingNodeSchema>;
type RoadNode = z.infer<typeof roadNodeSchema>;
type BuildingResponse = z.infer<typeof buildingResponseSchema>;
type RoadResponse = z.infer<typeof roadResponseSchema>;

const BUILDINGS_QUERY = `
query GetGeoDanmarkBuildings($wkt: String!, $first: Int!, $virkningstid: DafDateTime!, $registreringstid: DafDateTime!) {
  GEODKV_Bygning(
    first: $first
    where: { geometri: { intersects: { wkt: $wkt, crs: 25832 } } }
    virkningstid: $virkningstid
    registreringstid: $registreringstid
  ) {
    nodes {
      id_lokalId
      BBRUUID
      geometri {
        wkt
        crs
        type
      }
    }
  }
}`;

const ROADS_QUERY = `
query GetGeoDanmarkRoadCenterlines($wkt: String!, $first: Int!, $virkningstid: DafDateTime!, $registreringstid: DafDateTime!) {
  GEODKV_Vejmidte(
    first: $first
    where: { geometri: { intersects: { wkt: $wkt, crs: 25832 } } }
    virkningstid: $virkningstid
    registreringstid: $registreringstid
  ) {
    nodes {
      id_lokalId
      geometri {
        wkt
        crs
        type
      }
    }
  }
}`;

type ResolvedConfig = {
  apiKey: string;
  endpoint: string;
  now: Date;
};

function getConfig(config?: GeoDanmarkSiteContextConfig): ResolvedConfig {
  return {
    apiKey: config?.apiKey ?? getEnvRequired("DATAFORDELER_API_KEY"),
    endpoint: config?.endpoint ?? DEFAULT_ENDPOINT,
    now: config?.now ?? new Date(),
  };
}

export function expandBbox25832(bbox: BBox25832, paddingM: number): BBox25832 {
  return [bbox[0] - paddingM, bbox[1] - paddingM, bbox[2] + paddingM, bbox[3] + paddingM];
}

export function unionBbox25832(a: BBox25832, b: BBox25832): BBox25832 {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

function emptyContext(coverage: GeoDanmarkSiteContext["coverage"]): GeoDanmarkSiteContext {
  return {
    ownBuildings: [],
    neighborBuildings: [],
    roadCenterlines: [],
    coverage,
  };
}

function buildUrl(endpoint: string, apiKey: string): URL {
  const url = new URL(endpoint);
  url.searchParams.set("apiKey", apiKey);
  return url;
}

function isCrs25832(crs: GeometryNode["crs"]): boolean {
  return crs == null || crs === 25832 || crs === "25832" || crs === "EPSG:25832";
}

function parsePolygonGeometry(
  node: GeometryNode | null | undefined,
  sourceId: string,
): GeoJSON.Polygon | GeoJSON.MultiPolygon | null {
  if (!node) return null;
  if (!isCrs25832(node.crs)) throw new Error(`GeoDanmark geometry ${sourceId} is not EPSG:25832`);

  const geometry = parseGeoDanmarkGeometryWkt(node.wkt);
  if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") return geometry;
  throw new Error(`GeoDanmark building ${sourceId} returned ${geometry.type}`);
}

function parseLineGeometry(
  node: GeometryNode | null | undefined,
  sourceId: string,
): GeoJSON.LineString | GeoJSON.MultiLineString | null {
  if (!node) return null;
  if (!isCrs25832(node.crs)) throw new Error(`GeoDanmark geometry ${sourceId} is not EPSG:25832`);

  const geometry = parseGeoDanmarkGeometryWkt(node.wkt);
  if (geometry.type === "LineString" || geometry.type === "MultiLineString") return geometry;
  throw new Error(`GeoDanmark road ${sourceId} returned ${geometry.type}`);
}

function pointInRing(point: [number, number], ring: GeoJSON.Position[]): boolean {
  let inside = false;
  const [px, py] = point;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const current = ring[i];
    const previous = ring[j];
    if (!current || !previous) continue;

    const xi = current[0];
    const yi = current[1];
    const xj = previous[0];
    const yj = previous[1];
    if (![xi, yi, xj, yj].every(Number.isFinite)) continue;

    const crosses = yi > py !== yj > py;
    const xIntersection = ((xj - xi) * (py - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (crosses && px < xIntersection) inside = !inside;
  }

  return inside;
}

function pointInPolygon(point: [number, number], polygon: GeoJSON.Position[][]): boolean {
  const [outer, ...holes] = polygon;
  if (!outer || !pointInRing(point, outer)) return false;
  return !holes.some((hole) => pointInRing(point, hole));
}

function pointInPolygonGeometry(
  point: [number, number],
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): boolean {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some((polygon) => pointInPolygon(point, polygon));
}

function roundMeters(value: number | null): number | null {
  return value === null ? null : Math.round(value * 100) / 100;
}

function distanceToParcel(
  parcelPolygon: GeoJSON.Polygon | GeoJSON.MultiPolygon | null | undefined,
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): number | null {
  if (!parcelPolygon) return null;
  return roundMeters(polygonToPolygonDistanceM(parcelPolygon, geometry));
}

function classifyBuilding(
  node: BuildingNode,
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
  input: GeoDanmarkSiteContextInput,
): GeoDanmarkBuildingFeature["relationToParcel"] {
  const ownBbrUuids = new Set((input.ownBbrUuids ?? []).map((id) => id.toLowerCase()));
  const bbrUuid = node.BBRUUID?.toLowerCase() ?? null;
  if (bbrUuid && ownBbrUuids.has(bbrUuid)) return "own";

  if (!input.parcelPolygon) return "unknown";

  const centroid = computeCentroidUtm32(geometry);
  if (centroid && pointInPolygonGeometry(centroid, input.parcelPolygon)) return "own";
  return "neighbor";
}

function mapBuildingNode(
  node: BuildingNode,
  input: GeoDanmarkSiteContextInput,
): GeoDanmarkBuildingFeature | null {
  const geometry = parsePolygonGeometry(node.geometri, node.id_lokalId);
  if (!geometry) return null;

  return {
    sourceId: node.id_lokalId,
    bbrUuid: node.BBRUUID ?? null,
    geometry,
    footprintAreaM2: computePolygonAreaM2(geometry),
    distanceToParcelM: distanceToParcel(input.parcelPolygon, geometry),
    relationToParcel: classifyBuilding(node, geometry, input),
    geometrySource: "geodanmark",
  };
}

function mapRoadNode(
  node: RoadNode,
  parcelPolygon: GeoJSON.Polygon | GeoJSON.MultiPolygon | null | undefined,
) {
  const geometry = parseLineGeometry(node.geometri, node.id_lokalId);
  if (!geometry) return null;

  return {
    sourceId: node.id_lokalId,
    geometry,
    distanceToParcelM: parcelPolygon
      ? roundMeters(polygonToLineStringDistanceM(parcelPolygon, geometry))
      : null,
    geometrySource: "geodanmark" as const,
  };
}

function sortNullableDistance<T extends { distanceToParcelM: number | null }>(a: T, b: T): number {
  return (
    (a.distanceToParcelM ?? Number.POSITIVE_INFINITY) -
    (b.distanceToParcelM ?? Number.POSITIVE_INFINITY)
  );
}

function classifyErrorDetails(error: unknown): SourceErrorDetails {
  if (error instanceof z.ZodError) {
    return {
      kind: "schema",
      schemaCode: error.issues[0]?.path.join("."),
      message: error.message,
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  const statusMatch = /\bHTTP\s+(\d{3})\b/.exec(message);
  if (statusMatch) {
    return { kind: "http", httpStatus: Number(statusMatch[1]), message };
  }

  if (/timeout|aborted/i.test(message)) return { kind: "timeout", message };
  if (/fetch|network|ENOTFOUND|ECONN/i.test(message)) return { kind: "network", message };
  return { kind: "unknown", message };
}

async function fetchBuildingNodes(
  url: URL,
  variables: Record<string, unknown>,
): Promise<BuildingNode[]> {
  const data = await datafordelerGraphqlFetch<BuildingResponse>(
    url,
    BUILDINGS_QUERY,
    variables,
    "GEODKV_Bygning",
    buildingResponseSchema,
    { phase: "layer4", metadata: { endpoint: "GEODKV/v2" } },
  );
  return data.GEODKV_Bygning.nodes;
}

async function fetchRoadNodes(url: URL, variables: Record<string, unknown>): Promise<RoadNode[]> {
  try {
    const data = await datafordelerGraphqlFetch<RoadResponse>(
      url,
      ROADS_QUERY,
      variables,
      "GEODKV_Vejmidte",
      roadResponseSchema,
      { phase: "layer4", metadata: { endpoint: "GEODKV/v2" } },
    );
    return data.GEODKV_Vejmidte.nodes;
  } catch (error) {
    logServerEvent({
      module: "geodanmark/site-context",
      operation: "fetchRoadNodes",
      severity: "degraded",
      message: "GeoDanmark road centerlines could not be fetched",
      error,
    });
    return [];
  }
}

export class GeoDanmarkSiteContextService {
  static async getSiteContext(
    input: GeoDanmarkSiteContextInput,
    config?: GeoDanmarkSiteContextConfig,
  ): Promise<SourceResult<GeoDanmarkSiteContext>> {
    if (config?.mock ?? FEATURE_FLAGS.geodanmarkMock) {
      return makeMockResult(emptyContext("unknown"), {
        kilde: SOURCE_KIND,
        sourceUrl: config?.endpoint ?? DEFAULT_ENDPOINT,
        rawFeatureCount: 0,
      });
    }

    const resolvedConfig = getConfig(config);
    const sourceUrl = resolvedConfig.endpoint;

    try {
      const url = buildUrl(resolvedConfig.endpoint, resolvedConfig.apiKey);
      const bitemporalArgs = currentBitemporalArgs(resolvedConfig.now);
      const variables = {
        wkt: bboxToPolygonWkt25832(input.bbox25832),
        first: input.first ?? DEFAULT_FIRST,
        ...bitemporalArgs,
      };
      const roadVariables = {
        ...variables,
        wkt: bboxToPolygonWkt25832(input.roadBbox25832 ?? input.bbox25832),
      };

      const buildingNodes = await fetchBuildingNodes(url, variables);
      const roadNodes = await fetchRoadNodes(url, roadVariables);

      const buildings = buildingNodes
        .map((node) => mapBuildingNode(node, input))
        .filter((building): building is GeoDanmarkBuildingFeature => building !== null)
        .sort(sortNullableDistance);

      const roadCenterlines = roadNodes
        .map((node) => mapRoadNode(node, input.parcelPolygon))
        .filter((road): road is NonNullable<typeof road> => road !== null)
        .sort(sortNullableDistance);

      const ownBuildings = buildings.filter((building) => building.relationToParcel === "own");
      const neighborBuildings = buildings.filter((building) => building.relationToParcel !== "own");

      return makeOkResult(
        {
          ownBuildings,
          neighborBuildings,
          roadCenterlines,
          coverage: "covered",
        },
        {
          kilde: SOURCE_KIND,
          sourceUrl,
          rawFeatureCount: buildingNodes.length + roadNodes.length,
        },
      );
    } catch (error) {
      return makeErrorResult<GeoDanmarkSiteContext>(
        error,
        { kilde: SOURCE_KIND, sourceUrl },
        classifyErrorDetails(error),
      );
    }
  }
}
