import { describe, expect, test } from "bun:test";
import { renderFloorPlanPdf } from "./render-floor-plan-pdf";
import { renderFloorPlanSheetPdf, renderFloorPlanSheetSvg } from "./render-floor-plan-sheet-pdf";
import type { FloorPlanRenderModel } from "./floor-plan-render-model";
import type { FloorPlanDocument } from "@/domain/floor-plan/floor-plan.types";

const model: FloorPlanRenderModel = {
  levelId: "level_0",
  levelName: "Stueplan",
  viewBox: { minX: -1, minY: -1, width: 6, height: 5 },
  walls: [
    {
      id: "w_s",
      start: { x: 0, y: 0 },
      end: { x: 4, y: 0 },
      thicknessM: 0.12,
      structural: false,
      pochePolygon: [],
      gaps: [],
    },
    {
      id: "w_e",
      start: { x: 4, y: 0 },
      end: { x: 4, y: 3 },
      thicknessM: 0.12,
      structural: true,
      pochePolygon: [],
      gaps: [],
    },
  ],
  wallPoche: [
    [
      { x: -0.06, y: -0.06 },
      { x: 4.06, y: -0.06 },
      { x: 4.06, y: 0.06 },
      { x: -0.06, y: 0.06 },
    ],
  ],
  rooms: [
    {
      id: "room_1",
      name: "Stue",
      areaM2: 12,
      points: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 3 },
        { x: 0, y: 3 },
      ],
      labelPoint: { x: 2, y: 1.5 },
    },
  ],
  openings: [{ id: "door_1", kind: "door", center: { x: 1, y: 0 }, widthM: 0.9, angleDeg: 0 }],
  fixtures: [],
  furniture: [],
  zones: [
    {
      id: "zone_1",
      kind: "terrace",
      name: "Terrasse",
      areaM2: 8,
      points: [
        { x: 0, y: -2 },
        { x: 4, y: -2 },
        { x: 4, y: 0 },
        { x: 0, y: 0 },
      ],
      labelPoint: { x: 2, y: -1 },
      hatchPaths: [],
      heated: false,
    },
  ],
  layers: {
    showDimensions: true,
    showFurniture: true,
    showZones: true,
    showHatch: true,
  },
  dimensionChains: [
    {
      side: "south",
      segments: [
        {
          from: { x: 0, y: 0 },
          to: { x: 4, y: 0 },
          chainFrom: { x: 0, y: -0.5 },
          chainTo: { x: 4, y: -0.5 },
          labelText: "4.00 m",
          labelPt: { x: 2, y: -0.5 },
        },
      ],
    },
  ],
  interiorDimensions: [],
};

describe("renderFloorPlanPdf", () => {
  test("produces a non-empty PDF byte stream", async () => {
    const bytes = await renderFloorPlanPdf(model, {
      title: "Plantegning – Stue",
      statusLabel: "TECHNICAL_REVIEW",
    });
    expect(bytes.byteLength).toBeGreaterThan(100);
    // PDF magic header %PDF
    expect([bytes[0], bytes[1], bytes[2], bytes[3]]).toEqual([0x25, 0x50, 0x44, 0x46]);
  });

  test("does not throw on labels with Danish characters", async () => {
    const danish: FloorPlanRenderModel = {
      ...model,
      rooms: [{ ...model.rooms[0]!, name: "Køkken-alrum æøå" }],
    };
    const bytes = await renderFloorPlanPdf(danish, { title: "Tegning", statusLabel: "BLOCKED" });
    expect(bytes.byteLength).toBeGreaterThan(100);
  });

  test("uses wallPoche polygons (not wall lines) when wallPoche is non-empty", async () => {
    // Produce a PDF from a model that has wallPoche but empty walls list — the
    // renderer must draw the poché polygon and not crash on missing start/end.
    const pocheOnly: FloorPlanRenderModel = {
      ...model,
      walls: [],
      wallPoche: [
        [
          { x: -0.06, y: -0.06 },
          { x: 4.06, y: -0.06 },
          { x: 4.06, y: 0.06 },
          { x: -0.06, y: 0.06 },
        ],
      ],
    };
    const bytes = await renderFloorPlanPdf(pocheOnly, {
      title: "Poché test",
      statusLabel: "DRAFT",
    });
    expect(bytes.byteLength).toBeGreaterThan(100);
    expect([bytes[0], bytes[1], bytes[2], bytes[3]]).toEqual([0x25, 0x50, 0x44, 0x46]);
  });

  test("renders zones and dimension chains without throwing", async () => {
    const bytes = await renderFloorPlanPdf(model, {
      title: "Med zoner og mål",
      statusLabel: "DRAFT",
    });
    expect(bytes.byteLength).toBeGreaterThan(100);
  });
});

