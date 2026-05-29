import { describe, expect, it } from "bun:test";
import type { SourceResult } from "@/lib/source-result";
import { makeErrorResult, makeMockResult, makeOkResult } from "@/lib/source-result";
import type * as GeoJSON from "geojson";
import type { GeoDanmarkSiteContext } from "@/domain/contracts/geodanmark.types";
import {
  deriveGeoDanmarkNeighborSiteConstraintsPatch,
  handleGeoDanmarkNeighborAnalysis,
  type GeoDanmarkNeighborAnalysisDeps,
  type GeoDanmarkNeighborSiteConstraintsPatch,
} from "./geodanmark-neighbor-context.server";

const polygon: GeoJSON.Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ],
  ],
};

const road: GeoJSON.LineString = {
  type: "LineString",
  coordinates: [
    [10, 10],
    [20, 20],
  ],
};

function siteContext(): GeoDanmarkSiteContext {
  return {
    ownBuildings: [],
    neighborBuildings: [
      {
        sourceId: "bygning-1",
        bbrUuid: "bbr-1",
        geometry: polygon,
        footprintAreaM2: 42,
        distanceToParcelM: 8.5,
        relationToParcel: "neighbor",
        geometrySource: "geodanmark",
      },
    ],
    roadCenterlines: [
      {
        sourceId: "vej-1",
        geometry: road,
        distanceToParcelM: 12,
        geometrySource: "geodanmark",
      },
    ],
    coverage: "covered",
  };
}

function okSiteResult(): SourceResult<GeoDanmarkSiteContext> {
  return makeOkResult(siteContext(), {
    kilde: "geodanmark_nabo",
    sourceUrl: "https://graphql.datafordeler.dk/GEODKV/v2",
    rawFeatureCount: 2,
  });
}

function baseDeps(
  overrides: Partial<GeoDanmarkNeighborAnalysisDeps>,
): GeoDanmarkNeighborAnalysisDeps {
  return {
    getCachedParcelPolygon: async () => null,
    getCachedSiteContext: async () => null,
    setCachedSiteContext: async () => undefined,
    getLiveSiteContext: async () => okSiteResult(),
    syncSiteConstraints: async () => undefined,
    ...overrides,
  };
}

