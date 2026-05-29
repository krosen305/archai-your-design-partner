import { describe, it, expect, mock } from "bun:test";
import type { NeighborContext } from "@/domain/contracts/surroundings.types";
import type { SourceResult } from "@/lib/source-result";

mock.module("@/lib/feature-flags", () => ({
  FEATURE_FLAGS: {
    tinglysningMock: true,
    pdfExtractorMock: false,
    husDnaMock: false,
    byggeanalyseMock: false,
    fjernvarmeMock: false,
    billedanalyseMock: false,
    geodanmarkMock: true,
    plandataSurroundingsMock: false,
    matNeighborParcelsMock: false,
    geusMock: false,
    dhmMock: false,
  },
}));

describe("GeoDanmarkNeighborService (mock)", () => {
  it("returnerer SourceResult<NeighborContext> med mock data", async () => {
    const { GeoDanmarkNeighborService } = await import("./neighbor-geometry");
    const result: SourceResult<NeighborContext> =
      await GeoDanmarkNeighborService.getNeighborContext(
        null,
        [720000, 6175000, 720200, 6175200],
        null,
      );
    expect(result.status).toBe("mock");
    expect(result.isMock).toBe(true);
    expect(result.data).not.toBeNull();
    expect(result.data!.coverage).toBe("unknown");
    expect(result.data!.buildings).toBeArray();
  });

  it("coverage er aldrig null", async () => {
    const { GeoDanmarkNeighborService } = await import("./neighbor-geometry");
    const result = await GeoDanmarkNeighborService.getNeighborContext(null, [0, 0, 100, 100], null);
    expect(result.data!.coverage).toBeDefined();
  });
});
