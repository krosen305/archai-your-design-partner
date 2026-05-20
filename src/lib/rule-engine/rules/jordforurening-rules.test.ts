import { describe, expect, it } from "bun:test";
import { checkJordforureningRules } from "./jordforurening-rules";
import type { RuleEngineInput } from "@/lib/rule-engine/types";

function baseInput(overrides: Partial<RuleEngineInput["geotechnical"]> = {}): RuleEngineInput {
  return {
    project: { type: "demolition_and_new", municipality: "København", kommunekode: "0101" },
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
      radonRisk: "low",
      groundwaterDepthM: null,
      slopePercent: null,
      jordforureningV1: null,
      jordforureningV2: null,
      omraadeklassificering: null,
      ...overrides,
    },
    servituts: { hasCritical: false, criticalTexts: [] },
  };
}

describe("checkJordforureningRules", () => {
  it("returnerer ingen violations når alle felter er null", () => {
    const result = checkJordforureningRules(baseInput());
    expect(result).toHaveLength(0);
  });

  it("returnerer ingen violations når V1=false, V2=false, omraade=null", () => {
    const result = checkJordforureningRules(
      baseInput({ jordforureningV1: false, jordforureningV2: false }),
    );
    expect(result).toHaveLength(0);
  });

  it("returnerer 1 warning når V2=true", () => {
    const result = checkJordforureningRules(baseInput({ jordforureningV2: true }));
    expect(result).toHaveLength(1);
    expect(result[0].rule).toBe("jordforurening_v2");
    expect(result[0].severity).toBe("warning");
    expect(result[0].authority).toBe("Miljøstyrelsen");
  });

  it("returnerer 1 warning når V1=true", () => {
    const result = checkJordforureningRules(baseInput({ jordforureningV1: true }));
    expect(result).toHaveLength(1);
    expect(result[0].rule).toBe("jordforurening_v1");
    expect(result[0].severity).toBe("warning");
  });

  it("returnerer 1 warning når omraadeklassificering er sat", () => {
    const result = checkJordforureningRules(
      baseInput({ omraadeklassificering: "Lettere forurenet" }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].rule).toBe("jordforurening_omraadeklassificering");
    expect(result[0].reason).toContain("Lettere forurenet");
    expect(result[0].authority).toBe("Kommunen");
  });

  it("returnerer 2 violations ved V2=true + omraadeklassificering sat", () => {
    const result = checkJordforureningRules(
      baseInput({ jordforureningV2: true, omraadeklassificering: "Forurenet område" }),
    );
    expect(result).toHaveLength(2);
    expect(result.map((v) => v.rule)).toContain("jordforurening_v2");
    expect(result.map((v) => v.rule)).toContain("jordforurening_omraadeklassificering");
  });

  it("V2=null giver ingen violation (tri-state — ukendt er ikke false)", () => {
    const result = checkJordforureningRules(baseInput({ jordforureningV2: null }));
    expect(result).toHaveLength(0);
  });
});
