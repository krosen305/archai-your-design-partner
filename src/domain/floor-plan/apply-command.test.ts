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

// ---------------------------------------------------------------------------
// WS5 — add/delete commands
// ---------------------------------------------------------------------------

describe("applyCommand - add_wall", () => {
  test("adds a wall to the level and recomputes rooms", () => {
    const result = applyCommand(baseDoc(), {
      type: "add_wall",
      levelId: "level_0",
      start: { x: 2, y: 0 },
      end: { x: 2, y: 3 },
      thicknessM: 0.12,
      wallKind: "interior",
    });
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    const level = result.document.levels[0]!;
    expect(level.walls).toHaveLength(5);
    const newWall = level.walls.find((w) => w.id.startsWith("wall-"));
    expect(newWall).toBeDefined();
    expect(newWall!.wallKind).toBe("interior");
    expect(newWall!.source.source).toBe("manual");
    // changedElementIds must include the new wall id
    expect(result.changedElementIds).toContain(newWall!.id);
    // input document is not mutated
    expect(baseDoc().levels[0]!.walls).toHaveLength(4);
  });

  test("rejects an add_wall that is too short (< 0.1 m)", () => {
    const result = applyCommand(baseDoc(), {
      type: "add_wall",
      levelId: "level_0",
      start: { x: 0, y: 0 },
      end: { x: 0.05, y: 0 },
      thicknessM: 0.12,
      wallKind: "interior",
    });
    expect(result.accepted).toBe(false);
    if (result.accepted) return;
    expect(result.reasonCode).toBe("WALL_TOO_SHORT");
  });

  test("rejects add_wall for an unknown level", () => {
    const result = applyCommand(baseDoc(), {
      type: "add_wall",
      levelId: "no_such_level",
      start: { x: 0, y: 0 },
      end: { x: 1, y: 0 },
      thicknessM: 0.12,
      wallKind: "interior",
    });
    expect(result.accepted).toBe(false);
    if (result.accepted) return;
    expect(result.reasonCode).toBe("LEVEL_NOT_FOUND");
  });
});

describe("applyCommand - add_opening", () => {
  test("adds a window to an existing wall", () => {
    const result = applyCommand(baseDoc(), {
      type: "add_opening",
      levelId: "level_0",
      wallId: "w_n",
      openingKind: "window",
      offsetAlongWallM: 2,
      widthM: 1.2,
      heightM: 1.2,
      swing: "none",
    });
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    const level = result.document.levels[0]!;
    expect(level.openings).toHaveLength(2);
    const newOpening = level.openings.find((o) => o.id.startsWith("opening-"));
    expect(newOpening).toBeDefined();
    expect(newOpening!.openingKind).toBe("window");
    expect(newOpening!.wallId).toBe("w_n");
    expect(result.changedElementIds).toContain(newOpening!.id);
  });

  test("rejects opening that would overlap existing door", () => {
    const result = applyCommand(baseDoc(), {
      type: "add_opening",
      levelId: "level_0",
      wallId: "w_s",
      openingKind: "window",
      offsetAlongWallM: 1, // same position as door_1
      widthM: 0.9,
      heightM: 1.2,
      swing: "none",
    });
    expect(result.accepted).toBe(false);
    if (result.accepted) return;
    expect(result.reasonCode).toBe("OPENING_OVERLAPS_ANOTHER");
  });

  test("rejects opening on an unknown wall", () => {
    const result = applyCommand(baseDoc(), {
      type: "add_opening",
      levelId: "level_0",
      wallId: "w_nonexistent",
      openingKind: "door",
      offsetAlongWallM: 0.5,
      widthM: 0.9,
      heightM: 2.1,
      swing: "left",
    });
    expect(result.accepted).toBe(false);
    if (result.accepted) return;
    expect(result.reasonCode).toBe("WALL_NOT_FOUND");
  });
});

