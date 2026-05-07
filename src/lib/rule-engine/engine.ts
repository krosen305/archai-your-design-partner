// Regelkerne-indgang (ARCH-108).
// Pure function — ingen I/O, ingen sideeffekter.
// Tager RuleEngineInput + missingFields og returnerer RuleEngineResult.
//
// Rækkefølge:
//   1. Stopregler (fredning, beskyttelseslinjer)
//   2. Beregningsregler (bebyggelsespct, højde, etager, skelafstand)
//   3. Energiregler (proportionalitet BR18 §13)
//   4. Sammensæt dispensationList + sæt overordnet status

import type {
  RuleEngineInput,
  RuleEngineResult,
  RuleViolation,
  DispensationItem,
} from "@/lib/rule-engine/types";
import { checkStopRules } from "@/lib/rule-engine/rules/stop-rules";
import { runCalculations } from "@/lib/rule-engine/rules/calculations";
import { checkEnergyProportionality } from "@/lib/rule-engine/rules/energy-rules";

// ---------------------------------------------------------------------------
// Kritiske felter — hvis manglende → status INCOMPLETE
// ---------------------------------------------------------------------------

const CRITICAL_FIELDS = new Set([
  "plot.areaM2",
  "existingBuilding",
  "newBuilding.floorAreaM2",
  "newBuilding.storeys",
]);

// ---------------------------------------------------------------------------
// Status-aggregering
// ---------------------------------------------------------------------------

function aggregateStatus(
  violations: RuleViolation[],
  missingFields: string[],
): RuleEngineResult["status"] {
  const hasCriticalMissing = missingFields.some((f) => CRITICAL_FIELDS.has(f));
  if (hasCriticalMissing) return "INCOMPLETE";

  const hasIllegal = violations.some((v) => v.severity === "illegal");
  if (hasIllegal) return "ILLEGAL";

  const hasDispensation = violations.some((v) => v.severity === "dispensation_required");
  if (hasDispensation) return "REQUIRES_DISPENSATION";

  return "OK";
}

// ---------------------------------------------------------------------------
// Dispensationsliste
// ---------------------------------------------------------------------------

const DISPENSATION_LABELS: Record<string, string> = {
  listed_building_demolition: "Nedrivning af fredet bygning",
  listed_building_major_alteration: "Ombygning af fredet bygning",
  listed_building_extension: "Tilbygning til fredet bygning",
  save_1_3_demolition: "Nedrivning/ombygning af bevaringsværdig bygning",
  protection_line_coastal: "Byggeri inden for strandbeskyttelseslinje",
  protection_line_forest: "Byggeri inden for skovbyggelinje",
  protection_line_lakeRiver: "Byggeri inden for åbeskyttelseslinje",
  protection_line_lake: "Byggeri inden for søbeskyttelseslinje",
  protection_line_clitFredning: "Byggeri inden for klitfredning",
  protection_line_churchSurroundings: "Byggeri inden for kirkebyggelinje",
  bebyggelsesprocent: "Overskridelse af bebyggelsesprocent",
  bygningshøjde: "Overskridelse af max bygningshøjde",
  etager: "Overskridelse af max etager",
  skelafstand: "Underskridelse af skelafstand",
};

function buildDispensationList(violations: RuleViolation[]): DispensationItem[] {
  return violations
    .filter((v) => v.severity === "dispensation_required")
    .map((v) => ({
      rule: v.rule,
      label: DISPENSATION_LABELS[v.rule] ?? v.rule,
      authority: v.authority ?? "Kommunen",
      reason: v.reason,
    }));
}

// ---------------------------------------------------------------------------
// runRuleEngine
// ---------------------------------------------------------------------------

export function runRuleEngine(input: RuleEngineInput, missingFields: string[]): RuleEngineResult {
  const checkedRules: string[] = [];

  // ── 1. Stopregler ──────────────────────────────────────────────────────────
  const stopViolations = checkStopRules(input);
  checkedRules.push(
    "listed_building_demolition",
    "listed_building_major_alteration",
    "listed_building_extension",
    "save_1_3_demolition",
    "protection_line_coastal",
    "protection_line_forest",
    "protection_line_lakeRiver",
    "protection_line_lake",
    "protection_line_clitFredning",
    "protection_line_churchSurroundings",
  );

  // Tidlig retur ved ILLEGAL (nedrivning af fredet bygning)
  const hasIllegal = stopViolations.some((v) => v.severity === "illegal");
  if (hasIllegal) {
    const calculations = runCalculations(input);
    return {
      status: "ILLEGAL",
      checkedRules,
      missingInputs: missingFields,
      violations: stopViolations,
      dispensationList: buildDispensationList(stopViolations),
      calculations,
    };
  }

  // ── 2. Beregningsregler ────────────────────────────────────────────────────
  const calculations = runCalculations(input);
  checkedRules.push("bebyggelsesprocent", "bygningshøjde", "etager", "skelafstand");

  const calcViolations: RuleViolation[] = [
    calculations.buildingPercent.violation,
    calculations.height.violation,
    calculations.storeys.violation,
    calculations.setback.violation,
  ].filter((v): v is RuleViolation => v !== null);

  // ── 3. Energiregler ────────────────────────────────────────────────────────
  const energyViolations = checkEnergyProportionality(input);
  checkedRules.push("energy_upgrade_likely_required", "heat_pump_installation_requirement");

  // ── 4. Sammensæt ──────────────────────────────────────────────────────────
  const allViolations = [...stopViolations, ...calcViolations, ...energyViolations];
  const status = aggregateStatus(allViolations, missingFields);
  const dispensationList = buildDispensationList(allViolations);

  return {
    status,
    checkedRules,
    missingInputs: missingFields,
    violations: allViolations,
    dispensationList,
    calculations,
  };
}
