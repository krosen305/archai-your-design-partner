import { describe, expect, it } from "bun:test";
import { canAccessDebugAnalysis } from "./debug-analysis";

describe("canAccessDebugAnalysis", () => {
  it("afviser altid production", () => {
    expect(canAccessDebugAnalysis("production", "admin")).toBe(false);
    expect(canAccessDebugAnalysis("production", "service_role")).toBe(false);
  });

  it("tillader admin uden for production", () => {
    expect(canAccessDebugAnalysis("development", "admin")).toBe(true);
    expect(canAccessDebugAnalysis("preview", "admin")).toBe(true);
  });

  it("tillader service_role uden for production", () => {
    expect(canAccessDebugAnalysis("development", "service_role")).toBe(true);
  });

  it("afviser almindelige brugere", () => {
    expect(canAccessDebugAnalysis("development", "user")).toBe(false);
    expect(canAccessDebugAnalysis("development", null)).toBe(false);
  });
});
