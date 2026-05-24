import { describe, expect, it } from "bun:test";
import { canAccessDebugAnalysis } from "./debug-analysis";

describe("canAccessDebugAnalysis", () => {
  it("afviser altid production uanset rolle", () => {
    expect(canAccessDebugAnalysis("production")).toBe(false);
    expect(canAccessDebugAnalysis("production", "admin")).toBe(false);
    expect(canAccessDebugAnalysis("production", "service_role")).toBe(false);
  });

  it("tillader enhver autentificeret bruger uden for production", () => {
    expect(canAccessDebugAnalysis("development")).toBe(true);
    expect(canAccessDebugAnalysis("preview")).toBe(true);
    expect(canAccessDebugAnalysis(undefined)).toBe(true);
  });
});
