import type { Line2D, Point2D, Polygon2D } from "@/domain/geometry/geometry-2d.types";
import type { FloorLevel, Opening, Wall } from "@/domain/floor-plan/floor-plan.types";
import { lineLengthM, pointInPolygon } from "@/domain/geometry/polygon-ops";

export type FloorPlanElementKind = "wall" | "opening" | "fixture" | "room";

export type PickedFloorPlanElement = {
  kind: FloorPlanElementKind;
  id: string;
  distanceM: number;
};

export type HitTestingOptions = {
  wallToleranceM?: number;
  openingToleranceM?: number;
  fixtureToleranceM?: number;
};

const DEFAULT_WALL_TOLERANCE_M = 0.22;
const DEFAULT_OPENING_TOLERANCE_M = 0.35;
const DEFAULT_FIXTURE_TOLERANCE_M = 0.35;

export function pickFloorPlanElement(
  level: FloorLevel,
  point: Point2D,
  options: HitTestingOptions = {},
): PickedFloorPlanElement | null {
  const opening = nearestOpening(level, point, options.openingToleranceM);
  if (opening) return opening;

  const fixture = nearestFixture(level, point, options.fixtureToleranceM);
  if (fixture) return fixture;

  const wall = nearestWall(level.walls, point, options.wallToleranceM);
  if (wall) return { kind: "wall", id: wall.wall.id, distanceM: wall.distanceM };

  const room = level.rooms.find((candidate) => pointInPolygon(point, candidate.polygon));
  return room ? { kind: "room", id: room.id, distanceM: 0 } : null;
}

export function nearestWall(
  walls: Wall[],
  point: Point2D,
  toleranceM = DEFAULT_WALL_TOLERANCE_M,
): { wall: Wall; distanceM: number; projected: Point2D; offsetM: number } | null {
  let best: { wall: Wall; distanceM: number; projected: Point2D; offsetM: number } | null = null;

  for (const wall of walls) {
    const projection = projectPointToSegment(point, wall.centerline);
    if (projection.distanceM > toleranceM) continue;
    if (!best || projection.distanceM < best.distanceM) {
      best = { wall, ...projection };
    }
  }

  return best;
}

export function findRoomAtPoint(level: FloorLevel, point: Point2D): string | null {
  return level.rooms.find((room) => pointInPolygon(point, room.polygon))?.id ?? null;
}

export function openingCenter(opening: Opening, wall: Wall): Point2D | null {
  const lengthM = lineLengthM(wall.centerline);
  if (lengthM < 1e-9) return null;
  const unit = {
    x: (wall.centerline.end.x - wall.centerline.start.x) / lengthM,
    y: (wall.centerline.end.y - wall.centerline.start.y) / lengthM,
  };
  return {
    x: wall.centerline.start.x + unit.x * opening.offsetAlongWallM,
    y: wall.centerline.start.y + unit.y * opening.offsetAlongWallM,
  };
}

export function offsetAlongWall(wall: Wall, point: Point2D): number {
  return projectPointToSegment(point, wall.centerline).offsetM;
}

export function wallDragAxis(wall: Wall): "x" | "y" {
  const dx = Math.abs(wall.centerline.end.x - wall.centerline.start.x);
  const dy = Math.abs(wall.centerline.end.y - wall.centerline.start.y);
  return dy >= dx ? "x" : "y";
}

export function pointToSegmentDistanceM(point: Point2D, segment: Line2D): number {
  return projectPointToSegment(point, segment).distanceM;
}

function nearestOpening(
  level: FloorLevel,
  point: Point2D,
  toleranceM = DEFAULT_OPENING_TOLERANCE_M,
): PickedFloorPlanElement | null {
  const wallsById = new Map(level.walls.map((wall) => [wall.id, wall]));
  let best: PickedFloorPlanElement | null = null;

  for (const opening of level.openings) {
    const wall = wallsById.get(opening.wallId);
    if (!wall) continue;
    const center = openingCenter(opening, wall);
    if (!center) continue;
    const distanceM = distance(point, center);
    const threshold = Math.max(toleranceM, opening.widthM / 2);
    if (distanceM > threshold) continue;
    if (!best || distanceM < best.distanceM) {
      best = { kind: "opening", id: opening.id, distanceM };
    }
  }

  return best;
}

function nearestFixture(
  level: FloorLevel,
  point: Point2D,
  toleranceM = DEFAULT_FIXTURE_TOLERANCE_M,
): PickedFloorPlanElement | null {
  let best: PickedFloorPlanElement | null = null;

  for (const fixture of level.fixtures) {
    const insideFootprint = pointInPolygon(point, fixture.footprint);
    const distanceM = insideFootprint ? 0 : distance(point, fixture.position);
    if (distanceM > toleranceM) continue;
    if (!best || distanceM < best.distanceM) {
      best = { kind: "fixture", id: fixture.id, distanceM };
    }
  }

  return best;
}

function projectPointToSegment(
  point: Point2D,
  segment: Line2D,
): { distanceM: number; projected: Point2D; offsetM: number } {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq < 1e-12) {
    return {
      distanceM: distance(point, segment.start),
      projected: segment.start,
      offsetM: 0,
    };
  }

  const tRaw = ((point.x - segment.start.x) * dx + (point.y - segment.start.y) * dy) / lengthSq;
  const t = Math.min(Math.max(tRaw, 0), 1);
  const projected = {
    x: segment.start.x + dx * t,
    y: segment.start.y + dy * t,
  };

  return {
    distanceM: distance(point, projected),
    projected,
    offsetM: lineLengthM(segment) * t,
  };
}

function distance(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
