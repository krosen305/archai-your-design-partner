/**
 * Eval-suite: Deterministisk regelkerne (ARCH-110).
 *
 * Dækker stopregler, bebyggelsesprocent-hierarki, skelafstand,
 * energiproportionalitet, confidence-propagering og INCOMPLETE-status.
 *
 * Alle cases bruger exact-scoring — regelkernen er deterministisk,
 * så output skal matche præcist. Testen fanger regressioner i hierarki-fallback
 * og regellogik.
 */

import type { EvalSuite } from "../types.ts";
import type { RuleEngineInput } from "@/lib/rule-engine/types.ts";
import { runRuleEngine } from "@/lib/rule-engine/engine.ts";

// ---------------------------------------------------------------------------
// Input/output typer
// ---------------------------------------------------------------------------

type EvalInput = {
  input: RuleEngineInput;
  missingFields: string[];
};

type EvalOutput = {
  status: string;
  violationRules: string[]; // sorterede rule-IDs
  hasIllegal: boolean;
  hasDispensationRequired: boolean;
  hasWarning: boolean;
  buildingPercentLimit: number | null;
  buildingPercentActual: number | null;
  buildingPercentSource: string | null;
  setbackCompliant: boolean | null;
  energyWarning: boolean;
  firstViolationConfidence: number | null; // til confidence-propagering tests
  coastalAuthority: string | null; // til strandbeskyttelse-test
};

async function run(evalInput: EvalInput): Promise<EvalOutput> {
  const result = runRuleEngine(evalInput.input, evalInput.missingFields);
  const coastalViolation = result.violations.find((v) => v.rule === "protection_line_coastal");
  const firstCalcViolation = [
    result.calculations.buildingPercent.violation,
    result.calculations.height.violation,
    result.calculations.storeys.violation,
    result.calculations.setback.violation,
  ].find((v) => v !== null) ?? null;

  return {
    status: result.status,
    violationRules: result.violations.map((v) => v.rule).sort(),
    hasIllegal: result.violations.some((v) => v.severity === "illegal"),
    hasDispensationRequired: result.violations.some((v) => v.severity === "dispensation_required"),
    hasWarning: result.violations.some((v) => v.severity === "warning"),
    buildingPercentLimit: result.calculations.buildingPercent.limit,
    buildingPercentActual: result.calculations.buildingPercent.actual,
    buildingPercentSource: result.calculations.buildingPercent.appliedRule,
    setbackCompliant: result.calculations.setback.compliant,
    energyWarning: result.violations.some((v) => v.rule === "energy_upgrade_likely_required"),
    firstViolationConfidence: firstCalcViolation?.confidence ?? null,
    coastalAuthority: coastalViolation?.authority ?? null,
  };
}

// ---------------------------------------------------------------------------
// Base-input (minimal valid RuleEngineInput)
// ---------------------------------------------------------------------------

