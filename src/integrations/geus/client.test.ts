import { describe, expect, it } from "bun:test";
import { GeusService } from "./client";

describe("GeusService.getRiskData", () => {
  it("returns deterministic mock payload", async () => {
    const result = await GeusService.getRiskData(55.7, 12.5);
    expect(result.kilde).toBe("mock");
    expect(result.radonRisk).toBe("medium");
    expect(result.groundwaterDepthM).toBe(3.8);
  });
});
