// SERVER-SIDE ONLY.
//
// Application service for GeoDanmark nabogeometri. It owns cache orchestration,
// adapter calls and typed site_constraints synchronization; the Datafordeler
// adapter stays focused on validated transport decoding.

import type * as GeoJSON from "geojson";
import { getCachedJordstykkePolygon } from "@/integrations/cache/client";
import { getCachedSourceResult, setCachedSourceResult } from "@/integrations/cache/client";
import type { Database } from "@/integrations/supabase/types";
import { syncSiteConstraints } from "@/integrations/supabase/repositories/site-constraints.repository";
import { geoDanmarkSiteContextSchema } from "@/domain/contracts/geodanmark.schemas";
import type { GeoDanmarkSiteContext } from "@/domain/contracts/geodanmark.types";
import type { NeighborContext } from "@/domain/contracts/surroundings.types";
import type { NeighborBuilding, NeighborBuildingData } from "@/domain/contracts/analysis.types";
import {
  GeoDanmarkSiteContextService,
  type BBox25832,
} from "@/integrations/geodanmark/site-context";
import { expandBbox25832 } from "@/integrations/geodanmark/site-context";
import { siteContextToNeighborContext } from "@/integrations/geodanmark/neighbor-geometry";
import { computeBbox25832 } from "@/lib/geometry-utils";
import { traceCacheRead, type AnalysisTraceContext } from "@/lib/analysis-tracing";
import { logServerEvent } from "@/lib/server-logger";
import type { SourceResult } from "@/lib/source-result";

const SOURCE_KIND = "geodanmark_nabo";
const LEGACY_SOURCE_KIND = "geodanmark";

type SiteConstraintsInsert = Database["public"]["Tables"]["site_constraints"]["Insert"];

export type GeoDanmarkNeighborSiteConstraintsPatch = Pick<
  SiteConstraintsInsert,
  | "address_id"
  | "confidence"
  | "extracted_at"
  | "neighbor_building_count_40m"
  | "neighbor_nearest_building_distance_m"
  | "road_nearest_centerline_distance_m"
  | "access_road_nearby"
  | "neighbor_context_confidence"
>;

export type GeoDanmarkNeighborAnalysisInput = {
  addressId: string;
  parcelBbox25832: BBox25832 | null;
  addressBbox25832: BBox25832;
  ownJordstykkeId: string | null;
  ownBbrUuids: string[];
};

export type GeoDanmarkNeighborAnalysisResult = {
  siteContextResult: SourceResult<GeoDanmarkSiteContext>;
  neighborContextResult: SourceResult<NeighborContext>;
  legacyResult: SourceResult<NeighborBuildingData>;
  siteConstraintsPatch: GeoDanmarkNeighborSiteConstraintsPatch | null;
  cacheHit: boolean;
};

export type GeoDanmarkNeighborAnalysisDeps = {
  getCachedParcelPolygon: (addressId: string) => Promise<GeoJSON.FeatureCollection | null>;
  getCachedSiteContext: (addressId: string) => Promise<SourceResult<GeoDanmarkSiteContext> | null>;
  setCachedSiteContext: (
    addressId: string,
    result: SourceResult<GeoDanmarkSiteContext>,
  ) => Promise<void>;
  getLiveSiteContext: (
    input: Parameters<typeof GeoDanmarkSiteContextService.getSiteContext>[0],
  ) => Promise<SourceResult<GeoDanmarkSiteContext>>;
  syncSiteConstraints: (
    patch: GeoDanmarkNeighborSiteConstraintsPatch,
    trace: AnalysisTraceContext | null,
  ) => Promise<void>;
};

export type GeoDanmarkNeighborAnalysisOptions = {
  trace?: AnalysisTraceContext | null;
  deps?: Partial<GeoDanmarkNeighborAnalysisDeps>;
};

function firstPolygonGeometry(
  featureCollection: GeoJSON.FeatureCollection | null,
): GeoJSON.Polygon | GeoJSON.MultiPolygon | null {
  const geometry = featureCollection?.features.find(
    (feature) => feature.geometry?.type === "Polygon" || feature.geometry?.type === "MultiPolygon",
  )?.geometry;

  return geometry?.type === "Polygon" || geometry?.type === "MultiPolygon" ? geometry : null;
}

function queryBboxForParcel(
  parcelPolygon: GeoJSON.Polygon | GeoJSON.MultiPolygon | null,
  parcelBbox25832: BBox25832 | null,
  addressBbox25832: BBox25832,
  paddingM: number,
): BBox25832 {
  const geometryBbox = parcelPolygon ? computeBbox25832(parcelPolygon) : null;
  const sourceBbox = geometryBbox ?? parcelBbox25832;
  if (!sourceBbox) return addressBbox25832;
  return expandBbox25832(sourceBbox, paddingM);
}

function mapSourceResultData<TInput, TOutput>(
  result: SourceResult<TInput>,
  mapData: (data: TInput) => TOutput,
  kilde = result.kilde,
): SourceResult<TOutput> {
  return {
    ...result,
    kilde,
    data: result.data === null ? null : mapData(result.data),
  };
}

function toLegacyNeighborBuilding(building: {
  sourceId: string;
  addressLabel: string | null;
  distanceM: number;
}): NeighborBuilding {
  return {
    adgangsadresseid: building.sourceId,
    adresse: building.addressLabel ?? building.sourceId,
    distanceM: building.distanceM,
  };
}

