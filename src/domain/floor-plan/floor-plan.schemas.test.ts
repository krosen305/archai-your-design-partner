import { describe, expect, it, test } from "bun:test";
import {
  FloorPlanDocumentSchema,
  OpeningSchema,
  RoomZoneSchema,
  WallSchema,
} from "./floor-plan.schemas";

const sourceMeta = {
  source: "generated",
  confidence: "medium",
  fetchedAt: null,
  requiresReview: false,
};

const validWall = {
  id: "wall_1",
  levelId: "level_0",
  centerline: { start: { x: 0, y: 0 }, end: { x: 4, y: 0 } },
  thicknessM: 0.12,
  heightM: 2.5,
  wallKind: "interior",
  structuralRole: "non_bearing",
  fireRole: "none",
  assemblyId: null,
  locked: false,
  source: sourceMeta,
};

const validRoom = {
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
};

const validOpening = {
  id: "opening_1",
  levelId: "level_0",
  wallId: "wall_1",
  openingKind: "door",
  offsetAlongWallM: 1,
  widthM: 0.9,
  heightM: 2.1,
  sillHeightM: null,
  swing: "left",
  productTypeId: null,
  locked: false,
  source: sourceMeta,
};

describe("WallSchema", () => {
  test("accepts a valid wall", () => {
    expect(WallSchema.safeParse(validWall).success).toBe(true);
  });

  test("rejects non-positive thickness", () => {
    expect(WallSchema.safeParse({ ...validWall, thicknessM: 0 }).success).toBe(false);
  });

  test("rejects unknown wallKind", () => {
    expect(WallSchema.safeParse({ ...validWall, wallKind: "wizard" }).success).toBe(false);
  });
});

describe("RoomZoneSchema", () => {
  test("accepts a valid room", () => {
    expect(RoomZoneSchema.safeParse(validRoom).success).toBe(true);
  });

  test("rejects negative net area", () => {
    expect(RoomZoneSchema.safeParse({ ...validRoom, netAreaM2: -1 }).success).toBe(false);
  });

  test("rejects a polygon with fewer than 3 vertices", () => {
    const bad = {
      ...validRoom,
      polygon: {
        vertices: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
      },
    };
    expect(RoomZoneSchema.safeParse(bad).success).toBe(false);
  });
});

describe("OpeningSchema", () => {
  test("accepts a valid opening", () => {
    expect(OpeningSchema.safeParse(validOpening).success).toBe(true);
  });

  test("rejects empty wallId", () => {
    expect(OpeningSchema.safeParse({ ...validOpening, wallId: "" }).success).toBe(false);
  });

  test("rejects non-positive width", () => {
    expect(OpeningSchema.safeParse({ ...validOpening, widthM: 0 }).success).toBe(false);
  });

  test("rejects negative offset along wall", () => {
    expect(OpeningSchema.safeParse({ ...validOpening, offsetAlongWallM: -0.5 }).success).toBe(
      false,
    );
  });
});

describe("annotations-felter", () => {
  it("Opening har operable med default false", () => {
    const base = {
      id: "o1", levelId: "l0", wallId: "w1", openingKind: "window",
      offsetAlongWallM: 1, widthM: 1.2, heightM: 1.4, sillHeightM: 0.9,
      swing: "none", productTypeId: null, locked: false,
      source: { source: "manual", confidence: "medium", fetchedAt: null, requiresReview: false },
    };
    expect(OpeningSchema.parse(base).operable).toBe(false);
    expect(OpeningSchema.parse({ ...base, operable: true }).operable).toBe(true);
  });

  it("RoomZone har ceilingHeightM og floorOffsetM (nullable, default null)", () => {
    const base = {
      id: "r1", levelId: "l0", name: "Stue", roomType: "living",
      polygon: { vertices: [{x:0,y:0},{x:1,y:0},{x:1,y:1}] },
      netAreaM2: 1, minAreaM2: null, targetAreaM2: null,
      floorFinishAssemblyId: null, ceilingFinishAssemblyId: null,
      wallFinishAssemblyByWallId: {}, ventilationNeed: "natural",
      wetRoomZone: false, daylightRelevant: true,
      source: { source: "manual", confidence: "medium", fetchedAt: null, requiresReview: false },
    };
    const parsed = RoomZoneSchema.parse(base);
    expect(parsed.ceilingHeightM).toBeNull();
    expect(parsed.floorOffsetM).toBeNull();
  });
});

describe("FloorPlanDocumentSchema", () => {
  const validDoc = {
    schemaVersion: "floor-plan.v1",
    projectId: "proj_1",
    designIterationId: null,
    transform: {
      localCrs: "LOCAL_METER",
      siteCrs: "EPSG:25832",
      origin25832: [720000, 6175000],
      rotationDeg: 0,
    },
    levels: [
      {
        id: "level_0",
        name: "Stueplan",
        levelIndex: 0,
        elevationM: 0,
        floorToFloorHeightM: null,
        walls: [validWall],
        rooms: [validRoom],
        openings: [validOpening],
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
    metadata: { title: "Forslag A", createdAt: "2026-05-30T00:00:00.000Z" },
    provenance: { generator: "test", schemaVersion: "floor-plan.v1" },
  };

  test("accepts a minimal valid document", () => {
    const result = FloorPlanDocumentSchema.safeParse(validDoc);
    expect(result.success).toBe(true);
  });

  test("rejects a wrong schemaVersion", () => {
    expect(
      FloorPlanDocumentSchema.safeParse({ ...validDoc, schemaVersion: "floor-plan.v2" }).success,
    ).toBe(false);
  });

  test("rejects a wrong transform CRS", () => {
    const bad = { ...validDoc, transform: { ...validDoc.transform, siteCrs: "EPSG:4326" } };
    expect(FloorPlanDocumentSchema.safeParse(bad).success).toBe(false);
  });
});
