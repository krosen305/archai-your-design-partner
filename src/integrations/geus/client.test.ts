import { describe, expect, it, mock } from "bun:test";

mock.module("@/lib/feature-flags", () => ({
  FEATURE_FLAGS: {
    tinglysningMock: true,
    pdfExtractorMock: false,
    husDnaMock: false,
    byggeanalyseMock: false,
    fjernvarmeMock: false,
    billedanalyseMock: false,
    geusMock: true,
    dhmMock: true,
  },
}));

describe("GeusService.getRiskData", () => {
  it("returns SourceResult mock payload with ARCH-242 fields", async () => {
    const { GeusService } = await import("./client");
    const result = await GeusService.getRiskData(55.794, 12.492);

    expect(result.status).toBe("mock");
    expect(result.isMock).toBe(true);
    expect(result.data?.groundwaterDepthWinterM).toBeTypeOf("number");
    expect(result.data?.groundwaterDepthSummerM).toBeTypeOf("number");
    expect(result.data?.geoteknikJordart).toBe("Moræneler");
    expect(result.data?.kilde).toBe("mock");
  });
});