function makeBase(overrides?: {
  projectType?: RuleEngineInput["project"]["type"];
  listedBuilding?: boolean | null;
  saveValue?: number | null;
  coastal?: boolean;
  localplan?: RuleEngineInput["localplan"];
  municipalPlan?: RuleEngineInput["municipalPlan"];
  existingFootprint?: number;
  newFootprint?: number;
  newFloorArea?: number;
  existingFloorArea?: number;
  plotArea?: number;
  newHeight?: number;
  newStoreys?: number;
  setback?: number | null;
}): RuleEngineInput {
  const o = overrides ?? {};
  return {
    project: {
      type: o.projectType ?? "new_build",
      municipality: "Lyngby-Taarbæk",
      kommunekode: "0173",
    },
    plot: {
      areaM2: o.plotArea ?? 800,
      zone: "urban",
      hasLocalplan: o.localplan !== undefined,
      hasServitudes: false,
      localplanIds: [],
    },
    heritage: {
      listedBuilding: o.listedBuilding ?? null,
      saveValue: o.saveValue ?? null,
      preservationLocalplan: false,
      protectionLines: {
        coastal: o.coastal ?? false,
        forest: false,
        lakeRiver: false,
        lake: false,
        clitFredning: false,
        churchSurroundings: false,
      },
    },
    localplan: o.localplan ?? null,
    municipalPlan:
      o.municipalPlan !== undefined
        ? o.municipalPlan
        : { maxBuildingPercent: 30, maxHeightM: 8.5, maxStoreys: 2, usageCode: null, usageText: null },
    existingBuilding: {
      exists: true,
      floorAreaM2: o.existingFloorArea ?? 100,
      footprintM2: o.existingFootprint ?? 100,
      heightM: 3.0,
      heightEstimated: true,
      storeys: 1,
      yearBuilt: 1960,
      useCode: "120",
      currentBuildingPercent: 12.5,
    },
    newBuilding: {
      floorAreaM2: o.newFloorArea ?? 60,
      footprintM2: o.newFootprint ?? 60,
      footprintEstimated: true,
      heightM: o.newHeight ?? 6.0,
      heightEstimated: true,
      storeys: o.newStoreys ?? 2,
      distanceToBoundaryM: o.setback !== undefined ? o.setback : 3.0,
      buildType: o.projectType ?? "new_build",
      roofType: "saddeltag",
      facadeMaterial: "trae",
      usage: "residential",
      energyClass: "lavenergi",
      // fjernvarme som default — undgår heat_pump_installation_requirement
      // i tests der ikke specifikt tester varmepumpe-reglen
      heatingSource: "fjernvarme",
    },
    geotechnical: { radonRisk: "low", groundwaterDepthM: 5.0, slopePercent: 2.0 },
    servituts: { hasCritical: false, criticalTexts: [] },
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

export const ruleEngineSuite: EvalSuite<EvalInput, EvalOutput> = {
  name: "Regelkerne deterministisk",
  run,
  cases: [
    // ── Stopregler ──────────────────────────────────────────────────────────

    {
      id: "stop-fredet-nedrivning",
      description: "Fredet bygning + nedrivning → ILLEGAL",
      scoring: "exact",
      threshold: 1.0,
      input: {
        input: makeBase({ projectType: "demolition_and_new", listedBuilding: true }),
        missingFields: [],
      },
      expected: {
        status: "ILLEGAL",
        violationRules: ["listed_building_demolition"],
        hasIllegal: true,
        hasDispensationRequired: false,
        hasWarning: false,
        buildingPercentLimit: 30,
        buildingPercentActual: 20, // (100+60)/800*100
        buildingPercentSource: "kommuneplan",
        setbackCompliant: true, // 3.0 >= 2.5
        energyWarning: false,
        firstViolationConfidence: null,
        coastalAuthority: null,
      } satisfies EvalOutput,
    },

    {
      id: "stop-fredet-tilbygning",
      description: "Fredet bygning + tilbygning → dispensation_required, IKKE ILLEGAL",
      scoring: "exact",
      threshold: 1.0,
      input: {
        input: makeBase({ projectType: "extension", listedBuilding: true }),
        missingFields: [],
      },
      expected: {
        status: "REQUIRES_DISPENSATION",
        // extension + listedBuilding → both stop-rule + energy proportionality (60m²/100m²=60% > 25%)
        violationRules: ["energy_upgrade_likely_required", "listed_building_extension"],
        hasIllegal: false,
        hasDispensationRequired: true,
        hasWarning: true,
        buildingPercentLimit: 30,
        buildingPercentActual: 20,
        buildingPercentSource: "kommuneplan",
        setbackCompliant: true,
        energyWarning: true,
        firstViolationConfidence: null,
        coastalAuthority: null,
      } satisfies EvalOutput,
    },

    {
      id: "stop-save-2-nedrivning",
      description: "SAVE 2 + nedrivning → requires_dispensation, IKKE ILLEGAL",
      scoring: "exact",
      threshold: 1.0,
      input: {
        input: makeBase({ projectType: "demolition_and_new", saveValue: 2 }),
        missingFields: [],
      },
      expected: {
        status: "REQUIRES_DISPENSATION",
        violationRules: ["save_1_3_demolition"],
        hasIllegal: false,
        hasDispensationRequired: true,
        hasWarning: false,
        buildingPercentLimit: 30,
        buildingPercentActual: 20,
        buildingPercentSource: "kommuneplan",
        setbackCompliant: true,
        energyWarning: false,
        firstViolationConfidence: null,
        coastalAuthority: null,
      } satisfies EvalOutput,
    },

    {
      id: "stop-save-5-nedrivning",
      description: "SAVE 5 (lav bevaringsværdi) + nedrivning → ingen violation",
      scoring: "exact",
      threshold: 1.0,
      input: {
        input: makeBase({ projectType: "demolition_and_new", saveValue: 5 }),
        missingFields: [],
      },
      expected: {
        status: "OK",
        violationRules: [],
        hasIllegal: false,
        hasDispensationRequired: false,
        hasWarning: false,
        buildingPercentLimit: 30,
        buildingPercentActual: 20,
        buildingPercentSource: "kommuneplan",
        setbackCompliant: true,
        energyWarning: false,
        firstViolationConfidence: null,
        coastalAuthority: null,
      } satisfies EvalOutput,
    },

    {
      id: "stop-strandbeskyttelse",
      description: "Strandbeskyttelseslinje → requires_dispensation, authority indeholder Kystdirektorat",
      scoring: "exact",
      threshold: 1.0,
      input: {
        input: makeBase({ coastal: true }),
        missingFields: [],
      },
      expected: {
        status: "REQUIRES_DISPENSATION",
        violationRules: ["protection_line_coastal"],
        hasIllegal: false,
        hasDispensationRequired: true,
        hasWarning: false,
        buildingPercentLimit: 30,
        buildingPercentActual: 20,
        buildingPercentSource: "kommuneplan",
        setbackCompliant: true,
        energyWarning: false,
        firstViolationConfidence: null,
        coastalAuthority: "Kystdirektoratet",
      } satisfies EvalOutput,
    },

    // ── Bebyggelsesprocent — hierarki ──────────────────────────────────────

    {
      id: "calc-pct-lokalplan-40",
      description: "Lokalplan definerer 40% → limit = 40 (ikke BR18-default 30)",
      scoring: "exact",
      threshold: 1.0,
      input: {
        input: makeBase({
          localplan: {
            maxBuildingPercent: { value: 40, source: "pdf_extracted", confidence: 1.0 },
            maxHeightM: { value: null, source: "not_defined", confidence: 0 },
            maxStoreys: { value: null, source: "not_defined", confidence: 0 },
            minSetbackM: { value: null, source: "not_defined", confidence: 0 },
            allowedRoofTypes: null,
            allowedMaterials: [],
            specialConditions: [],
            buildingFieldDefined: false,
          },
          municipalPlan: { maxBuildingPercent: 30, maxHeightM: 8.5, maxStoreys: 2, usageCode: null, usageText: null },
        }),
        missingFields: [],
      },
      expected: {
        status: "OK",
        violationRules: [],
        hasIllegal: false,
        hasDispensationRequired: false,
        hasWarning: false,
        buildingPercentLimit: 40,
        buildingPercentActual: 20,
        buildingPercentSource: "lokalplan",
        setbackCompliant: true,
        energyWarning: false,
        firstViolationConfidence: null,
        coastalAuthority: null,
      } satisfies EvalOutput,
    },

    {
      id: "calc-pct-kommuneplan-35",
      description: "Ingen lokalplan, kommuneplan 35% → limit = 35",
      scoring: "exact",
      threshold: 1.0,
      input: {
        input: makeBase({
          localplan: null,
          municipalPlan: { maxBuildingPercent: 35, maxHeightM: 8.5, maxStoreys: 2, usageCode: null, usageText: null },
        }),
        missingFields: [],
      },
      expected: {
        status: "OK",
        violationRules: [],
        hasIllegal: false,
        hasDispensationRequired: false,
        hasWarning: false,
        buildingPercentLimit: 35,
        buildingPercentActual: 20,
        buildingPercentSource: "kommuneplan",
        setbackCompliant: true,
        energyWarning: false,
        firstViolationConfidence: null,
        coastalAuthority: null,
      } satisfies EvalOutput,
    },

    {
      id: "calc-pct-br18-fallback",
      description: "Ingen lokalplan, ingen kommuneplan → BR18 fallback 30%",
      scoring: "exact",
      threshold: 1.0,
      input: {
        input: makeBase({
          localplan: null,
          municipalPlan: null,
          plotArea: 800,
        }),
        missingFields: [],
      },
      expected: {
        status: "OK",
        violationRules: [],
        hasIllegal: false,
        hasDispensationRequired: false,
        hasWarning: false,
        buildingPercentLimit: 30,
        buildingPercentActual: 20,
        buildingPercentSource: "br18_default",
        setbackCompliant: true,
        energyWarning: false,
        firstViolationConfidence: null,
        coastalAuthority: null,
      } satisfies EvalOutput,
    },

    {
      id: "calc-pct-overskredet",
      description: "Bebyggelsesprocent 35% > limit 30% → requires_dispensation",
      scoring: "exact",
      threshold: 1.0,
      // 200m² eksisterende + 80m² ny = 280m² på 800m² = 35%
      input: {
        input: makeBase({
          existingFootprint: 200,
          newFootprint: 80,
          plotArea: 800,
          localplan: null,
          municipalPlan: { maxBuildingPercent: 30, maxHeightM: 8.5, maxStoreys: 2, usageCode: null, usageText: null },
        }),
        missingFields: [],
      },
      expected: {
        status: "REQUIRES_DISPENSATION",
        violationRules: ["bebyggelsesprocent"],
        hasIllegal: false,
        hasDispensationRequired: true,
        hasWarning: false,
        buildingPercentLimit: 30,
        buildingPercentActual: 35,
        buildingPercentSource: "kommuneplan",
        setbackCompliant: true,
        energyWarning: false,
        firstViolationConfidence: 1.0,
        coastalAuthority: null,
      } satisfies EvalOutput,
    },

    {
      id: "calc-pct-ikke-overskredet",
      description: "Bebyggelsesprocent 28% < limit 30% → ingen violation",
      scoring: "exact",
      threshold: 1.0,
      // 100m² eksisterende + 124m² ny = 224m² på 800m² = 28%
      input: {
        input: makeBase({
          existingFootprint: 100,
          newFootprint: 124,
          plotArea: 800,
          localplan: null,
          municipalPlan: { maxBuildingPercent: 30, maxHeightM: 8.5, maxStoreys: 2, usageCode: null, usageText: null },
        }),
        missingFields: [],
      },
      expected: {
        status: "OK",
        violationRules: [],
        hasIllegal: false,
        hasDispensationRequired: false,
        hasWarning: false,
        buildingPercentLimit: 30,
        buildingPercentActual: 28,
        buildingPercentSource: "kommuneplan",
        setbackCompliant: true,
        energyWarning: false,
        firstViolationConfidence: null,
        coastalAuthority: null,
      } satisfies EvalOutput,
    },

    // ── Skelafstand ──────────────────────────────────────────────────────────

    {
      id: "setback-lokalplan-5m-bygning-3m",
      description: "Lokalplan sætter 5m, bygning 3m fra skel → requires_dispensation",
      scoring: "exact",
      threshold: 1.0,
      input: {
        input: makeBase({
          localplan: {
            maxBuildingPercent: { value: null, source: "not_defined", confidence: 0 },
            maxHeightM: { value: null, source: "not_defined", confidence: 0 },
            maxStoreys: { value: null, source: "not_defined", confidence: 0 },
            minSetbackM: { value: 5, source: "pdf_extracted", confidence: 1.0 },
            allowedRoofTypes: null,
            allowedMaterials: [],
            specialConditions: [],
            buildingFieldDefined: false,
          },
          setback: 3.0,
        }),
        missingFields: [],
      },
      expected: {
        status: "REQUIRES_DISPENSATION",
        violationRules: ["skelafstand"],
        hasIllegal: false,
        hasDispensationRequired: true,
        hasWarning: false,
        buildingPercentLimit: 30, // lokalplan har null maxBuildingPercent → kommuneplan 30
        buildingPercentActual: 20,
        buildingPercentSource: "kommuneplan",
        setbackCompliant: false,
        energyWarning: false,
        firstViolationConfidence: 1.0,
        coastalAuthority: null,
      } satisfies EvalOutput,
    },

    {
      id: "setback-br18-3m-ok",
      description: "Ingen lokalplan, bygning 3m fra skel > 2.5m BR18 → ingen violation",
      scoring: "exact",
      threshold: 1.0,
      input: {
        input: makeBase({ localplan: null, setback: 3.0 }),
        missingFields: [],
      },
      expected: {
        status: "OK",
        violationRules: [],
        hasIllegal: false,
        hasDispensationRequired: false,
        hasWarning: false,
        buildingPercentLimit: 30,
        buildingPercentActual: 20,
        buildingPercentSource: "kommuneplan",
        setbackCompliant: true,
        energyWarning: false,
        firstViolationConfidence: null,
        coastalAuthority: null,
      } satisfies EvalOutput,
    },

    {
      id: "setback-br18-2m-violation",
      description: "Ingen lokalplan, bygning 2m fra skel < 2.5m BR18 → requires_dispensation",
      scoring: "exact",
      threshold: 1.0,
      input: {
        input: makeBase({ localplan: null, setback: 2.0 }),
        missingFields: [],
      },
      expected: {
        status: "REQUIRES_DISPENSATION",
        violationRules: ["skelafstand"],
        hasIllegal: false,
        hasDispensationRequired: true,
        hasWarning: false,
        buildingPercentLimit: 30,
        buildingPercentActual: 20,
        buildingPercentSource: "kommuneplan",
        setbackCompliant: false,
        energyWarning: false,
        firstViolationConfidence: 1.0,
        coastalAuthority: null,
      } satisfies EvalOutput,
    },

    // ── Energiproportionalitet ───────────────────────────────────────────────

    {
      id: "energy-tilbyg-30pct",
      description: "Tilbygning 30% af eksisterende → warning: energy_upgrade_likely_required",
      scoring: "exact",
      threshold: 1.0,
      // eksisterende 100m², tilbygning 30m² = 30%
      input: {
        input: makeBase({
          projectType: "extension",
          existingFloorArea: 100,
          newFloorArea: 30,
          existingFootprint: 100,
          newFootprint: 30,
        }),
        missingFields: [],
      },
      expected: {
        status: "OK",
        violationRules: ["energy_upgrade_likely_required"],
        hasIllegal: false,
        hasDispensationRequired: false,
        hasWarning: true,
        buildingPercentLimit: 30,
        // (100+30)/800*100 = 16.25 → Math.round(162.5)/10 = 16.3
        buildingPercentActual: 16.3,
        buildingPercentSource: "kommuneplan",
        setbackCompliant: true,
        energyWarning: true,
        firstViolationConfidence: null,
        coastalAuthority: null,
      } satisfies EvalOutput,
    },

    {
      id: "energy-tilbyg-20pct",
      description: "Tilbygning 20% af eksisterende → ingen energi-warning",
      scoring: "exact",
      threshold: 1.0,
      // eksisterende 100m², tilbygning 20m² = 20%
      input: {
        input: makeBase({
          projectType: "extension",
          existingFloorArea: 100,
          newFloorArea: 20,
          existingFootprint: 100,
          newFootprint: 20,
        }),
        missingFields: [],
      },
      expected: {
        status: "OK",
        violationRules: [],
        hasIllegal: false,
        hasDispensationRequired: false,
        hasWarning: false,
        buildingPercentLimit: 30,
        buildingPercentActual: 15,
        buildingPercentSource: "kommuneplan",
        setbackCompliant: true,
        energyWarning: false,
        firstViolationConfidence: null,
        coastalAuthority: null,
      } satisfies EvalOutput,
    },

    {
      id: "energy-nybyg-ingen-regel",
      description: "Nybyggeri (type=new_build) → ingen energiregel kørt",
      scoring: "exact",
      threshold: 1.0,
      input: {
        input: makeBase({ projectType: "new_build" }),
        missingFields: [],
      },
      expected: {
        status: "OK",
        violationRules: [],
        hasIllegal: false,
        hasDispensationRequired: false,
        hasWarning: false,
        buildingPercentLimit: 30,
        buildingPercentActual: 20,
        buildingPercentSource: "kommuneplan",
        setbackCompliant: true,
        energyWarning: false,
        firstViolationConfidence: null,
        coastalAuthority: null,
      } satisfies EvalOutput,
    },

    // ── Confidence-propagering ───────────────────────────────────────────────

    {
      id: "confidence-lokalplan-06-violation",
      description: "Lokalplan confidence 0.6, overskredet → violation.confidence = 0.6",
      scoring: "exact",
      threshold: 1.0,
      // 200m² + 80m² = 280m² på 800m² = 35% > 25% (lokalplan)
      input: {
        input: makeBase({
          existingFootprint: 200,
          newFootprint: 80,
          plotArea: 800,
          localplan: {
            maxBuildingPercent: { value: 25, source: "pdf_extracted", confidence: 0.6 },
            maxHeightM: { value: null, source: "not_defined", confidence: 0 },
            maxStoreys: { value: null, source: "not_defined", confidence: 0 },
            minSetbackM: { value: null, source: "not_defined", confidence: 0 },
            allowedRoofTypes: null,
            allowedMaterials: [],
            specialConditions: [],
            buildingFieldDefined: false,
          },
        }),
        missingFields: [],
      },
      expected: {
        status: "REQUIRES_DISPENSATION",
        violationRules: ["bebyggelsesprocent"],
        hasIllegal: false,
        hasDispensationRequired: true,
        hasWarning: false,
        buildingPercentLimit: 25,
        buildingPercentActual: 35,
        buildingPercentSource: "lokalplan",
        setbackCompliant: true,
        energyWarning: false,
        firstViolationConfidence: 0.6,
        coastalAuthority: null,
      } satisfies EvalOutput,
    },

    {
      id: "confidence-br18-fallback-1-0",
      description: "BR18-fallback regel udløser violation → confidence = 1.0 (deterministisk)",
      scoring: "exact",
      threshold: 1.0,
      // 200m² + 80m² = 280m² på 800m² = 35% > 30% (BR18 default, ingen plan)
      input: {
        input: makeBase({
          existingFootprint: 200,
          newFootprint: 80,
          plotArea: 800,
          localplan: null,
          municipalPlan: null,
        }),
        missingFields: [],
      },
      expected: {
        status: "REQUIRES_DISPENSATION",
        violationRules: ["bebyggelsesprocent"],
        hasIllegal: false,
        hasDispensationRequired: true,
        hasWarning: false,
        buildingPercentLimit: 30,
        buildingPercentActual: 35,
        buildingPercentSource: "br18_default",
        setbackCompliant: true,
        energyWarning: false,
        firstViolationConfidence: 1.0,
        coastalAuthority: null,
      } satisfies EvalOutput,
    },

    // ── INCOMPLETE-status ────────────────────────────────────────────────────

    {
      id: "incomplete-missing-plot-area",
      description: "missingFields indeholder plot.areaM2 → status = INCOMPLETE",
      scoring: "exact",
      threshold: 1.0,
      input: {
        input: makeBase({ plotArea: 800 }),
        missingFields: ["plot.areaM2"],
      },
      expected: {
        status: "INCOMPLETE",
        violationRules: [],
        hasIllegal: false,
        hasDispensationRequired: false,
        hasWarning: false,
        buildingPercentLimit: 30,
        buildingPercentActual: 20,
        buildingPercentSource: "kommuneplan",
        setbackCompliant: true,
        energyWarning: false,
        firstViolationConfidence: null,
        coastalAuthority: null,
      } satisfies EvalOutput,
    },

    {
      id: "incomplete-tom-missing-fields",
      description: "missingFields er tom → status baseret på violations (OK her)",
      scoring: "exact",
      threshold: 1.0,
      input: {
        input: makeBase(),
        missingFields: [],
      },
      expected: {
        status: "OK",
        violationRules: [],
        hasIllegal: false,
        hasDispensationRequired: false,
        hasWarning: false,
        buildingPercentLimit: 30,
        buildingPercentActual: 20,
        buildingPercentSource: "kommuneplan",
        setbackCompliant: true,
        energyWarning: false,
        firstViolationConfidence: null,
        coastalAuthority: null,
      } satisfies EvalOutput,
    },
  ],
};
