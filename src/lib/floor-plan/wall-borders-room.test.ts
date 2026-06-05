import { describe, expect, it } from "bun:test";
import { wallBordersRoom } from "./editor-hit-testing";
import type { Wall } from "@/domain/floor-plan/floor-plan.types";
import type { Polygon2D } from "@/domain/geometry/geometry-2d.types";

function wall(start: [number, number], end: [number, number]): Wall {
  return {
    id: "w",
    levelId: "level_0",
    centerline: { start: { x: start[0], y: start[1] }, end: { x: end[0], y: end[1] } },
    thicknessM: 0.1,
    heightM: 2.5,
    wallKind: "interior",
    structuralRole: "non_bearing",
    fireRole: "none",
    assemblyId: null,
    locked: false,
    source: { source: "generated", confidence: "medium", fetchedAt: null, requiresReview: false },
  };
}

// A 4x4 room in the lower-left quadrant of an 8x4 footprint.
const room: Polygon2D = {
  vertices: [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 4 },
    { x: 0, y: 4 },
  ],
};

describe("wallBordersRoom", () => {
  it("returnerer true for en væg der ligger på rummets højre kant", () => {
    expect(wallBordersRoom(wall([4, 0], [4, 4]), room)).toBe(true);
  });

  it("returnerer false for en væg langt fra rummet (anden partition)", () => {
    // A partition at x=8 (the far side of the building) does not border this room.
    expect(wallBordersRoom(wall([8, 0], [8, 4]), room)).toBe(false);
  });

  it("returnerer true for rummets bund-kant", () => {
    expect(wallBordersRoom(wall([0, 0], [4, 0]), room)).toBe(true);
  });
});
