import { describe, expect, test } from "bun:test";
import type { FloorLevel, Wall } from "@/domain/floor-plan/floor-plan.types";
import { snapDelta, snapOpeningOffset, snapPoint, snapPointToGrid, snapValue } from "./snap-engine";

const source = {
  source: "generated",
  confidence: "medium",
  fetchedAt: null,
  requiresReview: false,
} as const;

function wall(id: string, start: [number, number], end: [number, number]): Wall {
  return {
    id,
    levelId: "level_0",
    centerline: { start: { x: start[0], y: start[1] }, end: { x: end[0], y: end[1] } },
    thicknessM: 0.12,
    heightM: 2.4,
    wallKind: "interior",
    structuralRole: "non_bearing",
    fireRole: "none",
    assemblyId: null,
    locked: false,
    source,
  };
}

function level(): FloorLevel {
  return {
    id: "level_0",
    name: "Stueplan",
    levelIndex: 0,
    elevationM: 0,
    floorToFloorHeightM: null,
    walls: [wall("vertical", [2, 0], [2, 4]), wall("horizontal", [0, 3], [6, 3])],
    rooms: [],
    openings: [],
    fixtures: [],
    stairs: [],
    annotations: [],
  };
}

describe("snap engine", () => {
  test("snaps scalar and point values to grid", () => {
    expect(snapValue(1.26, 0.1)).toBe(1.3);
    expect(snapDelta(-0.24, 0.1)).toBe(-0.2);
    expect(snapPointToGrid({ x: 1.24, y: -0.04 }, 0.1)).toEqual({ x: 1.2, y: 0 });
  });

  test("prefers a nearby endpoint over grid", () => {
    const result = snapPoint({ x: 2.04, y: 0.03 }, level(), { toleranceM: 0.12 });

    expect(result.point).toEqual({ x: 2, y: 0 });
    expect(result.candidates.some((candidate) => candidate.kind === "wall_endpoint")).toBe(true);
  });

  test("snaps to wall axis when close", () => {
    const result = snapPoint({ x: 2.06, y: 2.2 }, level(), {
      toleranceM: 0.1,
      includeGrid: false,
    });

    expect(result.point).toEqual({ x: 2, y: 2.2 });
  });

  test("clamps opening offsets inside parent wall", () => {
    const host = wall("host", [0, 0], [4, 0]);

    expect(snapOpeningOffset(0.1, host, 1)).toBe(0.5);
    expect(snapOpeningOffset(3.9, host, 1)).toBe(3.5);
    expect(snapOpeningOffset(2.04, host, 1)).toBe(2);
  });
});
