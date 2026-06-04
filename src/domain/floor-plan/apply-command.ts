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
import type {
  FloorPlanDocument,
  FloorLevel,
  RoomZone,
  Wall,
  Opening,
  Fixture,
  Furniture,
} from "./floor-plan.types";

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
    case "resize_opening":
      return applyResizeOpening(doc, command);
    case "move_fixture":
      return applyMoveFixture(doc, command);
    case "add_wall":
      return applyAddWall(doc, command);
    case "add_opening":
      return applyAddOpening(doc, command);
    case "add_fixture":
      return applyAddFixture(doc, command);
    case "add_furniture":
      return applyAddFurniture(doc, command);
    case "delete_wall":
      return applyDeleteWall(doc, command);
    case "split_room":
      return applySplitRoom(doc, command);
    case "merge_rooms":
      return applyMergeRooms(doc, command);
    default:
      return reject(
        "WOULD_CORRUPT_TOPOLOGY",
        `Kommandoen "${(command as { type: string }).type}" understøttes ikke endnu.`,
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

// --- resize_opening --------------------------------------------------------

function applyResizeOpening(
  doc: FloorPlanDocument,
  cmd: Extract<FloorPlanCommand, { type: "resize_opening" }>,
): ApplyOutcome {
  const next = structuredClone(doc);
  for (const level of next.levels) {
    const opening = level.openings.find((o) => o.id === cmd.openingId);
    if (!opening) continue;

    const wall = level.walls.find((w) => w.id === opening.wallId);
    const wallLen = wall ? lineLengthM(wall.centerline) : Infinity;
    const half = cmd.widthM / 2;
    if (opening.offsetAlongWallM - half < -TOL || opening.offsetAlongWallM + half > wallLen + TOL) {
      return reject(
        "OPENING_OUTSIDE_PARENT_WALL",
        `Den nye bredde ${cmd.widthM.toFixed(2)} m passer ikke i væggen ved offset ${opening.offsetAlongWallM.toFixed(2)} m.`,
      );
    }

    opening.widthM = cmd.widthM;
    return {
      accepted: true,
      document: next,
      changedElementIds: [cmd.openingId],
      liveFindings: liveFindingsFor(next),
    };
  }
  return reject("OPENING_NOT_FOUND", `Åbningen "${cmd.openingId}" findes ikke.`);
}

// --- add_wall --------------------------------------------------------------

const MIN_WALL_LENGTH_M = 0.1;

const DEFAULT_MANUAL_SOURCE = {
  source: "manual",
  confidence: "medium",
  fetchedAt: null,
  requiresReview: false,
} as const;

function applyAddWall(
  doc: FloorPlanDocument,
  cmd: Extract<FloorPlanCommand, { type: "add_wall" }>,
): ApplyOutcome {
  const levelIndex = doc.levels.findIndex((l) => l.id === cmd.levelId);
  if (levelIndex === -1) return reject("LEVEL_NOT_FOUND", `Etagen "${cmd.levelId}" findes ikke.`);

  const length = lineLengthM({ start: cmd.start, end: cmd.end });
  if (length < MIN_WALL_LENGTH_M) {
    return reject(
      "WALL_TOO_SHORT",
      `Væggen er kun ${length.toFixed(3)} m lang — minimum er ${MIN_WALL_LENGTH_M} m.`,
    );
  }

  const newId = `wall-${crypto.randomUUID().slice(0, 8)}`;
  const newWall: Wall = {
    id: newId,
    levelId: cmd.levelId,
    centerline: { start: cmd.start, end: cmd.end },
    thicknessM: cmd.thicknessM,
    heightM: null,
    wallKind: cmd.wallKind,
    structuralRole: "unknown",
    fireRole: "none",
    assemblyId: null,
    locked: false,
    source: DEFAULT_MANUAL_SOURCE,
  };

  const next = structuredClone(doc);
  const level = next.levels[levelIndex]!;
  level.walls.push(newWall);
  const changedRoomIds = recomputeRooms(level);

  return {
    accepted: true,
    document: next,
    changedElementIds: [newId, ...changedRoomIds],
    liveFindings: liveFindingsFor(next),
  };
}

// --- add_opening -----------------------------------------------------------

function applyAddOpening(
  doc: FloorPlanDocument,
  cmd: Extract<FloorPlanCommand, { type: "add_opening" }>,
): ApplyOutcome {
  const levelIndex = doc.levels.findIndex((l) => l.id === cmd.levelId);
  if (levelIndex === -1) return reject("LEVEL_NOT_FOUND", `Etagen "${cmd.levelId}" findes ikke.`);

  const level = doc.levels[levelIndex]!;
  const wall = level.walls.find((w) => w.id === cmd.wallId);
  if (!wall) return reject("WALL_NOT_FOUND", `Væggen "${cmd.wallId}" findes ikke.`);

  const wallLen = lineLengthM(wall.centerline);
  const half = cmd.widthM / 2;
  if (cmd.offsetAlongWallM - half < -TOL || cmd.offsetAlongWallM + half > wallLen + TOL) {
    return reject(
      "OPENING_OUTSIDE_PARENT_WALL",
      `Åbningen kan ikke placeres ved ${cmd.offsetAlongWallM} m; den ville krydse væggens endepunkt (væglængde ${wallLen.toFixed(2)} m).`,
    );
  }

  const overlaps = level.openings.some(
    (o) =>
      o.wallId === cmd.wallId &&
      Math.abs(o.offsetAlongWallM - cmd.offsetAlongWallM) < (o.widthM + cmd.widthM) / 2 - TOL,
  );
  if (overlaps) {
    return reject(
      "OPENING_OVERLAPS_ANOTHER",
      "Åbningen ville overlappe en anden åbning på væggen.",
    );
  }

  const newId = `opening-${crypto.randomUUID().slice(0, 8)}`;
  const newOpening: Opening = {
    id: newId,
    levelId: cmd.levelId,
    wallId: cmd.wallId,
    openingKind: cmd.openingKind,
    offsetAlongWallM: cmd.offsetAlongWallM,
    widthM: cmd.widthM,
    heightM: cmd.heightM,
    sillHeightM: null,
    swing: cmd.swing,
    operable: false,
    productTypeId: null,
    locked: false,
    source: DEFAULT_MANUAL_SOURCE,
  };

  const next = structuredClone(doc);
  next.levels[levelIndex]!.openings.push(newOpening);

  return {
    accepted: true,
    document: next,
    changedElementIds: [newId],
    liveFindings: liveFindingsFor(next),
  };
}

// --- add_fixture -----------------------------------------------------------

function applyAddFixture(
  doc: FloorPlanDocument,
  cmd: Extract<FloorPlanCommand, { type: "add_fixture" }>,
): ApplyOutcome {
  const levelIndex = doc.levels.findIndex((l) => l.id === cmd.levelId);
  if (levelIndex === -1) return reject("LEVEL_NOT_FOUND", `Etagen "${cmd.levelId}" findes ikke.`);

  const newId = `fixture-${crypto.randomUUID().slice(0, 8)}`;
  const newFixture: Fixture = {
    id: newId,
    levelId: cmd.levelId,
    roomId: cmd.roomId,
    fixtureKind: cmd.fixtureKind,
    position: cmd.position,
    rotationDeg: cmd.rotationDeg,
    footprint: {
      vertices: [
        { x: cmd.position.x - 0.25, y: cmd.position.y - 0.25 },
        { x: cmd.position.x + 0.25, y: cmd.position.y - 0.25 },
        { x: cmd.position.x + 0.25, y: cmd.position.y + 0.25 },
        { x: cmd.position.x - 0.25, y: cmd.position.y + 0.25 },
      ],
    },
    productTypeId: null,
    requiresDisciplineReview: [],
    source: DEFAULT_MANUAL_SOURCE,
  };

  const next = structuredClone(doc);
  next.levels[levelIndex]!.fixtures.push(newFixture);

  return {
    accepted: true,
    document: next,
    changedElementIds: [newId],
    liveFindings: liveFindingsFor(next),
  };
}

// --- add_furniture ---------------------------------------------------------

function applyAddFurniture(
  doc: FloorPlanDocument,
  cmd: Extract<FloorPlanCommand, { type: "add_furniture" }>,
): ApplyOutcome {
  const levelIndex = doc.levels.findIndex((l) => l.id === cmd.levelId);
  if (levelIndex === -1) return reject("LEVEL_NOT_FOUND", `Etagen "${cmd.levelId}" findes ikke.`);

  const newId = `furniture-${crypto.randomUUID().slice(0, 8)}`;
  const newFurniture: Furniture = {
    id: newId,
    levelId: cmd.levelId,
    roomId: cmd.roomId,
    furnitureKind: cmd.furnitureKind,
    position: cmd.position,
    rotationDeg: cmd.rotationDeg,
    widthM: cmd.widthM,
    depthM: cmd.depthM,
    source: DEFAULT_MANUAL_SOURCE,
  };

  const next = structuredClone(doc);
  const targetLevel = next.levels[levelIndex]!;
  if (!targetLevel.furniture) targetLevel.furniture = [];
  targetLevel.furniture.push(newFurniture);

  return {
    accepted: true,
    document: next,
    changedElementIds: [newId],
    liveFindings: liveFindingsFor(next),
  };
}

// --- delete_wall -----------------------------------------------------------

function applyDeleteWall(
  doc: FloorPlanDocument,
  cmd: Extract<FloorPlanCommand, { type: "delete_wall" }>,
): ApplyOutcome {
  const located = locateWall(doc, cmd.wallId);
  if (!located) return reject("WALL_NOT_FOUND", `Væggen "${cmd.wallId}" findes ikke.`);
  const { wall } = located;
  if (wall.locked) return reject("ELEMENT_LOCKED", "Væggen er låst mod ændring.");

  const next = structuredClone(doc);
  const level = next.levels[located.levelIndex]!;

  // Remove the wall and any openings that belong to it.
  const removedOpeningIds = level.openings.filter((o) => o.wallId === cmd.wallId).map((o) => o.id);
  level.walls = level.walls.filter((w) => w.id !== cmd.wallId);
  level.openings = level.openings.filter((o) => o.wallId !== cmd.wallId);

  const changedRoomIds = recomputeRooms(level);

  return {
    accepted: true,
    document: next,
    changedElementIds: [cmd.wallId, ...removedOpeningIds, ...changedRoomIds],
    liveFindings: liveFindingsFor(next),
  };
}

// --- split_room (simplified) -----------------------------------------------
//
// NOTE: Simplified implementation — adds a new interior wall along wallLine
// and recomputes rooms from topology. Does not guarantee exactly two rooms
// result; complex geometries may produce unexpected results. Reported as
// DONE_WITH_CONCERNS in WS5 delivery notes.

function applySplitRoom(
  doc: FloorPlanDocument,
  cmd: Extract<FloorPlanCommand, { type: "split_room" }>,
): ApplyOutcome {
  const levelIndex = doc.levels.findIndex((l) => l.rooms.some((r) => r.id === cmd.roomId));
  if (levelIndex === -1) return reject("ROOM_NOT_FOUND", `Rummet "${cmd.roomId}" findes ikke.`);

  const lineLen = lineLengthM(cmd.wallLine);
  if (lineLen < MIN_WALL_LENGTH_M) {
    return reject(
      "WALL_TOO_SHORT",
      `Skillevæggen er kun ${lineLen.toFixed(3)} m lang — minimum er ${MIN_WALL_LENGTH_M} m.`,
    );
  }

  const next = structuredClone(doc);
  const level = next.levels[levelIndex]!;
  const sourceLevel = doc.levels[levelIndex]!;

  const newId = `wall-${crypto.randomUUID().slice(0, 8)}`;
  const newWall: Wall = {
    id: newId,
    levelId: sourceLevel.id,
    centerline: cmd.wallLine,
    thicknessM: 0.12,
    heightM: null,
    wallKind: "interior",
    structuralRole: "unknown",
    fireRole: "none",
    assemblyId: null,
    locked: false,
    source: DEFAULT_MANUAL_SOURCE,
  };

  level.walls.push(newWall);
  const changedRoomIds = recomputeRooms(level);

  return {
    accepted: true,
    document: next,
    changedElementIds: [newId, ...changedRoomIds],
    liveFindings: liveFindingsFor(next),
  };
}

// --- merge_rooms (simplified) ----------------------------------------------
//
// NOTE: Simplified implementation — finds walls whose both endpoints are
// adjacent to the two rooms (by checking which walls form the boundary between
// them by centroid proximity). Removes those walls and recomputes. Does not
// handle complex topologies with multiple shared walls reliably. Reported as
// DONE_WITH_CONCERNS in WS5 delivery notes.

function applyMergeRooms(
  doc: FloorPlanDocument,
  cmd: Extract<FloorPlanCommand, { type: "merge_rooms" }>,
): ApplyOutcome {
  // Find the level that contains all the specified rooms.
  let levelIndex = -1;
  for (let i = 0; i < doc.levels.length; i++) {
    const level = doc.levels[i]!;
    const found = cmd.roomIds.every((id) => level.rooms.some((r) => r.id === id));
    if (found) {
      levelIndex = i;
      break;
    }
  }
  if (levelIndex === -1) {
    return reject("ROOM_NOT_FOUND", "Et eller flere af rummene kunne ikke findes på samme etage.");
  }

  const next = structuredClone(doc);
  const level = next.levels[levelIndex]!;

  // Collect rooms to merge.
  const mergeRooms = cmd.roomIds
    .map((id) => level.rooms.find((r) => r.id === id))
    .filter((r): r is RoomZone => r !== undefined);

  // Heuristic: a wall is "shared" if both its endpoints lie inside or on the
  // boundary of any two distinct rooms from the merge set (checked via centroid
  // proximity). We use a simple bounding-box overlap check as a proxy.
  const roomPolygons = mergeRooms.map((r) => r.polygon);

  function pointInAnyRoom(pt: Point2D): boolean {
    return roomPolygons.some((poly) => pointInPolygon(pt, poly));
  }

  const wallsToRemove = level.walls.filter((w) => {
    return pointInAnyRoom(w.centerline.start) && pointInAnyRoom(w.centerline.end);
  });

  if (wallsToRemove.length === 0) {
    return reject(
      "WOULD_CORRUPT_TOPOLOGY",
      "Ingen fælles vægge fundet mellem de angivne rum — kan ikke merge.",
    );
  }

  const removeIds = new Set(wallsToRemove.map((w) => w.id));
  level.walls = level.walls.filter((w) => !removeIds.has(w.id));
  level.openings = level.openings.filter((o) => !removeIds.has(o.wallId));

  const changedRoomIds = recomputeRooms(level);

  return {
    accepted: true,
    document: next,
    changedElementIds: [...removeIds, ...changedRoomIds],
    liveFindings: liveFindingsFor(next),
  };
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
    ceilingHeightM: null,
    floorOffsetM: null,
    source: {
      source: "generated",
      confidence: "low",
      fetchedAt: null,
      requiresReview: true,
    },
  };
}
