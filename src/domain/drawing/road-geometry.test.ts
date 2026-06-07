import { describe, expect, it } from "bun:test";
import type {
  GeoJsonLineString25832,
  GeoJsonPolygon25832,
} from "@/domain/drawing/beliggenhedsplan.types";
import {
  assessRoadGeometryQuality,
  calculateRoadWidthM,
  selectRelevantRoadCenterline,
  selectRelevantRoadEdges,
} from "./road-geometry";

const parcel: GeoJsonPolygon25832 = {
  type: "Polygon",
  crs: "EPSG:25832",
  coordinates: [
    [
      [0, 0],
      [20, 0],
      [20, 20],
      [0, 20],
      [0, 0],
    ],
  ],
};

function line(y: number, minX = 0, maxX = 20): GeoJsonLineString25832 {
  return {
    type: "LineString",
    crs: "EPSG:25832",
    coordinates: [
      [minX, y],
      [maxX, y],
    ],
  };
}

describe("road geometry helpers", () => {
  it("selects the nearest centerline to the parcel", () => {
    const nearest = line(-6);
    const selected = selectRelevantRoadCenterline([line(80), nearest], parcel);

    expect(selected).toBe(nearest);
  });

  it("selects relevant road edges around the chosen centerline", () => {
    const centerline = line(-6);
    const edges = selectRelevantRoadEdges([line(-9), line(-3), line(120)], parcel, centerline);

    expect(edges).toHaveLength(2);
    expect(edges[0]?.coordinates[0]?.[1]).toBe(-9);
    expect(edges[1]?.coordinates[0]?.[1]).toBe(-3);
  });

  it("calculates road width from one edge on each side of the centerline", () => {
    expect(calculateRoadWidthM(line(-6), [line(-9), line(-3)])).toBe(6);
  });

  it("uses a median road width across the centerline instead of a single midpoint", () => {
    const centerline: GeoJsonLineString25832 = {
      type: "LineString",
      crs: "EPSG:25832",
      coordinates: [
        [0, -6],
        [100, -6],
      ],
    };
    const northEdge: GeoJsonLineString25832 = {
      type: "LineString",
      crs: "EPSG:25832",
      coordinates: [
        [0, -3],
        [50, -2],
        [100, -3],
      ],
    };
    const southEdge = line(-9, 0, 100);

    expect(calculateRoadWidthM(centerline, [northEdge, southEdge])).toBe(6.5);
  });

  it("returns null when sampled road widths vary too much for a reliable width", () => {
    const centerline: GeoJsonLineString25832 = {
      type: "LineString",
      crs: "EPSG:25832",
      coordinates: [
        [0, -6],
        [100, -6],
      ],
    };
    const wideningEdge: GeoJsonLineString25832 = {
      type: "LineString",
      crs: "EPSG:25832",
      coordinates: [
        [0, -9],
        [50, -9],
        [100, -18],
      ],
    };

    expect(calculateRoadWidthM(centerline, [wideningEdge, line(-3, 0, 100)])).toBeNull();
  });

  it("returns null when only one side of the road edge is available", () => {
    expect(calculateRoadWidthM(line(-6), [line(-9), line(-10)])).toBeNull();
  });

  it("returns null when centerline is missing", () => {
    expect(calculateRoadWidthM(null, [line(-9), line(-3)])).toBeNull();
  });

  it("marks road geometry for review when width cannot be calculated from edges", () => {
    const quality = assessRoadGeometryQuality(line(-6), [line(-9), line(-10)], null);

    expect(quality.confidence).toBe("low");
    expect(quality.requiresReview).toBe(true);
    expect(quality.reviewReasons).toContain("geodanmark.road_width_uncertain");
  });
});
