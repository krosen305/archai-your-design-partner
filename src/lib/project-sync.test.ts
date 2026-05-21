import { describe, it, expect } from "bun:test";
import { saveProjectSchema, projectPatchSchema } from "@/lib/project-sync";

// ---------------------------------------------------------------------------
// projectPatchSchema
// ---------------------------------------------------------------------------

describe("projectPatchSchema", () => {
  it("rejects patch with unknown keys", () => {
    const r = projectPatchSchema.safeParse({ unknownKey: "bad" });
    expect(r.success).toBe(false);
  });

  it("accepts empty patch", () => {
    const r = projectPatchSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it("accepts patch with scalar fields", () => {
    const r = projectPatchSchema.safeParse({ complianceDone: true, currentStep: "analyse" });
    expect(r.success).toBe(true);
  });

  it("accepts patch with null nullable fields", () => {
    const r = projectPatchSchema.safeParse({ bbrData: null, husDna: null, budget_estimate: null });
    expect(r.success).toBe(true);
  });

  it("accepts patch with object fields", () => {
    const r = projectPatchSchema.safeParse({ address: { adresseid: "abc" } });
    expect(r.success).toBe(true);
  });

  it("accepts patch with array fields", () => {
    const r = projectPatchSchema.safeParse({
      complianceFlags: [{ kilde: "bbr", severity: "warning" }],
      lokalplaner: [{ id: "lp-1" }],
    });
    expect(r.success).toBe(true);
  });

  it("accepts patch with valid analysisRunId uuid", () => {
    const r = projectPatchSchema.safeParse({
      analysisRunId: "123e4567-e89b-12d3-a456-426614174000",
    });
    expect(r.success).toBe(true);
  });

  it("rejects patch with invalid analysisRunId (not a uuid)", () => {
    const r = projectPatchSchema.safeParse({ analysisRunId: "not-a-uuid" });
    expect(r.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// saveProjectSchema
// ---------------------------------------------------------------------------

describe("saveProjectSchema", () => {
  it("rejects missing accessToken", () => {
    const r = saveProjectSchema.safeParse({ patch: {} });
    expect(r.success).toBe(false);
  });

  it("rejects empty accessToken", () => {
    const r = saveProjectSchema.safeParse({ accessToken: "", patch: {} });
    expect(r.success).toBe(false);
  });

  it("accepts valid save input", () => {
    const r = saveProjectSchema.safeParse({
      accessToken: "valid-token",
      patch: { complianceDone: true },
      projectId: null,
    });
    expect(r.success).toBe(true);
  });

  it("accepts valid save input with no projectId", () => {
    const r = saveProjectSchema.safeParse({
      accessToken: "valid-token",
      patch: {},
    });
    expect(r.success).toBe(true);
  });

  it("rejects save input when patch has unknown keys", () => {
    const r = saveProjectSchema.safeParse({
      accessToken: "valid-token",
      patch: { unknownField: "should-fail" },
    });
    expect(r.success).toBe(false);
  });
});
