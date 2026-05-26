// Bridge der mapper eksisterende RuleViolation[] fra regelmotor til Br18ApplicabilityResult[].
//
// De faktiske rule-nøgler fra calculations.ts bruger danske navne:
//   "bebyggelsesprocent" → BR18 §177 (8.3.1)
//   "bygningshøjde"      → BR18 §179 (8.4.1)
//   "etager"             → BR18 §179 (8.4.2)
//   "skelafstand"        → BR18 §181 (8.4.3)
//
// Violations fra stop-rules, plandata-rules, arealdata-rules og energy-rules
// er ikke direkte BR18-paragraf-krav og mappes ikke her.

import type { RuleViolation } from "@/lib/rule-engine/types";
import type { Br18ApplicabilityResult } from "../types";

// Mapning fra regelmotor rule-id → BR18-krav-id.
// Kun beregningsreglerne fra calculations.ts har direkte BR18-paragraf-mappings.
const RULE_TO_BR18_ID: Record<string, string> = {
  bebyggelsesprocent: "BR18-8.3.1-bebyggelsesprocent",
  bygningshøjde: "BR18-8.4.1-bygningshoejde",
  etager: "BR18-8.4.2-etager",
  skelafstand: "BR18-8.4.3-skelafstand",
};

export function mapRuleEngineViolationsToBr18(
  violations: RuleViolation[],
): Br18ApplicabilityResult[] {
  const results: Br18ApplicabilityResult[] = [];

  for (const violation of violations) {
    const requirementId = RULE_TO_BR18_ID[violation.rule];
    if (!requirementId) continue;

    results.push({
      requirementId,
      status: "relevant",
      reasons: [violation.reason],
      missingInputs: [],
      sourceFacts: [],
    });
  }

  return results;
}