export function neighborContextToLegacyData(neighbor: NeighborContext): NeighborBuildingData {
  return {
    count: neighbor.count40m,
    nearestDistanceM: neighbor.nearestDistanceM,
    buildings: neighbor.buildings.map(toLegacyNeighborBuilding),
    fejl: null,
    kilde: LEGACY_SOURCE_KIND,
    accessRoadNearby: neighbor.accessRoadNearby,
    roadDistanceM: neighbor.nearestRoadCenterlineDistanceM,
  };
}

export function deriveGeoDanmarkNeighborSiteConstraintsPatch(
  addressId: string,
  neighborResult: SourceResult<NeighborContext>,
): GeoDanmarkNeighborSiteConstraintsPatch | null {
  if (neighborResult.status !== "ok" || neighborResult.data === null || neighborResult.isMock) {
    return null;
  }

  const neighbor = neighborResult.data;
  return {
    address_id: addressId,
    confidence: "confirmed",
    extracted_at: neighborResult.fetchedAt,
    neighbor_building_count_40m: neighbor.count40m,
    neighbor_nearest_building_distance_m: neighbor.nearestDistanceM,
    road_nearest_centerline_distance_m: neighbor.nearestRoadCenterlineDistanceM,
    access_road_nearby: neighbor.accessRoadNearby,
    neighbor_context_confidence: neighbor.coverage,
  };
}

function resolveDeps(
  deps?: Partial<GeoDanmarkNeighborAnalysisDeps>,
): GeoDanmarkNeighborAnalysisDeps {
  return {
    getCachedParcelPolygon: deps?.getCachedParcelPolygon ?? getCachedJordstykkePolygon,
    getCachedSiteContext:
      deps?.getCachedSiteContext ??
      ((addressId) => getCachedSourceResult(addressId, SOURCE_KIND, geoDanmarkSiteContextSchema)),
    setCachedSiteContext:
      deps?.setCachedSiteContext ??
      ((addressId, result) => setCachedSourceResult(addressId, SOURCE_KIND, result)),
    getLiveSiteContext:
      deps?.getLiveSiteContext ?? ((input) => GeoDanmarkSiteContextService.getSiteContext(input)),
    syncSiteConstraints: deps?.syncSiteConstraints ?? syncSiteConstraints,
  };
}

async function cacheRead<T>(
  trace: AnalysisTraceContext | null,
  operation: string,
  read: () => Promise<T | null>,
): Promise<T | null> {
  if (!trace) return read();
  return traceCacheRead(trace, { service: "Cache", operation, phase: "layer4" }, read);
}

export async function handleGeoDanmarkNeighborAnalysis(
  input: GeoDanmarkNeighborAnalysisInput,
  options: GeoDanmarkNeighborAnalysisOptions = {},
): Promise<GeoDanmarkNeighborAnalysisResult> {
  const trace = options.trace ?? null;
  const deps = resolveDeps(options.deps);

  const [parcelFeatureCollection, cachedSiteContext] = await Promise.all([
    cacheRead(trace, "getCachedJordstykkePolygon(geodanmark_nabo)", () =>
      deps.getCachedParcelPolygon(input.addressId),
    ).catch((error: Error) => {
      logServerEvent({
        module: "geodanmark-neighbor-context",
        operation: "getCachedParcelPolygon",
        severity: "degraded",
        message: "Kunne ikke laese parcelpolygon til GeoDanmark",
        error,
        trace,
      });
      return null;
    }),
    cacheRead(trace, "getCachedSourceResult(geodanmark_nabo)", () =>
      deps.getCachedSiteContext(input.addressId),
    ),
  ]);

  const parcelPolygon = firstPolygonGeometry(parcelFeatureCollection);
  const buildingBbox = queryBboxForParcel(
    parcelPolygon,
    input.parcelBbox25832,
    input.addressBbox25832,
    50,
  );
  const roadBbox = queryBboxForParcel(
    parcelPolygon,
    input.parcelBbox25832,
    input.addressBbox25832,
    100,
  );

  const siteContextResult =
    cachedSiteContext ??
    (await deps.getLiveSiteContext({
      bbox25832: buildingBbox,
      roadBbox25832: roadBbox,
      parcelPolygon,
      ownBbrUuids: input.ownBbrUuids,
    }));

  if (!cachedSiteContext && siteContextResult.status !== "error") {
    await deps.setCachedSiteContext(input.addressId, siteContextResult).catch((error: Error) => {
      logServerEvent({
        module: "geodanmark-neighbor-context",
        operation: "setCachedSiteContext",
        severity: "degraded",
        message: "Kunne ikke gemme GeoDanmark site context cache",
        error,
        trace,
      });
    });
  }

  const neighborContextResult = mapSourceResultData(
    siteContextResult,
    siteContextToNeighborContext,
    SOURCE_KIND,
  );
  const legacyResult = mapSourceResultData(
    neighborContextResult,
    neighborContextToLegacyData,
    LEGACY_SOURCE_KIND,
  );
  const siteConstraintsPatch = deriveGeoDanmarkNeighborSiteConstraintsPatch(
    input.addressId,
    neighborContextResult,
  );

  if (siteConstraintsPatch) {
    await deps.syncSiteConstraints(siteConstraintsPatch, trace);
  }

  return {
    siteContextResult,
    neighborContextResult,
    legacyResult,
    siteConstraintsPatch,
    cacheHit: cachedSiteContext !== null,
  };
}
