import { describe, expect, test } from "bun:test";
import { decodeFloorPlanJson, deriveIterationColumns } from "./floor-plan-iteration.codec";
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
    wallKind: "exterior" as const,
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
        walls: [
          w("w_s", [0, 0], [4, 0]),
          w("w_e", [4, 0], [4, 3]),
          w("w_n", [4, 3], [0, 3]),
          w("w_w", [0, 3], [0, 0]),
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

describe("decodeFloorPlanJson", () => {
  test("accepts a valid stored document", () => {
    expect(decodeFloorPlanJson(doc()).projectId).toBe("proj_1");
  });

  test("rejects malformed JSONB at the boundary (Rule 1)", () => {
    expect(() => decodeFloorPlanJson({ schemaVersion: "floor-plan.v1" })).toThrow();
  });

  test("rejects a wrong schema version", () => {
    expect(() => decodeFloorPlanJson({ ...doc(), schemaVersion: "floor-plan.v2" })).toThrow();
  });
});

describe("deriveIterationColumns", () => {
  test("derives typed columns and a reproducible model hash", async () => {
    const cols = await deriveIterationColumns(doc());
    expect(cols.modelHash).toMatch(/^[0-9a-f]{64}$/);
    expect(cols.levelsCount).toBe(1);
    expect(cols.roomsCount).toBe(1);
    expect(cols.openingsCount).toBe(0);
    expect(cols.netAreaM2).toBeCloseTo(12, 6);
    expect(cols.wallLengthTotalM).toBeCloseTo(14, 6);
    expect(cols.verificationStatus).toBe("TECHNICAL_REVIEW");
    expect(cols.materialBasisReadiness).toBe("GEOMETRY_ONLY");
  });

  test("model hash is stable across calls", async () => {
    const a = await deriveIterationColumns(doc());
    const b = await deriveIterationColumns(doc());
    expect(a.modelHash).toBe(b.modelHash);
  });
});
