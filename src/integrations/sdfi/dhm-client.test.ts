import { describe, expect, it, mock } from "bun:test";

mock.module("@/lib/feature-flags", () => ({
  FEATURE_FLAGS: {
    tinglysningMock: true,
    pdfExtractorMock: false,
    husDnaMock: false,
    byggeanalyseMock: false,
    fjernvarmeMock: false,
    billedanalyseMock: false,
    geodanmarkMock: false,
    plandataSurroundingsMock: false,
    matNeighborParcelsMock: false,
    geusMock: false,
    dhmMock: true,
  },
}));

const { DhmService, bboxFromPoint } = await import("./dhm-client");

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