describe("applyCommand - add_fixture", () => {
  test("adds a toilet fixture to the level", () => {
    const result = applyCommand(baseDoc(), {
      type: "add_fixture",
      levelId: "level_0",
      roomId: "room_1",
      fixtureKind: "toilet",
      position: { x: 3, y: 2.5 },
      rotationDeg: 0,
    });
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    const level = result.document.levels[0]!;
    expect(level.fixtures).toHaveLength(2);
    const newFixture = level.fixtures.find((f) => f.id.startsWith("fixture-"));
    expect(newFixture).toBeDefined();
    expect(newFixture!.fixtureKind).toBe("toilet");
    expect(newFixture!.roomId).toBe("room_1");
    expect(result.changedElementIds).toContain(newFixture!.id);
  });

  test("rejects add_fixture for an unknown level", () => {
    const result = applyCommand(baseDoc(), {
      type: "add_fixture",
      levelId: "ghost_level",
      roomId: null,
      fixtureKind: "sink",
      position: { x: 1, y: 1 },
      rotationDeg: 0,
    });
    expect(result.accepted).toBe(false);
    if (result.accepted) return;
    expect(result.reasonCode).toBe("LEVEL_NOT_FOUND");
  });
});

describe("applyCommand - add_furniture", () => {
  test("adds a double_bed to the level", () => {
    const result = applyCommand(baseDoc(), {
      type: "add_furniture",
      levelId: "level_0",
      roomId: "room_1",
      furnitureKind: "double_bed",
      position: { x: 2, y: 1.5 },
      rotationDeg: 90,
      widthM: 1.8,
      depthM: 2.0,
    });
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    const level = result.document.levels[0]!;
    const furniture = level.furniture ?? [];
    const newItem = furniture.find((f) => f.id.startsWith("furniture-"));
    expect(newItem).toBeDefined();
    expect(newItem!.furnitureKind).toBe("double_bed");
    expect(newItem!.widthM).toBe(1.8);
    expect(result.changedElementIds).toContain(newItem!.id);
  });
});

describe("applyCommand - delete_wall", () => {
  test("removes the wall and its associated openings from the level", () => {
    const result = applyCommand(baseDoc(), { type: "delete_wall", wallId: "w_s" });
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    const level = result.document.levels[0]!;
    expect(level.walls.find((w) => w.id === "w_s")).toBeUndefined();
    // door_1 was on w_s and must be removed too
    expect(level.openings.find((o) => o.id === "door_1")).toBeUndefined();
    expect(result.changedElementIds).toContain("w_s");
    expect(result.changedElementIds).toContain("door_1");
    // input document is not mutated
    expect(baseDoc().levels[0]!.walls).toHaveLength(4);
  });

  test("rejects deleting a locked wall", () => {
    const doc = baseDoc();
    doc.levels[0]!.walls[0]!.locked = true; // w_s is locked
    const result = applyCommand(doc, { type: "delete_wall", wallId: "w_s" });
    expect(result.accepted).toBe(false);
    if (result.accepted) return;
    expect(result.reasonCode).toBe("ELEMENT_LOCKED");
  });

  test("rejects deleting a nonexistent wall", () => {
    const result = applyCommand(baseDoc(), { type: "delete_wall", wallId: "ghost_wall" });
    expect(result.accepted).toBe(false);
    if (result.accepted) return;
    expect(result.reasonCode).toBe("WALL_NOT_FOUND");
  });
});

describe("applyCommand - resize_opening", () => {
  test("updates the widthM of an existing opening", () => {
    const result = applyCommand(baseDoc(), {
      type: "resize_opening",
      openingId: "door_1",
      widthM: 1.2,
    });
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.document.levels[0]!.openings[0]!.widthM).toBe(1.2);
    expect(result.changedElementIds).toContain("door_1");
  });

  test("rejects resize that would push opening past wall end", () => {
    // door_1 is on w_s (4 m long) at offsetAlongWallM=1 with new width=3.5
    // half = 1.75 → offset - half = 1 - 1.75 = -0.75 < 0 → rejected
    const result = applyCommand(baseDoc(), {
      type: "resize_opening",
      openingId: "door_1",
      widthM: 3.5,
    });
    expect(result.accepted).toBe(false);
    if (result.accepted) return;
    expect(result.reasonCode).toBe("OPENING_OUTSIDE_PARENT_WALL");
  });

  test("rejects resize of an unknown opening", () => {
    const result = applyCommand(baseDoc(), {
      type: "resize_opening",
      openingId: "ghost_door",
      widthM: 0.9,
    });
    expect(result.accepted).toBe(false);
    if (result.accepted) return;
    expect(result.reasonCode).toBe("OPENING_NOT_FOUND");
  });
});
