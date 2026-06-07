import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { installSequentialJsonFetch, resetMockedFetch } from "@/testing/fetch-mocks";
import { fetchGeoDanmarkRoadGeometry } from "./road-geometry";

describe("fetchGeoDanmarkRoadGeometry", () => {
  beforeEach(() => resetMockedFetch());
  afterEach(() => resetMockedFetch());

  it("decodes GeoDanmark road centerline and edges into a VejLayer", async () => {
    const fetchSpy = installSequentialJsonFetch([
      {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: [
                [0, -6],
                [20, -6],
              ],
            },
          },
        ],
      },
      {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: {
              type: "MultiLineString",
              coordinates: [
                [
                  [0, -9],
                  [20, -9],
                ],
                [
                  [0, -3],
                  [20, -3],
                ],
              ],
            },
          },
        ],
      },
    ]);

    const result = await fetchGeoDanmarkRoadGeometry(
      { vejnavn: "Testvej", bbox25832: [0, 0, 20, 20] },
      {
        apiKey: "test-api-key",
        endpoint: "https://example.test/wfs",
        now: new Date("2026-06-07T12:00:00.000Z"),
      },
    );

    expect(result?.vejnavn).toBe("Testvej");
    expect(result?.centerline25832?.coordinates).toEqual([
      [0, -6],
      [20, -6],
    ]);
    expect(result?.vejkant25832).toHaveLength(2);
    expect(result?.vejbreddeM).toBe(6);
    expect(result?.source.requiresReview).toBe(false);
    expect(fetchSpy.mock.calls).toHaveLength(2);

    const [centerlineUrl] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(centerlineUrl).toContain("apikey=test-api-key");
    expect(centerlineUrl).toContain("typeNames=geodkv%3Avejmidte_current");
  });

  it("returns a named degraded layer when only DAR road name exists", async () => {
    installSequentialJsonFetch([
      { type: "FeatureCollection", features: [] },
      { type: "FeatureCollection", features: [] },
    ]);

    const result = await fetchGeoDanmarkRoadGeometry(
      { vejnavn: "Testvej", bbox25832: [0, 0, 20, 20] },
      { apiKey: "test-api-key", endpoint: "https://example.test/wfs" },
    );

    expect(result?.vejnavn).toBe("Testvej");
    expect(result?.centerline25832).toBeNull();
    expect(result?.vejkant25832).toHaveLength(0);
    expect(result?.vejbreddeM).toBeNull();
    expect(result?.source.requiresReview).toBe(true);
  });
});
