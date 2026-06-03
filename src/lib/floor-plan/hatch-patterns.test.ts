// src/lib/floor-plan/hatch-patterns.test.ts

import { describe, test, expect } from "bun:test";
import { buildHatchPaths } from "./hatch-patterns";

describe("buildHatchPaths", () => {
  const squarePoly = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 3 },
    { x: 0, y: 3 },
  ];

  test("none pattern returns empty array", () => {
    expect(buildHatchPaths({ polygon: squarePoly, pattern: "none" })).toEqual([]);
  });

  test("diagonal pattern returns at least one path for a 4x3 square", () => {
    const paths = buildHatchPaths({ polygon: squarePoly, pattern: "diagonal" });
    expect(paths.length).toBeGreaterThan(1);
  });

  test("each diagonal path is a valid M...L... SVG path string", () => {
    const paths = buildHatchPaths({ polygon: squarePoly, pattern: "diagonal" });
    for (const p of paths) {
      expect(p).toMatch(/^M\s+[\d.-]+,[\d.-]+\s+L\s+[\d.-]+,[\d.-]+$/);
    }
  });

  test("cross_hatch returns approximately double diagonal paths", () => {
    const diag = buildHatchPaths({ polygon: squarePoly, pattern: "diagonal" });
    const cross = buildHatchPaths({ polygon: squarePoly, pattern: "cross_hatch" });
    expect(cross.length).toBeGreaterThanOrEqual(diag.length * 1.5);
  });

  test("terrace_deck returns paths (horizontal lines at 0°)", () => {
    const paths = buildHatchPaths({ polygon: squarePoly, pattern: "terrace_deck" });
    expect(paths.length).toBeGreaterThan(0);
  });

  test("returns empty for polygon with fewer than 3 vertices", () => {
    expect(
      buildHatchPaths({
        polygon: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ],
        pattern: "diagonal",
      }),
    ).toEqual([]);
  });

  test("custom spacing produces fewer lines than default spacing", () => {
    const dense = buildHatchPaths({ polygon: squarePoly, pattern: "diagonal", spacingM: 0.2 });
    const sparse = buildHatchPaths({ polygon: squarePoly, pattern: "diagonal", spacingM: 1.0 });
    expect(dense.length).toBeGreaterThan(sparse.length);
  });
});
