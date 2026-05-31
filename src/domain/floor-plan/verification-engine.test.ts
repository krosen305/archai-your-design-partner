import { describe, expect, test } from "bun:test";
import { runVerification } from "./verification-engine";
import type { FloorPlanDocument } from "./floor-plan.types";

const sourceMeta = {
  source: "generated",
  confidence: "medium",
  fetchedAt: null,
  requiresReview: false,
} as const;

// A valid closed 4x3 room bounded by four walls, with one door.
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

function wall(id: string, a: [number, number], b: [number, number]) {
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

function findingIds(report: ReturnType<typeof runVerification>): string[] {
  return report.findings.map((f) => f.id.split("/")[0]!);
}

describe("runVerification - clean plan", () => {
  test("a valid closed plan is not BLOCKED", () => {
    const report = runVerification(baseDoc());
    expect(report.status).not.toBe("BLOCKED");
    expect(report.findings.some((f) => f.severity === "blocking")).toBe(false);
  });

  test("populates metrics", () => {
    const report = runVerification(baseDoc());
    expect(report.metrics.roomsCount).toBe(1);
    expect(report.metrics.openingsCount).toBe(1);
    expect(report.metrics.levelsCount).toBe(1);
    expect(report.metrics.netAreaM2).toBeCloseTo(12, 6);
  });

  test("includes a geometry-only material basis", () => {
    expect(runVerification(baseDoc()).materialBasis.readiness).toBe("GEOMETRY_ONLY");
  });
});

describe("FP-TOPO-003 - opening wall reference", () => {
  test("flags an opening referencing a missing wall as blocking", () => {
    const doc = baseDoc();
    doc.levels[0]!.openings[0]!.wallId = "does_not_exist";
    const report = runVerification(doc);
    expect(findingIds(report)).toContain("FP-TOPO-003");
    expect(report.status).toBe("BLOCKED");
  });
});

describe("FP-GEO-001 - positive room area", () => {
  test("flags a non-positive room area as blocking", () => {
    const doc = baseDoc();
    doc.levels[0]!.rooms[0]!.netAreaM2 = 0;
    const report = runVerification(doc);
    expect(findingIds(report)).toContain("FP-GEO-001");
    expect(report.status).toBe("BLOCKED");
  });
});

describe("FP-ROOM-001 - required room types", () => {
  test("warns when a required room type is missing", () => {
    const doc = baseDoc();
    doc.roomProgram.requiredRoomTypes = ["bathroom"];
    const report = runVerification(doc);
    expect(findingIds(report)).toContain("FP-ROOM-001");
  });
});

describe("FP-ROOM-002 - rooms below target", () => {
  test("warns when a room is below its target area", () => {
    const doc = baseDoc();
    doc.levels[0]!.rooms[0]!.targetAreaM2 = 20;
    const report = runVerification(doc);
    expect(findingIds(report)).toContain("FP-ROOM-002");
  });
});

describe("FP-MAT-001 - missing assemblies", () => {
  test("emits an info finding for walls without an assembly", () => {
    const report = runVerification(baseDoc());
    const mat = report.findings.find((f) => f.id.startsWith("FP-MAT-001"));
    expect(mat?.severity).toBe("info");
  });
});
