// Jordforureningsregler — V1/V2 kortlægning og områdeklassificering (ARCH-241).
// Pure functions uden sideeffekter. Severity "warning" fordi V1/V2 er risikofaktorer,
// ikke juridiske blokader — dispensation er ikke løsningen, undersøgelse er.

import type { RuleEngineInput, RuleViolation } from "@/lib/rule-engine/types";

export function checkJordforureningRules(input: RuleEngineInput): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const { jordforureningV2, jordforureningV1, omraadeklassificering } = input.geotechnical;

  if (jordforureningV2 === true) {
    violations.push({
      rule: "jordforurening_v2",
      severity: "warning",
      reason:
        "Grunden er V2-kortlagt (dokumenteret forurening). Oprensning kan koste 500.000 kr+. " +
        "Kræver miljøteknisk undersøgelse inden byggestart (Jordforureningslovens §72).",
      authority: "Miljøstyrelsen",
    });
  }

  if (jordforureningV1 === true) {
    violations.push({
      rule: "jordforurening_v1",
      severity: "warning",
      reason:
        "Grunden er V1-kortlagt (mulig forurening). Miljøundersøgelse anbefales inden køb og inden nedrivning.",
      authority: "Miljøstyrelsen",
    });
  }

  if (omraadeklassificering !== null) {
    violations.push({
      rule: "jordforurening_omraadeklassificering",
      severity: "warning",
      reason: `Grunden er i et områdeklassificeret område (${omraadeklassificering}). Jordflytning kræver jordsundhedsattest.`,
      authority: "Kommunen",
    });
  }

  return violations;
}
