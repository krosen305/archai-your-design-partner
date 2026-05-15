import { describe, it, expect } from "bun:test";
import { runRuleEngine } from "@/lib/rule-engine/engine";
import { checkStopRules } from "@/lib/rule-engine/rules/stop-rules";
import { runCalculations } from "@/lib/rule-engine/rules/calculations";
import { checkEnergyProportionality } from "@/lib/rule-engine/rules/energy-rules";
import type { RuleEngineInput } from "@/lib/rule-engine/types";

// ---------------------------------------------------------------------------
// Basis-fixture — ren grund uden violations
// ---------------------------------------------------------------------------

function baseInput(overrides: Partial<RuleEngineInput> = {}): RuleEngineInput {
  return {
    project: {
      type: "new_build",
      municipality: "Lyngby-Taarbæk",
      kommunekode: "0173",
    },
    plot: {
      areaM2: 1000,
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
    newBuilding: {
      floorAreaM2: 150,
      footprintM2: 100,
      footprintEstimated: true,
      heightM: 6.0,
      heightEstimated: true,
      storeys: 2,
      distanceToBoundaryM: null,
      buildType: "new_build",
      roofType: "saddeltag",
      facadeMaterial: "tegl",
      usage: "residential",
      energyClass: "BR18",
      heatingSource: null,
    },
    geotechnical: {
      radonRisk: "low",
      groundwaterDepthM: null,
      slopePercent: null,
    },
    servituts: {
      hasCritical: false,
      criticalTexts: [],
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Stop-regler
// ---------------------------------------------------------------------------

describe("checkStopRules — fredede bygninger", () => {
  it("nedrivning af fredet bygning → illegal", () => {
    const input = baseInput({
      heritage: { ...baseInput().heritage, listedBuilding: true },
      project: { ...baseInput().project, type: "demolition_and_new" },
    });
    const violations = checkStopRules(input);
    expect(violations.length).toBeGreaterThanOrEqual(1);
    const v = violations.find((x) => x.rule === "listed_building_demolition");
    expect(v).toBeDefined();
    expect(v?.severity).toBe("illegal");
    expect(v?.authority).toBe("Slots- og Kulturstyrelsen");
  });

  it("renovering af fredet bygning → dispensation_required", () => {
    const input = baseInput({
      heritage: { ...baseInput().heritage, listedBuilding: true },
      project: { ...baseInput().project, type: "renovation" },
    });
    const violations = checkStopRules(input);
    const v = violations.find((x) => x.rule === "listed_building_major_alteration");
    expect(v?.severity).toBe("dispensation_required");
  });

  it("tilbygning til fredet bygning → dispensation_required", () => {
    const input = baseInput({
      heritage: { ...baseInput().heritage, listedBuilding: true },
      project: { ...baseInput().project, type: "extension" },
    });
    const violations = checkStopRules(input);
    const v = violations.find((x) => x.rule === "listed_building_extension");
    expect(v?.severity).toBe("dispensation_required");
  });

  it("nybyg på ikke-fredet → ingen fredningsfejl", () => {
    const violations = checkStopRules(baseInput());
    expect(violations.filter((v) => v.rule.startsWith("listed_building"))).toHaveLength(0);
  });
});

describe("checkStopRules — SAVE-bevaringsværdi", () => {
  it("SAVE 2 + nedrivning → dispensation_required", () => {
    const input = baseInput({
      heritage: { ...baseInput().heritage, saveValue: 2 },
      project: { ...baseInput().project, type: "demolition_and_new" },
    });
    const violations = checkStopRules(input);
    const v = violations.find((x) => x.rule === "save_1_3_demolition");
    expect(v?.severity).toBe("dispensation_required");
  });

  it("SAVE 4 (lav) → ingen violation", () => {
    const input = baseInput({
      heritage: { ...baseInput().heritage, saveValue: 4 },
      project: { ...baseInput().project, type: "demolition_and_new" },
    });
    const violations = checkStopRules(input);
    expect(violations.find((x) => x.rule === "save_1_3_demolition")).toBeUndefined();
  });

  it("SAVE 3 + renovering → dispensation_required", () => {
    const input = baseInput({
      heritage: { ...baseInput().heritage, saveValue: 3 },
      project: { ...baseInput().project, type: "renovation" },
    });
    const violations = checkStopRules(input);
    expect(violations.find((x) => x.rule === "save_1_3_demolition")?.severity).toBe(
      "dispensation_required",
    );
  });

  it("SAVE 2 + nybyg → ingen SAVE-violation", () => {
    const input = baseInput({
      heritage: { ...baseInput().heritage, saveValue: 2 },
      project: { ...baseInput().project, type: "new_build" },
    });
    const violations = checkStopRules(input);
    expect(violations.find((x) => x.rule === "save_1_3_demolition")).toBeUndefined();
  });
});

describe("checkStopRules — beskyttelseslinjer", () => {
  it("strandbeskyttelseslinje → dispensation_required (Kystdirektoratet)", () => {
    const input = baseInput({
      heritage: {
        ...baseInput().heritage,
        protectionLines: { ...baseInput().heritage.protectionLines, coastal: true },
      },
    });
    const violations = checkStopRules(input);
    const v = violations.find((x) => x.rule === "protection_line_coastal");
    expect(v?.severity).toBe("dispensation_required");
    expect(v?.authority).toBe("Kystdirektoratet");
  });

  it("skovbyggelinje → dispensation_required", () => {
    const input = baseInput({
      heritage: {
        ...baseInput().heritage,
        protectionLines: { ...baseInput().heritage.protectionLines, forest: true },
      },
    });
    const violations = checkStopRules(input);
    expect(violations.find((x) => x.rule === "protection_line_forest")).toBeDefined();
  });

  it("søbeskyttelseslinje → dispensation_required", () => {
    const input = baseInput({
      heritage: {
        ...baseInput().heritage,
        protectionLines: { ...baseInput().heritage.protectionLines, lake: true },
      },
    });
    const violations = checkStopRules(input);
    expect(violations.find((x) => x.rule === "protection_line_lake")?.authority).toBe("Kommunen");
  });

  it("åbeskyttelseslinje → dispensation_required", () => {
    const input = baseInput({
      heritage: {
        ...baseInput().heritage,
        protectionLines: { ...baseInput().heritage.protectionLines, lakeRiver: true },
      },
    });
    const violations = checkStopRules(input);
    expect(violations.find((x) => x.rule === "protection_line_lakeRiver")).toBeDefined();
  });

  it("klitfredning → dispensation_required", () => {
    const input = baseInput({
      heritage: {
        ...baseInput().heritage,
        protectionLines: { ...baseInput().heritage.protectionLines, clitFredning: true },
      },
    });
    const violations = checkStopRules(input);
    expect(violations.find((x) => x.rule === "protection_line_clitFredning")?.authority).toBe(
      "Kystdirektoratet",
    );
  });

  it("kirkebyggelinje → dispensation_required", () => {
    const input = baseInput({
      heritage: {
        ...baseInput().heritage,
        protectionLines: { ...baseInput().heritage.protectionLines, churchSurroundings: true },
      },
    });
    const violations = checkStopRules(input);
    expect(
      violations.find((x) => x.rule === "protection_line_churchSurroundings")?.authority,
    ).toBe("Kommunen");
  });

  it("multiple beskyttelseslinjer → multiple violations", () => {
    const input = baseInput({
      heritage: {
        ...baseInput().heritage,
        protectionLines: {
          ...baseInput().heritage.protectionLines,
          coastal: true,
          forest: true,
          lakeRiver: true,
        },
      },
    });
    const violations = checkStopRules(input);
    expect(violations.length).toBeGreaterThanOrEqual(3);
  });

  it("ingen beskyttelseslinjer → ingen violations", () => {
    const violations = checkStopRules(baseInput());
    expect(violations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Beregningsregler
// ---------------------------------------------------------------------------

describe("runCalculations — bebyggelsesprocent", () => {
  it("under BR18-grænse (30% på ≥700m²) → compliant", () => {
    const input = baseInput(); // 100m² footprint på 1000m² = 10%
    const result = runCalculations(input);
    expect(result.buildingPercent.compliant).toBe(true);
    expect(result.buildingPercent.appliedRule).toBe("br18_default");
    expect(result.buildingPercent.limit).toBe(30);
  });

  it("over BR18-grænse → violation dispensation_required", () => {
    const input = baseInput({
      newBuilding: { ...baseInput().newBuilding!, footprintM2: 400 }, // 400/1000 = 40%
    });
    const result = runCalculations(input);
    expect(result.buildingPercent.compliant).toBe(false);
    expect(result.buildingPercent.violation?.severity).toBe("dispensation_required");
    expect(result.buildingPercent.violation?.rule).toBe("bebyggelsesprocent");
  });

  it("grund < 700m² → BR18-grænse er 40%", () => {
    const input = baseInput({
      plot: { ...baseInput().plot, areaM2: 500 },
      newBuilding: { ...baseInput().newBuilding!, footprintM2: 150 }, // 150/500 = 30%
    });
    const result = runCalculations(input);
    expect(result.buildingPercent.limit).toBe(40);
    expect(result.buildingPercent.compliant).toBe(true);
  });

  it("kommuneplanramme har forrang over BR18", () => {
    const input = baseInput({
      municipalPlan: {
        maxBuildingPercent: 25,
        maxHeightM: null,
        maxStoreys: null,
        usageCode: null,
        usageText: null,
      },
      newBuilding: { ...baseInput().newBuilding!, footprintM2: 260 }, // 260/1000 = 26%
    });
    const result = runCalculations(input);
    expect(result.buildingPercent.appliedRule).toBe("kommuneplan");
    expect(result.buildingPercent.limit).toBe(25);
    expect(result.buildingPercent.compliant).toBe(false);
  });

  it("lokalplan har forrang over kommuneplan", () => {
    const input = baseInput({
      localplan: {
        maxBuildingPercent: { value: 40, source: "pdf_extracted", confidence: 0.9 },
        maxHeightM: { value: null, source: "not_defined", confidence: 0 },
        maxStoreys: { value: null, source: "not_defined", confidence: 0 },
        minSetbackM: { value: null, source: "not_defined", confidence: 0 },
        allowedRoofTypes: null,
        allowedMaterials: [],
        specialConditions: [],
        buildingFieldDefined: false,
      },
      municipalPlan: {
        maxBuildingPercent: 25,
        maxHeightM: null,
        maxStoreys: null,
        usageCode: null,
        usageText: null,
      },
      newBuilding: { ...baseInput().newBuilding!, footprintM2: 300 }, // 30%
    });
    const result = runCalculations(input);
    expect(result.buildingPercent.appliedRule).toBe("lokalplan");
    expect(result.buildingPercent.limit).toBe(40);
    expect(result.buildingPercent.compliant).toBe(true);
  });

  it("manglende grundareal → compliant = null", () => {
    const input = baseInput({
      plot: { ...baseInput().plot, areaM2: null },
    });
    const result = runCalculations(input);
    expect(result.buildingPercent.compliant).toBeNull();
    expect(result.buildingPercent.violation).toBeNull();
  });
});

describe("runCalculations — bygningshøjde", () => {
  it("under BR18-grænse (8.5m) → compliant", () => {
    const result = runCalculations(baseInput()); // 6.0m
    expect(result.height.compliant).toBe(true);
    expect(result.height.limit).toBe(8.5);
  });

  it("over BR18-grænse → violation", () => {
    const input = baseInput({
      newBuilding: { ...baseInput().newBuilding!, heightM: 10.0 },
    });
    const result = runCalculations(input);
    expect(result.height.compliant).toBe(false);
    expect(result.height.violation?.rule).toBe("bygningshøjde");
  });
});

describe("runCalculations — etager", () => {
  it("2 etager under BR18-grænse (2) → compliant", () => {
    const result = runCalculations(baseInput());
    expect(result.storeys.compliant).toBe(true);
  });

  it("3 etager over BR18-grænse → violation", () => {
    const input = baseInput({
      newBuilding: { ...baseInput().newBuilding!, storeys: 3 },
    });
    const result = runCalculations(input);
    expect(result.storeys.compliant).toBe(false);
    expect(result.storeys.violation?.rule).toBe("etager");
  });
});

describe("runCalculations — skelafstand", () => {
  it("manglende skelafstand → compliant = null", () => {
    const result = runCalculations(baseInput()); // distanceToBoundaryM = null
    expect(result.setback.compliant).toBeNull();
    expect(result.setback.violation).toBeNull();
  });

  it("over min skelafstand (2.5m) → compliant", () => {
    const input = baseInput({
      newBuilding: { ...baseInput().newBuilding!, distanceToBoundaryM: 3.0 },
    });
    const result = runCalculations(input);
    expect(result.setback.compliant).toBe(true);
  });

  it("under min skelafstand → violation", () => {
    const input = baseInput({
      newBuilding: { ...baseInput().newBuilding!, distanceToBoundaryM: 1.5 },
    });
    const result = runCalculations(input);
    expect(result.setback.compliant).toBe(false);
    expect(result.setback.violation?.rule).toBe("skelafstand");
  });
});

// ---------------------------------------------------------------------------
// Energiregler
// ---------------------------------------------------------------------------

describe("checkEnergyProportionality", () => {
  it("tilbygning > 25% af eksisterende → energy_upgrade warning", () => {
    const input = baseInput({
      project: { ...baseInput().project, type: "extension" },
      existingBuilding: {
        exists: true,
        floorAreaM2: 100,
        footprintM2: 80,
        heightM: 6,
        heightEstimated: false,
        storeys: 2,
        yearBuilt: 1970,
        useCode: "120",
        currentBuildingPercent: 20,
      },
      newBuilding: { ...baseInput().newBuilding!, floorAreaM2: 40 }, // 40% af 100m²
    });
    const violations = checkEnergyProportionality(input);
    expect(violations.find((v) => v.rule === "energy_upgrade_likely_required")).toBeDefined();
  });

  it("tilbygning ≤ 25% → ingen energy_upgrade violation", () => {
    const input = baseInput({
      project: { ...baseInput().project, type: "extension" },
      existingBuilding: {
        exists: true,
        floorAreaM2: 200,
        footprintM2: 100,
        heightM: 6,
        heightEstimated: false,
        storeys: 2,
        yearBuilt: 1990,
        useCode: "120",
        currentBuildingPercent: 20,
      },
      newBuilding: { ...baseInput().newBuilding!, floorAreaM2: 40 }, // 20% af 200m²
    });
    const violations = checkEnergyProportionality(input);
    expect(violations.find((v) => v.rule === "energy_upgrade_likely_required")).toBeUndefined();
  });

  it("ny bebyggelse (ikke tilbygning) → ingen energiregler", () => {
    const violations = checkEnergyProportionality(baseInput());
    expect(violations).toHaveLength(0);
  });

  it("varmepumpe på eksisterende bygning → heat_pump warning", () => {
    const input = baseInput({
      project: { ...baseInput().project, type: "extension" },
      existingBuilding: {
        exists: true,
        floorAreaM2: 200,
        footprintM2: 100,
        heightM: 6,
        heightEstimated: false,
        storeys: 2,
        yearBuilt: 1980,
        useCode: "120",
        currentBuildingPercent: 20,
      },
      newBuilding: {
        ...baseInput().newBuilding!,
        floorAreaM2: 40,
        heatingSource: "varmepumpe",
      },
    });
    const violations = checkEnergyProportionality(input);
    expect(violations.find((v) => v.rule === "heat_pump_installation_requirement")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// runRuleEngine — integration
// ---------------------------------------------------------------------------

describe("runRuleEngine — overordnet status", () => {
  it("ren grund → status OK", () => {
    const result = runRuleEngine(baseInput(), []);
    expect(result.status).toBe("OK");
    expect(result.violations).toHaveLength(0);
  });

  it("fredet bygning + nedrivning → status ILLEGAL (tidlig retur)", () => {
    const input = baseInput({
      heritage: { ...baseInput().heritage, listedBuilding: true },
      project: { ...baseInput().project, type: "demolition_and_new" },
    });
    const result = runRuleEngine(input, []);
    expect(result.status).toBe("ILLEGAL");
    expect(result.violations.some((v) => v.severity === "illegal")).toBe(true);
  });

  it("strandbeskyttelseslinje → status REQUIRES_DISPENSATION", () => {
    const input = baseInput({
      heritage: {
        ...baseInput().heritage,
        protectionLines: { ...baseInput().heritage.protectionLines, coastal: true },
      },
    });
    const result = runRuleEngine(input, []);
    expect(result.status).toBe("REQUIRES_DISPENSATION");
    expect(result.dispensationList.length).toBeGreaterThan(0);
  });

  it("overskridelse af bebyggelsesprocent → REQUIRES_DISPENSATION", () => {
    const input = baseInput({
      newBuilding: { ...baseInput().newBuilding!, footprintM2: 400 }, // 40% > 30%
    });
    const result = runRuleEngine(input, []);
    expect(result.status).toBe("REQUIRES_DISPENSATION");
  });

  it("manglende kritiske felter → status INCOMPLETE", () => {
    const result = runRuleEngine(baseInput(), ["plot.areaM2", "newBuilding.floorAreaM2"]);
    expect(result.status).toBe("INCOMPLETE");
  });

  it("dispensationList indeholder labels for alle dispensation_required violations", () => {
    const input = baseInput({
      heritage: {
        ...baseInput().heritage,
        protectionLines: { ...baseInput().heritage.protectionLines, coastal: true, forest: true },
      },
    });
    const result = runRuleEngine(input, []);
    expect(result.dispensationList.length).toBe(2);
    expect(result.dispensationList.every((d) => d.label.length > 0)).toBe(true);
  });

  it("checkedRules indeholder alle regelkategorier", () => {
    const result = runRuleEngine(baseInput(), []);
    expect(result.checkedRules).toContain("protection_line_coastal");
    expect(result.checkedRules).toContain("bebyggelsesprocent");
    expect(result.checkedRules).toContain("energy_upgrade_likely_required");
  });

  it("tom input-objekt med manglende felter returnerer INCOMPLETE og fejler ikke", () => {
    const minimalInput = baseInput({
      plot: { ...baseInput().plot, areaM2: null },
      newBuilding: null,
    });
    const result = runRuleEngine(minimalInput, ["newBuilding.floorAreaM2", "plot.areaM2"]);
    expect(result.status).toBe("INCOMPLETE");
    expect(result.violations).toBeDefined();
  });
});
