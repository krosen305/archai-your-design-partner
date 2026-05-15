import { describe, expect, it } from "bun:test";
import { DhmService, bboxFromPoint, getNorthOrientation } from "./dhm-client";

describe("DHM client", () => {
  it("returns south orientation default", () => {
    expect(getNorthOrientation(55.7, 12.5)).toBe("S");
  });

  it("builds bbox and returns mock terrain", async () => {
    const bbox = bboxFromPoint(55.7, 12.5, 900);
    expect(bbox.maxX).toBeGreaterThan(bbox.minX);
    const result = await DhmService.getTerrainData(bbox, 55.7, 12.5);
    expect(result.kilde).toBe("mock");
    expect(result.kotepunkter.length).toBeGreaterThan(0);
  });
});
