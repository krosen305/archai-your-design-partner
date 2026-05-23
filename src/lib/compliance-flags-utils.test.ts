import { describe, it, expect } from "bun:test";
import { findFlagForStep } from "./compliance-flags-utils";
import type { ComplianceFlag } from "@/types/project-state";

const makeFlag = (overrides: Partial<ComplianceFlag> = {}): ComplianceFlag => ({
  id: "test-flag",
  label: "Test",
  status: "advarsel",
  detalje: null,
  aktuelVærdi: null,
  tilladt: null,
  kilde: "plandata",
  ...overrides,
});

describe("findFlagForStep", () => {
  it("returns undefined when no flags apply to the step", () => {
    const flags = [makeFlag({ appliesTo: ["facademateriale"] })];
    expect(findFlagForStep(flags, "tagform")).toBeUndefined();
  });

  it("returns the flag when appliesTo includes the step key", () => {
    const flag = makeFlag({ appliesTo: ["tagform"] });
    expect(findFlagForStep([flag], "tagform")).toBe(flag);
  });

  it("returns the flag when appliesTo includes one of multiple step keys", () => {
    const flag = makeFlag({ appliesTo: ["tagform", "facademateriale"] });
    expect(findFlagForStep([flag], "facademateriale")).toBe(flag);
  });

  it("returns undefined for flags without appliesTo", () => {
    const flags = [makeFlag({ appliesTo: undefined })];
    expect(findFlagForStep(flags, "tagform")).toBeUndefined();
  });

  it("returns first matching flag when multiple flags match", () => {
    const first = makeFlag({ id: "first", appliesTo: ["tagform"] });
    const second = makeFlag({ id: "second", appliesTo: ["tagform"] });
    expect(findFlagForStep([first, second], "tagform")).toBe(first);
  });
});