describe("handleGeoDanmarkNeighborAnalysis", () => {
  it("bruger cached GeoDanmark site context og synkroniserer typed neighbor columns", async () => {
    let liveCalls = 0;
    let cacheWrites = 0;
    const synced: GeoDanmarkNeighborSiteConstraintsPatch[] = [];

    const result = await handleGeoDanmarkNeighborAnalysis(
      {
        addressId: "adr-1",
        parcelBbox25832: [10, 10, 20, 20],
        addressBbox25832: [0, 0, 1, 1],
        ownJordstykkeId: "jord-1",
        ownBbrUuids: ["bbr-own"],
      },
      {
        deps: baseDeps({
          getCachedSiteContext: async () => okSiteResult(),
          setCachedSiteContext: async () => {
            cacheWrites += 1;
          },
          getLiveSiteContext: async () => {
            liveCalls += 1;
            return okSiteResult();
          },
          syncSiteConstraints: async (patch) => {
            synced.push(patch);
          },
        }),
      },
    );

    expect(result.cacheHit).toBe(true);
    expect(liveCalls).toBe(0);
    expect(cacheWrites).toBe(0);
    expect(result.legacyResult.data?.count).toBe(1);
    expect(result.legacyResult.data?.nearestDistanceM).toBe(8.5);
    expect(result.legacyResult.data?.roadDistanceM).toBe(12);
    expect(synced).toHaveLength(1);
    expect(synced[0]?.neighbor_building_count_40m).toBe(1);
    expect(synced[0]?.neighbor_nearest_building_distance_m).toBe(8.5);
    expect(synced[0]?.road_nearest_centerline_distance_m).toBe(12);
    expect(synced[0]?.neighbor_context_confidence).toBe("covered");
  });

  it("kalder live adapter ved cache miss og cacher det validerede site context result", async () => {
    const cachedWrites: SourceResult<GeoDanmarkSiteContext>[] = [];
    let liveBbox: [number, number, number, number] | null = null;
    let liveRoadBbox: [number, number, number, number] | null = null;

    const result = await handleGeoDanmarkNeighborAnalysis(
      {
        addressId: "adr-2",
        parcelBbox25832: [10, 10, 20, 20],
        addressBbox25832: [0, 0, 1, 1],
        ownJordstykkeId: null,
        ownBbrUuids: [],
      },
      {
        deps: baseDeps({
          getLiveSiteContext: async (input) => {
            liveBbox = input.bbox25832;
            liveRoadBbox = input.roadBbox25832 ?? null;
            return okSiteResult();
          },
          setCachedSiteContext: async (_addressId, sourceResult) => {
            cachedWrites.push(sourceResult);
          },
        }),
      },
    );

    expect(result.cacheHit).toBe(false);
    expect(liveBbox).toEqual([-40, -40, 70, 70]);
    expect(liveRoadBbox).toEqual([-90, -90, 120, 120]);
    expect(cachedWrites).toHaveLength(1);
    expect(cachedWrites[0]?.data?.neighborBuildings[0]?.sourceId).toBe("bygning-1");
  });

  it("skriver ikke mock-resultater til typed site_constraints", async () => {
    const synced: GeoDanmarkNeighborSiteConstraintsPatch[] = [];
    const mockResult = makeMockResult(siteContext(), {
      kilde: "geodanmark_nabo",
      sourceUrl: null,
      rawFeatureCount: 2,
    });

    const result = await handleGeoDanmarkNeighborAnalysis(
      {
        addressId: "adr-3",
        parcelBbox25832: null,
        addressBbox25832: [0, 0, 1, 1],
        ownJordstykkeId: null,
        ownBbrUuids: [],
      },
      {
        deps: baseDeps({
          getLiveSiteContext: async () => mockResult,
          syncSiteConstraints: async (patch) => {
            synced.push(patch);
          },
        }),
      },
    );

    expect(result.legacyResult.status).toBe("mock");
    expect(result.siteConstraintsPatch).toBeNull();
    expect(synced).toHaveLength(0);
  });

  it("cacher ikke fejl-resultater, saa transient 503 ikke bliver frisk 90-dages cache", async () => {
    const cachedWrites: SourceResult<GeoDanmarkSiteContext>[] = [];
    const synced: GeoDanmarkNeighborSiteConstraintsPatch[] = [];
    const errorResult = makeErrorResult<GeoDanmarkSiteContext>(
      new Error("HTTP 503 Service Unavailable"),
      {
        kilde: "geodanmark_nabo",
        sourceUrl: "https://graphql.datafordeler.dk/GEODKV/v2",
      },
      { kind: "http", httpStatus: 503 },
    );

    const result = await handleGeoDanmarkNeighborAnalysis(
      {
        addressId: "adr-503",
        parcelBbox25832: null,
        addressBbox25832: [0, 0, 1, 1],
        ownJordstykkeId: null,
        ownBbrUuids: [],
      },
      {
        deps: baseDeps({
          getLiveSiteContext: async () => errorResult,
          setCachedSiteContext: async (_addressId, sourceResult) => {
            cachedWrites.push(sourceResult);
          },
          syncSiteConstraints: async (patch) => {
            synced.push(patch);
          },
        }),
      },
    );

    expect(result.legacyResult.status).toBe("error");
    expect(result.cacheHit).toBe(false);
    expect(result.siteConstraintsPatch).toBeNull();
    expect(cachedWrites).toHaveLength(0);
    expect(synced).toHaveLength(0);
  });
});

describe("deriveGeoDanmarkNeighborSiteConstraintsPatch", () => {
  it("returnerer null for mock og fejl, saa transient/mock ikke bliver compliance-fakta", () => {
    const mockNeighborResult = makeMockResult(
      {
        count40m: 1,
        nearestDistanceM: 8.5,
        nearestRoadCenterlineDistanceM: 12,
        accessRoadNearby: true,
        buildingDensityWithin100m: 0.1,
        buildings: [],
        coverage: "covered" as const,
      },
      { kilde: "geodanmark_nabo", sourceUrl: null, rawFeatureCount: 1 },
    );

    expect(deriveGeoDanmarkNeighborSiteConstraintsPatch("adr-4", mockNeighborResult)).toBeNull();
  });
});
