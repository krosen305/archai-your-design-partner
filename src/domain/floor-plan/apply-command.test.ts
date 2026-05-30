import { describe, expect, test } from "bun:test";
import { applyCommand } from "./apply-command";
import type { FloorPlanDocument } from "./floor-plan.types";
import type { FloorPlanCommand } from "./commands";

const sourceMeta = {
  source: "generated",
  confidence: "medium",
  fetchedAt: null,
  requiresReview: false,
} as const;

function wall(
  id: string,
  a: [number, number],
  b: [number, number],
  opts: { locked?: boolean; bearing?: boolean } = {},
) {
  return {
    id,
    levelId: "level_0",
    centerline: { start: { x: a[0], y: a[1] }, end: { x: b[0], y: b[1] } },
    thicknessM: 0.12,
    heightM: 2.5 as number | null,
    wallKind: "interior" as const,
    structuralRole: (opts.bearing ? "bearing" : "non_bearing") as "bearing" | "non_bearing",
    fireRole: "none" as const,
    assemblyId: null as string | null,
    locked: opts.locked ?? false,
    source: sourceMeta,
  };
}

// 4 x 3 closed room with a door on the south wall and a technical cabinet.
function baseDoc(): FloorPlanDocument {
  return {
    schemaVersion: "floor-plan.v1",
    projectId: "proj_1",
    designIterationId: null,
    transform: {
      localCrs: "LOCAL_METER",
      siteCrs: "EPSG:25832",
      origin25832: [0, 0],
      rotationDeg: 0,
    },
    levels: [
      {
        id: "level_0",
        name: "Stueplan",
        levelIndex: 0,
        elevationM: 0,
        floorToFloorHeightM: null,
        walls: [
          wall("w_s", [0, 0], [4, 0]),
          wall("w_e", [4, 0], [4, 3]),
          wall("w_n", [4, 3], [0, 3]),
          wall("w_w", [0, 3], [0, 0]),
        ],
        rooms: [
          {
            id: "room_1",
            levelId: "level_0",
            name: "Stue",
            roomType: "living",
            polygon: {
              vertices: [
                { x: 0, y: 0 },
                { x: 4, y: 0 },
                { x: 4, y: 3 },
                { x: 0, y: 3 },
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
            source: sourceMeta,
          },
        ],
        openings: [
          {
            id: "door_1",
            levelId: "level_0",
            wallId: "w_s",
            openingKind: "door",
            offsetAlongWallM: 1,
            widthM: 0.9,
            heightM: 2.1,
            sillHeightM: null,
            swing: "left",
            productTypeId: null,
            locked: false,
            source: sourceMeta,
          },
        ],
        fixtures: [
          {
            id: "fx_cabinet",
            levelId: "level_0",
            roomId: "room_1",
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
            source: sourceMeta,
          },
        ],
        stairs: [],
        annotations: [],
      },
    ],
    assemblies: {
      wallAssemblies: [],
      floorFinishAssemblies: [],
      ceilingFinishAssemblies: [],
      openingProductTypes: [],
    },
    roomProgram: { requiredRoomTypes: [], bedroomCount: null, bathroomCount: null },
    constraints: [],
    metadata: { title: "A", createdAt: "2026-05-30T00:00:00.000Z" },
    provenance: { generator: "test", schemaVersion: "floor-plan.v1" },
  };
}

describe("applyCommand - move_wall", () => {
  test("moves the east wall east and grows the room area, leaving input untouched", () => {
    const doc = baseDoc();
    const cmd: FloorPlanCommand = { type: "move_wall", wallId: "w_e", deltaM: 1.2, axis: "x" };
    const result = applyCommand(doc, cmd);

    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    const room = result.document.levels[0]!.rooms[0]!;
    expect(room.netAreaM2).toBeCloseTo(5.2 * 3, 4);
    expect(room.id).toBe("room_1"); // identity preserved
    expect(result.changedElementIds).toContain("w_e");
    expect(result.changedElementIds).toContain("room_1");
    // input document is not mutated
    expect(doc.levels[0]!.rooms[0]!.netAreaM2).toBe(12);
  });

  test("rejects moving a locked wall without mutating", () => {
    const doc = baseDoc();
    doc.levels[0]!.walls[1]!.locked = true;
    const result = applyCommand(doc, { type: "move_wall", wallId: "w_e", deltaM: 1, axis: "x" });
    expect(result.accepted).toBe(false);
    if (result.accepted) return;
    expect(result.reasonCode).toBe("ELEMENT_LOCKED");
  });

  test("rejects an unknown wall", () => {
    const result = applyCommand(baseDoc(), {
      type: "move_wall",
      wallId: "nope",
      deltaM: 1,
      axis: "x",
    });
    expect(result.accepted).toBe(false);
    if (result.accepted) return;
    expect(result.reasonCode).toBe("WALL_NOT_FOUND");
  });
});

describe("applyCommand - move_opening", () => {
  test("moves a door along its wall", () => {
    const result = applyCommand(baseDoc(), {
      type: "move_opening",
      openingId: "door_1",
      wallId: "w_s",
      offsetM: 3,
    });
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.document.levels[0]!.openings[0]!.offsetAlongWallM).toBe(3);
  });

  test("rejects an offset that pushes the opening past the wall end", () => {
    const result = applyCommand(baseDoc(), {
      type: "move_opening",
      openingId: "door_1",
      wallId: "w_s",
      offsetM: 10,
    });
    expect(result.accepted).toBe(false);
    if (result.accepted) return;
    expect(result.reasonCode).toBe("OPENING_OUTSIDE_PARENT_WALL");
  });
});

describe("applyCommand - move_fixture", () => {
  test("moves the cabinet within the room", () => {
    const result = applyCommand(baseDoc(), {
      type: "move_fixture",
      fixtureId: "fx_cabinet",
      roomId: "room_1",
      x: 3,
      y: 2,
    });
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.document.levels[0]!.fixtures[0]!.position).toEqual({ x: 3, y: 2 });
  });

  test("rejects moving the fixture outside the target room", () => {
    const result = applyCommand(baseDoc(), {
      type: "move_fixture",
      fixtureId: "fx_cabinet",
      roomId: "room_1",
      x: 99,
      y: 99,
    });
    expect(result.accepted).toBe(false);
    if (result.accepted) return;
    expect(result.reasonCode).toBe("ROOM_NOT_FOUND");
  });
});

describe("applyCommand - parity", () => {
  test("drag and AI-origin commands produce the same result (same pipeline)", () => {
    const cmd: FloorPlanCommand = { type: "move_wall", wallId: "w_e", deltaM: 1.2, axis: "x" };
    const a = applyCommand(baseDoc(), cmd);
    const b = applyCommand(baseDoc(), cmd);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
