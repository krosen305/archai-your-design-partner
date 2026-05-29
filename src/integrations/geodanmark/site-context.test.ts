import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { z } from "zod";
import { installSequentialJsonFetch, resetMockedFetch } from "@/testing/fetch-mocks";
import { GeoDanmarkSiteContextService } from "./site-context";
import type * as GeoJSON from "geojson";

const TEST_CONFIG = {
  apiKey: "test-api-key",
  endpoint: "https://graphql.datafordeler.dk/GEODKV/v2",
  now: new Date("2026-05-29T12:00:00.000Z"),
  mock: false,
};

const PARCEL: GeoJSON.Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
  ],
};

const requestBodySchema = z.object({
  query: z.string(),
  variables: z.object({
    wkt: z.string(),
    first: z.number(),
    virkningstid: z.string(),
    registreringstid: z.string(),
  }),
});

function parseRequestBody(init: unknown) {
  const requestInit = init as RequestInit;
  const body = typeof requestInit.body === "string" ? requestInit.body : "";
  return requestBodySchema.parse(JSON.parse(body));
}

function buildingNode(sourceId: string, wkt: string, bbrUuid: string | null = null) {
  return {
    id_lokalId: sourceId,
    BBRUUID: bbrUuid,
    geometri: { wkt, crs: 25832, type: "Polygon" },
  };
}

describe("GeoDanmarkSiteContextService", () => {
  beforeEach(() => resetMockedFetch());
  afterEach(() => resetMockedFetch());

  it("henter bygninger og vejmidter via GEODKV GraphQL og klassificerer site context", async () => {
    const fetchSpy = installSequentialJsonFetch([
      {
        data: {
          GEODKV_Bygning: {
            nodes: [
              buildingNode("own-1", "POLYGON Z ((1 1 0, 4 1 0, 4 4 0, 1 4 0, 1 1 0))", "own-bbr"),
              buildingNode("neighbor-1", "POLYGON Z ((20 0 0, 25 0 0, 25 5 0, 20 5 0, 20 0 0))"),
            ],
          },
        },
      },
      {
        data: {
          GEODKV_Vejmidte: {
            nodes: [
              {
                id_lokalId: "road-1",
                geometri: {
                  wkt: "LINESTRING Z (15 -5 0, 15 15 0)",
                  crs: 25832,
                  type: "LineString",
                },
              },
            ],
          },
        },
      },
    ]);

    const result = await GeoDanmarkSiteContextService.getSiteContext(
      {
        bbox25832: [0, -5, 30, 20],
        roadBbox25832: [-10, -10, 40, 30],
        parcelPolygon: PARCEL,
        ownBbrUuids: ["own-bbr"],
      },
      TEST_CONFIG,
    );

    expect(result.status).toBe("ok");
    expect(result.kilde).toBe("geodanmark_nabo");
    expect(result.data?.coverage).toBe("covered");
    expect(result.data?.ownBuildings).toHaveLength(1);
    expect(result.data?.neighborBuildings).toHaveLength(1);
    expect(result.data?.neighborBuildings[0]?.distanceToParcelM).toBeCloseTo(10, 2);
    expect(result.data?.roadCenterlines[0]?.distanceToParcelM).toBeCloseTo(5, 2);

    const [buildingUrl, buildingInit] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(buildingUrl).toBe("https://graphql.datafordeler.dk/GEODKV/v2?apiKey=test-api-key");
    const buildingRequest = parseRequestBody(buildingInit);
    expect(buildingRequest.query).toContain("GEODKV_Bygning");
    expect(buildingRequest.variables.wkt).toBe("POLYGON((0 -5, 30 -5, 30 20, 0 20, 0 -5))");
    expect(buildingRequest.variables.virkningstid).toBe("2026-05-29T12:00:00.000Z");

    const [, roadInit] = fetchSpy.mock.calls[1] as [string, RequestInit];
    const roadRequest = parseRequestBody(roadInit);
    expect(roadRequest.query).toContain("GEODKV_Vejmidte");
    expect(roadRequest.variables.wkt).toBe("POLYGON((-10 -10, 40 -10, 40 30, -10 30, -10 -10))");
  });

  it("returnerer struktureret schema-fejl ved uventet bygningspayload", async () => {
    installSequentialJsonFetch([
      {
        data: {
          GEODKV_Bygning: {
            nodes: [{ geometri: { wkt: "POLYGON ((0 0, 1 0, 1 1, 0 0))", crs: 25832 } }],
          },
        },
      },
    ]);

    const result = await GeoDanmarkSiteContextService.getSiteContext(
      { bbox25832: [0, 0, 1, 1], parcelPolygon: PARCEL },
      TEST_CONFIG,
    );

    expect(result.status).toBe("error");
    expect(result.errorDetails?.kind).toBe("schema");
  });

  it("bruger bygningsdata selv hvis vejmidte-query fejler", async () => {
    const calls: Array<[unknown, unknown?]> = [];
    globalThis.fetch = mock(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push([url, init]);
      const request = parseRequestBody(init);
      if (request.query.includes("GEODKV_Vejmidte")) {
        return new Response(JSON.stringify({ errors: [{ message: "Unknown field" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          data: {
            GEODKV_Bygning: {
              nodes: [buildingNode("neighbor-1", "POLYGON ((20 0, 25 0, 25 5, 20 5, 20 0))")],
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const result = await GeoDanmarkSiteContextService.getSiteContext(
      { bbox25832: [0, 0, 30, 10], parcelPolygon: PARCEL },
      TEST_CONFIG,
    );

    expect(calls).toHaveLength(2);
    expect(result.status).toBe("ok");
    expect(result.data?.neighborBuildings).toHaveLength(1);
    expect(result.data?.roadCenterlines).toHaveLength(0);
  });
});
