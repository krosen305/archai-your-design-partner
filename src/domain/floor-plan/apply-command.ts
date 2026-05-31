// src/domain/floor-plan/apply-command.ts
//
// Deterministic command application (spec §7.2.1). Pure and atomic: a command
// either applies cleanly to a fresh copy of the document, or is rejected with a
// reason and no mutation. Drag and AI-text commands converge here. 0 AI tokens.
//
// Lifecycle: permission/lock check -> deterministic apply -> topology repair ->
// geometry recalculation -> live validation result.

import { lineLengthM, pointInPolygon, polygonCentroid } from "../geometry/polygon-ops";
import type { Point2D, Polygon2D } from "../geometry/geometry-2d.types";
import { detectRooms, reconcileRoomIdentity } from "./topology-engine";
import { runVerification } from "./verification-engine";
import type { FloorPlanCommand, CommandRejectionCode } from "./commands";
import type { FloorPlanDocument, FloorLevel, RoomZone, Wall } from "./floor-plan.types";

const TOL = 1e-6;

export type LiveFinding = { severity: string; category: string; message: string };

export type ApplyOutcome =
  | {
      accepted: true;
      document: FloorPlanDocument;
      changedElementIds: string[];
      liveFindings: LiveFinding[];
    }
  | {
      accepted: false;
      reasonCode: CommandRejectionCode;
      message: string;
      suggestedCommands: FloorPlanCommand[];
    };

function reject(reasonCode: CommandRejectionCode, message: string): ApplyOutcome {
  return { accepted: false, reasonCode, message, suggestedCommands: [] };
}

function liveFindingsFor(doc: FloorPlanDocument): LiveFinding[] {
  return runVerification(doc).findings.map((f) => ({
    severity: f.severity,
    category: f.category,
    message: f.message,
  }));
}

export function applyCommand(doc: FloorPlanDocument, command: FloorPlanCommand): ApplyOutcome {
  switch (command.type) {
    case "move_wall":
      return applyMoveWall(doc, command);
    case "move_opening":
      return applyMoveOpening(doc, command);
    case "move_fixture":
      return applyMoveFixture(doc, command);
    default:
      return reject(
        "WOULD_CORRUPT_TOPOLOGY",
        `Kommandoen "${command.type}" understøttes ikke endnu.`,
      );
  }
}

// --- move_wall -------------------------------------------------------------

function applyMoveWall(
  doc: FloorPlanDocument,
  cmd: Extract<FloorPlanCommand, { type: "move_wall" }>,
): ApplyOutcome {
  const located = locateWall(doc, cmd.wallId);
  if (!located) return reject("WALL_NOT_FOUND", `Væggen "${cmd.wallId}" findes ikke.`);
  const { wall } = located;
  if (wall.locked) return reject("ELEMENT_LOCKED", "Væggen er låst mod ændring.");

  const next = structuredClone(doc);
  const level = next.levels[located.levelIndex]!;
  const target = level.walls.find((w) => w.id === cmd.wallId)!;

  const oldEndpoints = [clonePoint(target.centerline.start), clonePoint(target.centerline.end)];
  const moves = oldEndpoints.map((p) => ({
    old: p,
    next: cmd.axis === "x" ? { x: p.x + cmd.deltaM, y: p.y } : { x: p.x, y: p.y + cmd.deltaM },
  }));

  // Drag every coincident wall endpoint so attached walls stretch with the move.
  const draggedWallIds = new Set<string>();
  for (const w of level.walls) {
    for (const ep of [w.centerline.start, w.centerline.end] as Point2D[]) {
      const m = moves.find((mv) => pointsEqual(ep, mv.old));
      if (m) {
        ep.x = m.next.x;
        ep.y = m.next.y;
        draggedWallIds.add(w.id);
      }
    }
  }

  const changedRoomIds = recomputeRooms(level);

  return {
    accepted: true,
    document: next,
    changedElementIds: [...draggedWallIds, ...changedRoomIds],
    liveFindings: liveFindingsFor(next),
  };
}

// --- move_opening ----------------------------------------------------------

