import { derivePackageReadiness, getMissingEvidence } from "../evidence/ledger";
import type { AuthorityPackageManifest, Br18ApplicabilityResult, EvidenceItem } from "../types";

export function buildAuthorityPackageManifest(
  projectId: string,
  br18Version: string,
  applicabilityResults: Br18ApplicabilityResult[],
  evidenceItems: EvidenceItem[],
): AuthorityPackageManifest {
  return {
    projectId,
    br18Version,
    generatedAt: new Date().toISOString(),
    readinessStatus: derivePackageReadiness(applicabilityResults, evidenceItems),
    requirements: applicabilityResults,
    evidenceItems,
    missingItems: getMissingEvidence(applicabilityResults, evidenceItems),
    unknownItems: applicabilityResults
      .filter((r) => r.status === "unknown_missing_data")
      .map((r) => r.requirementId),
  };
}
