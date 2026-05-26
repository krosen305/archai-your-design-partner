import { describe, it, expect } from "bun:test";
import type { RuleEngineInput } from "@/lib/rule-engine/types";
import { checkNoiseRules } from "./noise-rules";

function makeInput(noise: RuleEngineInput["noise"]): RuleEngineInput {
  return {
    project: { type: "new_build", municipality: "Testby", kommunekode: "0000" },
    plot: {
      areaM2: 800,
      zone: "urban",
      hasLocalplan: false,
      hasServitudes: false,
      localplanIds: [],
    },
    heritage: {
      listedBuilding: null,
      saveValue: null,
      preservationLocalplan: false,
      protectionLines: {
        coastal: false,
        forest: false,
        lakeRiver: false,
        lake: false,
        clitFredning: false,
        churchSurroundings: false,
      },
    },
    localplan: null,
    municipalPlan: null,
    existingBuilding: null,
    newBuilding: null,
    geotechnical: {
      radonRisk: "unknown",
      groundwaterDepthM: null,
      slopePercent: null,
      jordforureningV1: null,
      jordforureningV2: null,
      omraadeklassificering: null,
    },
    servituts: { hasCritical: false, criticalTexts: [] },
    noise,
  };
}

describe("checkNoiseRules", () => {
  it("ingen violations når noise er null", () => {
    expect(checkNoiseRules(makeInput(null))).toHaveLength(0);
  });

  it("ingen violations ved vejstøj under 58 dB med dækning", () => {
    const result = checkNoiseRules(
      makeInput({
        roadLdenDb: 55,
        railLdenDb: null,
        airLdenDb: null,
        industryLdenDb: null,
        coverageStatus: "covered",
        highestRisk: "ok",
        requiresAcousticReview: false,
      }),
    );
    expect(result).toHaveLength(0);
  });

  it("warning ved vejstøj >= 58 dB", () => {
    const violations = checkNoiseRules(
      makeInput({
        roadLdenDb: 60,
        railLdenDb: null,
        airLdenDb: null,
        industryLdenDb: null,
        coverageStatus: "covered",
        highestRisk: "warning",
        requiresAcousticReview: null,
      }),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]!.rule).toBe("noise_road_threshold");
    expect(violations[0]!.severity).toBe("warning");
  });

  it("warning ved togstøj >= 64 dB", () => {
    const violations = checkNoiseRules(
      makeInput({
        roadLdenDb: null,
        railLdenDb: 65,
        airLdenDb: null,
        industryLdenDb: null,
        coverageStatus: "covered",
        highestRisk: "warning",
        requiresAcousticReview: null,
      }),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]!.rule).toBe("noise_rail_threshold");
  });

  it("warning ved flystøj >= 55 dB", () => {
    const violations = checkNoiseRules(
      makeInput({
        roadLdenDb: null,
        railLdenDb: null,
        airLdenDb: 58,
        industryLdenDb: null,
        coverageStatus: "covered",
        highestRisk: "warning",
        requiresAcousticReview: null,
      }),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]!.rule).toBe("noise_air_threshold");
  });

  it("review_required ved virksomhedsstøj uanset niveau", () => {
    const violations = checkNoiseRules(
      makeInput({
        roadLdenDb: null,
        railLdenDb: null,
        airLdenDb: null,
        industryLdenDb: 45,
        coverageStatus: "covered",
        highestRisk: "review_required",
        requiresAcousticReview: null,
      }),
    );
    const rule = violations.find((v) => v.rule === "noise_industry_review");
    expect(rule).toBeDefined();
    expect(rule!.severity).toBe("warning");
  });

  it("warning ved coverage=outside_mapped_area — ukendt er ikke ok", () => {
    const violations = checkNoiseRules(
      makeInput({
        roadLdenDb: null,
        railLdenDb: null,
        airLdenDb: null,
        industryLdenDb: null,
        coverageStatus: "outside_mapped_area",
        highestRisk: "unknown",
        requiresAcousticReview: null,
      }),
    );
    const rule = violations.find((v) => v.rule === "noise_coverage_unknown");
    expect(rule).toBeDefined();
  });

  it("acoustic_review_required violation når flagget er true", () => {
    const violations = checkNoiseRules(
      makeInput({
        roadLdenDb: 62,
        railLdenDb: null,
        airLdenDb: null,
        industryLdenDb: null,
        coverageStatus: "covered",
        highestRisk: "review_required",
        requiresAcousticReview: true,
      }),
    );
    const acoustic = violations.find((v) => v.rule === "noise_acoustic_review_required");
    expect(acoustic).toBeDefined();
  });
});
