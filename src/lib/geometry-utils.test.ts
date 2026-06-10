import { describe, it, expect } from "bun:test";
import {
  computePolygonAreaM2,
  computeCentroidUtm32,
  computeBbox25832,
  minDistanceToBoundaryM,
  utm32ToWgs84,
  wgs84ToUtm32,
  polygonToPolygonDistanceM,
  polygonToLineStringDistanceM,
  gridConvergenceDeg,
  northUpRotationDeg,
} from "./geometry-utils";
import type * as GeoJSON from "geojson";

// 100×100 m square in UTM32 near Copenhagen — area = 10 000 m²
const SQUARE: GeoJSON.Polygon = {
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
};

// Square with a 10×10 m hole → area = 9 900 m²
const SQUARE_WITH_HOLE: GeoJSON.Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [724000, 6172000],
      [724100, 6172000],
      [724100, 6172100],
      [724000, 6172100],
      [724000, 6172000],
    ],
    [
      [724045, 6172045],
      [724055, 6172045],
      [724055, 6172055],
      [724045, 6172055],
      [724045, 6172045],
    ],
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
    const mp: GeoJSON.MultiPolygon = {
      type: "MultiPolygon",
      coordinates: [SQUARE.coordinates, SQUARE.coordinates],
    };
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

describe("wgs84ToUtm32", () => {
  it("konverterer WGS84 koordinater til UTM32 nær København", () => {
    const { x, y } = wgs84ToUtm32(55.6761, 12.5683);
    expect(x).toBeGreaterThan(300000);
    expect(x).toBeLessThan(900000);
    expect(y).toBeGreaterThan(6000000);
    expect(y).toBeLessThan(6400000);
  });
});

describe("polygonToPolygonDistanceM", () => {
  const squareAt = (x: number, y: number, size: number): GeoJSON.Polygon => ({
    type: "Polygon",
    coordinates: [
      [
        [x, y],
        [x + size, y],
        [x + size, y + size],
        [x, y + size],
        [x, y],
      ],
    ],
  });

  it("returnerer 0 for overlappende polygoner", () => {
    const a = squareAt(0, 0, 10);
    const b = squareAt(5, 5, 10);
    expect(polygonToPolygonDistanceM(a, b)).toBe(0);
  });

  it("returnerer korrekt afstand for polygoner med 10m mellemrum", () => {
    const a = squareAt(0, 0, 10);
    const b = squareAt(20, 0, 10);
    const dist = polygonToPolygonDistanceM(a, b);
    expect(dist).not.toBeNull();
    expect(Math.abs(dist! - 10)).toBeLessThan(0.01);
  });

  it("returnerer null for tomme polygoner", () => {
    const empty: GeoJSON.Polygon = { type: "Polygon", coordinates: [[]] };
    const b = squareAt(0, 0, 10);
    expect(polygonToPolygonDistanceM(empty, b)).toBeNull();
  });
});

describe("polygonToLineStringDistanceM", () => {
  const squareAt = (x: number, y: number, size: number): GeoJSON.Polygon => ({
    type: "Polygon",
    coordinates: [
      [
        [x, y],
        [x + size, y],
        [x + size, y + size],
        [x, y + size],
        [x, y],
      ],
    ],
  });

  it("returnerer 0 for linje der krydser polygon", () => {
    const polygon = squareAt(0, 0, 10);
    const line: GeoJSON.LineString = {
      type: "LineString",
      coordinates: [
        [-5, 5],
        [15, 5],
      ],
    };
    expect(polygonToLineStringDistanceM(polygon, line)).toBe(0);
  });

  it("returnerer korrekt afstand til naermeste vejmidte", () => {
    const polygon = squareAt(0, 0, 10);
    const line: GeoJSON.LineString = {
      type: "LineString",
      coordinates: [
        [15, -5],
        [15, 15],
      ],
    };
    expect(polygonToLineStringDistanceM(polygon, line)).toBeCloseTo(5, 3);
  });

  it("haandterer MultiLineString", () => {
    const polygon = squareAt(0, 0, 10);
    const lines: GeoJSON.MultiLineString = {
      type: "MultiLineString",
      coordinates: [
        [
          [30, 0],
          [30, 10],
        ],
        [
          [12, 0],
          [12, 10],
        ],
      ],
    };
    expect(polygonToLineStringDistanceM(polygon, lines)).toBeCloseTo(2, 3);
  });
});

describe("gridConvergenceDeg (UTM32N)", () => {
  it("is ~0 on the central meridian (9°E)", () => {
    expect(Math.abs(gridConvergenceDeg(56.0, 9.0))).toBeLessThan(0.05);
  });
  it("is positive east of 9°E (e.g. København ~+2.9°)", () => {
    const g = gridConvergenceDeg(55.68, 12.57);
    expect(g).toBeGreaterThan(2.5);
    expect(g).toBeLessThan(3.4);
  });
  it("is negative west of 9°E (e.g. Esbjerg ~-0.45°)", () => {
    expect(gridConvergenceDeg(55.47, 8.45)).toBeLessThan(0);
  });
});

describe("northUpRotationDeg", () => {
  it("rotates a grid-north-up drawing so true north points up", () => {
    // København centroid in 25832
    const { x, y } = wgs84ToUtm32(55.68, 12.57);
    const rot = northUpRotationDeg(x, y);
    // Equal in magnitude to the convergence at that point.
    expect(Math.abs(rot)).toBeGreaterThan(2.5);
    expect(Math.abs(rot)).toBeLessThan(3.4);
  });
  it("is ~0 on the central meridian", () => {
    const { x, y } = wgs84ToUtm32(56.0, 9.0);
    expect(Math.abs(northUpRotationDeg(x, y))).toBeLessThan(0.05);
  });
});
