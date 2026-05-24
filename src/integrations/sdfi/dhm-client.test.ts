import { describe, expect, it } from "bun:test";
import { DhmService, bboxFromPoint } from "./dhm-client";

describe("DhmService.getTerrainData", () => {
  it("returns SourceResult mock payload with ARCH-243 fields", async () => {
    const bbox = bboxFromPoint(55.794, 12.492, 800);
    const result = await DhmService.getTerrainData(bbox, 55.794, 12.492);
    expect(result.status).toBe("mock");
    expect(result.isMock).toBe(true);
    expect(result.data?.lowPointM).toBe(18.4);
    expect(result.data?.bluespotRisk).toBe(false);
    expect(result.data?.kilde).toBe("mock");
  });
});
