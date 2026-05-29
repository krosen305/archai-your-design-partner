import { describe, it, expect, mock, beforeEach } from "bun:test";
import type * as GeoJSON from "geojson";

// Mock map-proxy BEFORE importing MatGeometryService
const mockFetchParcelGeometry = mock(async (_id: string) => ({
  featureCollection: null as GeoJSON.FeatureCollection | null,
  source: "notfound" as "wfs" | "notfound",
}));

mock.module("@/lib/map-proxy", () => ({
  fetchParcelGeometryByJordstykkeId: mockFetchParcelGeometry,
  createBboxAroundPoint: () => ({ minX: 0, minY: 0, maxX: 1, maxY: 1 }),
}));

const mockSetCachedJordstykkePolygon = mock(async (_addressId: string, _fc: unknown) => undefined);

mock.module("@/integrations/cache/client", () => ({
  setCachedJordstykkePolygon: mockSetCachedJordstykkePolygon,
}));

const { MatGeometryService } = await import("./geometry");

// 100×100 m square in UTM32 — area = 10 000 m²
const SQUARE_FC: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [724000, 6172000],
            [724100, 6172000],
            [724100, 6172100],
            [724000, 6172100],
            [724000, 6172000],
          ],
        ],
      },
      properties: { id_lokalId: "mat-js-abc123", matrikelnummer: "48a" },
    },
  ],
};

describe("MatGeometryService.getParcelGeometry", () => {
  beforeEach(() => {
    mockFetchParcelGeometry.mockReset();
    mockSetCachedJordstykkePolygon.mockReset();
  });

  it("returnerer metrics for normal parcel (ét feature)", async () => {
    mockFetchParcelGeometry.mockResolvedValue({ featureCollection: SQUARE_FC, source: "wfs" });

    const result = await MatGeometryService.getParcelGeometry("mat-js-abc123", 9800);

    expect(result.status).toBe("ok");
    expect(result.data).not.toBeNull();
    expect(result.data!.polygonAreaM2).toBeCloseTo(10000, 0);
    expect(result.data!.registreretArealM2).toBe(9800);
    expect(result.data!.areaDiscrepancyM2).toBeCloseTo(200, 0);
    expect(result.data!.centroidLat).toBeGreaterThan(55);
    expect(result.data!.bbox25832).not.toBeNull();
    expect(result.data!.featureCount).toBe(1);
    expect(result.data!.hasCanonicalPolygon).toBe(true);
    expect(result.kilde).toBe("mat_wfs");
    expect(result.rawFeatureCount).toBe(1);
  });

  it("returnerer confidence=missing når WFS returnerer ingen features", async () => {
    mockFetchParcelGeometry.mockResolvedValue({ featureCollection: null, source: "notfound" });

    const result = await MatGeometryService.getParcelGeometry("ukendt-id", null);

    expect(result.status).toBe("ok");
    expect(result.confidence).toBe("missing");
    expect(result.data!.hasCanonicalPolygon).toBe(false);
    expect(result.data!.polygonAreaM2).toBeNull();
    expect(result.rawFeatureCount).toBe(0);
  });

  it("returnerer status=error når WFS kaster exception", async () => {
    mockFetchParcelGeometry.mockRejectedValue(new Error("WFS timeout"));

    const result = await MatGeometryService.getParcelGeometry("any-id", null);

    expect(result.status).toBe("error");
    expect(result.data).toBeNull();
  });

  it("persisterer parcelpolygon i cache når addressId er sat (P0/P1 #6)", async () => {
    mockFetchParcelGeometry.mockResolvedValue({ featureCollection: SQUARE_FC, source: "wfs" });

    await MatGeometryService.getParcelGeometry("mat-js-abc123", 9800, "addr-001");

    expect(mockSetCachedJordstykkePolygon).toHaveBeenCalledTimes(1);
    expect(mockSetCachedJordstykkePolygon.mock.calls[0]?.[0]).toBe("addr-001");
  });

  it("springer cache-write over når addressId mangler", async () => {
    mockFetchParcelGeometry.mockResolvedValue({ featureCollection: SQUARE_FC, source: "wfs" });

    await MatGeometryService.getParcelGeometry("mat-js-abc123", 9800);

    expect(mockSetCachedJordstykkePolygon).not.toHaveBeenCalled();
  });

  it("hasCanonicalPolygon=false når WFS returnerer flere features", async () => {
    const multiFC: GeoJSON.FeatureCollection = {
      ...SQUARE_FC,
      features: [SQUARE_FC.features[0]!, SQUARE_FC.features[0]!],
    };
    mockFetchParcelGeometry.mockResolvedValue({ featureCollection: multiFC, source: "wfs" });

    const result = await MatGeometryService.getParcelGeometry("any-id", null);

    expect(result.data!.hasCanonicalPolygon).toBe(false);
    expect(result.data!.featureCount).toBe(2);
  });
});
