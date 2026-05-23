import type { ComplianceFlag, Byggeoenske } from "@/types/project-state";

export function findFlagForStep(
  flags: ComplianceFlag[],
  stepKey: keyof Byggeoenske,
): ComplianceFlag | undefined {
  return flags.find((f) => f.appliesTo?.includes(stepKey));
}
