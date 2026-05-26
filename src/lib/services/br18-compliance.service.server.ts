import { loadBr18Catalog } from "@/lib/br18/requirements/catalog";
import { evaluateAllRequirements } from "@/lib/br18/applicability/engine";
import { derivePackageReadiness } from "@/lib/br18/evidence/ledger";
import type {
  Br18ProjectFacts,
  Br18ApplicabilityResult,
  EvidenceItem,
  AuthorityReadinessStatus,
} from "@/lib/br18/types";

export type Br18ComplianceDeps = {
  upsertApplicabilityResult: (
    projectId: string,
    result: Br18ApplicabilityResult,
    br18Version: string,
  ) => Promise<void>;
  updateProjectHardStop?: (
    projectId: string,
    hardStop: boolean,
    reason: string | null,
  ) => Promise<void>;
  updateAuthorityReadiness?: (
    projectId: string,
    status: AuthorityReadinessStatus,
  ) => Promise<void>;
};

export type Br18ComplianceResult = {
  applicabilityResults: Br18ApplicabilityResult[];
  hardStopTriggered: boolean;
  hardStopReason: string | null;
  authorityReadiness: AuthorityReadinessStatus;
};

export async function runBr18Compliance(
  projectId: string,
  facts: Br18ProjectFacts,
  deps: Br18ComplianceDeps,
  evidenceItems: EvidenceItem[] = [],
): Promise<Br18ComplianceResult> {
  const catalog = loadBr18Catalog(facts.br18Version);
  const applicabilityResults = evaluateAllRequirements(catalog, facts);

  await Promise.all(
    applicabilityResults.map((r) =>
      deps.upsertApplicabilityResult(projectId, r, facts.br18Version),
    ),
  );

  const hardStopTriggered = applicabilityResults.some(
    (r) => r.status === "unknown_missing_data" && r.missingInputs.length > 0,
  );
  const hardStopReason = hardStopTriggered
    ? "Manglende data til BR18-vurdering: " +
      applicabilityResults
        .filter((r) => r.status === "unknown_missing_data")
        .flatMap((r) => r.missingInputs)
        .join(", ")
    : null;

  const authorityReadiness = derivePackageReadiness(applicabilityResults, evidenceItems);

  if (deps.updateProjectHardStop) {
    await deps.updateProjectHardStop(projectId, hardStopTriggered, hardStopReason);
  }
  if (deps.updateAuthorityReadiness) {
    await deps.updateAuthorityReadiness(projectId, authorityReadiness);
  }

  return { applicabilityResults, hardStopTriggered, hardStopReason, authorityReadiness };
}
