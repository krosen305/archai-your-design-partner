import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const featureFlags = {
  tinglysningMock: true,
  pdfExtractorMock: false,
  husDnaMock: false,
  byggeanalyseMock: false,
  fjernvarmeMock: false,
  billedanalyseMock: false,
  geodanmarkMock: false,
  plandataSurroundingsMock: true,
  matNeighborParcelsMock: false,
  geusMock: false,
  dhmMock: false,
};

mock.module("@/lib/feature-flags", () => ({
  FEATURE_FLAGS: featureFlags,
}));

const originalFetch = globalThis.fetch;

beforeEach(() => {
  featureFlags.plandataSurroundingsMock = true;
  globalThis.fetch = originalFetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("PlandataSurroundingsService", () => {
  it("returnerer SourceResult med mock data", async () => {
    const { PlandataSurroundingsService } = await import("./surroundings");
    const result = await PlandataSurroundingsService.getSurroundings([
      720000, 6175000, 720500, 6175500,
    ]);
    expect(result.status).toBe("mock");
    expect(result.isMock).toBe(true);
    expect(result.data).not.toBeNull();
    expect(result.data!.hits).toBeArray();
  });

  it("alle boolean felter er null i mock", async () => {
    const { PlandataSurroundingsService } = await import("./surroundings");
    const result = await PlandataSurroundingsService.getSurroundings([0, 0, 500, 500]);
    const d = result.data!;
    expect(d.noiseDesignatedArea).toBeNull();
    expect(d.productionNoiseConsequenceArea).toBeNull();
    expect(d.odorConsequenceArea).toBeNull();
    expect(d.odorDesignatedArea).toBeNull();
    expect(d.technicalFacilityConsequenceArea).toBeNull();
    expect(d.largeLivestockFarmArea).toBeNull();
    expect(d.proposedPlanConflict).toBeNull();
  });

  it("mapper verificerede live layers til surroundings-kontekst", async () => {
    featureFlags.plandataSurroundingsMock = false;

    const makeEmptyResponse = () =>
      new Response(JSON.stringify({ features: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    globalThis.fetch = mock(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

      if (url.includes("theme_pdk_stoejbelastetareal_vedtaget")) {
        return new Response(
          JSON.stringify({
            features: [
              {
                id: "noise-1",
                properties: {
                  temakode: 1109,
                  komplan_id: 123,
                  plangrund: "Kommuneplan 2025",
                  komnavn: "Lyngby-Taarbæk",
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      if (url.includes("theme_pdk_konsekvensomraade_forslag")) {
        return new Response(
          JSON.stringify({
            features: [
              {
                id: "consequence-1",
                properties: {
                  temakode: 1150,
                  komplan_id: 456,
                  plangrund: "Forslag 2026",
                  komnavn: "Lyngby-Taarbæk",
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      return makeEmptyResponse();
    }) as typeof fetch;

    const { PlandataSurroundingsService } = await import("./surroundings");
    const result = await PlandataSurroundingsService.getSurroundings([
      720000, 6175000, 720500, 6175500,
    ]);
    const d = result.data!;

    expect(result.status).toBe("ok");
    expect(d.noiseDesignatedArea).toBe(true);
    expect(d.productionNoiseConsequenceArea).toBe(true);
    expect(d.technicalFacilityConsequenceArea).toBe(false);
    expect(d.largeLivestockFarmArea).toBe(false);
    expect(d.odorConsequenceArea).toBeNull();
    expect(d.odorDesignatedArea).toBeNull();
    expect(d.proposedPlanConflict).toBe(true);
    expect(d.hits).toHaveLength(2);
    expect(d.hits[0]?.themeCode).toBe("1109");
  });
});