function applyMoveOpening(
  doc: FloorPlanDocument,
  cmd: Extract<FloorPlanCommand, { type: "move_opening" }>,
): ApplyOutcome {
  const next = structuredClone(doc);
  let opening = null as null | ReturnType<typeof findOpening>;
  for (const level of next.levels) {
    const found = findOpening(level, cmd.openingId);
    if (found) {
      opening = found;
      break;
    }
  }
  if (!opening) return reject("OPENING_NOT_FOUND", `Åbningen "${cmd.openingId}" findes ikke.`);

  const wall = opening.level.walls.find((w) => w.id === cmd.wallId);
  if (!wall) return reject("WALL_NOT_FOUND", `Værtsvæggen "${cmd.wallId}" findes ikke.`);

  const wallLen = lineLengthM(wall.centerline);
  const half = opening.opening.widthM / 2;
  if (cmd.offsetM - half < -TOL || cmd.offsetM + half > wallLen + TOL) {
    return reject(
      "OPENING_OUTSIDE_PARENT_WALL",
      `Åbningen kan ikke placeres ved ${cmd.offsetM} m; den ville krydse væggens endepunkt (væglængde ${wallLen.toFixed(2)} m).`,
    );
  }

  const overlaps = opening.level.openings.some(
    (o) =>
      o.id !== cmd.openingId &&
      o.wallId === cmd.wallId &&
      Math.abs(o.offsetAlongWallM - cmd.offsetM) < (o.widthM + opening!.opening.widthM) / 2 - TOL,
  );
  if (overlaps) {
    return reject(
      "OPENING_OVERLAPS_ANOTHER",
      "Åbningen ville overlappe en anden åbning på væggen.",
    );
  }

  opening.opening.wallId = cmd.wallId;
  opening.opening.offsetAlongWallM = cmd.offsetM;

  return {
    accepted: true,
    document: next,
    changedElementIds: [cmd.openingId],
    liveFindings: liveFindingsFor(next),
  };
}

// --- move_fixture ----------------------------------------------------------

function applyMoveFixture(
  doc: FloorPlanDocument,
  cmd: Extract<FloorPlanCommand, { type: "move_fixture" }>,
): ApplyOutcome {
  const next = structuredClone(doc);
  for (const level of next.levels) {
    const fixture = level.fixtures.find((f) => f.id === cmd.fixtureId);
    if (!fixture) continue;
    const room = level.rooms.find((r) => r.id === cmd.roomId);
    if (!room) return reject("ROOM_NOT_FOUND", `Rummet "${cmd.roomId}" findes ikke.`);
    const point: Point2D = { x: cmd.x, y: cmd.y };
    if (!pointInPolygon(point, room.polygon)) {
      return reject("ROOM_NOT_FOUND", "Punktet ligger uden for det valgte rum.");
    }
    fixture.position = point;
    fixture.roomId = cmd.roomId;
    return {
      accepted: true,
      document: next,
      changedElementIds: [cmd.fixtureId],
      liveFindings: liveFindingsFor(next),
    };
  }
  return reject("FIXTURE_NOT_FOUND", `Inventaret "${cmd.fixtureId}" findes ikke.`);
}

// --- helpers ---------------------------------------------------------------

function locateWall(
  doc: FloorPlanDocument,
  wallId: string,
): { wall: Wall; levelIndex: number } | null {
  for (let i = 0; i < doc.levels.length; i++) {
    const wall = doc.levels[i]!.walls.find((w) => w.id === wallId);
    if (wall) return { wall, levelIndex: i };
  }
  return null;
}

function findOpening(level: FloorLevel, openingId: string) {
  const opening = level.openings.find((o) => o.id === openingId);
  return opening ? { opening, level } : null;
}

function clonePoint(p: Point2D): Point2D {
  return { x: p.x, y: p.y };
}

function pointsEqual(a: Point2D, b: Point2D): boolean {
  return Math.abs(a.x - b.x) < TOL && Math.abs(a.y - b.y) < TOL;
}

/**
 * Re-derive room geometry from the (possibly moved) walls, preserving stable
 * room identity, labels and material fields. Returns the IDs of rooms whose
 * geometry changed.
 */
function recomputeRooms(level: FloorLevel): string[] {
  const detected = detectRooms(level.walls.map((w) => w.centerline));
  const previous = level.rooms.map((r) => ({
    id: r.id,
    centroid: polygonCentroid(r.polygon),
  }));
  const reconciled = reconcileRoomIdentity(previous, detected);

  const byId = new Map(level.rooms.map((r) => [r.id, r]));
  const changed: string[] = [];
  const nextRooms: RoomZone[] = reconciled.map((face) => {
    const existing = byId.get(face.id);
    const polygon: Polygon2D = face.boundary;
    if (existing) {
      if (existing.netAreaM2 !== face.areaM2) changed.push(existing.id);
      return { ...existing, polygon, netAreaM2: face.areaM2 };
    }
    changed.push(face.id);
    return newRoomFrom(level, face.id, polygon, face.areaM2);
  });

  level.rooms = nextRooms;
  return changed;
}

function newRoomFrom(level: FloorLevel, id: string, polygon: Polygon2D, areaM2: number): RoomZone {
  return {
    id,
    levelId: level.id,
    name: "Nyt rum",
    roomType: "other",
    polygon,
    netAreaM2: areaM2,
    minAreaM2: null,
    targetAreaM2: null,
    floorFinishAssemblyId: null,
    ceilingFinishAssemblyId: null,
    wallFinishAssemblyByWallId: {},
    ventilationNeed: "unknown",
    wetRoomZone: false,
    daylightRelevant: false,
    source: {
      source: "generated",
      confidence: "low",
      fetchedAt: null,
      requiresReview: true,
    },
  };
}
