import { describe, it, expect } from "bun:test";
import type { RuleEngineInput } from "@/lib/rule-engine/types";
import { checkSurroundingsRules } from "./surroundings-rules";

function makeInput(
  surroundings: RuleEngineInput["surroundings"],
  neighborContext: RuleEngineInput["neighborContext"] = null,
): RuleEngineInput {
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
    surroundings,
    neighborContext,
  };
}

describe("checkSurroundingsRules", () => {
  it("ingen violations ved null surroundings", () => {
    expect(checkSurroundingsRules(makeInput(null))).toHaveLength(0);
  });

  it("warning ved plandata støjbelastet areal", () => {
    const violations = checkSurroundingsRules(
      makeInput({
        noiseDesignatedArea: true,
        productionNoiseConsequenceArea: null,
        odorConsequenceArea: null,
        odorDesignatedArea: null,
        technicalFacilityConsequenceArea: null,
        largeLivestockFarmArea: null,
        proposedPlanConflict: null,
      }),
    );
    const v = violations.find((x) => x.rule === "planning_noise_area");
    expect(v).toBeDefined();
    expect(v!.severity).toBe("warning");
  });

  it("warning ved produktionsvirksomhed konsekvensområde", () => {
    const violations = checkSurroundingsRules(
      makeInput({
        noiseDesignatedArea: null,
        productionNoiseConsequenceArea: true,
        odorConsequenceArea: null,
        odorDesignatedArea: null,
        technicalFacilityConsequenceArea: null,
        largeLivestockFarmArea: null,
        proposedPlanConflict: null,
      }),
    );
    const v = violations.find((x) => x.rule === "planning_production_noise_consequence");
    expect(v).toBeDefined();
  });

  it("warning ved lugt konsekvensområde", () => {
    const violations = checkSurroundingsRules(
      makeInput({
        noiseDesignatedArea: null,
        productionNoiseConsequenceArea: null,
        odorConsequenceArea: true,
        odorDesignatedArea: null,
        technicalFacilityConsequenceArea: null,
        largeLivestockFarmArea: null,
        proposedPlanConflict: null,
      }),
    );
    expect(violations.find((x) => x.rule === "planning_odor_consequence")).toBeDefined();
  });

  it("warning ved forslag-plankonflikt", () => {
    const violations = checkSurroundingsRules(
      makeInput({
        noiseDesignatedArea: null,
        productionNoiseConsequenceArea: null,
        odorConsequenceArea: null,
        odorDesignatedArea: null,
        technicalFacilityConsequenceArea: null,
        largeLivestockFarmArea: null,
        proposedPlanConflict: true,
      }),
    );
    const v = violations.find((x) => x.rule === "planning_proposed_conflict");
    expect(v).toBeDefined();
    expect(v!.severity).toBe("warning");
  });

  it("warning ved teknisk anlæg konsekvensområde", () => {
    const violations = checkSurroundingsRules(
      makeInput({
        noiseDesignatedArea: null,
        productionNoiseConsequenceArea: null,
        odorConsequenceArea: null,
        odorDesignatedArea: null,
        technicalFacilityConsequenceArea: true,
        largeLivestockFarmArea: null,
        proposedPlanConflict: null,
      }),
    );
    expect(
      violations.find((x) => x.rule === "planning_technical_facility_consequence"),
    ).toBeDefined();
  });

  it("warning ved store husdyrbrug", () => {
    const violations = checkSurroundingsRules(
      makeInput({
        noiseDesignatedArea: null,
        productionNoiseConsequenceArea: null,
        odorConsequenceArea: null,
        odorDesignatedArea: null,
        technicalFacilityConsequenceArea: null,
        largeLivestockFarmArea: true,
        proposedPlanConflict: null,
      }),
    );
    expect(violations.find((x) => x.rule === "planning_large_livestock_area")).toBeDefined();
  });

  it("warning ved nabodækning=source_unavailable", () => {
    const violations = checkSurroundingsRules(
      makeInput(null, {
        nearestBuildingDistanceM: null,
        nearestRoadCenterlineDistanceM: null,
        buildingCount40m: 0,
        accessRoadNearby: null,
        coverage: "source_unavailable",
      }),
    );
    expect(violations.find((x) => x.rule === "neighbor_coverage_unavailable")).toBeDefined();
  });
});
