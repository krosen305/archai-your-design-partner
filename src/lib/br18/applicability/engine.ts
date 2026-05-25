import type {
  Br18Requirement,
  Br18ApplicabilityResult,
  Br18ProjectFacts,
  ApplicabilityCondition,
} from "../types";

function checkCondition(
  condition: ApplicabilityCondition,
  facts: Br18ProjectFacts,
): { passes: boolean; missingInput: string | null } {
  const value = facts[condition.field as keyof Br18ProjectFacts];

  if (condition.operator === "present") {
    return value == null
      ? { passes: false, missingInput: condition.field }
      : { passes: true, missingInput: null };
  }

  if (value == null) {
    return { passes: false, missingInput: condition.field };
  }

  switch (condition.operator) {
    case "eq":
      return { passes: value === condition.value, missingInput: null };
    case "gt":
      return {
        passes: (value as number) > (condition.value as number),
        missingInput: null,
      };
    case "lt":
      return {
        passes: (value as number) < (condition.value as number),
        missingInput: null,
      };
    case "gte":
      return {
        passes: (value as number) >= (condition.value as number),
        missingInput: null,
      };
    case "lte":
      return {
        passes: (value as number) <= (condition.value as number),
        missingInput: null,
      };
    case "in":
      return {
        passes: (condition.value as unknown[]).includes(value),
        missingInput: null,
      };
    default:
      return { passes: false, missingInput: null };
  }
}

export function evaluateApplicability(
  requirement: Br18Requirement,
  facts: Br18ProjectFacts,
): Br18ApplicabilityResult {
  if (!requirement.projectScopes.includes(facts.projectScope)) {
    return {
      requirementId: requirement.id,
      status: "not_relevant",
      reasons: [`Gælder ikke for ${facts.projectScope}`],
      missingInputs: [],
      sourceFacts: [],
    };
  }

  if (requirement.requirementKind === "specialist_review") {
    return {
      requirementId: requirement.id,
      status: "requires_specialist_review",
      reasons: ["Kræver faglig review"],
      missingInputs: [],
      sourceFacts: [],
    };
  }

  if (requirement.requirementKind === "authority_discretion") {
    return {
      requirementId: requirement.id,
      status: "requires_authority_decision",
      reasons: ["Afgøres af myndighed"],
      missingInputs: [],
      sourceFacts: [],
    };
  }

  const missingInputs: string[] = [];
  const failedConditions: string[] = [];

  for (const condition of requirement.applicability) {
    const { passes, missingInput } = checkCondition(condition, facts);
    if (missingInput) {
      missingInputs.push(missingInput);
    } else if (!passes) {
      failedConditions.push(`${condition.field} ${condition.operator} ikke opfyldt`);
    }
  }

  if (missingInputs.length > 0) {
    return {
      requirementId: requirement.id,
      status: "unknown_missing_data",
      reasons: ["Manglende data"],
      missingInputs,
      sourceFacts: [],
    };
  }

  if (failedConditions.length > 0) {
    return {
      requirementId: requirement.id,
      status: "not_relevant",
      reasons: failedConditions,
      missingInputs: [],
      sourceFacts: [],
    };
  }

  return {
    requirementId: requirement.id,
    status: "relevant",
    reasons: ["Krav er relevant"],
    missingInputs: [],
    sourceFacts: [],
  };
}

export function evaluateAllRequirements(
  requirements: Br18Requirement[],
  facts: Br18ProjectFacts,
): Br18ApplicabilityResult[] {
  return requirements.map((req) => evaluateApplicability(req, facts));
}
