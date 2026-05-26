import type { RuleEngineInput, RuleViolation } from "@/lib/rule-engine/types";

export function checkSurroundingsRules(input: RuleEngineInput): RuleViolation[] {
  const violations: RuleViolation[] = [];

  const s = input.surroundings;
  if (s) {
    if (s.noiseDesignatedArea === true) {
      violations.push({
        rule: "planning_noise_area",
        severity: "warning",
        reason:
          "Grunden overlapper et planlagt støjbelastet areal (kommuneplanretningslinje). Kontrollér lokalplan og afklar støjkrav med kommunen.",
        authority: "Kommunen",
      });
    }

    if (s.productionNoiseConsequenceArea === true) {
      violations.push({
        rule: "planning_production_noise_consequence",
        severity: "warning",
        reason:
          "Grunden ligger i et konsekvensområde for støj fra produktionsvirksomhed. Støjforhold bør afklares med kommunen og en akustiker inden køb eller design.",
        authority: "Kommunen/Akustiker",
      });
    }

    if (s.odorConsequenceArea === true || s.odorDesignatedArea === true) {
      violations.push({
        rule: "planning_odor_consequence",
        severity: "warning",
        reason:
          "Grunden overlapper et lugtbelastet areal eller konsekvensområde. Lugtforhold skal afklares med kommunen — kan påvirke anvendelse og boligkvalitet.",
        authority: "Kommunen",
      });
    }

    if (s.technicalFacilityConsequenceArea === true) {
      violations.push({
        rule: "planning_technical_facility_consequence",
        severity: "warning",
        reason:
          "Grunden ligger i et konsekvensområde for et teknisk anlæg (fx højspændingsanlæg, transmissionsledning eller vindmølle). Afklar bindinger med kommunen.",
        authority: "Kommunen",
      });
    }

    if (s.largeLivestockFarmArea === true) {
      violations.push({
        rule: "planning_large_livestock_area",
        severity: "warning",
        reason:
          "Grunden er i nærheden af et areal med store husdyrbrug. Lugt og støj fra husdyrproduktion kan påvirke boligkvalitet og mulighed for ny boliganvendelse.",
        authority: "Kommunen",
      });
    }

    if (s.proposedPlanConflict === true) {
      violations.push({
        rule: "planning_proposed_conflict",
        severity: "warning",
        reason:
          "Et planforslag (ikke vedtaget) kan konflikte med grunden. Kontrollér om forslaget vedtages — fremtidig planrisiko, ikke gældende krav endnu.",
        authority: "Kommunen",
      });
    }
  }

  const n = input.neighborContext;
  if (n) {
    if (n.coverage === "source_unavailable" || n.coverage === "unknown") {
      violations.push({
        rule: "neighbor_coverage_unavailable",
        severity: "warning",
        reason:
          "Nabogeometridata er ikke tilgængeligt. Skelafstande og naboforhold kan ikke screenes automatisk — afklar manuelt.",
        authority: "Rådgiver/Landinspektør",
      });
    }
  }

  return violations;
}
