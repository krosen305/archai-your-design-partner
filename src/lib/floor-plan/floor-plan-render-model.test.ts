import { describe, expect, it, test } from "bun:test";
import { buildRenderModel } from "./floor-plan-render-model";
import type { FloorPlanDocument } from "@/domain/floor-plan/floor-plan.types";
import { generateSeedFloorPlan } from "@/domain/floor-plan/seed-generator";

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

describe("rum-gulv-hatch", () => {
  it("giver hatch-paths pr. rum når floorFinishAssemblyId er sat", () => {
    const base = generateSeedFloorPlan({
      projectId: "p1",
      targetAreaM2: 60,
      rooms: [{ name: "Stue", roomType: "living" }],
    });
    const lvl = base.levels[0]!;
    const withFinish = {
      ...base,
      levels: [
        { ...lvl, rooms: lvl.rooms.map((r) => ({ ...r, floorFinishAssemblyId: "oak_plank" })) },
      ],
    };
    const model = buildRenderModel(withFinish, lvl.id);
    const room = model.rooms[0]!;
    expect(room.floorHatchPaths.length).toBeGreaterThan(0);
  });

  it("rum uden floorFinishAssemblyId har tomme floorHatchPaths", () => {
    const base = generateSeedFloorPlan({
      projectId: "p1",
      targetAreaM2: 60,
      rooms: [{ name: "Stue", roomType: "living" }],
    });
    const lvl = base.levels[0]!;
    const model = buildRenderModel(base, lvl.id);
    expect(model.rooms[0]!.floorHatchPaths).toEqual([]);
  });
});

describe("installations-/inventar-labels", () => {
  it("giver en label-annotation for et appliance-fixture", () => {
    const base = generateSeedFloorPlan({
      projectId: "p1",
      targetAreaM2: 60,
      rooms: [{ name: "Køkken", roomType: "kitchen" }],
    });
    const lvl = base.levels[0]!;
    const withFix = {
      ...base,
      levels: [
        {
          ...lvl,
          fixtures: [
            {
              id: "fx1",
              levelId: lvl.id,
              roomId: null,
              fixtureKind: "appliance" as const,
              position: { x: 2, y: 2 },
              rotationDeg: 0,
              footprint: {
                vertices: [
                  { x: 1.8, y: 1.8 },
                  { x: 2.2, y: 1.8 },
                  { x: 2.2, y: 2.2 },
                  { x: 1.8, y: 2.2 },
                ],
              },
              productTypeId: null,
              requiresDisciplineReview: [],
              source: {
                source: "manual" as const,
                confidence: "medium" as const,
                fetchedAt: null,
                requiresReview: false,
              },
            },
          ],
        },
      ],
    };
    const model = buildRenderModel(withFix, lvl.id);
    const labels = model.annotations.filter((a) => a.kind === "fixture_label").map((a) => a.text);
    expect(labels.length).toBeGreaterThan(0);
    expect(labels[0]!.length).toBeGreaterThan(0);
  });
});

describe("annotations i render-model", () => {
  it("udleder lofthøjde-, gulvniveau- og opluk-felt-annotationer", () => {
    const base = generateSeedFloorPlan({
      projectId: "p1",
      targetAreaM2: 60,
      rooms: [{ name: "Stue", roomType: "living" }],
    });
    const lvl = base.levels[0]!;
    const withData = {
      ...base,
      levels: [
        {
          ...lvl,
          rooms: lvl.rooms.map((r) => ({ ...r, ceilingHeightM: 2.5, floorOffsetM: 0.4 })),
          openings: lvl.openings.map((o, i) => (i === 0 ? { ...o, operable: true } : o)),
        },
      ],
    };
    const model = buildRenderModel(withData, lvl.id);
    const texts = model.annotations.map((a) => a.text);
    expect(texts.some((t) => t.includes("Lofthøjde"))).toBe(true);
    expect(texts.some((t) => t.includes("Gulvniveau") && t.includes("40"))).toBe(true);
    expect(texts.some((t) => t.includes("Opluk"))).toBe(true);
  });

  it("ingen annotationer når ingen data og ingen level.annotations", () => {
    const base = generateSeedFloorPlan({
      projectId: "p1",
      targetAreaM2: 60,
      rooms: [{ name: "Stue", roomType: "living" }],
    });
    const model = buildRenderModel(base, base.levels[0]!.id);
    expect(model.annotations).toEqual([]);
  });
});
