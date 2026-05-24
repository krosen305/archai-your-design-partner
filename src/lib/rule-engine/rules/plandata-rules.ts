import type { RuleEngineInput, RuleViolation } from "@/lib/rule-engine/types";

export function checkPlandataRules(input: RuleEngineInput): RuleViolation[] {
  const planning = input.planning;
  if (!planning) return [];

  const violations: RuleViolation[] = [];

  if (planning.withinBuildingField === false && planning.buildingFieldDefined === true) {
    violations.push({
      rule: "lokalplan_building_field",
      severity: "dispensation_required",
      reason:
        "Parcelens planmæssige kontekst ligger uden for registreret byggefelt i lokalplanen. Byggeri kræver planfaglig afklaring eller dispensation.",
      authority: "Kommunen",
    });
  }

  if (planning.landzonePermitRequired === true) {
    violations.push({
      rule: "landzone_permit_required",
      severity: "warning",
      reason:
        "Ejendommen ligger i landzone. Nybyggeri eller væsentlige ændringer kræver som udgangspunkt landzonetilladelse fra kommunen.",
      authority: "Kommunen",
    });
  }

  if (planning.wastewaterPlanStatus !== null || planning.sewerAreaType !== null) {
    violations.push({
      rule: "wastewater_plan_clarification",
      severity: "warning",
      reason:
        "Spildevands- eller kloakforhold skal afklares tidligt, før teknik, nedsivning og budget kan låses.",
      authority: "Kommune/Forsyning",
    });
  }

  return violations;
}
