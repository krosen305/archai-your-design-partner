import { describe, it, expect } from "bun:test";
import { validateNaturbeskyttelse } from "./nature-protection-rules";
import type { NaturbeskyttelseLayer } from "@/domain/drawing/beliggenhedsplan.types";

const mockLayer = (
  type: NaturbeskyttelseLayer["type"],
  intersects: boolean,
): NaturbeskyttelseLayer => ({
  type,
  geometry25832: {
    type: "LineString",
    crs: "EPSG:25832",
    coordinates: [
      [0, 0],
      [100, 0],
    ],
  },
  bufferDistanceM: 300,
  intersectsProposedBuilding: intersects,
  source: { source: "registry", confidence: "medium", fetchedAt: null, requiresReview: false },
});

describe("validateNaturbeskyttelse", () => {
  it("empty list → no reasons", () => {
    expect(validateNaturbeskyttelse([])).toHaveLength(0);
  });

  it("non-intersecting layer → no reasons", () => {
    expect(validateNaturbeskyttelse([mockLayer("strandbeskyttelse", false)])).toHaveLength(0);
  });

  it("strandbeskyttelse intersection → blocking reason with §15", () => {
    const reasons = validateNaturbeskyttelse([mockLayer("strandbeskyttelse", true)]);
    expect(reasons).toHaveLength(1);
    expect(reasons[0]!.severity).toBe("blocking");
    expect(reasons[0]!.message).toContain("NBL §15");
  });

  it("two intersecting layers → two reasons", () => {
    const reasons = validateNaturbeskyttelse([
      mockLayer("strandbeskyttelse", true),
      mockLayer("skovbyggelinje", true),
    ]);
    expect(reasons).toHaveLength(2);
  });
});
