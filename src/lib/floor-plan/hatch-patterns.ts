// src/lib/floor-plan/hatch-patterns.ts
//
// Pure helper functions for generating SVG hatch paths clipped to a polygon.
// No domain imports beyond geometry types — remains a lib-layer helper per
// CLAUDE.md architecture doctrine.

import type { Point2D } from "@/domain/geometry/geometry-2d.types";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type HatchPattern = "diagonal" | "cross_hatch" | "terrace_deck" | "none";

export type HatchOptions = {
  polygon: Point2D[];
  pattern: HatchPattern;
  /** Spacing between hatch lines in meters. Default 0.3 m. */
  spacingM?: number;
  /** Angle of hatch lines in degrees (0 = horizontal). Default 45. */
  angleDeg?: number;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns an array of SVG path `d` strings for hatch lines clipped inside the
 * given polygon. Returns an empty array for `pattern: "none"` or degenerate
 * polygons (fewer than 3 vertices).
 *
 * Coordinates are in the same units as the polygon (LOCAL_METER). The caller
 * is responsible for applying the same scale/y-flip transform as the rest of
 * the SVG rendering pipeline.
 */
export function buildHatchPaths(opts: HatchOptions): string[] {
  const { polygon, pattern, spacingM = 0.3, angleDeg = 45 } = opts;

  if (pattern === "none") return [];
  if (polygon.length < 3) return [];
  if (spacingM <= 0) return [];

  if (pattern === "diagonal") {
    return buildAngledLines(polygon, spacingM, angleDeg);
  }

  if (pattern === "cross_hatch") {
    // Two sets of diagonal lines 90° apart
    const set1 = buildAngledLines(polygon, spacingM, angleDeg);
    const set2 = buildAngledLines(polygon, spacingM, angleDeg + 90);
    return [...set1, ...set2];
  }

  if (pattern === "terrace_deck") {
    // Deck boards: horizontal lines only
    return buildAngledLines(polygon, spacingM, 0);
  }

  return [];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Compute axis-aligned bounding box of the polygon. */
function bbox(polygon: Point2D[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of polygon) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Clip a horizontal line segment y=y0 from x=x0 to x=x1 against the polygon
 * using a simple scan-line intersection approach. Returns an array of [xa, xb]
 * pairs sorted left-to-right for line segments inside the polygon.
 */
function clipHorizontalLine(
  polygon: Point2D[],
  y0: number,
  xMin: number,
  xMax: number,
): Array<[number, number]> {
  const intersections: number[] = [];
  const n = polygon.length;

  for (let i = 0; i < n; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % n]!;

    // Check if the edge crosses the scan line y0 (exactly one endpoint on y0
    // is handled by the half-open rule: include lower, exclude upper)
    const minEdgeY = Math.min(a.y, b.y);
    const maxEdgeY = Math.max(a.y, b.y);

    if (y0 < minEdgeY || y0 >= maxEdgeY) continue;

    // Linear interpolation to find x at y0
    const t = (y0 - a.y) / (b.y - a.y);
    const xIntersect = a.x + t * (b.x - a.x);
    if (xIntersect >= xMin && xIntersect <= xMax) {
      intersections.push(xIntersect);
    }
  }

  intersections.sort((a, b) => a - b);

  // Pair up intersections (entry/exit)
  const segments: Array<[number, number]> = [];
  for (let i = 0; i + 1 < intersections.length; i += 2) {
    segments.push([intersections[i]!, intersections[i + 1]!]);
  }
  return segments;
}

/**
 * Generate hatch lines at `angleDeg` through the polygon at `spacingM`
 * intervals. Uses rotation to transform the problem into a horizontal-scan
 * problem, then rotates results back.
 */
function buildAngledLines(polygon: Point2D[], spacingM: number, angleDeg: number): string[] {
  // Normalise angle to [0, 180)
  const angle = ((angleDeg % 180) + 180) % 180;
  const rad = (angle * Math.PI) / 180;

  const cosA = Math.cos(-rad);
  const sinA = Math.sin(-rad);
  const cosB = Math.cos(rad);
  const sinB = Math.sin(rad);

  // Rotate polygon into a coordinate system aligned with the hatch direction
  const rotated = polygon.map((p) => ({
    x: p.x * cosA - p.y * sinA,
    y: p.x * sinA + p.y * cosA,
  }));

  const box = bbox(rotated);

  if (!isFinite(box.minX) || !isFinite(box.minY)) return [];

  // Generate horizontal scan lines in the rotated space at spacing intervals
  const paths: string[] = [];
  const startY = Math.floor(box.minY / spacingM) * spacingM;
  const endY = box.maxY + spacingM;

  for (let y = startY; y <= endY; y += spacingM) {
    const segs = clipHorizontalLine(rotated, y, box.minX - 0.001, box.maxX + 0.001);
    for (const [xa, xb] of segs) {
      if (Math.abs(xb - xa) < 1e-6) continue;

      // Rotate the clipped endpoints back to world space
      const pa = {
        x: xa * cosB - y * sinB,
        y: xa * sinB + y * cosB,
      };
      const pb = {
        x: xb * cosB - y * sinB,
        y: xb * sinB + y * cosB,
      };

      const fmt = (n: number) => Math.round(n * 10000) / 10000;
      paths.push(`M ${fmt(pa.x)},${fmt(pa.y)} L ${fmt(pb.x)},${fmt(pb.y)}`);
    }
  }

  return paths;
}
