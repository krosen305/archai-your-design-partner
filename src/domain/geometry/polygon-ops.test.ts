import { describe, expect, test } from "bun:test";
import type { Polygon2D } from "./geometry-2d.types";
import {
  lineLengthM,
  pointInPolygon,
  polygonAreaM2,
  polygonCentroid,
  polygonPerimeterM,
  polygonSignedAreaM2,
} from "./polygon-ops";

// A 4m x 3m axis-aligned rectangle (counter-clockwise), no repeated last point.
const rect: Polygon2D = {
  vertices: [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 3 },
    { x: 0, y: 3 },
  ],
};

describe("polygonAreaM2", () => {
  test("computes area of a rectangle", () => {
    expect(polygonAreaM2(rect)).toBeCloseTo(12, 6);
  });

  test("is sign-independent of winding order", () => {
    const reversed: Polygon2D = { vertices: [...rect.vertices].reverse() };
    expect(polygonAreaM2(reversed)).toBeCloseTo(12, 6);
  });

  test("degenerate polygon has zero area", () => {
    expect(
      polygonAreaM2({
        vertices: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
      }),
    ).toBeCloseTo(0, 6);
  });
});

describe("polygonPerimeterM", () => {
  test("sums the closed-ring segment lengths", () => {
    expect(polygonPerimeterM(rect)).toBeCloseTo(14, 6);
  });
});

describe("pointInPolygon", () => {
  test("interior point is inside", () => {
    expect(pointInPolygon({ x: 2, y: 1.5 }, rect)).toBe(true);
  });

  test("exterior point is outside", () => {
    expect(pointInPolygon({ x: 5, y: 1.5 }, rect)).toBe(false);
  });
});

describe("lineLengthM", () => {
  test("computes euclidean length", () => {
    expect(lineLengthM({ start: { x: 0, y: 0 }, end: { x: 3, y: 4 } })).toBeCloseTo(5, 6);
  });
});

describe("polygonSignedAreaM2", () => {
  test("is positive for counter-clockwise winding", () => {
    expect(polygonSignedAreaM2(rect)).toBeCloseTo(12, 6);
  });

  test("is negative for clockwise winding", () => {
    const cw: Polygon2D = { vertices: [...rect.vertices].reverse() };
    expect(polygonSignedAreaM2(cw)).toBeCloseTo(-12, 6);
  });
});

describe("polygonCentroid", () => {
  test("computes the area centroid of a rectangle", () => {
    const c = polygonCentroid(rect);
    expect(c.x).toBeCloseTo(2, 6);
    expect(c.y).toBeCloseTo(1.5, 6);
  });
});
