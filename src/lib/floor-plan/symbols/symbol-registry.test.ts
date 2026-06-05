// src/lib/floor-plan/symbols/symbol-registry.test.ts
//
// Unit tests for the symbol registry (Tier 1 — pure domain, no network/DOM).

import { describe, expect, it, test } from "bun:test";
import { getSymbol } from "./symbol-registry";

describe("getSymbol", () => {
  test('getSymbol("toilet") returns non-empty paths', () => {
    const sym = getSymbol("toilet");
    expect(sym.kind).toBe("toilet");
    expect(sym.paths.length).toBeGreaterThan(0);
    for (const p of sym.paths) {
      expect(typeof p).toBe("string");
      expect(p.length).toBeGreaterThan(0);
    }
  });

  test('getSymbol("toilet") has correct default dimensions', () => {
    const sym = getSymbol("toilet");
    expect(sym.defaultWidthM).toBeCloseTo(0.38, 5);
    expect(sym.defaultHeightM).toBeCloseTo(0.68, 5);
  });

  test('getSymbol("door", 0.9, 2.1) returns paths including a swing arc', () => {
    const sym = getSymbol("door", 0.9, 2.1);
    expect(sym.paths.length).toBeGreaterThanOrEqual(2);
    // Arc path must contain an "A" command for the quarter-circle swing
    const hasArc = sym.paths.some((p) => p.includes("A"));
    expect(hasArc).toBe(true);
  });

  test('getSymbol("door_right") produces a right-swing arc', () => {
    const sym = getSymbol("door_right", 0.9);
    const hasArc = sym.paths.some((p) => p.includes("A"));
    expect(hasArc).toBe(true);
  });

  test('getSymbol("window", 1.2) returns exactly 5 path elements (3 lines + 2 caps)', () => {
    const sym = getSymbol("window", 1.2);
    expect(sym.paths.length).toBe(5);
  });

  test('getSymbol("window") paths represent 3 parallel horizontal lines', () => {
    const sym = getSymbol("window", 1.0, 0.12);
    // Paths: outer, glass, inner, capLeft, capRight
    // outer: M-0.5,-0.06 L0.5,-0.06   (y = -hd)
    // glass: M-0.5,0     L0.5,0        (y = 0)
    // inner: M-0.5,0.06  L0.5,0.06    (y = +hd)
    const [outer, glass, inner] = sym.paths;
    expect(outer).toBeDefined();
    expect(glass).toBeDefined();
    expect(inner).toBeDefined();
    // Each of the first 3 paths should be a single horizontal line (M...L...)
    for (const p of [outer!, glass!, inner!]) {
      expect(p).toMatch(/^M/);
      expect(p).toContain("L");
    }
  });

  test('getSymbol("single_bed") has correct default dimensions (~0.9×2.0m)', () => {
    const sym = getSymbol("single_bed");
    expect(sym.defaultWidthM).toBeCloseTo(0.9, 5);
    expect(sym.defaultHeightM).toBeCloseTo(2.0, 5);
  });

  test('getSymbol("single_bed") returns non-empty paths with a pillow oval', () => {
    const sym = getSymbol("single_bed");
    expect(sym.paths.length).toBeGreaterThanOrEqual(2);
    // Pillow is an ellipse arc — must contain "A"
    const hasPillow = sym.paths.some((p) => p.includes("A"));
    expect(hasPillow).toBe(true);
  });

  test('getSymbol("double_bed") returns two pillow ovals', () => {
    const sym = getSymbol("double_bed");
    // outer rect + 2 pillows = at least 3 paths
    expect(sym.paths.length).toBeGreaterThanOrEqual(3);
  });

  test('getSymbol("shower") returns outer square and two diagonal lines', () => {
    const sym = getSymbol("shower");
    expect(sym.paths.length).toBe(3);
  });

  test('getSymbol("bathtub") has default 1.7×0.8m dimensions', () => {
    const sym = getSymbol("bathtub");
    expect(sym.defaultWidthM).toBeCloseTo(1.7, 5);
    expect(sym.defaultHeightM).toBeCloseTo(0.8, 5);
  });

  test('getSymbol("kitchen_sink") returns double-bowl paths', () => {
    const sym = getSymbol("kitchen_sink");
    // outer + bowl1 + bowl2 = 3 paths
    expect(sym.paths.length).toBe(3);
  });

  test('getSymbol("sofa") has correct default dimensions (2.0×0.9m)', () => {
    const sym = getSymbol("sofa");
    expect(sym.defaultWidthM).toBeCloseTo(2.0, 5);
    expect(sym.defaultHeightM).toBeCloseTo(0.9, 5);
  });

  test('getSymbol("wardrobe_shelf") returns outer rect and shelf hatch lines', () => {
    const sym = getSymbol("wardrobe_shelf");
    // outer + 3 diagonal lines = 4 paths
    expect(sym.paths.length).toBe(4);
  });

  test('getSymbol("chair") returns a circular path', () => {
    const sym = getSymbol("chair");
    expect(sym.paths.length).toBe(1);
    expect(sym.paths[0]).toContain("A");
  });

  test('getSymbol("sliding_door") returns overlapping-panel paths', () => {
    const sym = getSymbol("sliding_door", 1.2);
    // left panel + right panel + leftArrow + rightArrow = 4 paths
    expect(sym.paths.length).toBe(4);
  });

  test('getSymbol("garage_door") returns outer rect and panel lines', () => {
    const sym = getSymbol("garage_door");
    // outer + 3 panel lines = 4 paths
    expect(sym.paths.length).toBe(4);
  });

  test("all paths for all kinds are non-empty strings", () => {
    const kinds = [
      "toilet",
      "washbasin",
      "shower",
      "bathtub",
      "kitchen_unit",
      "kitchen_island",
      "kitchen_sink",
      "appliance",
      "single_bed",
      "double_bed",
      "sofa",
      "armchair",
      "dining_table",
      "chair",
      "wardrobe_shelf",
      "door",
      "door_left",
      "door_right",
      "sliding_door",
      "window",
      "garage_door",
    ] as const;
    for (const kind of kinds) {
      const sym = getSymbol(kind);
      expect(sym.paths.length).toBeGreaterThan(0);
      for (const p of sym.paths) {
        expect(p.length).toBeGreaterThan(0);
      }
    }
  });

  test("widthM/heightM overrides are reflected in the returned dimensions", () => {
    const sym = getSymbol("single_bed", 1.0, 2.1);
    expect(sym.defaultWidthM).toBeCloseTo(1.0, 5);
    expect(sym.defaultHeightM).toBeCloseTo(2.1, 5);
  });
});

describe("nye symboler", () => {
  for (const kind of ["vehicle", "plant", "outdoor_lounge", "wardrobe_walkin"] as const) {
    it(`returnerer paths for ${kind}`, () => {
      expect(getSymbol(kind).paths.length).toBeGreaterThan(0);
    });
  }
});
