import { describe, it, expect } from "bun:test";
import {
  computePolygonAreaM2,
  computeCentroidUtm32,
  computeBbox25832,
  minDistanceToBoundaryM,
  utm32ToWgs84,
} from "./geometry-utils";
import type * as GeoJSON from "geojson";

// 100×100 m square in UTM32 near Copenhagen — area = 10 000 m²
const SQUARE: GeoJSON.Polygon = {
  type: "Polygon",
  coordinates: [[[724000, 6172000],[724100, 6172000],[724100, 6172100],[724000, 6172100],[724000, 6172000]]],
};

// Square with a 10×10 m hole → area = 9 900 m²
const SQUARE_WITH_HOLE: GeoJSON.Polygon = {
  type: "Polygon",
  coordinates: [
    [[724000, 6172000],[724100, 6172000],[724100, 6172100],[724000, 6172100],[724000, 6172000]],
    [[724045, 6172045],[724055, 6172045],[724055, 6172055],[724045, 6172055],[724045, 6172045]],
  ],
};

describe("computePolygonAreaM2", () => {
  it("beregner areal for 100×100 m kvadrat", () => {
    expect(computePolygonAreaM2(SQUARE)).toBeCloseTo(10000, 0);
  });
  it("trækker hul fra ydre ring", () => {
    expect(computePolygonAreaM2(SQUARE_WITH_HOLE)).toBeCloseTo(9900, 0);
  });
  it("returnerer null for tom polygon", () => {
    const empty: GeoJSON.Polygon = { type: "Polygon", coordinates: [] };
    expect(computePolygonAreaM2(empty)).toBeNull();
  });
  it("håndterer MultiPolygon", () => {
    const mp: GeoJSON.MultiPolygon = { type: "MultiPolygon", coordinates: [SQUARE.coordinates, SQUARE.coordinates] };
    expect(computePolygonAreaM2(mp)).toBeCloseTo(20000, 0);
  });
});

describe("computeCentroidUtm32", () => {
  it("beregner centroid for kvadrat til midtpunkt", () => {
    const c = computeCentroidUtm32(SQUARE);
    expect(c).not.toBeNull();
    expect(c![0]).toBeCloseTo(724050, 0);
    expect(c![1]).toBeCloseTo(6172050, 0);
  });
  it("returnerer null for tom polygon", () => {
    const empty: GeoJSON.Polygon = { type: "Polygon", coordinates: [] };
    expect(computeCentroidUtm32(empty)).toBeNull();
  });
});

describe("computeBbox25832", () => {
  it("beregner korrekt bounding box for kvadrat", () => {
    expect(computeBbox25832(SQUARE)).toEqual([724000, 6172000, 724100, 6172100]);
  });
});

describe("minDistanceToBoundaryM", () => {
  it("centroid af kvadrat er 50 m fra alle sider", () => {
    const dist = minDistanceToBoundaryM([724050, 6172050], SQUARE);
    expect(dist).toBeCloseTo(50, 1);
  });
  it("hjørne af kvadrat er 0 m fra grænsen", () => {
    const dist = minDistanceToBoundaryM([724000, 6172000], SQUARE);
    expect(dist).toBeCloseTo(0, 1);
  });
});

describe("utm32ToWgs84", () => {
  it("konverterer UTM32 koordinater til WGS84 nær København", () => {
    const { lat, lng } = utm32ToWgs84(724050, 6172050);
    expect(lat).toBeGreaterThan(55);
    expect(lat).toBeLessThan(57);
    expect(lng).toBeGreaterThan(9);
    expect(lng).toBeLessThan(16);
  });
});
