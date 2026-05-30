// src/domain/floor-plan/verification-engine.ts
//
// Deterministic formal-verification engine (spec §10, §20.2). Pure TypeScript,
// 0 AI tokens. Implements the P0 rule subset over a FloorPlanDocument and
// returns canonical findings, status, metrics and material basis. Site/compliance
// rules (FP-SITE-*) and the cross-CRS footprint check (FP-GEO-003) are added by
// the verification service, which holds trusted data (spec §23.3.4).

import { pointInPolygon, polygonCentroid } from "../geometry/polygon-ops";
import { detectRooms } from "./topology-engine";
import { deriveMaterialBasisSummary, type MaterialBasisSummary } from "./material-basis";
import type { FloorPlanDocument } from "./floor-plan.types";

export type VerificationSeverity = "info" | "warning" | "review_required" | "blocking";

export type VerificationFinding = {
  id: string;
  severity: VerificationSeverity;
  category:
    | "topology"
    | "geometry"
    | "room_program"
    | "site_compliance"
    | "br18"
    | "material_basis";
  message: string;
  affectedElementIds: string[];
  source: "deterministic";
  nextAction: string | null;
};

export type FloorPlanVerificationStatus =
  | "CONCEPT_DRAFT"
  | "TECHNICAL_REVIEW"
  | "AUTHORITY_REVIEW"
  | "DOCUMENTATION_REQUIRED"
  | "BLOCKED";

export type FloorPlanVerificationReport = {
  status: FloorPlanVerificationStatus;
  findings: VerificationFinding[];
  metrics: {
    grossAreaM2: number | null;
    netAreaM2: number | null;
    levelsCount: number;
    roomsCount: number;
    exteriorWallLengthM: number | null;
    interiorWallLengthM: number | null;
    openingsCount: number;
  };
  materialBasis: MaterialBasisSummary;
  missingDataPoints: string[];
};

const MIN_ROOM_AREA_M2 = 1e-3;

export function runVerification(doc: FloorPlanDocument): FloorPlanVerificationReport {
  const findings: VerificationFinding[] = [];
  const walls = doc.levels.flatMap((l) => l.walls);
  const rooms = doc.levels.flatMap((l) => l.rooms);
  const openings = doc.levels.flatMap((l) => l.openings);

  checkOpeningWallRefs(doc, findings); // FP-TOPO-003
  checkRoomReconciliation(doc, findings); // FP-TOPO-001
  checkRoomAreas(rooms, findings); // FP-GEO-001
  const grossAreaM2 = checkAreaPlausibility(walls, rooms, findings); // FP-GEO-002
  checkRequiredRoomTypes(doc, findings); // FP-ROOM-001
  checkRoomTargets(rooms, findings); // FP-ROOM-002
  checkMissingAssemblies(walls, findings); // FP-MAT-001
  const materialBasis = deriveMaterialBasisSummary(doc);
  checkWallAreaComputable(materialBasis, findings); // FP-MAT-002

  const netAreaM2 = rooms.reduce((sum, r) => sum + r.netAreaM2, 0);

  return {
    status: deriveStatus(findings),
    findings,
    metrics: {
      grossAreaM2,
      netAreaM2: rooms.length > 0 ? netAreaM2 : null,
      levelsCount: doc.levels.length,
      roomsCount: rooms.length,
      exteriorWallLengthM: materialBasis.exteriorWallLengthM,
      interiorWallLengthM: materialBasis.interiorWallLengthM,
      openingsCount: openings.length,
    },
    materialBasis,
    missingDataPoints: materialBasis.missingDataPoints,
  };
}

// --- Rules -----------------------------------------------------------------

function checkOpeningWallRefs(doc: FloorPlanDocument, out: VerificationFinding[]): void {
  for (const level of doc.levels) {
    const wallIds = new Set(level.walls.map((w) => w.id));
    for (const opening of level.openings) {
      if (!wallIds.has(opening.wallId)) {
        out.push({
          id: `FP-TOPO-003/${opening.id}`,
          severity: "blocking",
          category: "topology",
          message: `Åbningen "${opening.id}" refererer til en væg (${opening.wallId}) der ikke findes.`,
          affectedElementIds: [opening.id],
          source: "deterministic",
          nextAction: "Knyt åbningen til en eksisterende væg.",
        });
      }
    }
  }
}

function checkRoomReconciliation(doc: FloorPlanDocument, out: VerificationFinding[]): void {
  for (const level of doc.levels) {
    const faces = detectRooms(level.walls.map((w) => w.centerline));
    for (const room of level.rooms) {
      const roomCentroid = polygonCentroid(room.polygon);
      const reconciled = faces.some((face) => pointInPolygon(roomCentroid, face.boundary));
      if (!reconciled) {
        out.push({
          id: `FP-TOPO-001/${room.id}`,
          severity: "blocking",
          category: "topology",
          message: `Rummet "${room.name}" kan ikke genskabes fra væggrafen (ingen lukket flade om rummet).`,
          affectedElementIds: [room.id],
          source: "deterministic",
          nextAction: "Luk rummet med vægge, eller flyt væggen tilbage.",
        });
      }
    }
  }
}

