import { describe, expect, it, mock } from "bun:test";
import { makeMockResult, makeOkResult } from "@/lib/source-result";

const getCachedSourceResult = mock(async (_addressId: string, sourceKind: string) => {
  if (sourceKind === "geus") {
    return makeMockResult(
      {
        radonRisk: "medium" as const,
        groundwaterDepthM: 3.8,
        groundwaterDataSource: "DGU-1",
        groundwaterDepthWinterM: 3.2,
        groundwaterDepthSummerM: 3.8,
        groundwaterModelUncertaintyM: 0.5,
        geoteknikJordart: "MorÃ¦neler",
        kilde: "mock" as const,
      },
      { kilde: "geus", sourceUrl: "mock://geus", rawFeatureCount: 1, confidence: "estimated" },
    );
  }

  if (sourceKind === "dhm") {
    return makeOkResult(
      {
        minElevationM: 18.4,
        maxElevationM: 21.7,
        avgElevationM: 20.1,
        slopePercent: 4.2,
        lowPointM: 18.4,
        bluespotRisk: false,
        northOrientation: "S" as const,
        kotepunkter: [],
        kilde: "dhm" as const,
      },
      { kilde: "dhm", sourceUrl: "mock://dhm", rawFeatureCount: 2 },
    );
  }

  if (sourceKind === "plandata_ext") {
    return makeOkResult(
      {
        zoneType: "byzone" as const,
        futureZoneType: "byzone" as const,
        landzonePermitRequired: false,
        lokalplanDelomraadeId: null,
        lokalplanByggefeltPresent: null,
        withinBuildingField: null,
        buildingFieldSourceId: null,
        wastewaterPlanStatus: null,
        sewerAreaType: null,
        sourceLokalplanId: null,
        sourceKommuneplanId: null,
        zoneSourcePlanId: null,
        wastewaterSourceId: null,
      },
      { kilde: "plandata", sourceUrl: "mock://plandata", rawFeatureCount: 1 },
    );
  }

  if (sourceKind === "arealdata_ext") {
    return makeOkResult(
      {
        paragraph3Nature: false,
        natura2000: false,
        protectedDige: false,
        fortidsminde: false,
        fortidsmindeBuffer: false,
        bnbo: null,
        osd: null,
        rawMaterialArea: false,
      },
      { kilde: "arealdata", sourceUrl: "mock://arealdata", rawFeatureCount: 0 },
    );
  }

  return null;
});

const setCachedSourceResult = mock(async () => undefined);

mock.module("@/integrations/cache/client", () => ({
  getCachedSourceResult,
  setCachedSourceResult,
  getCachedJordstykkePolygon: async () => null,
}));

mock.module("@/integrations/sdfi/naturbeskyttelse", () => ({
  NaturbeskyttelseService: {
    getTilstand: async () => null,
  },
}));

mock.module("@/integrations/miljoe/dkjord", () => ({
  DkJordService: {
    getTilstand: async () =>
      makeOkResult(
        {
          v1Kortlagt: false,
          v2Kortlagt: false,
          olietank: { eksisterer: false, driftsstatus: null },
          omraadeklassificering: null,
          nuancering: null,
          lokalitetsId: null,
          kilde: "dkjord" as const,
        },
        { kilde: "dkjord", sourceUrl: "mock://dkjord", rawFeatureCount: 0 },
      ),
  },
}));

mock.module("@/integrations/geus/client", () => ({
  GeusService: {
    getRiskData: async () => {
      throw new Error("should not call live GEUS when cache exists");
    },
  },
}));

mock.module("@/integrations/sdfi/dhm-client", () => ({
  DhmService: {
    getTerrainData: async () => {
      throw new Error("should not call live DHM when cache exists");
    },
  },
  bboxFromPoint: () => ({ minX: 0, minY: 0, maxX: 1, maxY: 1 }),
}));

mock.module("@/lib/map-proxy", () => ({
  createBboxAroundPoint: () => ({ minX: 0, minY: 0, maxX: 1, maxY: 1 }),
}));

mock.module("@/integrations/geodanmark/client", () => ({
  GeoDanmarkNaboService: {
    getNabobygninger: async () =>
      makeOkResult(
        {
          count: 0,
          nearestDistanceM: null,
          buildings: [],
          fejl: null,
          kilde: "geodanmark",
          accessRoadNearby: null,
          roadDistanceM: null,
        },
        { kilde: "geodanmark", sourceUrl: "mock://geodanmark", rawFeatureCount: 0 },
      ),
  },
}));

mock.module("@/integrations/plandata/fjernvarme", () => ({
  FjernvarmeService: {
    getDaekning: async () => null,
  },
}));

describe("runGeoRiskStep", () => {
  it("uses cached GEUS and DHM source results and marks states as cache_hit", async () => {
    const { runGeoRiskStep } = await import("./geo-risk-step");

    const result = await runGeoRiskStep(
      {
        addressId: "addr-1",
        koordinater: { lat: 55.7, lng: 12.5 },
        jordstykkeId: null,
        bygningIds: [],
        grundareal: 800,
        skipExpensive: false,
      },
      null as never,
    );

    expect(getCachedSourceResult).toHaveBeenCalledWith("addr-1", "geus", expect.anything());
    expect(getCachedSourceResult).toHaveBeenCalledWith("addr-1", "dhm", expect.anything());
    expect(getCachedSourceResult).toHaveBeenCalledWith("addr-1", "plandata_ext", expect.anything());
    expect(getCachedSourceResult).toHaveBeenCalledWith(
      "addr-1",
      "arealdata_ext",
      expect.anything(),
    );
    expect(result.geusRisk?.geoteknikJordart).toBe("MorÃ¦neler");
    expect(result.terrain?.lowPointM).toBe(18.4);
    expect(result.plandataContext?.zoneType).toBe("byzone");
    expect(result.arealdataContext?.paragraph3Nature).toBe(false);
    expect(result.states.geusRisk).toBe("cache_hit");
    expect(result.states.terrain).toBe("cache_hit");
    expect(setCachedSourceResult).not.toHaveBeenCalled();
  });
});
