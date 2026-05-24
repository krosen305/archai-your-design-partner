import { describe, expect, it } from "bun:test";
import { checkArealdataRules } from "@/lib/rule-engine/rules/arealdata-rules";
import type { RuleEngineInput } from "@/lib/rule-engine/types";

function baseInput(): RuleEngineInput {
  return {
    project: {
      type: "new_build",
      municipality: "Kobenhavn",
      kommunekode: "0101",
    },
    plot: {
      areaM2: 800,
      zone: "urban",
      hasLocalplan: false,
      hasServitudes: false,
      localplanIds: [],
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
    environmental: null,
  };
}

describe("checkArealdataRules", () => {
  it("returns no violations when environmental context is absent", () => {
    expect(checkArealdataRules(baseInput())).toEqual([]);
  });

  it("returns dispensation_required for paragraph 3 nature and dige", () => {
    const violations = checkArealdataRules({
      ...baseInput(),
      environmental: {
        paragraph3Nature: true,
        natura2000: false,
        protectedDige: true,
        fortidsminde: false,
        fortidsmindeBuffer: false,
        bnbo: false,
        osd: false,
        rawMaterialArea: false,
      },
    });

    expect(violations.find((v) => v.rule === "paragraph3_nature")?.severity).toBe(
      "dispensation_required",
    );
    expect(violations.find((v) => v.rule === "protected_dige")?.severity).toBe(
      "dispensation_required",
    );
  });

  it("returns warning-level screening rules for Natura 2000 and groundwater interests", () => {
    const violations = checkArealdataRules({
      ...baseInput(),
      environmental: {
        paragraph3Nature: false,
        natura2000: true,
        protectedDige: false,
        fortidsminde: false,
        fortidsmindeBuffer: true,
        bnbo: true,
        osd: true,
        rawMaterialArea: true,
      },
    });

    expect(violations.find((v) => v.rule === "natura2000_screening")?.severity).toBe("warning");
    expect(violations.find((v) => v.rule === "fortidsminde_buffer")?.severity).toBe("warning");
    expect(violations.find((v) => v.rule === "bnbo")?.severity).toBe("warning");
    expect(violations.find((v) => v.rule === "osd")?.severity).toBe("warning");
    expect(violations.find((v) => v.rule === "raw_material_area")?.severity).toBe("warning");
  });

  it("returns fortidsminde as dispensation_required", () => {
    const violations = checkArealdataRules({
      ...baseInput(),
      environmental: {
        paragraph3Nature: false,
        natura2000: false,
        protectedDige: false,
        fortidsminde: true,
        fortidsmindeBuffer: false,
        bnbo: false,
        osd: false,
        rawMaterialArea: false,
      },
    });

    expect(violations.find((v) => v.rule === "fortidsminde")?.severity).toBe(
      "dispensation_required",
    );
  });
});
