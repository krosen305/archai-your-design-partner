import { describe, it, expect } from "bun:test";

describe("PlandataSurroundingsService (mock)", () => {
  it("returnerer SourceResult med mock data", async () => {
    const { PlandataSurroundingsService } = await import("./surroundings");
    const result = await PlandataSurroundingsService.getSurroundings([
      720000, 6175000, 720500, 6175500,
    ]);
    expect(result.status).toBe("mock");
    expect(result.isMock).toBe(true);
    expect(result.data).not.toBeNull();
    expect(result.data!.hits).toBeArray();
  });

  it("alle boolean felter er null i mock", async () => {
    const { PlandataSurroundingsService } = await import("./surroundings");
    const result = await PlandataSurroundingsService.getSurroundings([0, 0, 500, 500]);
    const d = result.data!;
    expect(d.noiseDesignatedArea).toBeNull();
    expect(d.productionNoiseConsequenceArea).toBeNull();
    expect(d.odorConsequenceArea).toBeNull();
    expect(d.odorDesignatedArea).toBeNull();
    expect(d.technicalFacilityConsequenceArea).toBeNull();
    expect(d.largeLivestockFarmArea).toBeNull();
    expect(d.proposedPlanConflict).toBeNull();
  });
});
