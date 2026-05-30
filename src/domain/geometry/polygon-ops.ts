// src/domain/geometry/polygon-ops.ts
//
// Deterministic pure 2D polygon helpers in LOCAL_METER. No JSTS (spec §23.3.1).

import type { Line2D, Point2D, Polygon2D } from "./geometry-2d.types";

/** Euclidean length of a segment in meters. */
export function lineLengthM(line: Line2D): number {
  const dx = line.end.x - line.start.x;
  const dy = line.end.y - line.start.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Absolute area of a simple polygon via the shoelace formula. */
export function polygonAreaM2(polygon: Polygon2D): number {
  const v = polygon.vertices;
  if (v.length < 3) return 0;
  let twiceArea = 0;
  for (let i = 0; i < v.length; i++) {
    const a = v[i]!;
    const b = v[(i + 1) % v.length]!;
    twiceArea += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twiceArea) / 2;
}

/**
 * Signed area via the shoelace formula. Positive for counter-clockwise
 * winding, negative for clockwise. Used to orient planar faces.
 */
export function polygonSignedAreaM2(polygon: Polygon2D): number {
  const v = polygon.vertices;
  if (v.length < 3) return 0;
  let twiceArea = 0;
  for (let i = 0; i < v.length; i++) {
    const a = v[i]!;
    const b = v[(i + 1) % v.length]!;
    twiceArea += a.x * b.y - b.x * a.y;
  }
  return twiceArea / 2;
}

/** Area centroid of a simple polygon. Falls back to vertex average if degenerate. */
export function polygonCentroid(polygon: Polygon2D): Point2D {
  const v = polygon.vertices;
  let twiceArea = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < v.length; i++) {
    const a = v[i]!;
    const b = v[(i + 1) % v.length]!;
    const cross = a.x * b.y - b.x * a.y;
    twiceArea += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  if (Math.abs(twiceArea) < 1e-12) {
    const n = v.length || 1;
    return {
      x: v.reduce((s, p) => s + p.x, 0) / n,
      y: v.reduce((s, p) => s + p.y, 0) / n,
    };
  }
  return { x: cx / (3 * twiceArea), y: cy / (3 * twiceArea) };
}

/** Closed-ring perimeter length in meters. */
export function polygonPerimeterM(polygon: Polygon2D): number {
  const v = polygon.vertices;
  if (v.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < v.length; i++) {
    total += lineLengthM({ start: v[i]!, end: v[(i + 1) % v.length]! });
  }
  return total;
}

/** True if the point lies inside the polygon (ray casting). */
export function pointInPolygon(point: Point2D, polygon: Polygon2D): boolean {
  const v = polygon.vertices;
  let inside = false;
  for (let i = 0, j = v.length - 1; i < v.length; j = i++) {
    const a = v[i]!;
    const b = v[j]!;
    const intersects =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}
