import { describe, expect, test } from "bun:test";
import { buildRenderModel } from "./floor-plan-render-model";
import type { FloorPlanDocument } from "@/domain/floor-plan/floor-plan.types";

const sourceMeta = {
  source: "generated",
  confidence: "medium",
  fetchedAt: null,
  requiresReview: false,
} as const;

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

describe("buildRenderModel", () => {
  test("renders every wall, room, opening and fixture", () => {
    const m = buildRenderModel(doc(), "level_0");
    expect(m.walls).toHaveLength(4);
    expect(m.rooms).toHaveLength(1);
    expect(m.openings).toHaveLength(1);
    expect(m.fixtures).toHaveLength(1);
  });

  test("wallPoche is a Point2D[][] present on the render model", () => {
    const m = buildRenderModel(doc(), "level_0");
    expect(Array.isArray(m.wallPoche)).toBe(true);
    // Four connected walls → merged into one or more polygons (not zero)
    expect(m.wallPoche.length).toBeGreaterThan(0);
    // Every entry is an array of points with x/y
    for (const poly of m.wallPoche) {
      expect(Array.isArray(poly)).toBe(true);
      expect(poly.length).toBeGreaterThanOrEqual(3);
      expect(typeof poly[0]!.x).toBe("number");
      expect(typeof poly[0]!.y).toBe("number");
    }
  });

  test("wallPoche is empty for a document with no walls", () => {
    const d = doc();
    d.levels[0]!.walls = [];
    d.levels[0]!.openings = [];
    const m = buildRenderModel(d, "level_0");
    expect(m.wallPoche).toEqual([]);
  });

  test("places the room stamp at the polygon centroid with name and area read from the model", () => {
    const m = buildRenderModel(doc(), "level_0");
    const room = m.rooms[0]!;
    expect(room.name).toBe("Stue");
    expect(room.areaM2).toBe(12);
    expect(room.labelPoint.x).toBeCloseTo(2, 6);
    expect(room.labelPoint.y).toBeCloseTo(1.5, 6);
  });

  test("computes opening world position and angle from its parent wall", () => {
    const m = buildRenderModel(doc(), "level_0");
    const op = m.openings[0]!;
    expect(op.center.x).toBeCloseTo(1, 6);
    expect(op.center.y).toBeCloseTo(0, 6);
    expect(op.angleDeg).toBeCloseTo(0, 6);
  });

  test("viewBox bounds the geometry with a margin", () => {
    const m = buildRenderModel(doc(), "level_0");
    expect(m.viewBox.minX).toBeLessThanOrEqual(0);
    expect(m.viewBox.minY).toBeLessThanOrEqual(0);
    expect(m.viewBox.width).toBeGreaterThanOrEqual(4);
    expect(m.viewBox.height).toBeGreaterThanOrEqual(3);
  });

  test("throws for an unknown level", () => {
    expect(() => buildRenderModel(doc(), "level_9")).toThrow();
  });

  test("drops an opening whose parent wall is missing", () => {
    const d = doc();
    d.levels[0]!.openings[0]!.wallId = "ghost";
    expect(buildRenderModel(d, "level_0").openings).toHaveLength(0);
  });
});
