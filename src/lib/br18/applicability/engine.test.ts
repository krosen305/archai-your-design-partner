import { describe, expect, it } from "bun:test";
import { evaluateApplicability } from "./engine";
import type { Br18Requirement, Br18ProjectFacts } from "../types";

const baseReq: Br18Requirement = {
  id: "test-req",
  br18Version: "2024",
  chapter: "8",
  paragraph: "8.3.1",
  title: "Test",
  description: "Test",
  sourceUrl: "https://www.bygningsreglementet.dk/",
  validFrom: "2018-01-01",
  validTo: null,
  projectScopes: ["enfamiliehus"],
  requirementKind: "machine_checkable",
  severity: "hard_stop",
  applicability: [{ field: "projectScope", operator: "in", value: ["enfamiliehus"] }],
  requiredEvidence: [],
  responsibleRole: "architect",
};

const baseFacts: Br18ProjectFacts = {
  projectScope: "enfamiliehus",
  bebyggetArealM2: 60,
  grundarealM2: 300,
  antalEtager: 1,
  bygningshojdeM: 5.0,
  skelafstandM: 3.5,
  anvendelseskategori: null,
  br18Version: "2024",
  municipality: "0101",
};

describe("evaluateApplicability", () => {
  it("relevant når conditions matcher", () => {
    expect(evaluateApplicability(baseReq, baseFacts).status).toBe("relevant");
  });

  it("not_relevant når projectScope ikke matcher", () => {
    const req = { ...baseReq, projectScopes: ["tilbygning"] as const };
    expect(evaluateApplicability(req as Br18Requirement, baseFacts).status).toBe("not_relevant");
  });

  it("unknown_missing_data når required field er null", () => {
    const req: Br18Requirement = {
      ...baseReq,
      applicability: [{ field: "grundarealM2", operator: "present" }],
    };
    const facts: Br18ProjectFacts = { ...baseFacts, grundarealM2: null };
    const result = evaluateApplicability(req, facts);
    expect(result.status).toBe("unknown_missing_data");
    expect(result.missingInputs).toContain("grundarealM2");
  });

  it("requires_specialist_review for specialist_review krav", () => {
    const req: Br18Requirement = {
      ...baseReq,
      requirementKind: "specialist_review",
      applicability: [],
    };
    expect(evaluateApplicability(req, baseFacts).status).toBe("requires_specialist_review");
  });

  it("requires_authority_decision for authority_discretion krav", () => {
    const req: Br18Requirement = {
      ...baseReq,
      requirementKind: "authority_discretion",
      applicability: [],
    };
    expect(evaluateApplicability(req, baseFacts).status).toBe("requires_authority_decision");
  });
});
