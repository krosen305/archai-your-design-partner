import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { resetMockedFetch } from "@/testing/fetch-mocks";
import { fetchNaturbeskyttelseLayers } from "./geometry-adapter";

const RUN_LIVE_NATURBESKYTTELSE_WFS = process.env.RUN_LIVE_NATURBESKYTTELSE_WFS === "true";
const describeLive = RUN_LIVE_NATURBESKYTTELSE_WFS ? describe : describe.skip;

type MockResponseInit = {
  status?: number;
  contentType?: string;
};

function mockResponse(body: string, init: MockResponseInit = {}): Response {
  const status = init.status ?? 200;
  const contentType = init.contentType ?? "application/json";
  return new Response(body, {
    status,
    headers: { "Content-Type": contentType },
  });
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

function featureCollection(geometry: unknown) {
  return JSON.stringify({
    type: "FeatureCollection",
    features: geometry
      ? [
          {
            type: "Feature",
            properties: {},
            geometry,
          },
        ]
      : [],
  });
}

const polygonGeometry = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [20, 0],
      [20, 20],
      [0, 20],
      [0, 0],
    ],
  ],
};

const multiPolygonGeometry = {
  type: "MultiPolygon",
  coordinates: [
    [
      [
        [0, 0, 1.4],
        [20, 0, 1.3],
        [20, 20, 1.2],
        [0, 20, 1.1],
        [0, 0, 1.4],
      ],
    ],
  ],
};

describe("naturbeskyttelse geometry adapter", () => {
  beforeEach(() => resetMockedFetch());
  afterEach(() => resetMockedFetch());

  it("fetches DMP and SLKS GeoJSON layers as NaturbeskyttelseLayer polygons", async () => {
    const fetchSpy = installUrlAwareFetch((url) => {
      const decoded = decodeURIComponent(url);
      if (decoded.includes("dai:skovbyggelinjer")) {
        return mockResponse(featureCollection(multiPolygonGeometry));
      }
      if (decoded.includes("dai:aa_bes_linjer")) {
        return mockResponse(featureCollection(null));
      }
      if (decoded.includes("public:fundogfortidsminder_areal_beskyttelse")) {
        return mockResponse(featureCollection(polygonGeometry));
      }
      return mockResponse("missing", { status: 404, contentType: "text/plain" });
    });

    const layers = await fetchNaturbeskyttelseLayers([0, 0, 20, 20], {
      dmpEndpoint: "https://dmp.test/wfs",
      slksEndpoint: "https://slks.test/wfs",
      includeMatLayers: false,
      now: new Date("2026-06-07T12:00:00.000Z"),
    });

    expect(layers.map((layer) => layer.type)).toEqual([
      "skovbyggelinje",
      "fortidsmindebeskyttelse",
    ]);
    expect(layers[0]?.geometry25832.coordinates[0]?.[0]).toEqual([0, 0]);
    expect(layers.every((layer) => layer.source.fetchedAt === "2026-06-07T12:00:00.000Z")).toBe(
      true,
    );
    expect(fetchSpy.mock.calls).toHaveLength(3);
    expect(decodeURIComponent(fetchSpy.mock.calls[0]![0])).toContain("bbox=0,0,20,20,EPSG:25832");
  });

  it("keeps partial WFS failures from blocking verified layers", async () => {
    installUrlAwareFetch((url) => {
      const decoded = decodeURIComponent(url);
      if (decoded.includes("dai:skovbyggelinjer")) {
        return mockResponse("not json", { status: 502, contentType: "text/plain" });
      }
      if (decoded.includes("public:fundogfortidsminder_areal_beskyttelse")) {
        return mockResponse(featureCollection(polygonGeometry));
      }
      return mockResponse(featureCollection(null));
    });

    const layers = await fetchNaturbeskyttelseLayers([0, 0, 20, 20], {
      dmpEndpoint: "https://dmp.test/wfs",
      slksEndpoint: "https://slks.test/wfs",
      includeMatLayers: false,
    });

    expect(layers).toHaveLength(1);
    expect(layers[0]?.type).toBe("fortidsmindebeskyttelse");
  });

  it("parses MAT WFS XML geometry for strand and klit when credentials are supplied", async () => {
    const fetchSpy = installUrlAwareFetch((url) => {
      const decoded = decodeURIComponent(url);
      if (decoded.includes("mat:StrandbeskyttelseFlade_Gaeldende")) {
        return mockResponse(
          `<wfs:FeatureCollection>
            <wfs:member>
              <mat:StrandbeskyttelseFlade_Gaeldende>
                <mat:geometri>
                  <gml:Polygon>
                    <gml:exterior>
                      <gml:LinearRing>
                        <gml:posList>0 0 20 0 20 20 0 20 0 0</gml:posList>
                      </gml:LinearRing>
                    </gml:exterior>
                  </gml:Polygon>
                </mat:geometri>
              </mat:StrandbeskyttelseFlade_Gaeldende>
            </wfs:member>
          </wfs:FeatureCollection>`,
          { contentType: "application/xml" },
        );
      }
      return mockResponse(featureCollection(null));
    });

    const layers = await fetchNaturbeskyttelseLayers([0, 0, 20, 20], {
      dmpEndpoint: "https://dmp.test/wfs",
      slksEndpoint: "https://slks.test/wfs",
      matEndpoint: "https://mat.test/wfs",
      datafordelerApiKey: "test-key",
      includeMatLayers: true,
    });

    const strand = layers.find((layer) => layer.type === "strandbeskyttelse");
    expect(strand?.geometry25832.coordinates[0]).toEqual([
      [0, 0],
      [20, 0],
      [20, 20],
      [0, 20],
      [0, 0],
    ]);
    expect(strand?.source.requiresReview).toBe(false);
    expect(fetchSpy.mock.calls.some(([url]) => String(url).includes("apikey=test-key"))).toBe(true);
    expect(
      fetchSpy.mock.calls.some(([url]) =>
        decodeURIComponent(String(url)).includes("bbox=0,0,20,20,urn:ogc:def:crs:EPSG::25832"),
      ),
    ).toBe(true);
  });
});

describeLive("naturbeskyttelse geometry adapter live WFS", () => {
  it("henter live MAT-geometri for strandbeskyttelse og klitfredning", async () => {
    const strandLayers = await fetchNaturbeskyttelseLayers([891460, 6127440, 891485, 6127470], {
      includeMatLayers: true,
    });
    const klitLayers = await fetchNaturbeskyttelseLayers([542590, 6358950, 542645, 6358990], {
      includeMatLayers: true,
    });

    const strand = strandLayers.find((layer) => layer.type === "strandbeskyttelse");
    const klit = klitLayers.find((layer) => layer.type === "klitfredning");

    expect(strand?.geometry25832.type).toBe("Polygon");
    expect(strand?.geometry25832.coordinates[0]?.length).toBeGreaterThanOrEqual(4);
    expect(strand?.source.requiresReview).toBe(false);
    expect(klit?.geometry25832.type).toBe("Polygon");
    expect(klit?.geometry25832.coordinates[0]?.length).toBeGreaterThanOrEqual(4);
    expect(klit?.source.requiresReview).toBe(false);
  }, 45_000);
});
