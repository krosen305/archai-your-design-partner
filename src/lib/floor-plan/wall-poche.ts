// src/lib/floor-plan/wall-poche.ts
//
// Geometry helpers that convert wall centerlines + thickness into closed
// poché polygons.  Opening gaps are cut by boolean difference (via jsts).
//
// Coordinate system: LOCAL_METER (same as the floor-plan domain model).
// All functions are pure and have no side-effects — import freely in tests.
//
// jsts monkey-patch is required for .buffer() / .difference() / .union()
// on Geometry instances.  We import it once here so callers don't need to.

import "jsts/org/locationtech/jts/monkey.js";
import GeometryFactory from "jsts/org/locationtech/jts/geom/GeometryFactory.js";
import Coordinate from "jsts/org/locationtech/jts/geom/Coordinate.js";
import type { Point2D } from "@/domain/geometry/geometry-2d.types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JstsGeometry = any;

const factory = new GeometryFactory();

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function coord(p: Point2D): InstanceType<typeof Coordinate> {
  return new Coordinate(p.x, p.y);
}

/** Build a jsts Polygon from a list of LOCAL_METER vertices (auto-close). */
function jstsPolygon(pts: Point2D[]): JstsGeometry {
  const coords = [...pts.map(coord), coord(pts[0]!)]; // close ring
  const ring = factory.createLinearRing(coords);
  return factory.createPolygon(ring);
}

/**
 * Extract Point2D[] from a single jsts Polygon geometry
 * (outer ring only, excluding the closing duplicate vertex).
 */
function fromJstsPolygon(geom: JstsGeometry): Point2D[] {
  const coords: Array<{ x: number; y: number }> = geom.getExteriorRing().getCoordinates();
  return coords.slice(0, -1).map((c) => ({ x: c.x, y: c.y }));
}

/**
 * Extract one or more Point2D[] arrays from a jsts geometry result.
 * Handles both Polygon and MultiPolygon outputs (difference of a rect by a
 * rect in the middle produces two separate polygons = MultiPolygon).
 * Returns the original fallback if the geometry is empty or unsupported.
 */
