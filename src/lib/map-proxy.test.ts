import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const getCachedJordstykkePolygonMock = mock(async (_adresseid: string) => null);
const setCachedJordstykkePolygonMock = mock(
  async (_adresseid: string, _featureCollection: unknown) => undefined,
);

mock.module("@/integrations/cache/client", () => ({
  getCachedJordstykkePolygon: getCachedJordstykkePolygonMock,
  setCachedJordstykkePolygon: setCachedJordstykkePolygonMock,
}));

mock.module("@/lib/env", () => ({
  getEnvRequired: (_key: string) => "test-api-key",
  getEnvOptional: (_key: string) => null,
}));

const { fetchParcelGeometryByJordstykkeId } = await import("./map-proxy");

describe("fetchParcelGeometryByJordstykkeId", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    getCachedJordstykkePolygonMock.mockReset();
    setCachedJordstykkePolygonMock.mockReset();
  });

  it("parses GML response without forcing JSON output format", async () => {
    const fetchMock = mock(async (input: string | URL | Request) => {
      const requestUrl =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      expect(requestUrl).toContain("FILTER=");
      expect(requestUrl).toContain("id.lokalId");
      expect(requestUrl).toContain("2468837");
      expect(requestUrl).not.toContain("outputFormat=application%2Fjson");

      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
         <wfs:FeatureCollection xmlns:wfs="http://www.opengis.net/wfs/2.0" xmlns:mat="https://datafordeler.dk/MATRIKLEN2">
           <wfs:member>
             <mat:Jordstykke_Gaeldende>
               <mat:id.lokalId>2468837</mat:id.lokalId>
               <mat:matrikelnummer>5fs</mat:matrikelnummer>
               <mat:ejerlavskode>12345</mat:ejerlavskode>
               <mat:ejerlavsnavn>Virum By</mat:ejerlavsnavn>
               <mat:registreretAreal>700</mat:registreretAreal>
               <mat:geometri>
                 <gml:Polygon xmlns:gml="http://www.opengis.net/gml/3.2">
                   <gml:exterior>
                     <gml:LinearRing>
                       <gml:posList>724000 6172000 724010 6172000 724010 6172010 724000 6172010 724000 6172000</gml:posList>
                     </gml:LinearRing>
                   </gml:exterior>
                 </gml:Polygon>
               </mat:geometri>
             </mat:Jordstykke_Gaeldende>
           </wfs:member>
         </wfs:FeatureCollection>`,
        {
          status: 200,
          headers: { "content-type": "application/gml+xml; version=3.2" },
        },
      );
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const result = await fetchParcelGeometryByJordstykkeId("2468837");

    expect(result.source).toBe("wfs");
    expect(result.featureCollection?.features).toHaveLength(1);
    expect(result.featureCollection?.features[0]?.properties).toMatchObject({
      id_lokalId: "2468837",
      matrikelnummer: "5fs",
      ejerlavskode: 12345,
      ejerlavsnavn: "Virum By",
      registreretAreal: 700,
    });
    expect(result.featureCollection?.features[0]?.geometry).toMatchObject({
      type: "Polygon",
    });
  });

  it("returns notfound on non-200 response", async () => {
    const fetchMock = mock(async () => new Response("missing", { status: 404 }));
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await fetchParcelGeometryByJordstykkeId("missing");

    expect(result).toEqual({ featureCollection: null, source: "notfound" });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });
});
