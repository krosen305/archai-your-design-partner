import { describe, it, expect } from "bun:test";
import { computeDrawingCompleteness } from "./completeness-engine";
import type { CompletenessInput } from "./completeness-engine";

const minimalBlocking: CompletenessInput = {
  hasParcelPolygon: true,
  proposedFootprintSource: null,
  sokkelKoteM: null,
  sokkelSource: null,
  tagform: null,
  taghaldningGrad: null,
  rygningsKoteM: null,
  vejLayer: null,
  terrainLayer: null,
  surveyTerrainPointCount: 0,
  kloakoplandType: null,
  siteUseLayers: [],
  naturbeskyttelseFetchedAt: null,
};

describe("computeDrawingCompleteness", () => {
  it("footprint null → overallStatus draft", () => {
    const result = computeDrawingCompleteness(minimalBlocking);
    expect(result.overallStatus).toBe("draft");
  });

  it("tinglysteServitutter is always placeholder in permanentWarnings", () => {
    const result = computeDrawingCompleteness(minimalBlocking);
    expect(result.permanentWarnings.length).toBeGreaterThan(0);
    expect(result.permanentWarnings[0]).toContain("tinglysning.dk");
  });

  it("kloakStikledning is always placeholder", () => {
    const result = computeDrawingCompleteness(minimalBlocking);
    expect(result.fields.kloakStikledning.status).toBe("placeholder");
  });

  it("regnvandsløsning placeholder when kloakopland null", () => {
    const result = computeDrawingCompleteness({ ...minimalBlocking, kloakoplandType: null });
    expect(result.fields.regnvandsløsning.status).toBe("placeholder");
  });

  it("regnvandsløsning placeholder when separat", () => {
    const result = computeDrawingCompleteness({ ...minimalBlocking, kloakoplandType: "separat" });
    expect(result.fields.regnvandsløsning.status).toBe("placeholder");
  });

  it("regnvandsløsning auto when faelles", () => {
    const result = computeDrawingCompleteness({
      ...minimalBlocking,
      kloakoplandType: "faelles",
      proposedFootprintSource: "generated",
    });
    expect(result.fields.regnvandsløsning.status).toBe("auto");
  });

  it("sokkelKote estimated when sokkelKoteM present with registry source", () => {
    const result = computeDrawingCompleteness({
      ...minimalBlocking,
      sokkelKoteM: 18.2,
      sokkelSource: "registry",
      proposedFootprintSource: "generated",
    });
    expect(result.fields.sokkelKote.status).toBe("estimated");
  });

  it("complete plan → overallStatus ready", () => {
    const result = computeDrawingCompleteness({
      hasParcelPolygon: true,
      proposedFootprintSource: "generated",
      sokkelKoteM: 18.2,
      sokkelSource: "registry",
      tagform: "sadeltag",
      taghaldningGrad: 35,
      rygningsKoteM: 23.75,
      vejLayer: {
        vejnavn: "Testvej",
        centerline25832: {
          type: "LineString",
          crs: "EPSG:25832",
          coordinates: [
            [0, 0],
            [100, 0],
          ],
        },
        vejkant25832: [],
        vejbreddeM: null,
        source: {
          source: "registry",
          confidence: "medium",
          fetchedAt: "2026-06-06",
          requiresReview: false,
        },
      },
      terrainLayer: {
        verticalDatum: "DVR90",
        points: [],
        slopePercent: null,
        lowPointM: null,
        source: {
          source: "registry",
          confidence: "medium",
          fetchedAt: "2026-06-06",
          requiresReview: false,
        },
      },
      surveyTerrainPointCount: 0,
      kloakoplandType: "faelles",
      siteUseLayers: [],
      naturbeskyttelseFetchedAt: "2026-06-06",
    });
    expect(result.overallStatus).toBe("ready");
  });
});
