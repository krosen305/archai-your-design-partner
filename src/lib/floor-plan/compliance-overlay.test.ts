// src/lib/floor-plan/compliance-overlay.test.ts

import { describe, expect, test } from "bun:test";
import { buildComplianceOverlay } from "./compliance-overlay";
import type { VerificationFinding } from "@/domain/floor-plan/verification-engine";
import type { FloorLevel } from "@/domain/floor-plan/floor-plan.types";

const sourceMeta = {
  source: "generated",
  confidence: "medium",
  fetchedAt: null,
  requiresReview: false,
} as const;

function makeRoom(
  id: string,
  name: string,
  roomType: "living" | "bedroom" | "kitchen" | "bathroom" | "hall" | "other",
  netAreaM2: number,
): FloorLevel["rooms"][number] {
  return {
    id,
    levelId: "level_0",
    name,
    roomType,
    polygon: {
      vertices: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 3 },
        { x: 0, y: 3 },
      ],
    },
    netAreaM2,
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
}

function makeLevel(rooms: FloorLevel["rooms"], zones: FloorLevel["zones"] = []): FloorLevel {
  return {
    id: "level_0",
    name: "Stueplan",
    levelIndex: 0,
    elevationM: 0,
    floorToFloorHeightM: null,
    walls: [],
    rooms,
    openings: [],
    fixtures: [],
    furniture: [],
    zones,
    stairs: [],
    annotations: [],
  };
}

function makeZone(
  id: string,
  name: string,
  areaM2: number,
  heated: boolean,
): FloorLevel["zones"][number] {
  return {
    id,
    levelId: "level_0",
    zoneKind: "terrace",
    polygon: {
      vertices: [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 2 },
        { x: 0, y: 2 },
      ],
    },
    name,
    areaM2,
    heated,
    source: sourceMeta,
  };
}

function makeFinding(
  id: string,
  severity: VerificationFinding["severity"],
  affectedElementIds: string[],
  message: string,
): VerificationFinding {
  return {
    id,
    severity,
    category: "br18",
    message,
    affectedElementIds,
    source: "deterministic",
    nextAction: null,
  };
}

