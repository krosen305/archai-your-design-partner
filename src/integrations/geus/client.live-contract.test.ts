import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

mock.module("@/lib/feature-flags", () => ({
  FEATURE_FLAGS: {
    tinglysningMock: true,
    pdfExtractorMock: false,
    husDnaMock: false,
    byggeanalyseMock: false,
    fjernvarmeMock: false,
    billedanalyseMock: false,
    geusMock: false,
    dhmMock: true,
  },
}));

describe("GeusService live contract", () => {
  afterEach(() => {
    mock.restore();
  });

  it("returns status=error when both upstream GEUS calls fail", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    const { GeusService } = await import("./client");

    const result = await GeusService.getRiskData(55.794, 12.492);

    expect(result.status).toBe("error");
    expect(result.data).toBeNull();
    fetchSpy.mockRestore();
  });
});
