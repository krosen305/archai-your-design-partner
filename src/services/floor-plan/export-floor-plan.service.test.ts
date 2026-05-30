import { describe, expect, test } from "bun:test";
import { exportFloorPlan, type ExportFloorPlanDeps } from "./export-floor-plan.service";
import type { FloorPlanPrincipal } from "./principal";
import type { FloorPlanDocument } from "@/domain/floor-plan/floor-plan.types";

const sourceMeta = {
  source: "generated",
  confidence: "medium",
  fetchedAt: null,
  requiresReview: false,
} as const;

const owner: FloorPlanPrincipal = { subjectId: "u", subjectKind: "user", projectRole: "owner" };

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
    metadata: { title: "Forslag A", createdAt: "2026-05-30T00:00:00.000Z" },
    provenance: { generator: "test", schemaVersion: "floor-plan.v1" },
  };
}

function makeDeps(overrides: Partial<ExportFloorPlanDeps["store"]> = {}) {
  const records: unknown[] = [];
  const store: ExportFloorPlanDeps["store"] = {
    saveSvg: async () => "svg/path.svg",
    savePdf: async () => "pdf/path.pdf",
    createSignedUrl: async () => "https://signed/url.pdf",
    saveExportRecord: async (p) => {
      records.push(p);
      return "exp_1";
    },
    ...overrides,
  };
  return { deps: { store } as ExportFloorPlanDeps, records };
}

const input = {
  projectId: "proj_1",
  floorPlanIterationId: "iter_1",
  document: doc(),
  levelId: "level_0",
  verificationStatus: "TECHNICAL_REVIEW" as const,
  inputHash: "hash123",
};

describe("exportFloorPlan", () => {
  test("renders SVG+PDF, stores them and stamps the readiness status", async () => {
    const { deps, records } = makeDeps();
    const result = await exportFloorPlan(input, owner, deps);
    expect(result.exportId).toBe("exp_1");
    expect(result.svgContent).toContain("Stue");
    expect(result.pdfPath).toBe("pdf/path.pdf");
    expect(result.pdfUrl).toBe("https://signed/url.pdf");
    expect(result.readinessStatus).toBe("TECHNICAL_REVIEW");
    expect((records[0] as { readinessStatus: string }).readinessStatus).toBe("TECHNICAL_REVIEW");
  });

  test("still produces an export record when PDF generation fails", async () => {
    const { deps } = makeDeps({
      savePdf: async () => {
        throw new Error("pdf boom");
      },
    });
    const result = await exportFloorPlan(input, owner, deps);
    expect(result.exportId).toBe("exp_1");
    expect(result.pdfPath).toBeNull();
    expect(result.svgContent).toContain("Stue");
  });

  test("rejects a viewer principal", async () => {
    const { deps } = makeDeps();
    const viewer: FloorPlanPrincipal = { ...owner, projectRole: "viewer" };
    await expect(exportFloorPlan(input, viewer, deps)).rejects.toThrow();
  });
});
