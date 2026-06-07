import type {
  DataConfidence,
  GeoJsonLineString25832,
  GeoJsonPolygon25832,
} from "@/domain/drawing/beliggenhedsplan.types";

type Point = [number, number];

const MAX_ROAD_EDGE_TO_CENTERLINE_M = 25;
const MAX_ROAD_EDGE_TO_PARCEL_M = 80;
const MAX_WIDTH_SAMPLE_SPREAD_M = 4;
const ROAD_WIDTH_SAMPLE_FRACTIONS = [0.25, 0.5, 0.75] as const;

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

function segmentLength(a: Point, b: Point): number {
  return distance(a, b);
}

function lineLengthM(line: GeoJsonLineString25832): number {
  return lineSegments(line).reduce((sum, [a, b]) => sum + segmentLength(a, b), 0);
}

function pointAndDirectionAtFraction(
  line: GeoJsonLineString25832,
  fraction: number,
): { point: Point; direction: Point } | null {
  const segments = lineSegments(line);
  const totalLength = lineLengthM(line);
  if (!segments.length || totalLength < Number.EPSILON) return null;

  const targetLength = Math.max(0, Math.min(1, fraction)) * totalLength;
  let traversed = 0;

  for (let i = 0; i < segments.length; i += 1) {
    const [a, b] = segments[i];
    const lengthM = segmentLength(a, b);
    if (lengthM < Number.EPSILON) continue;

    const isLast = i === segments.length - 1;
    if (targetLength <= traversed + lengthM || isLast) {
      const t = Math.max(0, Math.min(1, (targetLength - traversed) / lengthM));
      return {
        point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
        direction: [(b[0] - a[0]) / lengthM, (b[1] - a[1]) / lengthM],
      };
    }

    traversed += lengthM;
  }

  return null;
}

function nearestPointOnLine(
  point: Point,
  line: GeoJsonLineString25832,
): { point: Point; distanceM: number } | null {
  let best: { point: Point; distanceM: number } | null = null;
  for (const [a, b] of lineSegments(line)) {
    const candidate = nearestPointOnSegment(point, a, b);
    const distanceM = distance(point, candidate);
    if (!best || distanceM < best.distanceM) best = { point: candidate, distanceM };
  }
  return best;
}

function sampleRoadWidthM(
  sample: { point: Point; direction: Point },
  edges: GeoJsonLineString25832[],
): number | null {
  const normal: Point = [-sample.direction[1], sample.direction[0]];
  const signedOffsets = edges
    .map((edge) => nearestPointOnLine(sample.point, edge))
    .filter((nearest): nearest is { point: Point; distanceM: number } => nearest !== null)
    .filter((nearest) => nearest.distanceM <= MAX_ROAD_EDGE_TO_CENTERLINE_M)
    .map(
      (nearest) =>
        (nearest.point[0] - sample.point[0]) * normal[0] +
        (nearest.point[1] - sample.point[1]) * normal[1],
    )
    .filter((offset) => Math.abs(offset) > 0.1);

  const positive = signedOffsets.filter((offset) => offset > 0).sort((a, b) => a - b)[0];
  const negative = signedOffsets.filter((offset) => offset < 0).sort((a, b) => b - a)[0];

  if (positive == null || negative == null) return null;

  return positive + Math.abs(negative);
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? null;
  const left = sorted[middle - 1];
  const right = sorted[middle];
  if (left == null || right == null) return null;
  return (left + right) / 2;
}

export function calculateRoadWidthM(
  centerline: GeoJsonLineString25832 | null,
  edges: GeoJsonLineString25832[],
): number | null {
  if (!centerline || edges.length < 2) return null;

  const widths = ROAD_WIDTH_SAMPLE_FRACTIONS.map((fraction) =>
    pointAndDirectionAtFraction(centerline, fraction),
  )
    .filter((sample): sample is { point: Point; direction: Point } => sample !== null)
    .map((sample) => sampleRoadWidthM(sample, edges))
    .filter((width): width is number => width !== null);

  const roadWidthM = median(widths);
  if (roadWidthM === null) return null;

  const spreadM = Math.max(...widths) - Math.min(...widths);
  if (widths.length >= 2 && spreadM > MAX_WIDTH_SAMPLE_SPREAD_M) return null;

  return Math.round(roadWidthM * 100) / 100;
}

export function assessRoadGeometryQuality(
  centerline: GeoJsonLineString25832 | null,
  edges: GeoJsonLineString25832[],
  widthM: number | null,
): {
  confidence: DataConfidence;
  requiresReview: boolean;
  reviewReasons: string[];
} {
  const reviewReasons: string[] = [];

  if (!centerline) {
    reviewReasons.push("geodanmark.centerline_missing");
  }

  if (centerline && edges.length < 2) {
    reviewReasons.push("geodanmark.road_edges_missing");
  }

  if (centerline && edges.length >= 2 && widthM === null) {
    reviewReasons.push("geodanmark.road_width_uncertain");
  }

  const confidence: DataConfidence = !centerline
    ? "unknown"
    : reviewReasons.length > 0
      ? "low"
      : "medium";

  return {
    confidence,
    requiresReview: reviewReasons.length > 0,
    reviewReasons,
  };
}
