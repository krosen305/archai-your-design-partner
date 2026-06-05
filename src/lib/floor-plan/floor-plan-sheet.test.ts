// src/lib/floor-plan/floor-plan-sheet.test.ts
//
// Regression tests: ensures the authority-required sheet elements (scale
// indicator, north arrow, title block, area schedule) are present and correct
// in every sheet produced by buildFloorPlanSheet.

import { describe, expect, it } from "bun:test";
import { buildFloorPlanSheet } from "./floor-plan-sheet";
import type { FloorPlanDocument } from "@/domain/floor-plan/floor-plan.types";

// ── helpers ─────────────────────────────────────────────────────────────────

const SOURCE_META = {
  source: "generated",
  confidence: "medium",
  fetchedAt: null,
  requiresReview: false,
} as const;

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
    source: SOURCE_META,
  };
}

function makeSampleDoc(): FloorPlanDocument {
  return {
    schemaVersion: "floor-plan.v1",
    projectId: "proj_sheet_test",
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
          wall("w_s", [0, 0], [10, 0]),
          wall("w_e", [10, 0], [10, 8]),
          wall("w_n", [10, 8], [0, 8]),
          wall("w_w", [0, 8], [0, 0]),
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
                { x: 6, y: 0 },
                { x: 6, y: 8 },
                { x: 0, y: 8 },
              ],
            },
            netAreaM2: 48,
            minAreaM2: null,
            targetAreaM2: null,
            floorFinishAssemblyId: null,
            ceilingFinishAssemblyId: null,
            wallFinishAssemblyByWallId: {},
            ventilationNeed: "natural",
            wetRoomZone: false,
            daylightRelevant: true,
            source: SOURCE_META,
          },
          {
            id: "room_bad",
            levelId: "level_0",
            name: "Badeværelse",
            roomType: "bathroom",
            polygon: {
              vertices: [
                { x: 6, y: 0 },
                { x: 10, y: 0 },
                { x: 10, y: 8 },
                { x: 6, y: 8 },
              ],
            },
            netAreaM2: 12,
            minAreaM2: null,
            targetAreaM2: null,
            floorFinishAssemblyId: null,
            ceilingFinishAssemblyId: null,
            wallFinishAssemblyByWallId: {},
            ventilationNeed: "mechanical",
            wetRoomZone: true,
            daylightRelevant: false,
            source: SOURCE_META,
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
                { x: 0, y: -3 },
                { x: 10, y: -3 },
                { x: 10, y: 0 },
                { x: 0, y: 0 },
              ],
            },
            name: "Terrasse",
            areaM2: 30,
            heated: false,
            source: SOURCE_META,
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
    metadata: { title: "Sheet test", createdAt: "2026-06-01T00:00:00.000Z" },
    provenance: { generator: "test", schemaVersion: "floor-plan.v1" },
  };
}

// ── authority-required elements: comprehensive regression test ───────────────

