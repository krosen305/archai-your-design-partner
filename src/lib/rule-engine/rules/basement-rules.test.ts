import { describe, it, expect } from "bun:test";
import { validateKælderFeasibility } from "./basement-rules";

describe("validateKælderFeasibility", () => {
  it("no kælder → empty", () => {
    expect(
      validateKælderFeasibility({
        hasKælder: false,
        kælderGulvKoteM: null,
        groundwaterDepthM: 2,
        terrainKoteM: 20,
      }),
    ).toHaveLength(0);
  });

  it("kælder with safe depth → empty", () => {
    // terrain 20m, groundwater 3m deep → water table kote = 17m
    // safe floor >= 17 + 0.5 = 17.5 → basement floor at 18 → safe
    const result = validateKælderFeasibility({
      hasKælder: true,
      kælderGulvKoteM: 18,
      groundwaterDepthM: 3,
      terrainKoteM: 20,
    });
    expect(result).toHaveLength(0);
  });

  it("kælder below water table → blocking Hard Stop", () => {
    // terrain 20, groundwater 2m deep → water table = 18m, safe floor >= 18.5
    // basement at 17 → below safe level → blocking
    const result = validateKælderFeasibility({
      hasKælder: true,
      kælderGulvKoteM: 17,
      groundwaterDepthM: 2,
      terrainKoteM: 20,
    });
    expect(result.some((r) => r.severity === "blocking")).toBe(true);
  });

  it("kælder likely below sewer → warning", () => {
    // terrain 20, sewer est. at 20-1.2=18.8, basement at 18 → 18 < 18.8 → pump warning
    const result = validateKælderFeasibility({
      hasKælder: true,
      kælderGulvKoteM: 18,
      groundwaterDepthM: null,
      terrainKoteM: 20,
    });
    expect(result.some((r) => r.severity === "warning" && r.code === "KAELDER_PUMP_LIKELY")).toBe(
      true,
    );
  });

  it("kælder floor null → warning about missing kote", () => {
    const result = validateKælderFeasibility({
      hasKælder: true,
      kælderGulvKoteM: null,
      groundwaterDepthM: null,
      terrainKoteM: null,
    });
    expect(result.some((r) => r.code === "KAELDER_GULVKOTE_MISSING")).toBe(true);
  });
});
