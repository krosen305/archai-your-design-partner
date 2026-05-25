import { describe, expect, it } from "bun:test";
import { deriveRequirementReadiness, getMissingEvidence, derivePackageReadiness } from "./ledger";
import type { EvidenceItem, Br18ApplicabilityResult } from "../types";

const makeEvidence = (reqId: string, status: EvidenceItem["status"]): EvidenceItem => ({
  id: `ev-${reqId}`,
  projectId: "p1",
  requirementId: reqId,
  evidenceType: "drawing",
  status,
  source: "user_upload",
  fileId: null,
  structuredPayload: null,
  validationNotes: [],
  reviewedByRole: null,
  reviewedAt: null,
});

const makeResult = (
  reqId: string,
  status: Br18ApplicabilityResult["status"],
): Br18ApplicabilityResult => ({
  requirementId: reqId,
  status,
  reasons: [],
  missingInputs: [],
  sourceFacts: [],
});

describe("deriveRequirementReadiness", () => {
  it("missing når ingen evidens", () => {
    expect(deriveRequirementReadiness([], "req-1")).toBe("missing");
  });
  it("validated ved validated evidens", () => {
    expect(deriveRequirementReadiness([makeEvidence("req-1", "validated")], "req-1")).toBe(
      "validated",
    );
  });
  it("rejected ved rejected evidens", () => {
    expect(deriveRequirementReadiness([makeEvidence("req-1", "rejected")], "req-1")).toBe(
      "rejected",
    );
  });
  it("uploaded ved uploaded evidens", () => {
    expect(deriveRequirementReadiness([makeEvidence("req-1", "uploaded")], "req-1")).toBe(
      "uploaded",
    );
  });
});

describe("getMissingEvidence", () => {
  it("returnerer krav-ids med manglende evidens", () => {
    const applicability = [makeResult("req-1", "relevant"), makeResult("req-2", "relevant")];
    const evidence = [makeEvidence("req-1", "validated")];
    const missing = getMissingEvidence(applicability, evidence);
    expect(missing).toContain("req-2");
    expect(missing).not.toContain("req-1");
  });
  it("ignorerer not_relevant krav", () => {
    const applicability = [makeResult("req-1", "not_relevant")];
    expect(getMissingEvidence(applicability, [])).toHaveLength(0);
  });
});

describe("derivePackageReadiness", () => {
  it("preliminary ved ingen relevante krav", () => {
    expect(derivePackageReadiness([], [])).toBe("preliminary");
  });
  it("missing_critical_documentation ved manglende evidens", () => {
    const applicability = [makeResult("req-1", "relevant")];
    expect(derivePackageReadiness(applicability, [])).toBe("missing_critical_documentation");
  });
  it("ready_for_advisor_review når alt er validated", () => {
    const applicability = [makeResult("req-1", "relevant")];
    const evidence = [makeEvidence("req-1", "validated")];
    expect(derivePackageReadiness(applicability, evidence)).toBe("ready_for_advisor_review");
  });
  it("missing_critical_documentation ved rejected evidens", () => {
    const applicability = [makeResult("req-1", "relevant")];
    const evidence = [makeEvidence("req-1", "rejected")];
    expect(derivePackageReadiness(applicability, evidence)).toBe("missing_critical_documentation");
  });
});
