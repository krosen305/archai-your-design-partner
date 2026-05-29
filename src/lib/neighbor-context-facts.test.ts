import { describe, expect, it } from "bun:test";
import { neighborContextFactsFromNeighborData } from "./neighbor-context-facts";
import type { NeighborBuildingData } from "@/domain/contracts/analysis.types";

const baseNeighborData: NeighborBuildingData = {
  count: 4,
  nearestDistanceM: 8.5,
  buildings: [],
  fejl: null,
  kilde: "geodanmark",
  accessRoadNearby: true,
  roadDistanceM: 12,
};

describe("neighborContextFactsFromNeighborData", () => {
  it("mapper live nabodata til consumer read model fakta", () => {
    expect(neighborContextFactsFromNeighborData(baseNeighborData, "success")).toEqual({
      buildingCount40m: 4,
      nearestBuildingDistanceM: 8.5,
      nearestRoadCenterlineDistanceM: 12,
      accessRoadNearby: true,
      confidence: "covered",
    });
  });

  it("afviser mock/cache-mock som typed read model fakta", () => {
    expect(neighborContextFactsFromNeighborData(baseNeighborData, "mock")).toBeNull();
    expect(neighborContextFactsFromNeighborData(baseNeighborData, "mock_cache_hit")).toBeNull();
  });

  it("afviser nabodata uden eksplicit trusted service-state", () => {
    expect(neighborContextFactsFromNeighborData(baseNeighborData, null)).toBeNull();
  });

  it("returnerer null ved integrationsfejl", () => {
    expect(
      neighborContextFactsFromNeighborData({ ...baseNeighborData, fejl: "503" }, "success"),
    ).toBeNull();
  });
});