// --- FloorPlanDocument fixture for sheet-level tests -------------------------

const sourceMeta = {
  source: "generated" as const,
  confidence: "medium" as const,
  fetchedAt: null,
  requiresReview: false,
};

function makeDoc(): FloorPlanDocument {
  return {
    schemaVersion: "floor-plan.v1",
    projectId: "proj_test",
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
            id: "w_s",
            levelId: "level_0",
            centerline: { start: { x: 0, y: 0 }, end: { x: 4, y: 0 } },
            thicknessM: 0.12,
            heightM: 2.5,
            wallKind: "exterior",
            structuralRole: "bearing",
            fireRole: "none",
            assemblyId: null,
            locked: false,
            source: sourceMeta,
          },
          {
            id: "w_e",
            levelId: "level_0",
            centerline: { start: { x: 4, y: 0 }, end: { x: 4, y: 3 } },
            thicknessM: 0.12,
            heightM: 2.5,
            wallKind: "exterior",
            structuralRole: "bearing",
            fireRole: "none",
            assemblyId: null,
            locked: false,
            source: sourceMeta,
          },
          {
            id: "w_n",
            levelId: "level_0",
            centerline: { start: { x: 4, y: 3 }, end: { x: 0, y: 3 } },
            thicknessM: 0.12,
            heightM: 2.5,
            wallKind: "exterior",
            structuralRole: "bearing",
            fireRole: "none",
            assemblyId: null,
            locked: false,
            source: sourceMeta,
          },
          {
            id: "w_w",
            levelId: "level_0",
            centerline: { start: { x: 0, y: 3 }, end: { x: 0, y: 0 } },
            thicknessM: 0.12,
            heightM: 2.5,
            wallKind: "exterior",
            structuralRole: "bearing",
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
        furniture: [],
        zones: [],
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
    metadata: { title: "Test", createdAt: "2026-06-01T00:00:00.000Z" },
    provenance: { generator: "test", schemaVersion: "floor-plan.v1" },
  };
}

describe("renderFloorPlanSheetPdf", () => {
  test("returns valid PDF bytes (magic header %PDF)", async () => {
    const bytes = await renderFloorPlanSheetPdf(makeDoc(), "level_0", {
      scale: 100,
      paperSize: "A3",
      address: "Testgade 1",
    });
    expect(bytes.byteLength).toBeGreaterThan(100);
    expect([bytes[0], bytes[1], bytes[2], bytes[3]]).toEqual([0x25, 0x50, 0x44, 0x46]);
  });

  test("accepts A2 paper size without throwing", async () => {
    const bytes = await renderFloorPlanSheetPdf(makeDoc(), "level_0", { paperSize: "A2" });
    expect(bytes.byteLength).toBeGreaterThan(100);
  });

  test("works with default options (no opts)", async () => {
    const bytes = await renderFloorPlanSheetPdf(makeDoc(), "level_0");
    expect(bytes.byteLength).toBeGreaterThan(100);
  });
});

describe("renderFloorPlanSheetSvg", () => {
  test("returns a non-empty SVG string", () => {
    const svg = renderFloorPlanSheetSvg(makeDoc(), "level_0", {
      scale: 100,
      address: "Testgade 1",
    });
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg.length).toBeGreaterThan(100);
  });

  test("returned SVG includes the plan content", () => {
    const svg = renderFloorPlanSheetSvg(makeDoc(), "level_0");
    // Should include room or wall polygon data
    expect(svg).toContain("data-level-id");
  });
});
