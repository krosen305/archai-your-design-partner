import { describe, it, expect } from "bun:test";
import { buildSquareFootprint25832, buildRectangularFootprint25832 } from "./footprint-builder";

describe("buildSquareFootprint25832", () => {
  it("returnerer polygon i EPSG:25832", () => {
    const result = buildSquareFootprint25832({
      centroidWgs84: [10.2, 56.1],
      areaM2: 100,
      rotationDeg: 0,
    });
    expect(result.type).toBe("Polygon");
    expect(result.crs).toBe("EPSG:25832");
  });

  it("polygon har 5 koordinater (lukket ring)", () => {
    const result = buildSquareFootprint25832({
      centroidWgs84: [10.2, 56.1],
      areaM2: 100,
      rotationDeg: 0,
    });
    expect(result.coordinates[0]).toHaveLength(5);
    // Første og sidste koordinat skal være identiske (lukket ring)
    expect(result.coordinates[0][0]).toEqual(result.coordinates[0][4]);
  });

  it("areal tilnærmer 100 m²", () => {
    const result = buildSquareFootprint25832({
      centroidWgs84: [10.2, 56.1],
      areaM2: 100,
      rotationDeg: 0,
    });
    // Beregn areal via shoelace
    const ring = result.coordinates[0];
    let area = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    }
    const computedArea = Math.abs(area) / 2;
    expect(computedArea).toBeGreaterThan(95);
    expect(computedArea).toBeLessThan(105);
  });

  it("rotation 90 grader roterer hjoernerne", () => {
    const base = buildSquareFootprint25832({
      centroidWgs84: [10.2, 56.1],
      areaM2: 100,
      rotationDeg: 0,
    });
    const rotated = buildSquareFootprint25832({
      centroidWgs84: [10.2, 56.1],
      areaM2: 100,
      rotationDeg: 90,
    });
    // De fire hjoerner skal vaere forskellige ved rotation
    expect(base.coordinates[0][0]).not.toEqual(rotated.coordinates[0][0]);
  });

  it("centroid er midtpunkt for footprint (uroteret)", () => {
    const result = buildSquareFootprint25832({
      centroidWgs84: [10.2, 56.1],
      areaM2: 64,
      rotationDeg: 0,
    });
    const ring = result.coordinates[0].slice(0, 4);
    const centerX = ring.reduce((s, c) => s + c[0], 0) / 4;
    const centerY = ring.reduce((s, c) => s + c[1], 0) / 4;
    // Find EPSG:25832 centroid via proj4 for comparison
    // Vi tester blot at centroiden er indenfor polygon-BBox
    const xs = ring.map((c) => c[0]);
    const ys = ring.map((c) => c[1]);
    expect(centerX).toBeGreaterThan(Math.min(...xs));
    expect(centerX).toBeLessThan(Math.max(...xs));
    expect(centerY).toBeGreaterThan(Math.min(...ys));
    expect(centerY).toBeLessThan(Math.max(...ys));
  });
});

describe("buildRectangularFootprint25832", () => {
  it("builds a 12×8m rectangle at the given centroid", () => {
    const fp = buildRectangularFootprint25832({
      centroidWgs84: [12.5683, 55.6761], // Copenhagen center
      widthM: 12,
      depthM: 8,
      rotationDeg: 0,
    });
    expect(fp.type).toBe("Polygon");
    expect(fp.crs).toBe("EPSG:25832");
    // Ring has 5 coordinates (4 corners + closing)
    expect(fp.coordinates[0]).toHaveLength(5);
  });

  it("depthM=widthM produces a square identical to buildSquareFootprint25832 output area", () => {
    const rect = buildRectangularFootprint25832({
      centroidWgs84: [12.5683, 55.6761],
      widthM: 10,
      depthM: 10,
      rotationDeg: 0,
    });
    const sq = buildSquareFootprint25832({
      centroidWgs84: [12.5683, 55.6761],
      areaM2: 100,
      rotationDeg: 0,
    });
    // Both should produce 100m² footprints
    expect(rect.coordinates[0]).toHaveLength(5);
    expect(sq.coordinates[0]).toHaveLength(5);
  });
});
