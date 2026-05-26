import { describe, it, expect } from "bun:test";
import type { SourceResult } from "@/lib/source-result";
import type {
  NeighborContext,
  PlanningSurroundingsContext,
} from "@/domain/contracts/surroundings.types";
import type { NoiseScreeningResult } from "@/domain/contracts/noise.types";
import { makeMockResult } from "@/lib/source-result";
import {
  handleSurroundingsAnalysis,
  type SurroundingsInput,
  type SurroundingsAnalysisResult,
} from "./surroundings-analysis.server";

function mockNeighborContext(): SourceResult<NeighborContext> {
  return makeMockResult<NeighborContext>(
    {
      count40m: 2,
      nearestDistanceM: 8.5,
      nearestRoadCenterlineDistanceM: 12,
      accessRoadNearby: true,
      buildingDensityWithin100m: 0.6,
      buildings: [],
      coverage: "covered",
    },
    { kilde: "geodanmark_nabo", sourceUrl: null, rawFeatureCount: 2 },
  );
}

function mockSurroundings(): SourceResult<PlanningSurroundingsContext> {
  return makeMockResult<PlanningSurroundingsContext>(
    {
      noiseDesignatedArea: false,
      productionNoiseConsequenceArea: false,
      odorConsequenceArea: false,
      odorDesignatedArea: false,
      technicalFacilityConsequenceArea: false,
      largeLivestockFarmArea: false,
      proposedPlanConflict: false,
      hits: [],
    },
    { kilde: "plandata_surroundings", sourceUrl: null, rawFeatureCount: 0 },
  );
}

function mockNoise(): SourceResult<NoiseScreeningResult> {
  return makeMockResult<NoiseScreeningResult>(
    {
      addressId: "adr-test",
      parcelIntersectionUsed: false,
      metrics: [],
      highestRisk: "unknown",
      requiresAcousticReview: null,
      sourceUrl: "https://mst.dk",
      fetchedAt: new Date().toISOString(),
    },
    { kilde: "mst_noise", sourceUrl: null, rawFeatureCount: 0 },
  );
}

describe("handleSurroundingsAnalysis", () => {
  it("returnerer SurroundingsAnalysisResult med site_constraints patch", async () => {
    const input: SurroundingsInput = {
      addressId: "adr-123",
      bbox25832: [720000, 6175000, 720200, 6175200],
      parcelPolygon: null,
      ownJordstykkeId: null,
    };

    const result: SurroundingsAnalysisResult = await handleSurroundingsAnalysis(input, {
      getNeighborContext: async () => mockNeighborContext(),
      getSurroundings: async () => mockSurroundings(),
      getNoiseForParcel: async () => mockNoise(),
    });

    expect(result).toBeDefined();
    expect(result.siteConstraintsPatch).toBeDefined();
    expect(result.neighborContextResult.data?.coverage).toBe("covered");
    expect(result.violations).toBeArray();
  });

  it("site_constraints patch indeholder neighbor kolonner", async () => {
    const input: SurroundingsInput = {
      addressId: "adr-456",
      bbox25832: [720000, 6175000, 720200, 6175200],
      parcelPolygon: null,
      ownJordstykkeId: null,
    };

    const result = await handleSurroundingsAnalysis(input, {
      getNeighborContext: async () => mockNeighborContext(),
      getSurroundings: async () => mockSurroundings(),
      getNoiseForParcel: async () => mockNoise(),
    });

    expect(result.siteConstraintsPatch.neighbor_building_count_40m).toBe(2);
    expect(result.siteConstraintsPatch.neighbor_nearest_building_distance_m).toBe(8.5);
    expect(result.siteConstraintsPatch.road_nearest_centerline_distance_m).toBe(12);
    expect(result.siteConstraintsPatch.neighbor_context_confidence).toBe("covered");
  });
});
