import { describe, expect, it } from "bun:test";
import { isHusDna, parseComplianceData } from "./project-state";

describe("parseComplianceData", () => {
  it("returns null for non-objects", () => {
    expect(parseComplianceData(null)).toBeNull();
    expect(parseComplianceData("invalid")).toBeNull();
  });

  it("decodes an empty persisted payload with schema defaults", () => {
    expect(parseComplianceData({})).toEqual({
      bbr: null,
      flags: [],
      lokalplaner: [],
      kommuneplanramme: null,
      plandataContext: null,
      arealdataContext: null,
      byggeanalyseResultat: null,
      vurderingData: null,
    });
  });
});

describe("isHusDna", () => {
  it("returns true for a valid HusDna payload", () => {
    expect(
      isHusDna({
        stil: "nordisk",
        bruttoareal: "180",
        etager: "2",
        tagform: "saddeltag",
        energiklasse: "BR18",
        saerligeKrav: ["atelier"],
        confidence: 0.8,
        kilde: "mock",
      }),
    ).toBe(true);
  });

  it("returns false for an invalid HusDna payload", () => {
    expect(isHusDna({ stil: "nordisk" })).toBe(false);
  });
});
