import { describe, expect, test } from "bun:test";
import {
  verifyFloorPlan,
  type FloorPlanPrincipal,
  type VerifyFloorPlanDeps,
} from "./verify-floor-plan.service";
import type { FloorPlanDocument } from "@/domain/floor-plan/floor-plan.types";
import type { GeoJsonPolygon25832 } from "@/domain/drawing/beliggenhedsplan.types";

const sourceMeta = {
  source: "generated",
  confidence: "medium",
  fetchedAt: null,
  requiresReview: false,
} as const;

const principal: FloorPlanPrincipal = {
  subjectId: "user_1",
  subjectKind: "user",
  projectRole: "owner",
};

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

function ring(coords: Array<[number, number]>): GeoJsonPolygon25832 {
  return { type: "Polygon", coordinates: [coords], crs: "EPSG:25832" };
}

const containingFootprint = ring([
  [-1, -1],
  [5, -1],
  [5, 4],
  [-1, 4],
  [-1, -1],
]);

function makeDeps(overrides: Partial<VerifyFloorPlanDeps> = {}): {
  deps: VerifyFloorPlanDeps;
  saved: unknown[];
} {
  const saved: unknown[] = [];
  const deps: VerifyFloorPlanDeps = {
    read: { loadActiveDocument: async () => baseDoc() },
    site: { loadFootprint25832: async () => containingFootprint },
    store: {
      saveVerification: async (snap) => {
        saved.push(snap);
        return "ver_1";
      },
    },
    ...overrides,
  };
  return { deps, saved };
}

const input = { projectId: "proj_1", floorPlanIterationId: "iter_1" };

describe("verifyFloorPlan", () => {
  test("returns TECHNICAL_REVIEW for a clean plan inside its footprint and persists once", async () => {
    const { deps, saved } = makeDeps();
    const result = await verifyFloorPlan(input, principal, deps);
    expect(result.status).toBe("TECHNICAL_REVIEW");
    expect(result.inputHash).toMatch(/^[0-9a-f]{64}$/);
    expect(saved).toHaveLength(1);
    expect(result.verificationId).toBe("ver_1");
  });

  test("flags FP-GEO-003 review_required when no trusted footprint exists", async () => {
    const { deps } = makeDeps({ site: { loadFootprint25832: async () => null } });
    const result = await verifyFloorPlan(input, principal, deps);
    expect(result.findings.some((f) => f.id.startsWith("FP-GEO-003"))).toBe(true);
    expect(result.status).toBe("DOCUMENTATION_REQUIRED");
  });

  test("flags FP-GEO-003 when the plan extends beyond the footprint", async () => {
    const halfFootprint = ring([
      [0, 0],
      [2, 0],
      [2, 3],
      [0, 3],
      [0, 0],
    ]);
    const { deps } = makeDeps({ site: { loadFootprint25832: async () => halfFootprint } });
    const result = await verifyFloorPlan(input, principal, deps);
    expect(result.findings.some((f) => f.id.startsWith("FP-GEO-003"))).toBe(true);
  });

  test("propagates a BLOCKED status from the domain engine", async () => {
    const blockedDoc = baseDoc();
    blockedDoc.levels[0]!.rooms[0]!.netAreaM2 = 0; // FP-GEO-001 blocking
    const { deps, saved } = makeDeps({
      read: { loadActiveDocument: async () => blockedDoc },
    });
    const result = await verifyFloorPlan(input, principal, deps);
    expect(result.status).toBe("BLOCKED");
    expect((saved[0] as { status: string }).status).toBe("BLOCKED");
  });

  test("throws when the floor plan cannot be loaded", async () => {
    const { deps } = makeDeps({ read: { loadActiveDocument: async () => null } });
    await expect(verifyFloorPlan(input, principal, deps)).rejects.toThrow();
  });

  test("rejects a principal without project access", async () => {
    const { deps } = makeDeps();
    const viewer: FloorPlanPrincipal = { ...principal, projectRole: "viewer" };
    await expect(verifyFloorPlan(input, viewer, deps)).rejects.toThrow();
  });

  test("produces a reproducible inputHash for identical inputs", async () => {
    const a = await verifyFloorPlan(input, principal, makeDeps().deps);
    const b = await verifyFloorPlan(input, principal, makeDeps().deps);
    expect(a.inputHash).toBe(b.inputHash);
  });
});
