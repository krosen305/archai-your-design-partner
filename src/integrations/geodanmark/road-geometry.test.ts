import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { installSequentialJsonFetch, resetMockedFetch } from "@/testing/fetch-mocks";
import {
  extractWfsTypeNamesFromCapabilitiesXml,
  fetchGeoDanmarkRoadGeometry,
  selectRoadTypeNamesFromCapabilities,
} from "./road-geometry";

type MockResponseInit = {
  status?: number;
  contentType?: string;
};

function mockResponse(body: string, init: MockResponseInit = {}): Response {
  const status = init.status ?? 200;
  const contentType = init.contentType ?? "application/json";
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => (name.toLowerCase() === "content-type" ? contentType : null),
    },
    text: async () => body,
    json: async () => JSON.parse(body) as unknown,
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
  } as unknown as Response;
}

function installUrlAwareFetch(handler: (url: string) => Response) {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const spy = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const href = String(url);
    calls.push([href, init]);
    return handler(href);
  }) as typeof globalThis.fetch & { mock: { calls: Array<[string, RequestInit | undefined]> } };

  spy.mock = { calls };
  globalThis.fetch = spy;
  return spy;
}

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
                [0, -6, 1.2],
                [20, -6, 1.1],
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
    expect(centerlineUrl).toContain("typeNames=geodkv_v001%3Avejmidte_current");
  });

  it("returns a named degraded layer when only DAR road name exists", async () => {
    installSequentialJsonFetch([
      { type: "FeatureCollection", features: [] },
      { type: "FeatureCollection", features: [] },
    ]);

    const result = await fetchGeoDanmarkRoadGeometry(
      { vejnavn: "Testvej", bbox25832: [0, 0, 20, 20] },
      {
        apiKey: "test-api-key",
        endpoint: "https://example.test/wfs",
        discoverTypeNames: false,
        typeNameOverrides: {
          centerline: ["geodkv:vejmidte_current"],
          edge: ["geodkv:vejkant_current"],
        },
      },
    );

    expect(result?.vejnavn).toBe("Testvej");
    expect(result?.centerline25832).toBeNull();
    expect(result?.vejkant25832).toHaveLength(0);
    expect(result?.vejbreddeM).toBeNull();
    expect(result?.source.requiresReview).toBe(true);
    expect(result?.source.confidence).toBe("unknown");
    expect(result?.source.reviewReasons).toEqual(["geodanmark.centerline_missing"]);
  });

  it("extracts and ranks road type names from WFS capabilities", () => {
    const capabilities = `
      <wfs:FeatureTypeList>
        <wfs:FeatureType><wfs:Name>geodkv:bygning_current</wfs:Name></wfs:FeatureType>
        <wfs:FeatureType><wfs:Name>geodkv:vejkant_current</wfs:Name></wfs:FeatureType>
        <wfs:FeatureType><wfs:Name>geodkv:vejmidte_current</wfs:Name></wfs:FeatureType>
      </wfs:FeatureTypeList>
    `;

    const typeNames = extractWfsTypeNamesFromCapabilitiesXml(capabilities);

    expect(selectRoadTypeNamesFromCapabilities(typeNames, "centerline")).toEqual([
      "geodkv:vejmidte_current",
    ]);
    expect(selectRoadTypeNamesFromCapabilities(typeNames, "edge")).toEqual([
      "geodkv:vejkant_current",
    ]);
  });

  it("discovers road type names when configured candidates fail", async () => {
    const featureCollection = (y: number) =>
      JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: [
                [0, y],
                [20, y],
              ],
            },
          },
        ],
      });
    const capabilities = `
      <wfs:FeatureTypeList>
        <wfs:FeatureType><wfs:Name>prod:vejmidte_current</wfs:Name></wfs:FeatureType>
        <wfs:FeatureType><wfs:Name>prod:vejkant_current</wfs:Name></wfs:FeatureType>
      </wfs:FeatureTypeList>
    `;
    const fetchSpy = installUrlAwareFetch((url) => {
      if (url.includes("GetCapabilities")) {
        return mockResponse(capabilities, { contentType: "application/xml" });
      }
      if (url.includes("typeNames=wrong%3Avejmidte")) {
        return mockResponse("missing", { status: 404, contentType: "text/plain" });
      }
      if (url.includes("typeNames=wrong%3Avejkant")) {
        return mockResponse("missing", { status: 404, contentType: "text/plain" });
      }
      if (url.includes("typeNames=prod%3Avejmidte_current")) {
        return mockResponse(featureCollection(-6));
      }
      if (url.includes("typeNames=prod%3Avejkant_current")) {
        return mockResponse(
          JSON.stringify({
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: {},
                geometry: {
                  type: "MultiLineString",
                  coordinates: [
                    [
                      [0, -9, 1.4],
                      [20, -9, 1.2],
                    ],
                    [
                      [0, -3, 1.5],
                      [20, -3, 1.3],
                    ],
                  ],
                },
              },
            ],
          }),
        );
      }
      return mockResponse("missing", { status: 404, contentType: "text/plain" });
    });

    const result = await fetchGeoDanmarkRoadGeometry(
      { vejnavn: "Testvej", bbox25832: [0, 0, 20, 20] },
      {
        apiKey: "test-api-key",
        endpoint: "https://example.test/wfs",
        typeNameOverrides: {
          centerline: ["wrong:vejmidte"],
          edge: ["wrong:vejkant"],
        },
      },
    );

    expect(result?.centerline25832?.coordinates).toEqual([
      [0, -6],
      [20, -6],
    ]);
    expect(result?.vejkant25832).toHaveLength(2);
    expect(result?.source.requiresReview).toBe(false);
    expect(fetchSpy.mock.calls.some(([url]) => url.includes("GetCapabilities"))).toBe(true);
  });
});
