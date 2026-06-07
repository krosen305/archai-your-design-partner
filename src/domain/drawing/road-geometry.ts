import type {
  GeoJsonLineString25832,
  GeoJsonPolygon25832,
} from "@/domain/drawing/beliggenhedsplan.types";

type Point = [number, number];

const MAX_ROAD_EDGE_TO_CENTERLINE_M = 25;
const MAX_ROAD_EDGE_TO_PARCEL_M = 80;

function sq(value: number): number {
  return value * value;
}

function distance(a: Point, b: Point): number {
  return Math.sqrt(sq(a[0] - b[0]) + sq(a[1] - b[1]));
}

function nearestPointOnSegment(point: Point, a: Point, b: Point): Point {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq < Number.EPSILON) return a;
  const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lenSq));
  return [a[0] + t * dx, a[1] + t * dy];
}

function pointToSegmentDistance(point: Point, a: Point, b: Point): number {
  return distance(point, nearestPointOnSegment(point, a, b));
}

function orientation(a: Point, b: Point, c: Point): number {
  return (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]);
}

function isPointOnSegment(point: Point, a: Point, b: Point): boolean {
  return (
    point[0] <= Math.max(a[0], b[0]) &&
    point[0] >= Math.min(a[0], b[0]) &&
    point[1] <= Math.max(a[1], b[1]) &&
    point[1] >= Math.min(a[1], b[1])
  );
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);

  if (o1 * o2 < 0 && o3 * o4 < 0) return true;
  if (Math.abs(o1) < Number.EPSILON && isPointOnSegment(c, a, b)) return true;
  if (Math.abs(o2) < Number.EPSILON && isPointOnSegment(d, a, b)) return true;
  if (Math.abs(o3) < Number.EPSILON && isPointOnSegment(a, c, d)) return true;
  if (Math.abs(o4) < Number.EPSILON && isPointOnSegment(b, c, d)) return true;
  return false;
}

function segmentDistance(a: Point, b: Point, c: Point, d: Point): number {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(
    pointToSegmentDistance(a, c, d),
    pointToSegmentDistance(b, c, d),
    pointToSegmentDistance(c, a, b),
    pointToSegmentDistance(d, a, b),
  );
}

function lineSegments(line: GeoJsonLineString25832): Array<[Point, Point]> {
  const segments: Array<[Point, Point]> = [];
  for (let i = 0; i < line.coordinates.length - 1; i += 1) {
    const a = line.coordinates[i];
    const b = line.coordinates[i + 1];
    if (!a || !b) continue;
    segments.push([a, b]);
  }
  return segments;
}

function polygonBoundarySegments(polygon: GeoJsonPolygon25832): Array<[Point, Point]> {
  const ring = polygon.coordinates[0] ?? [];
  const segments: Array<[Point, Point]> = [];
  for (let i = 0; i < ring.length - 1; i += 1) {
    const a = ring[i];
    const b = ring[i + 1];
    if (!a || !b) continue;
    segments.push([a, b]);
  }
  return segments;
}

export function lineToPolygonDistanceM(
  line: GeoJsonLineString25832,
  polygon: GeoJsonPolygon25832,
): number {
  const roadSegments = lineSegments(line);
  const boundarySegments = polygonBoundarySegments(polygon);
  if (!roadSegments.length || !boundarySegments.length) return Number.POSITIVE_INFINITY;

  let best = Number.POSITIVE_INFINITY;
  for (const [a, b] of roadSegments) {
    for (const [c, d] of boundarySegments) {
      best = Math.min(best, segmentDistance(a, b, c, d));
    }
  }
  return best;
}

export function lineToLineDistanceM(a: GeoJsonLineString25832, b: GeoJsonLineString25832): number {
  const segmentsA = lineSegments(a);
  const segmentsB = lineSegments(b);
  if (!segmentsA.length || !segmentsB.length) return Number.POSITIVE_INFINITY;

  let best = Number.POSITIVE_INFINITY;
  for (const [a1, a2] of segmentsA) {
    for (const [b1, b2] of segmentsB) {
      best = Math.min(best, segmentDistance(a1, a2, b1, b2));
    }
  }
  return best;
}

export function selectRelevantRoadCenterline(
  centerlines: GeoJsonLineString25832[],
  parcelPolygon: GeoJsonPolygon25832,
): GeoJsonLineString25832 | null {
  return (
    centerlines
      .map((line) => ({ line, distanceM: lineToPolygonDistanceM(line, parcelPolygon) }))
      .sort((a, b) => a.distanceM - b.distanceM)[0]?.line ?? null
  );
}

export function selectRelevantRoadEdges(
  edges: GeoJsonLineString25832[],
  parcelPolygon: GeoJsonPolygon25832,
  centerline: GeoJsonLineString25832 | null,
): GeoJsonLineString25832[] {
  if (!centerline) return [];
  return edges
    .map((edge) => ({
      edge,
      centerlineDistanceM: lineToLineDistanceM(edge, centerline),
      parcelDistanceM: lineToPolygonDistanceM(edge, parcelPolygon),
    }))
    .filter(
      (candidate) =>
        candidate.centerlineDistanceM <= MAX_ROAD_EDGE_TO_CENTERLINE_M &&
        candidate.parcelDistanceM <= MAX_ROAD_EDGE_TO_PARCEL_M,
    )
    .sort((a, b) => a.centerlineDistanceM - b.centerlineDistanceM)
    .map((candidate) => candidate.edge);
}

function lineMidpoint(line: GeoJsonLineString25832): Point | null {
  const first = line.coordinates[0];
  const last = line.coordinates[line.coordinates.length - 1];
  if (!first || !last) return null;
  return [(first[0] + last[0]) / 2, (first[1] + last[1]) / 2];
}

function lineDirection(line: GeoJsonLineString25832): Point | null {
  const first = line.coordinates[0];
  const last = line.coordinates[line.coordinates.length - 1];
  if (!first || !last) return null;
  const dx = last[0] - first[0];
  const dy = last[1] - first[1];
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length < Number.EPSILON) return null;
  return [dx / length, dy / length];
}

function nearestPointOnLine(point: Point, line: GeoJsonLineString25832): Point | null {
  let best: { point: Point; distanceM: number } | null = null;
  for (const [a, b] of lineSegments(line)) {
    const candidate = nearestPointOnSegment(point, a, b);
    const distanceM = distance(point, candidate);
    if (!best || distanceM < best.distanceM) best = { point: candidate, distanceM };
  }
  return best?.point ?? null;
}

export function calculateRoadWidthM(
  centerline: GeoJsonLineString25832 | null,
  edges: GeoJsonLineString25832[],
): number | null {
  if (!centerline || edges.length < 2) return null;

  const midpoint = lineMidpoint(centerline);
  const direction = lineDirection(centerline);
  if (!midpoint || !direction) return null;

  const normal: Point = [-direction[1], direction[0]];
  const signedOffsets = edges
    .map((edge) => nearestPointOnLine(midpoint, edge))
    .filter((point): point is Point => point !== null)
    .map((point) => (point[0] - midpoint[0]) * normal[0] + (point[1] - midpoint[1]) * normal[1])
    .filter((offset) => Math.abs(offset) > 0.1);

  const positive = signedOffsets.filter((offset) => offset > 0).sort((a, b) => a - b)[0];
  const negative = signedOffsets.filter((offset) => offset < 0).sort((a, b) => b - a)[0];

  if (positive == null || negative == null) return null;

  return Math.round((positive + Math.abs(negative)) * 100) / 100;
}
