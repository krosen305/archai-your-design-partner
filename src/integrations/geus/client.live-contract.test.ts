import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

mock.module("@/lib/feature-flags", () => ({
  FEATURE_FLAGS: {
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
    dhmMock: true,
  },
}));

describe("GeusService live contract", () => {
  afterEach(() => {
    mock.restore();
  });

  it("returns status=error when the live GEUS groundwater request fails", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    const { GeusService } = await import("./client");

    const result = await GeusService.getRiskData(55.794, 12.492);

    expect(result.status).toBe("error");
    expect(result.data).toBeNull();
    fetchSpy.mockRestore();
  });

  it("maps jupiter_pejlinger payload into typed groundwater fields", async () => {
    const payload = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [719484.71, 6186887.81],
          },
          properties: {
            borid: 164984,
            dgu_nr: "201.566",
            url_borerapport: "https://data.geus.dk/JupiterWWW/borerapport.jsp?borid=164984",
            vsp_mtu_seneste: 6.48,
            terraen_kote: 19.9,
            kote_seneste: 13.42,
            indtags_bjergart: "Kvartært sand",
            xutm32euref89: 719484.71,
            yutm32euref89: 6186887.81,
          },
        },
      ],
    };
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const { GeusService } = await import("./client");

    const result = await GeusService.getRiskData(55.794, 12.492);

    expect(result.status).toBe("ok");
    expect(result.isMock).toBe(false);
    expect(result.data?.radonRisk).toBe("unknown");
    expect(result.data?.groundwaterDepthM).toBe(6.5);
    expect(result.data?.groundwaterDepthWinterM).toBe(6.5);
    expect(result.data?.groundwaterDepthSummerM).toBe(6.5);
    expect(result.data?.groundwaterDataSource).toBe("201.566");
    expect(result.data?.geoteknikJordart).toBe("Kvartært sand");
    expect(result.rawFeatureCount).toBe(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });
});
