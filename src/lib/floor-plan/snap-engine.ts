import type { Point2D } from "@/domain/geometry/geometry-2d.types";
import type { FloorLevel, Wall } from "@/domain/floor-plan/floor-plan.types";
import { lineLengthM } from "@/domain/geometry/polygon-ops";

export type SnapKind = "grid" | "wall_endpoint" | "wall_axis";

export type SnapCandidate = {
  kind: SnapKind;
  point: Point2D;
  distanceM: number;
  elementId: string | null;
};

export type SnapResult = {
  point: Point2D;
  candidates: SnapCandidate[];
};

export type SnapOptions = {
  gridSizeM?: number;
  toleranceM?: number;
  includeGrid?: boolean;
};

const DEFAULT_GRID_SIZE_M = 0.1;
const DEFAULT_TOLERANCE_M = 0.18;

export function snapPointToGrid(point: Point2D, gridSizeM = DEFAULT_GRID_SIZE_M): Point2D {
  return {
    x: snapValue(point.x, gridSizeM),
    y: snapValue(point.y, gridSizeM),
  };
}

export function snapValue(value: number, gridSizeM = DEFAULT_GRID_SIZE_M): number {
  if (gridSizeM <= 0) return value;
  return roundM(Math.round(value / gridSizeM) * gridSizeM);
}

export function snapPoint(
  point: Point2D,
  level: FloorLevel,
  options: SnapOptions = {},
): SnapResult {
  const toleranceM = options.toleranceM ?? DEFAULT_TOLERANCE_M;
  const candidates: SnapCandidate[] = [];

  if (options.includeGrid ?? true) {
    const grid = snapPointToGrid(point, options.gridSizeM ?? DEFAULT_GRID_SIZE_M);
    candidates.push({
      kind: "grid",
      point: grid,
      distanceM: distance(point, grid),
      elementId: null,
    });
  }

  for (const wall of level.walls) {
    for (const endpoint of [wall.centerline.start, wall.centerline.end]) {
      const distanceM = distance(point, endpoint);
      if (distanceM <= toleranceM) {
        candidates.push({
          kind: "wall_endpoint",
          point: endpoint,
          distanceM,
          elementId: wall.id,
        });
      }
    }

    const axis = snapToWallAxis(point, wall, toleranceM);
    if (axis) candidates.push(axis);
  }

  const best = candidates
    .filter((candidate) => candidate.distanceM <= toleranceM || candidate.kind === "grid")
    .sort((a, b) => scoreCandidate(a) - scoreCandidate(b))[0];

  return { point: best?.point ?? point, candidates };
}

export function snapDelta(deltaM: number, gridSizeM = DEFAULT_GRID_SIZE_M): number {
  return snapValue(deltaM, gridSizeM);
}

export function snapOpeningOffset(offsetM: number, wall: Wall, openingWidthM: number): number {
  const half = openingWidthM / 2;
  const wallLengthM = lineLengthM(wall.centerline);
  return Math.min(Math.max(snapValue(offsetM), half), Math.max(half, wallLengthM - half));
}

function snapToWallAxis(point: Point2D, wall: Wall, toleranceM: number): SnapCandidate | null {
  const start = wall.centerline.start;
  const end = wall.centerline.end;
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);

  if (dx < 1e-9) {
    const distanceM = Math.abs(point.x - start.x);
    return distanceM <= toleranceM
      ? {
          kind: "wall_axis",
          point: { x: start.x, y: point.y },
          distanceM,
          elementId: wall.id,
        }
      : null;
  }

  if (dy < 1e-9) {
    const distanceM = Math.abs(point.y - start.y);
    return distanceM <= toleranceM
      ? {
          kind: "wall_axis",
          point: { x: point.x, y: start.y },
          distanceM,
          elementId: wall.id,
        }
      : null;
  }

  return null;
}

function scoreCandidate(candidate: SnapCandidate): number {
  const priority =
    candidate.kind === "wall_endpoint" ? -0.03 : candidate.kind === "wall_axis" ? -0.01 : 0;
  return candidate.distanceM + priority;
}

function roundM(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function distance(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
