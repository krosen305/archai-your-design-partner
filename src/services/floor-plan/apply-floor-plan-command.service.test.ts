import { describe, expect, test } from "bun:test";
import {
  applyFloorPlanCommand,
  type ApplyFloorPlanCommandDeps,
} from "./apply-floor-plan-command.service";
import type { FloorPlanPrincipal } from "./principal";
import type { FloorPlanDocument } from "@/domain/floor-plan/floor-plan.types";

const sourceMeta = {
  source: "generated",
  confidence: "medium",
  fetchedAt: null,
  requiresReview: false,
} as const;

const owner: FloorPlanPrincipal = {
  subjectId: "user_1",
  subjectKind: "user",
  projectRole: "owner",
};

function wall(id: string, a: [number, number], b: [number, number], locked = false) {
  return {
    id,
    levelId: "level_0",
    centerline: { start: { x: a[0], y: a[1] }, end: { x: b[0], y: b[1] } },
    thicknessM: 0.12,
    heightM: 2.5 as number | null,
    wallKind: "interior" as const,
    structuralRole: "non_bearing" as const,
    fireRole: "none" as const,
    assemblyId: null as string | null,
    locked,
    source: sourceMeta,
  };
}

function baseDoc(lockEast = false): FloorPlanDocument {
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
          wall("w_e", [4, 0], [4, 3], lockEast),
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
        openings: [],
        fixtures: [],
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

function makeDeps(doc: FloorPlanDocument | null) {
  const saved: FloorPlanDocument[] = [];
  const commands: unknown[] = [];
  const deps: ApplyFloorPlanCommandDeps = {
    read: { loadActiveDocument: async () => doc },
    write: {
      saveIteration: async (p) => {
        saved.push(p.document);
        return "iter_2";
      },
      appendCommand: async (p) => {
        commands.push(p);
      },
    },
  };
  return { deps, saved, commands };
}

const input = {
  projectId: "proj_1",
  floorPlanIterationId: "iter_1",
  source: "drag" as const,
};

describe("applyFloorPlanCommand", () => {
  test("persists a new version and appends the command on accept", async () => {
    const { deps, saved, commands } = makeDeps(baseDoc());
    const result = await applyFloorPlanCommand(
      { ...input, command: { type: "move_wall", wallId: "w_e", deltaM: 1.2, axis: "x" } },
      owner,
      deps,
    );
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.floorPlanIterationId).toBe("iter_2");
    expect(saved).toHaveLength(1);
    expect(saved[0]!.levels[0]!.rooms[0]!.netAreaM2).toBeCloseTo(15.6, 4);
    expect(commands).toHaveLength(1);
    expect((commands[0] as { source: string }).source).toBe("drag");
  });

  test("does not persist when the command is rejected", async () => {
    const { deps, saved, commands } = makeDeps(baseDoc(true));
    const result = await applyFloorPlanCommand(
      { ...input, command: { type: "move_wall", wallId: "w_e", deltaM: 1, axis: "x" } },
      owner,
      deps,
    );
    expect(result.accepted).toBe(false);
    if (result.accepted) return;
    expect(result.reasonCode).toBe("ELEMENT_LOCKED");
    expect(saved).toHaveLength(0);
    expect(commands).toHaveLength(0);
  });

  test("rejects a viewer principal", async () => {
    const { deps } = makeDeps(baseDoc());
    const viewer: FloorPlanPrincipal = { ...owner, projectRole: "viewer" };
    await expect(
      applyFloorPlanCommand(
        { ...input, command: { type: "move_wall", wallId: "w_e", deltaM: 1, axis: "x" } },
        viewer,
        deps,
      ),
    ).rejects.toThrow();
  });

  test("throws when the active plan cannot be loaded", async () => {
    const { deps } = makeDeps(null);
    await expect(
      applyFloorPlanCommand(
        { ...input, command: { type: "move_wall", wallId: "w_e", deltaM: 1, axis: "x" } },
        owner,
        deps,
      ),
    ).rejects.toThrow();
  });
});