describe("buildFloorPlanSheet — myndighedskrav (authority-required elements)", () => {
  const doc = makeSampleDoc();
  const sheet = buildFloorPlanSheet(doc, "level_0", {
    scale: 100,
    paperSize: "A3",
    address: "Parcelvej 1, 2800 Kongens Lyngby",
  });

  // ── scale indicator ──────────────────────────────────────────────────────

  it("sheetMeta.scaleDenominator er korrekt (100 for 1:100)", () => {
    expect(sheet.sheetMeta.scaleDenominator).toBe(100);
  });

  it("sheetMeta.scaleLabel er '1:100'", () => {
    expect(sheet.sheetMeta.scaleLabel).toBe("1:100");
  });

  it("SVG-output indeholder målestok-tekst '1:100'", () => {
    const combined = sheet.svgElements.join("\n");
    expect(combined).toContain("1:100");
  });

  it("sheetMeta.titleBlock.scaleText indeholder målestoks-streng", () => {
    expect(sheet.sheetMeta.titleBlock.scaleText).toBe("Plantegning 1:100");
  });

  // ── north arrow ──────────────────────────────────────────────────────────

  it("sheetMeta.northArrow er true", () => {
    expect(sheet.sheetMeta.northArrow).toBe(true);
  });

  it("SVG-output indeholder nordpil N-label", () => {
    const combined = sheet.svgElements.join("\n");
    expect(combined).toContain(">N<");
  });

  // ── title block ──────────────────────────────────────────────────────────

  it("sheetMeta.titleBlock.address matcher options.address", () => {
    expect(sheet.sheetMeta.titleBlock.address).toBe("Parcelvej 1, 2800 Kongens Lyngby");
  });

  it("sheetMeta.titleBlock.createdAt matcher doc.metadata.createdAt", () => {
    expect(sheet.sheetMeta.titleBlock.createdAt).toBe("2026-06-01T00:00:00.000Z");
  });

  it("SVG-output indeholder adresse fra titelblok", () => {
    const combined = sheet.svgElements.join("\n");
    expect(combined).toContain("Parcelvej 1");
  });

  it("SVG-output indeholder dato formateret som DD.MM.YYYY", () => {
    const combined = sheet.svgElements.join("\n");
    expect(combined).toContain("01.06.2026");
  });

  it("SVG-output indeholder branding 'ArchAI'", () => {
    const combined = sheet.svgElements.join("\n");
    expect(combined).toContain("ArchAI");
  });

  // ── area schedule ─────────────────────────────────────────────────────────

  it("sheetMeta.areaSchedule indeholder mindst ét rum (opvarmet areal)", () => {
    expect(sheet.sheetMeta.areaSchedule.length).toBeGreaterThanOrEqual(1);
    const heated = sheet.sheetMeta.areaSchedule.filter((r) => r.heated);
    expect(heated.length).toBeGreaterThanOrEqual(1);
  });

  it("sheetMeta.areaSchedule har korrekte rum: Stue (48 m²) og Badeværelse (12 m²)", () => {
    const stue = sheet.sheetMeta.areaSchedule.find((r) => r.label === "Stue");
    expect(stue).toBeDefined();
    expect(stue?.areaM2).toBe(48);
    expect(stue?.heated).toBe(true);

    const bad = sheet.sheetMeta.areaSchedule.find((r) => r.label === "Badeværelse");
    expect(bad).toBeDefined();
    expect(bad?.areaM2).toBe(12);
    expect(bad?.heated).toBe(true);
  });

  it("sheetMeta.areaSchedule indeholder uopvarmet zone (Terrasse 30 m²)", () => {
    const terr = sheet.sheetMeta.areaSchedule.find((r) => r.label === "Terrasse");
    expect(terr).toBeDefined();
    expect(terr?.areaM2).toBe(30);
    expect(terr?.heated).toBe(false);
  });

  it("SVG-output indeholder arealskema-labels og arealer", () => {
    const combined = sheet.svgElements.join("\n");
    expect(combined).toContain("Stue");
    expect(combined).toContain("48.0");
    expect(combined).toContain("Badeværelse");
    expect(combined).toContain("12.0");
    expect(combined).toContain("Terrasse");
    expect(combined).toContain("30.0");
  });

  it("SVG-output skelner opvarmet/uopvarmet i arealskema", () => {
    const combined = sheet.svgElements.join("\n");
    expect(combined).toContain("opvarmet");
    expect(combined).toContain("uopvarmet");
  });

  // ── scale variant: 1:50 / A2 ─────────────────────────────────────────────

  it("sheetMeta.scaleLabel er '1:50' for scale=50", () => {
    const sheet50 = buildFloorPlanSheet(doc, "level_0", { scale: 50, paperSize: "A2" });
    expect(sheet50.sheetMeta.scaleLabel).toBe("1:50");
    expect(sheet50.sheetMeta.scaleDenominator).toBe(50);
    expect(sheet50.sheetMeta.titleBlock.scaleText).toBe("Plantegning 1:50");
  });

  // ── no address: titleBlock.address is null ────────────────────────────────

  it("sheetMeta.titleBlock.address er null når address ikke er angivet", () => {
    const sheetNoAddr = buildFloorPlanSheet(doc, "level_0");
    expect(sheetNoAddr.sheetMeta.titleBlock.address).toBeNull();
  });
});
