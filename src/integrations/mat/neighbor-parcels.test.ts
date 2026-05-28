import { beforeEach, describe, expect, it, mock } from "bun:test";

// Capture the native fetch *before* any mock.module calls execute so we can
// reliably restore globalThis.fetch in beforeEach, regardless of test order.
const nativeFetch = globalThis.fetch;

const featureFlags = {
  tinglysningMock: true,
  pdfExtractorMock: false,
  husDnaMock: false,
  byggeanalyseMock: false,
  fjernvarmeMock: false,
  billedanalyseMock: false,
  geodanmarkMock: false,
  plandataSurroundingsMock: false,
  matNeighborParcelsMock: false,
  geusMock: false,
  dhmMock: false,
};

mock.module("@/lib/feature-flags", () => ({
  FEATURE_FLAGS: featureFlags,
}));

mock.module("@/lib/env", () => ({
  getEnvRequired: () => "test-api-key",
}));

const fetchParcelGeometryByJordstykkeIdMock = mock(async (_jordstykkeId: string) => ({
  featureCollection: null,
  source: "notfound" as const,
}));

mock.module("@/lib/map-proxy", () => ({
  fetchParcelGeometryByJordstykkeId: fetchParcelGeometryByJordstykkeIdMock,
}));

beforeEach(() => {
  globalThis.fetch = nativeFetch;
  fetchParcelGeometryByJordstykkeIdMock.mockReset();
  fetchParcelGeometryByJordstykkeIdMock.mockResolvedValue({
    featureCollection: null,
    source: "notfound" as const,
  });
});

describe("MatNeighborParcelService", () => {
  it("returnerer mock result når feature flag er aktivt", async () => {
    featureFlags.matNeighborParcelsMock = true;
    const { MatNeighborParcelService } = await import("./neighbor-parcels");
    const result = await MatNeighborParcelService.getNeighborParcels(
      "test-jordstykke-id",
      [720000, 6175000, 720200, 6175200],
    );
    expect(result.status).toBe("mock");
    expect(result.isMock).toBe(true);
    expect(result.data).toBeArray();
  });

  it("bruger verificeret MAT typename i live path og filtrerer eget jordstykke fra", async () => {
    featureFlags.matNeighborParcelsMock = false;
    fetchParcelGeometryByJordstykkeIdMock.mockResolvedValue({
      featureCollection: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: {
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
            },
            properties: {},
          },
        ],
      },
      source: "wfs" as const,
    });
    const fetchCalls: string[] = [];
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      fetchCalls.push(String(input));
      const responseBody = JSON.stringify({
        features: [
          {
            id: "mat.Jordstykke_Gaeldende.egen",
            properties: { id_lokalId: "own-id", matrikelnummer: "1a", ejerlavskode: 17301 },
            geometry: {
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
            },
          },
          {
            id: "mat.Jordstykke_Gaeldende.nabo",
            properties: { id_lokalId: "neighbor-id", matrikelnummer: "1b", ejerlavskode: 17301 },
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [10, 0],
                  [20, 0],
                  [20, 10],
                  [10, 10],
                  [10, 0],
                ],
              ],
            },
          },
        ],
      });
      return {
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        text: async () => responseBody,
      } as unknown as Response;
    }) as typeof fetch;

    const { MatNeighborParcelService } = await import("./neighbor-parcels");
    const result = await MatNeighborParcelService.getNeighborParcels("own-id", [0, 0, 100, 100]);

    expect(result.status).toBe("ok");
    expect(fetchCalls[0]).toContain("typenames=mat%3AJordstykke_Gaeldende");
    expect(result.data).toHaveLength(1);
    expect(result.data?.[0]?.jordstykkeLokalId).toBe("neighbor-id");
    expect(result.data?.[0]?.relation).toBe("shared_boundary");
    expect(result.data?.[0]?.sharedBoundaryLengthM).toBe(10);
    expect(result.data?.[0]?.distanceM).toBe(0);
  });

  it("parser XML/GML bbox-response når MAT WFS ikke returnerer JSON", async () => {
    featureFlags.matNeighborParcelsMock = false;
    globalThis.fetch = mock(async () => {
      const body = `<?xml version="1.0" encoding="UTF-8"?>
<wfs:FeatureCollection xmlns:wfs="http://www.opengis.net/wfs/2.0" xmlns:mat="http://data.gov.dk/schemas/matrikel/1">
  <wfs:member>
    <mat:Jordstykke_Gaeldende>
      <mat:id.lokalId>own-id</mat:id.lokalId>
      <mat:matrikelnummer>5fo</mat:matrikelnummer>
      <mat:ejerlavskode>12352</mat:ejerlavskode>
      <mat:geometri>
        <gml:Polygon xmlns:gml="http://www.opengis.net/gml/3.2">
          <gml:exterior>
            <gml:LinearRing>
              <gml:posList>0 0 10 0 10 10 0 10 0 0</gml:posList>
            </gml:LinearRing>
          </gml:exterior>
        </gml:Polygon>
      </mat:geometri>
    </mat:Jordstykke_Gaeldende>
  </wfs:member>
  <wfs:member>
    <mat:Jordstykke_Gaeldende>
      <mat:id.lokalId>neighbor-id</mat:id.lokalId>
      <mat:matrikelnummer>5fp</mat:matrikelnummer>
      <mat:ejerlavskode>12352</mat:ejerlavskode>
      <mat:geometri>
        <gml:Polygon xmlns:gml="http://www.opengis.net/gml/3.2">
          <gml:exterior>
            <gml:LinearRing>
              <gml:posList>10 0 20 0 20 10 10 10 10 0</gml:posList>
            </gml:LinearRing>
          </gml:exterior>
        </gml:Polygon>
      </mat:geometri>
    </mat:Jordstykke_Gaeldende>
  </wfs:member>
</wfs:FeatureCollection>`;

      return {
        ok: true,
        status: 200,
        headers: { get: () => "application/xml" },
        text: async () => body,
      } as unknown as Response;
    }) as typeof fetch;

    const { MatNeighborParcelService } = await import("./neighbor-parcels");
    const result = await MatNeighborParcelService.getNeighborParcels("own-id", [0, 0, 100, 100]);

    expect(result.status).toBe("ok");
    expect(result.data).toHaveLength(1);
    expect(result.data?.[0]).toEqual({
      jordstykkeLokalId: "neighbor-id",
      matrikelnummer: "5fp",
      ejerlavskode: 12352,
      relation: "shared_boundary",
      sharedBoundaryLengthM: 10,
      distanceM: 0,
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [10, 0],
            [20, 0],
            [20, 10],
            [10, 10],
            [10, 0],
          ],
        ],
      },
    });
  });
});
