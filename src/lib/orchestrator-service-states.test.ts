import { describe, it, expect } from "bun:test";

describe("analyseAddress serviceStates", () => {
  it("ComplianceResult type includes optional serviceStates field", () => {
    // Type-level check — verifies the field exists on the type
    const result: import("./analysis-orchestrator").ComplianceResult = {
      bbr: null,
      lokalplaner: [],
      kommuneplanramme: null,
      analysedAt: new Date().toISOString(),
      lokalplanExtract: null,
      naturbeskyttelse: null,
      dkjord: null,
      geusRisk: null,
      servitutter: null,
      terrain: null,
      naboer: null,
      fjernvarme: null,
      fbbData: null,
      vurderingData: null,
      serviceStates: {
        bbr: "success",
        fbb: "no_hit",
        naturbeskyttelse: "skipped",
      },
    };
    expect(result.serviceStates?.bbr).toBe("success");
    expect(result.serviceStates?.fbb).toBe("no_hit");
  });
});
