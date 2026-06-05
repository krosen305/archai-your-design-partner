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

const { fetchMapTileProxy, fetchParcelGeometryByJordstykkeId } = await import("./map-proxy");

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

  it("fetches ortofoto tiles from Datafordeler WMTS", async () => {
    const fetchMock = mock(async (input: string | URL | Request) => {
      const requestUrl =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const url = new URL(requestUrl);

      expect(url.origin + url.pathname).toBe(
        "https://wmts.datafordeler.dk/GeoDanmarkOrto/orto_foraar_webm/1.0.0/WMTS",
      );
      expect(url.searchParams.get("apikey")).toBe("test-api-key");
      expect(url.searchParams.get("REQUEST")).toBe("GetTile");
      expect(url.searchParams.get("LAYER")).toBe("orto_foraar_webm");
      expect(url.searchParams.get("FORMAT")).toBe("image/jpeg");
      expect(url.searchParams.get("TILEMATRIXSET")).toBe("DFD_GoogleMapsCompatible");
      expect(url.searchParams.get("TILEMATRIX")).toBe("19");
      expect(url.searchParams.get("TILEROW")).toBe("160000");
      expect(url.searchParams.get("TILECOL")).toBe("270000");

      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await fetchMapTileProxy({
      layer: "ortofoto",
      z: "19",
      x: "270000",
      y: "160000",
    });

    expect(result?.startsWith("data:image/jpeg;base64,")).toBe(true);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });
});
