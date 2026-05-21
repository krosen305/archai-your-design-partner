// src/lib/parcel-geometry.test.ts
import { describe, it, expect } from "bun:test";
import {
  computeFootprintAreaM2,
  computeMinDistanceToBoundaryM,
  computeOutsideParcelAreaM2,
} from "./parcel-geometry";

type Ring = [number, number][];

const SQUARE_10x10: Ring = [
  [0, 0], [0.0001, 0], [0.0001, 0.0001], [0, 0.0001], [0, 0],
];

const SQUARE_5x5: Ring = [
  [0, 0], [0.00005, 0], [0.00005, 0.00005], [0, 0.00005], [0, 0],
];

describe("computeFootprintAreaM2", () => {
  it("returns null for empty ring", () => {
    expect(computeFootprintAreaM2([])).toBeNull();
  });
  it("returns positive area for a polygon ring", () => {
    const area = computeFootprintAreaM2(SQUARE_10x10);
    expect(area).not.toBeNull();
    expect(area!).toBeGreaterThan(0);
  });
});

describe("computeMinDistanceToBoundaryM", () => {
  it("returns null for empty boundary", () => {
    expect(computeMinDistanceToBoundaryM([10, 56], [])).toBeNull();
  });
  it("returns positive distance for point inside polygon", () => {
    const center: [number, number] = [0.00005, 0.00005];
    const dist = computeMinDistanceToBoundaryM(center, SQUARE_10x10);
    expect(dist).not.toBeNull();
    expect(dist!).toBeGreaterThan(0);
  });
});

describe("computeOutsideParcelAreaM2", () => {
  it("returns 0 when footprint bbox is inside parcel bbox", () => {
    const outside = computeOutsideParcelAreaM2(SQUARE_5x5, SQUARE_10x10);
    expect(outside).toBe(0);
  });
  it("returns null for empty inputs", () => {
    expect(computeOutsideParcelAreaM2([], SQUARE_10x10)).toBeNull();
    expect(computeOutsideParcelAreaM2(SQUARE_10x10, [])).toBeNull();
  });
});
