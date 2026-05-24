import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { ArealdataService } from "./client";
import type * as GeoJSON from "geojson";

function wfsResponse(totalFeatures: number) {
  return { totalFeatures, features: [] };
}

function mockFetchForScenario(
  scenario: "clean" | "mixed" | "all_error",
): ReturnType<typeof spyOn> {
  return spyOn(globalThis, "fetch").mockImplementation(
    async (input: RequestInfo | URL): Promise<Response> => {
      const url = input.toString();

      if (scenario === "all_error") {
        throw new Error("network error");
      }

      let data = wfsResponse(0);

      if (scenario === "mixed") {
        if (url.includes("PARAGRAF3_NATUR")) data = wfsResponse(1);
        if (url.includes("FORTIDSMINDE")) data = wfsResponse(1);
      }

      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  );
}

describe("ArealdataService.getContext", () => {
  let fetchSpy: ReturnType<typeof mockFetchForScenario>;

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  it("returns ok with false booleans for a clean response set", async () => {
    fetchSpy = mockFetchForScenario("clean");
    const result = await ArealdataService.getContext({ lat: 55.7, lng: 12.5 });

    expect(result.status).toBe("ok");
    expect(result.data?.paragraph3Nature).toBe(false);
    expect(result.data?.natura2000).toBe(false);
    expect(result.data?.fortidsminde).toBe(false);
  });

  it("returns true for hit layers and keeps others false", async () => {
    fetchSpy = mockFetchForScenario("mixed");
    const result = await ArealdataService.getContext({ lat: 55.7, lng: 12.5 });

    expect(result.status).toBe("ok");
    expect(result.data?.paragraph3Nature).toBe(true);
    expect(result.data?.fortidsminde).toBe(true);
    expect(result.data?.natura2000).toBe(false);
  });

  it("falls back to polygon WKT when parcel geometry is provided", async () => {
    fetchSpy = mockFetchForScenario("clean");

    const polygon: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [12.5, 55.7],
                [12.6, 55.7],
                [12.6, 55.8],
                [12.5, 55.8],
                [12.5, 55.7],
              ],
            ],
          },
          properties: {},
        },
      ],
    };

    await ArealdataService.getContext({ lat: 55.7, lng: 12.5 }, polygon);

    const calledUrl = fetchSpy.mock.calls[0]?.[0]?.toString() ?? "";
    expect(calledUrl).toContain("POLYGON");
    expect(calledUrl).not.toContain("POINT");
  });

  it("returns error with null data when all layer requests fail", async () => {
    fetchSpy = mockFetchForScenario("all_error");
    const result = await ArealdataService.getContext({ lat: 55.7, lng: 12.5 });

    expect(result.status).toBe("error");
    expect(result.data).toBeNull();
  });
});
