import { describe, it, expect } from "bun:test";
import { validateJordvarmePermit } from "./utility-rules";

describe("validateJordvarmePermit", () => {
  it("no jordvarme → empty", () => {
    expect(validateJordvarmePermit({ hasJordvarme: false })).toHaveLength(0);
  });

  it("jordvarme → two info reasons", () => {
    const result = validateJordvarmePermit({ hasJordvarme: true });
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.severity === "info")).toBe(true);
    expect(result.some((r) => r.code === "JORDVARME_PARAGRAPH19_PERMIT")).toBe(true);
    expect(result.some((r) => r.code === "JORDVARME_JUPITER_REGISTRATION")).toBe(true);
  });
});
