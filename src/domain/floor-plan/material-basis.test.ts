import { describe, expect, test } from "bun:test";
import { deriveMaterialBasisSummary } from "./material-basis";
import type { FloorPlanDocument } from "./floor-plan.types";

const sourceMeta = {
  source: "generated",
  confidence: "medium",
  fetchedAt: null,
  requiresReview: false,
} as const;

function doc(overrides: { intWallHeight?: number | null; roomArea?: number }): FloorPlanDocument {
  const { intWallHeight = 2.5, roomArea = 12 } = overrides;
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
          {
            id: "wall_ext",
            levelId: "level_0",
            centerline: { start: { x: 0, y: 0 }, end: { x: 4, y: 0 } },
            thicknessM: 0.3,
            heightM: 2.5,
            wallKind: "exterior",
            structuralRole: "bearing",
            fireRole: "none",
            assemblyId: null,
            locked: false,
            source: sourceMeta,
          },
          {
            id: "wall_int",
            levelId: "level_0",
            centerline: { start: { x: 0, y: 0 }, end: { x: 0, y: 3 } },
            thicknessM: 0.1,
            heightM: intWallHeight,
            wallKind: "interior",
            structuralRole: "non_bearing",
            fireRole: "none",
            assemblyId: null,
            locked: false,
            source: sourceMeta,
          },
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
            netAreaM2: roomArea,
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
            id: "op_1",
            levelId: "level_0",
            wallId: "wall_ext",
            openingKind: "window",
            offsetAlongWallM: 1,
            widthM: 1,
            heightM: 2,
            sillHeightM: 0.9,
            swing: "none",
            productTypeId: null,
            locked: false,
            source: sourceMeta,
          },
        ],
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

describe("deriveMaterialBasisSummary - lengths", () => {
  test("sums total / exterior / interior wall lengths", () => {
    const s = deriveMaterialBasisSummary(doc({}));
    expect(s.wallLengthTotalM).toBeCloseTo(7, 6);
    expect(s.exteriorWallLengthM).toBeCloseTo(4, 6);
    expect(s.interiorWallLengthM).toBeCloseTo(3, 6);
  });
});

describe("deriveMaterialBasisSummary - wall areas", () => {
  test("computes gross and net wall area with opening subtracted", () => {
    const s = deriveMaterialBasisSummary(doc({}));
    // gross = (4 + 3) * 2.5 = 17.5 ; opening = 1 * 2 = 2 ; net = 15.5
    expect(s.wallGrossAreaM2).toBeCloseTo(17.5, 6);
    expect(s.wallNetAreaM2).toBeCloseTo(15.5, 6);
  });

  test("reports null areas and missing data when a wall lacks height", () => {
    const s = deriveMaterialBasisSummary(doc({ intWallHeight: null }));
    expect(s.wallGrossAreaM2).toBeNull();
    expect(s.wallNetAreaM2).toBeNull();
    expect(s.missingDataPoints.some((p) => p.includes("wall_int") && p.includes("height"))).toBe(
      true,
    );
  });
});

describe("deriveMaterialBasisSummary - rooms and openings", () => {
  test("reports floor area per room", () => {
    const s = deriveMaterialBasisSummary(doc({}));
    expect(s.floorAreaByRoomM2).toEqual([{ roomId: "room_1", areaM2: 12, finishAssemblyId: null }]);
  });

  test("counts openings by kind", () => {
    const s = deriveMaterialBasisSummary(doc({}));
    expect(s.openingCounts).toContainEqual({
      openingKind: "window",
      productTypeId: null,
      count: 1,
    });
  });
});

describe("deriveMaterialBasisSummary - readiness", () => {
  test("is GEOMETRY_ONLY when geometry valid but assemblies missing", () => {
    expect(deriveMaterialBasisSummary(doc({})).readiness).toBe("GEOMETRY_ONLY");
  });

  test("is NOT_READY when a room has non-positive area", () => {
    expect(deriveMaterialBasisSummary(doc({ roomArea: 0 })).readiness).toBe("NOT_READY");
  });
});