function checkRoomAreas(
  rooms: FloorPlanDocument["levels"][number]["rooms"],
  out: VerificationFinding[],
): void {
  for (const room of rooms) {
    if (room.netAreaM2 <= MIN_ROOM_AREA_M2) {
      out.push({
        id: `FP-GEO-001/${room.id}`,
        severity: "blocking",
        category: "geometry",
        message: `Rummet "${room.name}" har et ikke-positivt areal (${room.netAreaM2} m²).`,
        affectedElementIds: [room.id],
        source: "deterministic",
        nextAction: "Ret rummets geometri så arealet bliver positivt.",
      });
    }
  }
}

function checkAreaPlausibility(
  walls: FloorPlanDocument["levels"][number]["walls"],
  rooms: FloorPlanDocument["levels"][number]["rooms"],
  out: VerificationFinding[],
): number | null {
  if (walls.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const w of walls) {
    for (const p of [w.centerline.start, w.centerline.end]) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  const grossAreaM2 = (maxX - minX) * (maxY - minY);
  const netAreaM2 = rooms.reduce((sum, r) => sum + r.netAreaM2, 0);
  if (grossAreaM2 > 0 && netAreaM2 > grossAreaM2 * 1.01) {
    out.push({
      id: "FP-GEO-002/area",
      severity: "warning",
      category: "geometry",
      message: `Samlet nettoareal (${netAreaM2.toFixed(1)} m²) overstiger plangrundens bruttoareal (${grossAreaM2.toFixed(1)} m²).`,
      affectedElementIds: [],
      source: "deterministic",
      nextAction: "Kontrollér rumarealer og vægplacering.",
    });
  }
  return grossAreaM2;
}

function checkRequiredRoomTypes(doc: FloorPlanDocument, out: VerificationFinding[]): void {
  const present = new Set<string>(doc.levels.flatMap((l) => l.rooms.map((r) => r.roomType)));
  const missing = doc.roomProgram.requiredRoomTypes.filter((t) => !present.has(t));
  if (missing.length > 0) {
    out.push({
      id: "FP-ROOM-001/missing",
      severity: "warning",
      category: "room_program",
      message: `Rumprogrammet kræver rumtyper der mangler i planen: ${missing.join(", ")}.`,
      affectedElementIds: [],
      source: "deterministic",
      nextAction: "Tilføj de manglende rum, eller justér rumprogrammet.",
    });
  }
}

function checkRoomTargets(
  rooms: FloorPlanDocument["levels"][number]["rooms"],
  out: VerificationFinding[],
): void {
  for (const room of rooms) {
    const floor = room.minAreaM2 ?? room.targetAreaM2;
    if (floor !== null && room.netAreaM2 < floor) {
      out.push({
        id: `FP-ROOM-002/${room.id}`,
        severity: "warning",
        category: "room_program",
        message: `Rummet "${room.name}" er ${room.netAreaM2.toFixed(1)} m² og under ønsket ${floor.toFixed(1)} m².`,
        affectedElementIds: [room.id],
        source: "deterministic",
        nextAction: "Gør rummet større, eller justér ønsket minimum.",
      });
    }
  }
}

function checkMissingAssemblies(
  walls: FloorPlanDocument["levels"][number]["walls"],
  out: VerificationFinding[],
): void {
  const missing = walls.filter((w) => w.assemblyId === null).map((w) => w.id);
  if (missing.length > 0) {
    out.push({
      id: "FP-MAT-001/walls",
      severity: "info",
      category: "material_basis",
      message: `${missing.length} væg(ge) mangler en assembly og kan ikke give materialelag endnu.`,
      affectedElementIds: missing,
      source: "deterministic",
      nextAction: "Tildel væg-assemblies for at nærme dig materialeoverslag.",
    });
  }
}

function checkWallAreaComputable(
  materialBasis: MaterialBasisSummary,
  out: VerificationFinding[],
): void {
  if (materialBasis.wallGrossAreaM2 === null) {
    out.push({
      id: "FP-MAT-002/wall-area",
      severity: "warning",
      category: "material_basis",
      message: "Vægareal kan ikke beregnes, fordi en eller flere vægge mangler højde.",
      affectedElementIds: [],
      source: "deterministic",
      nextAction: "Angiv højde på alle vægge for at beregne vægareal.",
    });
  }
}

// --- Status ----------------------------------------------------------------

export function deriveStatus(findings: VerificationFinding[]): FloorPlanVerificationStatus {
  if (findings.some((f) => f.severity === "blocking")) return "BLOCKED";
  if (findings.some((f) => f.severity === "review_required")) return "DOCUMENTATION_REQUIRED";
  return "TECHNICAL_REVIEW";
}
