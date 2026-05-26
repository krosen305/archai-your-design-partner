import { describe, it, expect } from "bun:test";

describe("MatNeighborParcelService (mock)", () => {
  it("returnerer SourceResult med mock data og IS_MOCK=true", async () => {
    const { MatNeighborParcelService } = await import("./neighbor-parcels");
    const result = await MatNeighborParcelService.getNeighborParcels(
      "test-jordstykke-id",
      [720000, 6175000, 720200, 6175200],
    );
    expect(result.status).toBe("mock");
    expect(result.isMock).toBe(true);
    expect(result.data).toBeArray();
  });

  it("returnerer tom array ved mock — aldrig null", async () => {
    const { MatNeighborParcelService } = await import("./neighbor-parcels");
    const result = await MatNeighborParcelService.getNeighborParcels("id", [0, 0, 100, 100]);
    expect(result.data).not.toBeNull();
    expect(Array.isArray(result.data)).toBe(true);
  });
});
