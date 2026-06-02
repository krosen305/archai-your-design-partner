// src/lib/floor-plan/title-block.test.ts

import { describe, expect, test } from "bun:test";
import { buildTitleBlock } from "./title-block";
import { buildFloorPlanSheet } from "./floor-plan-sheet";
import type { FloorPlanDocument } from "@/domain/floor-plan/floor-plan.types";

// ---- shared helpers -------------------------------------------------------

const sourceMeta = {
  source: "generated",
  confidence: "medium",
  fetchedAt: null,
  requiresReview: false,
} as const;

function makeDoc(): FloorPlanDocument {
  return {
    schemaVersion: "floor-plan.v1",
    projectId: "proj_tb",
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
          wall("w_s", [0, 0], [8, 0]),
          wall("w_e", [8, 0], [8, 6]),
          wall("w_n", [8, 6], [0, 6]),
          wall("w_w", [0, 6], [0, 0]),
        ],
        rooms: [
          {
            id: "room_stue",
            levelId: "level_0",
            name: "Stue",
            roomType: "living",
            polygon: {
              vertices: [
                { x: 0, y: 0 },
                { x: 4, y: 0 },
                { x: 4, y: 6 },
                { x: 0, y: 6 },
              ],
            },
            netAreaM2: 24,
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
          {
            id: "room_ko",
            levelId: "level_0",
            name: "Køkken",
            roomType: "kitchen",
            polygon: {
              vertices: [
                { x: 4, y: 0 },
                { x: 8, y: 0 },
                { x: 8, y: 6 },
                { x: 4, y: 6 },
              ],
            },
            netAreaM2: 18.5,
            minAreaM2: null,
            targetAreaM2: null,
            floorFinishAssemblyId: null,
            ceilingFinishAssemblyId: null,
            wallFinishAssemblyByWallId: {},
            ventilationNeed: "mechanical",
            wetRoomZone: false,
            daylightRelevant: true,
            source: sourceMeta,
          },
        ],
        openings: [],
        fixtures: [],
        furniture: [],
        zones: [
          {
            id: "zone_terr",
            levelId: "level_0",
            zoneKind: "terrace",
            polygon: {
              vertices: [
                { x: 0, y: -2 },
                { x: 8, y: -2 },
                { x: 8, y: 0 },
                { x: 0, y: 0 },
              ],
            },
            name: "Terrasse",
            areaM2: 16,
            heated: false,
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
    metadata: { title: "TB test", createdAt: "2026-06-01T00:00:00.000Z" },
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
    wallKind: "exterior" as const,
    structuralRole: "bearing" as const,
    fireRole: "none" as const,
    assemblyId: null as string | null,
    locked: false,
    source: sourceMeta,
  };
}

// ---- buildTitleBlock tests ------------------------------------------------

describe("buildTitleBlock", () => {
  const rows = [
    { label: "Stue", areaM2: 24, heated: true },
    { label: "Køkken", areaM2: 18.5, heated: true },
    { label: "Terrasse", areaM2: 16, heated: false },
  ];

  const layout = buildTitleBlock({
    address: "Testvej 1, 2100 København Ø",
    areaTableRows: rows,
    scale: 100,
    paperWidthMm: 420,
    paperHeightMm: 297,
    createdAt: "2026-06-01T00:00:00.000Z",
    branding: "ArchAI",
  });

  test("returns svgElements array with at least 3 elements", () => {
    expect(Array.isArray(layout.svgElements)).toBe(true);
    expect(layout.svgElements.length).toBeGreaterThanOrEqual(3);
  });

  test("address appears in SVG output", () => {
    const combined = layout.svgElements.join("\n");
    expect(combined).toContain("Testvej 1");
    expect(combined).toContain("2100 K");
  });

  test("scale text appears in SVG output", () => {
    const combined = layout.svgElements.join("\n");
    expect(combined).toContain("1:100");
  });

  test("branding text appears in SVG output", () => {
    const combined = layout.svgElements.join("\n");
    expect(combined).toContain("ArchAI");
  });

  test("copyright text appears in SVG output", () => {
    const combined = layout.svgElements.join("\n");
    expect(combined).toContain("© ArchAI 2026");
  });

  test("area table rows are present with labels and areas", () => {
    const combined = layout.svgElements.join("\n");
    expect(combined).toContain("Stue");
    expect(combined).toContain("24.0");
    expect(combined).toContain("Køkken");
    expect(combined).toContain("18.5");
    expect(combined).toContain("Terrasse");
    expect(combined).toContain("16.0");
  });

  test("heated/uopvarmet labels are correct", () => {
    const combined = layout.svgElements.join("\n");
    expect(combined).toContain("opvarmet");
    expect(combined).toContain("uopvarmet");
  });

  test("date is formatted as DD.MM.YYYY", () => {
    const combined = layout.svgElements.join("\n");
    expect(combined).toContain("01.06.2026");
  });

  test("returns positive blockWidthPx and blockHeightPx", () => {
    expect(layout.blockWidthPx).toBeGreaterThan(0);
    expect(layout.blockHeightPx).toBeGreaterThan(0);
  });

  test("works without optional fields (no address, no createdAt)", () => {
    const minimal = buildTitleBlock({
      areaTableRows: [],
      scale: 50,
      paperWidthMm: 420,
      paperHeightMm: 297,
    });
    expect(minimal.svgElements.length).toBeGreaterThanOrEqual(3);
    expect(minimal.blockWidthPx).toBeGreaterThan(0);
  });

  test("XML-special characters in address are escaped", () => {
    const escaped = buildTitleBlock({
      address: "Ø & Å > 1",
      areaTableRows: [],
      scale: 100,
      paperWidthMm: 420,
      paperHeightMm: 297,
    });
    const combined = escaped.svgElements.join("\n");
    expect(combined).toContain("&amp;");
    expect(combined).not.toContain(" & ");
  });
});

// ---- buildFloorPlanSheet tests --------------------------------------------

describe("buildFloorPlanSheet", () => {
  test("returns correct A3 dimensions at 1:100", () => {
    const sheet = buildFloorPlanSheet(makeDoc(), "level_0", {
      scale: 100,
      paperSize: "A3",
      address: "Testvej 1",
    });
    // A3 landscape: 420×297mm at 96dpi = ~1587×1122px
    expect(sheet.totalWidthPx).toBe(Math.round(420 * (96 / 25.4)));
    expect(sheet.totalHeightPx).toBe(Math.round(297 * (96 / 25.4)));
  });

  test("returns correct A2 dimensions at 1:50", () => {
    const sheet = buildFloorPlanSheet(makeDoc(), "level_0", {
      scale: 50,
      paperSize: "A2",
    });
    expect(sheet.totalWidthPx).toBe(Math.round(594 * (96 / 25.4)));
    expect(sheet.totalHeightPx).toBe(Math.round(420 * (96 / 25.4)));
  });

  test("pxPerMm is approximately 3.78 (96dpi)", () => {
    const sheet = buildFloorPlanSheet(makeDoc(), "level_0");
    expect(sheet.pxPerMm).toBeCloseTo(96 / 25.4, 3);
  });

  test("svgElements is a non-empty array of strings", () => {
    const sheet = buildFloorPlanSheet(makeDoc(), "level_0");
    expect(Array.isArray(sheet.svgElements)).toBe(true);
    expect(sheet.svgElements.length).toBeGreaterThan(0);
    for (const el of sheet.svgElements) {
      expect(typeof el).toBe("string");
    }
  });

  test("elements include north arrow N label", () => {
    const sheet = buildFloorPlanSheet(makeDoc(), "level_0");
    const combined = sheet.svgElements.join("\n");
    expect(combined).toContain(">N<");
  });

  test("elements include title block address", () => {
    const sheet = buildFloorPlanSheet(makeDoc(), "level_0", {
      address: "Parcelvej 42",
    });
    const combined = sheet.svgElements.join("\n");
    expect(combined).toContain("Parcelvej 42");
  });

  test("elements include title block area rows for rooms and unheated zones", () => {
    const sheet = buildFloorPlanSheet(makeDoc(), "level_0");
    const combined = sheet.svgElements.join("\n");
    // Rooms
    expect(combined).toContain("Stue");
    expect(combined).toContain("Køkken");
    // Unheated zone
    expect(combined).toContain("Terrasse");
  });

  test("defaults to A3 1:100 when no options given", () => {
    const sheet = buildFloorPlanSheet(makeDoc(), "level_0");
    expect(sheet.totalWidthPx).toBe(Math.round(420 * (96 / 25.4)));
    expect(sheet.totalHeightPx).toBe(Math.round(297 * (96 / 25.4)));
  });

  test("throws for unknown levelId", () => {
    expect(() => buildFloorPlanSheet(makeDoc(), "level_99")).toThrow();
  });
});