function fromJstsGeometry(geom: JstsGeometry, fallback: Point2D[][]): Point2D[][] {
  if (geom.isEmpty()) return fallback;

  const type: string = geom.getGeometryType();
  if (type === "Polygon") {
    return [fromJstsPolygon(geom)];
  }
  if (type === "MultiPolygon") {
    const parts: Point2D[][] = [];
    const n: number = geom.getNumGeometries();
    for (let i = 0; i < n; i++) {
      const sub: JstsGeometry = geom.getGeometryN(i);
      if (!sub.isEmpty()) parts.push(fromJstsPolygon(sub));
    }
    return parts.length > 0 ? parts : fallback;
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Core geometry: rectangular poché from a wall centerline
// ---------------------------------------------------------------------------

/**
 * Compute the four-corner rectangle for a wall's poché.
 *
 * Returns vertices in CCW order:
 *   [startLeft, endLeft, endRight, startRight]
 * where "Left" / "Right" are the two sides of the wall when travelling
 * from start → end (standard architectural convention, normal pointing left).
 *
 * Returns an empty array for a degenerate (zero-length) wall.
 */
export function wallPocheRect(start: Point2D, end: Point2D, thicknessM: number): Point2D[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-9) return []; // degenerate wall

  // Perpendicular unit vector (left-hand normal: rotated 90° CCW)
  const half = thicknessM / 2;
  const nx = (-dy / len) * half;
  const ny = (dx / len) * half;

  return [
    { x: start.x + nx, y: start.y + ny }, // start-left
    { x: end.x + nx, y: end.y + ny }, // end-left
    { x: end.x - nx, y: end.y - ny }, // end-right
    { x: start.x - nx, y: start.y - ny }, // start-right
  ];
}

// ---------------------------------------------------------------------------
// Opening gap subtraction
// ---------------------------------------------------------------------------

export type OpeningGap = {
  /** Centre of the opening along the wall centerline (LOCAL_METER). */
  center: Point2D;
  /** Width of the opening (m). */
  widthM: number;
  /** Wall thickness (m) — used to make the gap rectangle deep enough. */
  thicknessM: number;
  /** Unit vector along the wall (start→end direction). */
  wallDir: Point2D;
};

/** Extra depth (m) beyond each wall face to ensure the gap cut-out is full-depth. */
const GAP_OVERSIZE = 0.02;

/**
 * Subtract one opening gap from one or more poché polygons.
 *
 * Cutting a gap in the middle of a rectangular wall splits it into two pieces
 * (MultiPolygon). The return value is therefore an array of polygons.
 *
 * Returns the original polygons unchanged if the jsts operation fails.
 */
export function subtractOpeningGap(pochePolys: Point2D[][], gap: OpeningGap): Point2D[][] {
  if (pochePolys.length === 0) return pochePolys;

  const { center, widthM, thicknessM, wallDir } = gap;
  const halfW = widthM / 2;
  const halfD = thicknessM / 2 + GAP_OVERSIZE;

  // Tangent (along wall) and normal
  const tx = wallDir.x;
  const ty = wallDir.y;
  const nx = -ty; // left-hand normal
  const ny = tx;

  const gapRectPts: Point2D[] = [
    { x: center.x - tx * halfW + nx * halfD, y: center.y - ty * halfW + ny * halfD },
    { x: center.x + tx * halfW + nx * halfD, y: center.y + ty * halfW + ny * halfD },
    { x: center.x + tx * halfW - nx * halfD, y: center.y + ty * halfW - ny * halfD },
    { x: center.x - tx * halfW - nx * halfD, y: center.y - ty * halfW - ny * halfD },
  ];

  const gapGeom: JstsGeometry = jstsPolygon(gapRectPts);

  const results: Point2D[][] = [];
  for (const poly of pochePolys) {
    if (poly.length < 3) {
      results.push(poly);
      continue;
    }
    try {
      const wallGeom: JstsGeometry = jstsPolygon(poly);
      const result: JstsGeometry = wallGeom.difference(gapGeom);
      results.push(...fromJstsGeometry(result, [poly]));
    } catch {
      results.push(poly);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Wall-join resolution: union all poché polygons to eliminate join overlaps
// ---------------------------------------------------------------------------

/** Tolerance (m) within which two endpoints are considered identical. */
const JOIN_TOL = 0.001;

export type WallJoinInput = {
  poche: Point2D[][];
  start: Point2D;
  end: Point2D;
};

/**
 * Union all poché polygons from adjacent walls (corners and T-junctions) so
 * that overlapping regions at joins are eliminated.
 *
 * Strategy: walls that share an endpoint (within JOIN_TOL) are treated as
 * connected and their poche polygons are unioned together.  For T-junctions,
 * where one wall's endpoint meets the body of another wall, the poche polygons
 * physically overlap even though no exact endpoint pair matches — these are
 * handled by also unioning any pair of walls whose poche rectangles are
 * geometrically adjacent (their endpoint lies within the other wall's poche
 * bounds).  In practice it is simpler and correct to union ALL input polygons
 * into a single geometry; jsts union of non-overlapping polygons is a no-op
 * for the non-overlapping parts and correctly removes only the actual overlaps.
 *
 * Returns the final merged polygon pieces for the entire set of walls as a
 * flat array.  Isolated walls (no overlap with any other wall) are returned
 * unchanged.
 */
export function resolveWallJoins(walls: WallJoinInput[]): Point2D[][] {
  if (walls.length === 0) return [];

  // Collect all poche polygons
  const allPolys: Point2D[][] = walls.flatMap((w) => w.poche);

  if (allPolys.length === 0) return [];

  // Union all polygons.  jsts union of two disjoint polygons returns a
  // MultiPolygon holding both unchanged — so this is safe for disconnected
  // wall sets too.
  let merged: JstsGeometry | null = null;
  const fallback: Point2D[][] = [];

  for (const poly of allPolys) {
    if (poly.length < 3) {
      fallback.push(poly); // degenerate — keep as-is
      continue;
    }
    try {
      const geom: JstsGeometry = jstsPolygon(poly);
      merged = merged === null ? geom : merged.union(geom);
    } catch {
      // If union fails for this polygon, add it to fallback output
      fallback.push(poly);
    }
  }

  if (merged === null || merged.isEmpty()) {
    return allPolys; // full fallback
  }

  return [...fromJstsGeometry(merged, allPolys), ...fallback];
}

/**
 * Returns true when two points are within JOIN_TOL of each other.
 * Exported for use in render-model helpers.
 */
export function wallEndpointsClose(a: Point2D, b: Point2D): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy < JOIN_TOL * JOIN_TOL;
}

// ---------------------------------------------------------------------------
// Combined: poché rectangles with all opening gaps applied
// ---------------------------------------------------------------------------

export type OpeningInput = {
  offsetAlongWallM: number;
  widthM: number;
};

/**
 * Build the final poché polygon(s) for one wall, with all openings cut out.
 *
 * Returns an array of polygons:
 * - Empty array when the wall is degenerate (zero length).
 * - One polygon for a wall with no openings or with openings only at the ends.
 * - Two or more polygons when openings split the wall into multiple pieces.
 *
 * @param start      Wall centerline start in LOCAL_METER
 * @param end        Wall centerline end in LOCAL_METER
 * @param thicknessM Wall thickness (m)
 * @param openings   All openings whose parent wall is this wall
 */
export function buildWallPoché(
  start: Point2D,
  end: Point2D,
  thicknessM: number,
  openings: OpeningInput[],
): Point2D[][] {
  const rect = wallPocheRect(start, end, thicknessM);
  if (rect.length === 0) return [];

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-9) return [];

  const wallDir: Point2D = { x: dx / len, y: dy / len };
  let polys: Point2D[][] = [rect];

  for (const op of openings) {
    const center: Point2D = {
      x: start.x + wallDir.x * op.offsetAlongWallM,
      y: start.y + wallDir.y * op.offsetAlongWallM,
    };
    polys = subtractOpeningGap(polys, {
      center,
      widthM: op.widthM,
      thicknessM,
      wallDir,
    });
  }

  return polys;
}
