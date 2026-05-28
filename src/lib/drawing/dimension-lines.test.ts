import { describe, it, expect } from "bun:test";
import { buildDimensionLines } from "./dimension-lines";
import type { GeoJsonPolygon25832 } from "@/domain/drawing/beliggenhedsplan.types";

const rect15x10: GeoJsonPolygon25832 = {
  type: "Polygon",
  crs: "EPSG:25832",
  coordinates: [
    [
      [720000, 6170000],
      [720015, 6170000],
      [720015, 6170010],
      [720000, 6170010],
      [720000, 6170000],
    ],
  ],
};

describe("buildDimensionLines", () => {
  it("returnerer 4 dimensionslinjer for rektangel", () => {
    const lines = buildDimensionLines(rect15x10);
    expect(lines).toHaveLength(4);
  });

  it("to sider er ~15m og to er ~10m", () => {
    const lines = buildDimensionLines(rect15x10);
    const lengths = lines.map((l) => l.labelM).sort((a, b) => a - b);
    expect(lengths[0]).toBeCloseTo(10, 1);
    expect(lengths[1]).toBeCloseTo(10, 1);
    expect(lengths[2]).toBeCloseTo(15, 1);
    expect(lengths[3]).toBeCloseTo(15, 1);
  });

  it("alle fromPoint og toPoint er EPSG:25832", () => {
    const lines = buildDimensionLines(rect15x10);
    expect(lines.every((l) => l.fromPoint.crs === "EPSG:25832")).toBe(true);
    expect(lines.every((l) => l.toPoint.crs === "EPSG:25832")).toBe(true);
  });

  it("returnerer tom liste for polygon med færre end 3 punkter", () => {
    const bad: GeoJsonPolygon25832 = {
      type: "Polygon",
      crs: "EPSG:25832",
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [0, 0],
        ],
      ],
    };
    expect(buildDimensionLines(bad)).toHaveLength(0);
  });
});
