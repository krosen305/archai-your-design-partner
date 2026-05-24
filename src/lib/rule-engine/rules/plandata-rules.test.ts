import { describe, expect, it } from "bun:test";
import { checkPlandataRules } from "./plandata-rules";
import type { RuleEngineInput } from "@/lib/rule-engine/types";

function baseInput(): RuleEngineInput {
  return {
    project: { type: "new_build", municipality: "Test", kommunekode: "0101" },
    plot: {
      areaM2: 800,
      zone: "urban",
      hasLocalplan: true,
      hasServitudes: false,
      localplanIds: ["lp-1"],
    },
    heritage: {
      listedBuilding: false,
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
    servituts: {
      hasCritical: false,
      criticalTexts: [],
    },
    planning: null,
    placement: null,
  };
}

describe("checkPlandataRules", () => {
  it("returns no violations when planning context is absent", () => {
    expect(checkPlandataRules(baseInput())).toEqual([]);
  });

  it("returns dispensation_required when parcel is outside defined building field", () => {
    const violations = checkPlandataRules({
      ...baseInput(),
      planning: {
        zoneType: "byzone",
        futureZoneType: null,
        landzonePermitRequired: false,
        buildingFieldDefined: true,
        withinBuildingField: false,
        wastewaterPlanStatus: null,
        sewerAreaType: null,
      },
    });

    expect(violations.some((v) => v.rule === "lokalplan_building_field")).toBe(true);
  });

  it("returns warnings for landzone and wastewater clarification", () => {
    const violations = checkPlandataRules({
      ...baseInput(),
      planning: {
        zoneType: "landzone",
        futureZoneType: null,
        landzonePermitRequired: true,
        buildingFieldDefined: false,
        withinBuildingField: null,
        wastewaterPlanStatus: "Vedtaget",
        sewerAreaType: "Separatkloakeret",
      },
    });

    expect(violations.some((v) => v.rule === "landzone_permit_required")).toBe(true);
    expect(violations.some((v) => v.rule === "wastewater_plan_clarification")).toBe(true);
  });
});
