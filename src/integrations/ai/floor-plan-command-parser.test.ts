import { describe, expect, test } from "bun:test";
import {
  buildCommandParserSlice,
  interpretAIResponse,
  parseFloorPlanCommand,
  type FloorPlanCommandGateway,
} from "./floor-plan-command-parser";
import type { FloorPlanDocument } from "@/domain/floor-plan/floor-plan.types";

const sourceMeta = {
  source: "generated",
  confidence: "medium",
  fetchedAt: null,
  requiresReview: false,
} as const;

function w(id: string, a: [number, number], b: [number, number]) {
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
    locked: false,
    source: sourceMeta,
  };
}

function doc(): FloorPlanDocument {
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
        walls: [w("w_s", [0, 0], [4, 0]), w("w_e", [4, 0], [4, 3])],
        rooms: [
          {
            id: "room_1",
            levelId: "level_0",
            name: "Bryggers",
            roomType: "utility",
            polygon: {
              vertices: [
                { x: 0, y: 0 },
                { x: 4, y: 0 },
                { x: 4, y: 3 },
              ],
            },
            netAreaM2: 6,
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
      {
        id: "level_1",
        name: "1. sal",
        levelIndex: 1,
        elevationM: 3,
        floorToFloorHeightM: null,
        walls: [w("w_upstairs", [0, 0], [2, 0])],
        rooms: [],
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

describe("buildCommandParserSlice", () => {
  test("includes the selected element and room names for the active level only", () => {
    const slice = buildCommandParserSlice(doc(), "level_0", ["fx_cabinet"]);
    expect(slice.selected).toContainEqual({ id: "fx_cabinet", kind: "fixture" });
    expect(slice.rooms).toContainEqual({ id: "room_1", name: "Bryggers", roomType: "utility" });
    expect(slice.wallIds).toEqual(["w_s", "w_e"]);
  });

  test("does not leak elements from other levels", () => {
    const slice = buildCommandParserSlice(doc(), "level_0", []);
    expect(slice.wallIds).not.toContain("w_upstairs");
    expect(JSON.stringify(slice)).not.toContain("w_upstairs");
  });
});

describe("interpretAIResponse", () => {
  test("returns a validated command for a well-formed command response", () => {
    const result = interpretAIResponse({
      kind: "command",
      command: { type: "move_fixture", fixtureId: "fx_cabinet", roomId: "room_1", x: 2, y: 1 },
    });
    expect(result.kind).toBe("command");
    if (result.kind !== "command") return;
    expect(result.command.type).toBe("move_fixture");
  });

  test("passes through a clarification response", () => {
    const result = interpretAIResponse({
      kind: "clarification",
      question: "Hvilken væg mener du?",
      options: ["w_s", "w_e"],
    });
    expect(result.kind).toBe("clarification");
  });

  test("falls back to clarification when the AI command fails schema validation (Rule 1)", () => {
    const result = interpretAIResponse({
      kind: "command",
      command: { type: "move_wall", wallId: "w_e" }, // missing deltaM/axis
    });
    expect(result.kind).toBe("clarification");
  });

  test("falls back to clarification for garbage output", () => {
    expect(interpretAIResponse("not json").kind).toBe("clarification");
    expect(interpretAIResponse(null).kind).toBe("clarification");
  });
});

describe("parseFloorPlanCommand", () => {
  test("returns a command candidate and feeds the gateway a slice, not the full document", async () => {
    let received: unknown = null;
    const gateway: FloorPlanCommandGateway = {
      suggest: async (req) => {
        received = req;
        return {
          kind: "command",
          command: { type: "move_fixture", fixtureId: "fx_cabinet", roomId: "room_1", x: 3, y: 1 },
        };
      },
    };
    const result = await parseFloorPlanCommand(
      {
        document: doc(),
        levelId: "level_0",
        selectedElementIds: ["fx_cabinet"],
        instruction: "flyt skab",
      },
      gateway,
    );
    expect(result.kind).toBe("command");
    // gateway saw a slice (no `levels`, no upstairs wall) — §18.2
    expect(JSON.stringify(received)).not.toContain("w_upstairs");
    expect(JSON.stringify(received)).not.toContain('"levels"');
  });

  test("returns clarification when the gateway is ambiguous", async () => {
    const gateway: FloorPlanCommandGateway = {
      suggest: async () => ({ kind: "clarification", question: "Hvilket skab?", options: [] }),
    };
    const result = await parseFloorPlanCommand(
      { document: doc(), levelId: "level_0", selectedElementIds: [], instruction: "flyt det" },
      gateway,
    );
    expect(result.kind).toBe("clarification");
  });
});
