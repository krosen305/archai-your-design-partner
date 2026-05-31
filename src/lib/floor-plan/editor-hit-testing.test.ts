import { describe, expect, test } from "bun:test";
import type { FloorLevel } from "@/domain/floor-plan/floor-plan.types";
import {
  findRoomAtPoint,
  nearestWall,
  offsetAlongWall,
  openingCenter,
  pickFloorPlanElement,
  pointToSegmentDistanceM,
  wallDragAxis,
} from "./editor-hit-testing";

const source = {
  source: "generated",
  confidence: "medium",
  fetchedAt: null,
  requiresReview: false,
} as const;

function level(): FloorLevel {
  return {
    id: "level_0",
    name: "Stueplan",
    levelIndex: 0,
    elevationM: 0,
    floorToFloorHeightM: null,
    walls: [
      wall("w_s", [0, 0], [6, 0], "exterior"),
      wall("w_e", [6, 0], [6, 4], "exterior"),
      wall("w_n", [6, 4], [0, 4], "exterior"),
      wall("w_w", [0, 4], [0, 0], "exterior"),
      wall("w_mid", [3, 0], [3, 4], "interior"),
    ],
    rooms: [
      {
        id: "room_left",
        levelId: "level_0",
        name: "Stue",
        roomType: "living",
        polygon: {
          vertices: [
            { x: 0, y: 0 },
            { x: 3, y: 0 },
            { x: 3, y: 4 },
            { x: 0, y: 4 },
          ],
        },
        netAreaM2: 12,
        minAreaM2: null,
        targetAreaM2: null,
        floorFinishAssemblyId: null,
        ceilingFinishAssemblyId: null,
        wallFinishAssemblyByWallId: {},
        ventilationNeed: "natural",
        wetRoomZone: false,
        daylightRelevant: true,
        source,
      },
    ],
    openings: [
      {
        id: "door_1",
        levelId: "level_0",
        wallId: "w_s",
        openingKind: "door",
        offsetAlongWallM: 1.5,
        widthM: 0.9,
        heightM: 2.1,
        sillHeightM: null,
        swing: "left",
        productTypeId: null,
        locked: false,
        source,
      },
    ],
    fixtures: [
      {
        id: "fixture_1",
        levelId: "level_0",
        roomId: "room_left",
        fixtureKind: "technical_cabinet",
        position: { x: 1, y: 1 },
        rotationDeg: 0,
        footprint: {
          vertices: [
            { x: 0.8, y: 0.8 },
            { x: 1.2, y: 0.8 },
            { x: 1.2, y: 1.2 },
            { x: 0.8, y: 1.2 },
          ],
        },
        productTypeId: null,
        requiresDisciplineReview: ["vvs"],
        source,
      },
    ],
    stairs: [],
    annotations: [],
  };
}

function wall(
  id: string,
  start: [number, number],
  end: [number, number],
  kind: "exterior" | "interior",
) {
  return {
    id,
    levelId: "level_0",
    centerline: { start: { x: start[0], y: start[1] }, end: { x: end[0], y: end[1] } },
    thicknessM: 0.12,
    heightM: 2.4,
    wallKind: kind,
    structuralRole: "non_bearing",
    fireRole: "none",
    assemblyId: null,
    locked: false,
    source,
  } as const;
}

describe("editor hit testing", () => {
  test("picks openings before walls", () => {
    expect(pickFloorPlanElement(level(), { x: 1.5, y: 0 })?.kind).toBe("opening");
  });

  test("picks a nearby wall by segment distance", () => {
    const picked = pickFloorPlanElement(level(), { x: 3.08, y: 2 });

    expect(picked).toEqual({ kind: "wall", id: "w_mid", distanceM: 0.08000000000000007 });
    expect(pointToSegmentDistanceM({ x: 3.08, y: 2 }, level().walls[4]!.centerline)).toBeCloseTo(
      0.08,
      6,
    );
  });

  test("falls back to room picking", () => {
    expect(pickFloorPlanElement(level(), { x: 2, y: 2 })).toEqual({
      kind: "room",
      id: "room_left",
      distanceM: 0,
    });
  });

  test("returns null outside the plan", () => {
    expect(pickFloorPlanElement(level(), { x: 20, y: 20 })).toBeNull();
  });

  test("calculates opening centers and offsets along walls", () => {
    const l = level();
    expect(openingCenter(l.openings[0]!, l.walls[0]!)).toEqual({ x: 1.5, y: 0 });
    expect(offsetAlongWall(l.walls[0]!, { x: 2.25, y: 0.1 })).toBeCloseTo(2.25, 6);
  });

  test("finds rooms and drag axes in LOCAL_METER", () => {
    const l = level();
    expect(findRoomAtPoint(l, { x: 1, y: 1 })).toBe("room_left");
    expect(wallDragAxis(l.walls[4]!)).toBe("x");
    expect(wallDragAxis(l.walls[0]!)).toBe("y");
    expect(nearestWall(l.walls, { x: 3.1, y: 2 })?.wall.id).toBe("w_mid");
  });
});
