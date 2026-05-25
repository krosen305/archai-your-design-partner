import type {
  EvidenceItem,
  EvidenceStatus,
  Br18ApplicabilityResult,
  AuthorityReadinessStatus,
} from "../types";

export function deriveRequirementReadiness(
  items: EvidenceItem[],
  requirementId: string,
): EvidenceStatus {
  const relevant = items.filter((e) => e.requirementId === requirementId);
  if (relevant.length === 0) return "missing";
  if (relevant.some((e) => e.status === "rejected")) return "rejected";
  if (relevant.some((e) => e.status === "validated")) return "validated";
  if (relevant.some((e) => e.status === "uploaded")) return "uploaded";
  if (relevant.some((e) => e.status === "draft")) return "draft";
  return "missing";
}

export function getMissingEvidence(
  applicabilityResults: Br18ApplicabilityResult[],
  evidenceItems: EvidenceItem[],
): string[] {
  return applicabilityResults
    .filter((r) => r.status === "relevant")
    .filter((r) => deriveRequirementReadiness(evidenceItems, r.requirementId) === "missing")
    .map((r) => r.requirementId);
}

export function derivePackageReadiness(
  applicabilityResults: Br18ApplicabilityResult[],
  evidenceItems: EvidenceItem[],
): AuthorityReadinessStatus {
  const relevant = applicabilityResults.filter((r) => r.status === "relevant");
  if (relevant.length === 0) return "preliminary";

  if (getMissingEvidence(applicabilityResults, evidenceItems).length > 0) {
    return "missing_critical_documentation";
  }
  if (evidenceItems.some((e) => e.status === "rejected")) {
    return "missing_critical_documentation";
  }

  const allValidated = relevant.every(
    (r) => deriveRequirementReadiness(evidenceItems, r.requirementId) === "validated",
  );
  return allValidated ? "ready_for_advisor_review" : "preliminary";
}
