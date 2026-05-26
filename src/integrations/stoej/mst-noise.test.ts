import { describe, it, expect } from "bun:test";

describe("MstNoiseService (mock)", () => {
  it("returnerer SourceResult med mock data", async () => {
    const { MstNoiseService } = await import("./mst-noise");
    const result = await MstNoiseService.getNoiseForParcel("adr-123", [720000, 6175000, 720200, 6175200]);
    expect(result.status).toBe("mock");
    expect(result.isMock).toBe(true);
    expect(result.data).not.toBeNull();
  });

  it("mock returnerer source_unavailable — aldrig ok eller covered", async () => {
    const { MstNoiseService } = await import("./mst-noise");
    const result = await MstNoiseService.getNoiseForParcel("adr-x", [0, 0, 100, 100]);
    expect(result.data!.highestRisk).toBe("unknown");
    for (const m of result.data!.metrics) {
      expect(m.coverage).toBe("source_unavailable");
    }
  });
});
