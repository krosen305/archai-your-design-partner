import { describe, expect, it } from "bun:test";
import { buildAuthorityPackageManifest } from "./manifest";
import type { Br18ApplicabilityResult, EvidenceItem } from "../types";

describe("buildAuthorityPackageManifest", () => {
  it("missing_critical_documentation med manglende evidens", () => {
    const applicability: Br18ApplicabilityResult[] = [
      {
        requirementId: "req-1",
        status: "relevant",
        reasons: [],
        missingInputs: [],
        sourceFacts: [],
      },
    ];
    const manifest = buildAuthorityPackageManifest("proj-1", "2024", applicability, []);
    expect(manifest.readinessStatus).toBe("missing_critical_documentation");
    expect(manifest.missingItems).toContain("req-1");
    expect(manifest.projectId).toBe("proj-1");
    expect(manifest.br18Version).toBe("2024");
  });

  it("ready_for_advisor_review ved validated evidens", () => {
    const applicability: Br18ApplicabilityResult[] = [
      {
        requirementId: "req-1",
        status: "relevant",
        reasons: [],
        missingInputs: [],
        sourceFacts: [],
      },
    ];
    const evidence: EvidenceItem[] = [
      {
        id: "ev-1",
        projectId: "proj-1",
        requirementId: "req-1",
        evidenceType: "drawing",
        status: "validated",
        source: "user_upload",
        fileId: null,
        structuredPayload: null,
        validationNotes: [],
        reviewedByRole: null,
        reviewedAt: null,
      },
    ];
    const manifest = buildAuthorityPackageManifest("proj-1", "2024", applicability, evidence);
    expect(manifest.readinessStatus).toBe("ready_for_advisor_review");
    expect(manifest.missingItems).toHaveLength(0);
  });

  it("unknownItems indeholder unknown_missing_data krav", () => {
    const applicability: Br18ApplicabilityResult[] = [
      {
        requirementId: "req-unknown",
        status: "unknown_missing_data",
        reasons: [],
        missingInputs: ["grundarealM2"],
        sourceFacts: [],
      },
    ];
    const manifest = buildAuthorityPackageManifest("proj-1", "2024", applicability, []);
    expect(manifest.unknownItems).toContain("req-unknown");
  });

  it("generatedAt er en ISO-dato string", () => {
    const manifest = buildAuthorityPackageManifest("proj-1", "2024", [], []);
    expect(new Date(manifest.generatedAt).toString()).not.toBe("Invalid Date");
  });
});
