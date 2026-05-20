import { describe, expect, it, spyOn, afterEach } from "bun:test";
import { DkJordService } from "./dkjord";
import type * as GeoJSON from "geojson";

// ---------------------------------------------------------------------------
// Helpers: byg WFS JSON-svar
// ---------------------------------------------------------------------------

function wfsResponse(totalFeatures: number, features: object[] = []) {
  return {
    totalFeatures,
    features: features.map((props) => ({ type: "Feature", properties: props })),
  };
}

// Lav en mock fetch der returnerer différente svar baseret på TYPENAMES i URL
function mockFetchForScenario(scenario: "no_hit" | "v1_only" | "v2_hit") {
  return spyOn(globalThis, "fetch").mockImplementation(
    async (input: RequestInfo | URL): Promise<Response> => {
      const url = input.toString();
      const isV1 = url.includes("dkjord:V1");
      const isV2 = url.includes("dkjord:V2");
      const isOlietank = url.includes("dkjord:olietank");
      const isOmraadet = url.includes("dkjord:omraadet");

      let data: object;
      if (scenario === "no_hit") {
        data = wfsResponse(0);
      } else if (scenario === "v1_only") {
        data = isV1 ? wfsResponse(1, [{ nuancering: "Historisk", lokalitet_id: "LOK-001" }]) : wfsResponse(0);
      } else {
        // v2_hit
        data = isV2 ? wfsResponse(1, [{ nuancering: "V2 Forurenet", lokalitet_id: "LOK-042" }]) : wfsResponse(0);
      }

      // olietank og omraadet returnerer altid 0 i disse scenarier
      if (isOlietank || isOmraadet) data = wfsResponse(0);

      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  );
}

// ---------------------------------------------------------------------------
// Eksisterende tests (mock-path)
// ---------------------------------------------------------------------------

describe("DkJordService.getTilstand — live path (fetch mocked)", () => {
  let fetchSpy: ReturnType<typeof mockFetchForScenario>;

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  it("returns SourceResult shape with status and data", async () => {
    fetchSpy = mockFetchForScenario("no_hit");
    const result = await DkJordService.getTilstand({ lat: 55.7, lng: 12.5 });
    expect(result.status).toBeDefined();
    expect(["ok", "mock", "error", "skipped"]).toContain(result.status);
    expect(result.kilde).toBeDefined();
    expect(result.fetchedAt).toBeDefined();
    expect(result.isMock).toBeDefined();
  });

  it("result.data.nuancering and lokalitetsId are present in type", async () => {
    fetchSpy = mockFetchForScenario("no_hit");
    const result = await DkJordService.getTilstand({ lat: 55.7, lng: 12.5 });
    expect(result.data).not.toBeNull();
    const data = result.data!;
    expect("nuancering" in data).toBe(true);
    expect("lokalitetsId" in data).toBe(true);
  });

  it("result.data has kilde field for backward compatibility", async () => {
    fetchSpy = mockFetchForScenario("no_hit");
    const result = await DkJordService.getTilstand({ lat: 55.7, lng: 12.5 });
    expect(["dkjord", "mock"]).toContain(result.data?.kilde);
  });
});

// ---------------------------------------------------------------------------
// wfsPolygonFilter hjælpefunktion
// ---------------------------------------------------------------------------

describe("wfsPolygonFilter", () => {
  it("bygger korrekt WKT fra en GeoJSON Feature med Polygon", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      async (): Promise<Response> => new Response(JSON.stringify(wfsResponse(0)), { status: 200 }),
    );

    const polygon: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [10.0, 55.0],
                [10.1, 55.0],
                [10.1, 55.1],
                [10.0, 55.1],
                [10.0, 55.0],
              ],
            ],
          },
          properties: {},
        },
      ],
    };

    await DkJordService.getTilstand({ lat: 55.05, lng: 10.05 }, polygon);

    const calledUrl = fetchSpy.mock.calls[0]?.[0]?.toString() ?? "";
    expect(calledUrl).toContain("POLYGON");
    expect(calledUrl).not.toContain("POINT");

    fetchSpy.mockRestore();
  });

  it("falder tilbage til POINT når polygon er null", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      async (): Promise<Response> => new Response(JSON.stringify(wfsResponse(0)), { status: 200 }),
    );

    await DkJordService.getTilstand({ lat: 55.05, lng: 10.05 }, null);

    const calledUrl = fetchSpy.mock.calls[0]?.[0]?.toString() ?? "";
    expect(calledUrl).toContain("POINT");

    fetchSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Live fixture-scenarier (fetch mocked)
// ---------------------------------------------------------------------------

describe("DkJordService.getTilstand — no_hit scenarie", () => {
  let fetchSpy: ReturnType<typeof mockFetchForScenario>;

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  it("returnerer v1=false, v2=false, status=ok ved 0 features", async () => {
    fetchSpy = mockFetchForScenario("no_hit");
    const result = await DkJordService.getTilstand({ lat: 55.7, lng: 12.5 });
    expect(result.status).toBe("ok");
    expect(result.data?.v1Kortlagt).toBe(false);
    expect(result.data?.v2Kortlagt).toBe(false);
    expect(result.data?.kilde).toBe("dkjord");
  });
});

describe("DkJordService.getTilstand — v1_only scenarie", () => {
  let fetchSpy: ReturnType<typeof mockFetchForScenario>;

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  it("returnerer v1=true, v2=false ved 1 V1-feature", async () => {
    fetchSpy = mockFetchForScenario("v1_only");
    const result = await DkJordService.getTilstand({ lat: 55.7, lng: 12.5 });
    expect(result.status).toBe("ok");
    expect(result.data?.v1Kortlagt).toBe(true);
    expect(result.data?.v2Kortlagt).toBe(false);
  });
});

describe("DkJordService.getTilstand — v2_hit scenarie", () => {
  let fetchSpy: ReturnType<typeof mockFetchForScenario>;

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  it("returnerer v1=false, v2=true ved 1 V2-feature", async () => {
    fetchSpy = mockFetchForScenario("v2_hit");
    const result = await DkJordService.getTilstand({ lat: 55.7, lng: 12.5 });
    expect(result.status).toBe("ok");
    expect(result.data?.v1Kortlagt).toBe(false);
    expect(result.data?.v2Kortlagt).toBe(true);
  });
});

describe("DkJordService.getTilstand — fetch-fejl giver null data (tri-state)", () => {
  it("returnerer status=error og data=null ved netværksfejl", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockRejectedValue(new Error("network error"));
    const result = await DkJordService.getTilstand({ lat: 55.7, lng: 12.5 });
    expect(result.status).toBe("error");
    expect(result.data).toBeNull();
    fetchSpy.mockRestore();
  });
});