describe("buildComplianceOverlay", () => {
  test("maps findings to the correct rooms by affectedElementIds", () => {
    const rooms = [
      makeRoom("r1", "Stue", "living", 20),
      makeRoom("r2", "Soveværelse", "bedroom", 12),
    ];
    const findings: VerificationFinding[] = [
      makeFinding("f1", "blocking", ["r1"], "Stue er for lille ifølge BR18"),
      makeFinding("f2", "warning", ["r2"], "Soveværelse mangler dagslys"),
    ];
    const overlay = buildComplianceOverlay(makeLevel(rooms), findings);
    const r1Compliance = overlay.roomCompliance.find((rc) => rc.roomId === "r1")!;
    const r2Compliance = overlay.roomCompliance.find((rc) => rc.roomId === "r2")!;
    expect(r1Compliance.findings).toHaveLength(1);
    expect(r1Compliance.findings[0]!.id).toBe("f1");
    expect(r1Compliance.findings[0]!.severity).toBe("blocking");
    expect(r2Compliance.findings).toHaveLength(1);
    expect(r2Compliance.findings[0]!.id).toBe("f2");
  });

  test("finding with no matching room is not included in roomCompliance", () => {
    const rooms = [makeRoom("r1", "Stue", "living", 20)];
    const findings: VerificationFinding[] = [
      // Affects a wall id, not any room id
      makeFinding("f_wall", "info", ["wall_1"], "Væg mangler assembly"),
    ];
    const overlay = buildComplianceOverlay(makeLevel(rooms), findings);
    const r1 = overlay.roomCompliance.find((rc) => rc.roomId === "r1")!;
    expect(r1.findings).toHaveLength(0);
  });

  test("areaSummary.totalHeatedM2 equals sum of room netAreaM2", () => {
    const rooms = [
      makeRoom("r1", "Stue", "living", 24),
      makeRoom("r2", "Soveværelse", "bedroom", 16),
    ];
    const overlay = buildComplianceOverlay(makeLevel(rooms), []);
    expect(overlay.areaSummary.totalHeatedM2).toBeCloseTo(40, 6);
  });

  test("areaSummary.totalBbrM2 equals totalHeatedM2", () => {
    const rooms = [makeRoom("r1", "Stue", "living", 30)];
    const overlay = buildComplianceOverlay(makeLevel(rooms), []);
    expect(overlay.areaSummary.totalBbrM2).toBe(overlay.areaSummary.totalHeatedM2);
  });

  test("unheated zones are included in totalUnheatedM2 not totalHeatedM2", () => {
    const rooms = [makeRoom("r1", "Stue", "living", 20)];
    const zones = [makeZone("z1", "Terrasse", 15, false)];
    const overlay = buildComplianceOverlay(makeLevel(rooms, zones), []);
    expect(overlay.areaSummary.totalHeatedM2).toBeCloseTo(20, 6);
    expect(overlay.areaSummary.totalUnheatedM2).toBeCloseTo(15, 6);
  });

  test("heated zones are not counted in totalUnheatedM2", () => {
    const rooms = [makeRoom("r1", "Stue", "living", 20)];
    const zones = [makeZone("z_hot", "Overdækket indgang", 5, true)];
    const overlay = buildComplianceOverlay(makeLevel(rooms, zones), []);
    expect(overlay.areaSummary.totalUnheatedM2).toBeCloseTo(0, 6);
  });

  test("shortLabel is ≤30 characters", () => {
    const rooms = [makeRoom("r1", "Stue", "living", 20)];
    const longMessage =
      "Dette er en meget lang besked om compliance der overskrider 30 tegn grænsen";
    const findings: VerificationFinding[] = [makeFinding("f1", "info", ["r1"], longMessage)];
    const overlay = buildComplianceOverlay(makeLevel(rooms), findings);
    const rc = overlay.roomCompliance.find((r) => r.roomId === "r1")!;
    expect(rc.findings[0]!.shortLabel.length).toBeLessThanOrEqual(30);
  });

  test("areaSummary rows include all rooms as heated_room type", () => {
    const rooms = [makeRoom("r1", "Stue", "living", 24), makeRoom("r2", "Bad", "bathroom", 6)];
    const overlay = buildComplianceOverlay(makeLevel(rooms), []);
    const heatedRows = overlay.areaSummary.rows.filter((r) => r.type === "heated_room");
    expect(heatedRows).toHaveLength(2);
    expect(heatedRows[0]!.areaFormatted).toMatch(/m²/);
  });

  test("areaFormatted is formatted correctly", () => {
    const rooms = [makeRoom("r1", "Stue", "living", 24.0)];
    const overlay = buildComplianceOverlay(makeLevel(rooms), []);
    expect(overlay.areaSummary.rows[0]!.areaFormatted).toBe("24.0 m²");
  });

  test("returns empty roomCompliance when there are no rooms", () => {
    const overlay = buildComplianceOverlay(makeLevel([]), []);
    expect(overlay.roomCompliance).toHaveLength(0);
    expect(overlay.areaSummary.totalHeatedM2).toBe(0);
  });

  test("a finding affecting multiple rooms is mapped to all affected rooms", () => {
    const rooms = [
      makeRoom("r1", "Stue", "living", 20),
      makeRoom("r2", "Soveværelse", "bedroom", 12),
    ];
    const findings: VerificationFinding[] = [
      makeFinding("f_multi", "warning", ["r1", "r2"], "Begge rum er for varme"),
    ];
    const overlay = buildComplianceOverlay(makeLevel(rooms), findings);
    const r1 = overlay.roomCompliance.find((rc) => rc.roomId === "r1")!;
    const r2 = overlay.roomCompliance.find((rc) => rc.roomId === "r2")!;
    expect(r1.findings).toHaveLength(1);
    expect(r2.findings).toHaveLength(1);
  });
});
