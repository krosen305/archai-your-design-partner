// src/domain/drawing/kote-engine.ts
//
// Pure, world-space (EPSG:25832) selection of which terrain koter to plot on the
// beliggenhedsplan, organised into the authority's three priority layers:
//   A  building-corner + parcel-corner koter (mandatory "skal-koter")
//   B  road koter, terrain extrema, neighbour-proximity flags
//   C  adaptive open-terrain grid — lowest priority. The grid THINNING and
//      collision-unclutter is a paper-space concern and lives in the renderer
//      layer (src/lib/drawing/kote-grid.ts), not here.
//
// No paper units, px, Projector, React, IO or compliance invention in this
// module. Koter are only ever derived from measured terrain samples.

import { minDistanceToBoundaryM } from "@/lib/geometry-utils";

export type WorldPoint = { x: number; y: number };
export type TerrainSample = { x: number; y: number; z: number };
export type KoteLayer = "A" | "B" | "C";
export type KoteKind = "building_corner" | "parcel_corner" | "road" | "extremum" | "grid";
export type KotePlacement = {
  /** World EPSG:25832 position where the kote dot is drawn. */
  x: number;
  y: number;
  /** DVR90 elevation, metres. */
  z: number;
  /** Render-ready label, e.g. "20.14". */
  label: string;
  layer: KoteLayer;
  kind: KoteKind;
};

/** Format a kote to the drawing's 2-decimal DVR90 convention. */
export const koteLabel = (z: number): string => z.toFixed(2);

/**
 * Nearest measured terrain elevation to a point, or null when the closest
 * sample is farther than maxRadiusM (so we never label a location the DHM grid
 * did not actually cover).
 */
export function sampleTerrainZ(
  p: WorldPoint,
  terrain: TerrainSample[],
  maxRadiusM: number,
): number | null {
  let best: number | null = null;
  let bestD = Infinity;
  for (const t of terrain) {
    const d = (t.x - p.x) ** 2 + (t.y - p.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = t.z;
    }
  }
  return best !== null && bestD <= maxRadiusM ** 2 ? best : null;
}

/** Lowest and highest measured koter. Caller must pass a non-empty array. */
export function terrainExtrema(terrain: TerrainSample[]): {
  low: TerrainSample;
  high: TerrainSample;
} {
  let low = terrain[0]!;
  let high = terrain[0]!;
  for (const t of terrain) {
    if (t.z < low.z) low = t;
    if (t.z > high.z) high = t;
  }
  return { low, high };
}

/** Drop the closing duplicate vertex of a GeoJSON ring. */
function ringCorners(ring: [number, number][]): [number, number][] {
  const last = ring[ring.length - 1];
  const first = ring[0];
  const closed = last && first && last[0] === first[0] && last[1] === first[1];
  return (closed ? ring.slice(0, -1) : ring) as [number, number][];
}

function centroidOf(ring: [number, number][]): [number, number] {
  const cs = ringCorners(ring);
  const cx = cs.reduce((s, c) => s + c[0], 0) / cs.length;
  const cy = cs.reduce((s, c) => s + c[1], 0) / cs.length;
  return [cx, cy];
}

/**
 * Layer A — mandatory "skal-koter": one kote at every building corner (nudged
 * cornerOffsetM outward along the centroid→corner direction so the dot sits just
 * off the wall) and one at every parcel-boundary corner. A corner is skipped when
 * the DHM grid has no sample within maxRadiusM (never label uncovered ground).
 */
export function selectLayerAKoter(input: {
  building: [number, number][];
  parcel: [number, number][];
  terrain: TerrainSample[];
  cornerOffsetM: number;
  maxRadiusM: number;
}): KotePlacement[] {
  const out: KotePlacement[] = [];
  const [bcx, bcy] = centroidOf(input.building);
  for (const [x, y] of ringCorners(input.building)) {
    const z = sampleTerrainZ({ x, y }, input.terrain, input.maxRadiusM);
    if (z === null) continue;
    const dx = x - bcx;
    const dy = y - bcy;
    const len = Math.hypot(dx, dy) || 1;
    out.push({
      x: x + (dx / len) * input.cornerOffsetM,
      y: y + (dy / len) * input.cornerOffsetM,
      z,
      label: koteLabel(z),
      layer: "A",
      kind: "building_corner",
    });
  }
  for (const [x, y] of ringCorners(input.parcel)) {
    const z = sampleTerrainZ({ x, y }, input.terrain, input.maxRadiusM);
    if (z === null) continue;
    out.push({ x, y, z, label: koteLabel(z), layer: "A", kind: "parcel_corner" });
  }
  return out;
}

/** Closest point on a polyline to pt, or null for an empty line. */
function nearestOnPolyline(pt: WorldPoint, line: [number, number][]): WorldPoint | null {
  if (line.length === 0) return null;
  let best: WorldPoint | null = null;
  let bestD = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, ay] = line[i]!;
    const [bx, by] = line[i + 1]!;
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy || 1;
    let t = ((pt.x - ax) * dx + (pt.y - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const nx = ax + t * dx;
    const ny = ay + t * dy;
    const d = (pt.x - nx) ** 2 + (pt.y - ny) ** 2;
    if (d < bestD) {
      bestD = d;
      best = { x: nx, y: ny };
    }
  }
  return best;
}

/**
 * Layer B — infrastructure & extrema: a road kote at the centreline point and at
 * each vejkant nearest the parcel, plus the parcel's absolute lowest and highest
 * measured terrain points. (Driveway-side koter need driveway geometry, which the
 * export path does not yet carry; the centreline/vejkant koter approximate them.)
 */
export function selectLayerBKoter(input: {
  parcel: [number, number][];
  terrain: TerrainSample[];
  centerline: [number, number][] | null;
  edges: [number, number][][];
  maxRadiusM: number;
}): KotePlacement[] {
  const out: KotePlacement[] = [];
  const [pcx, pcy] = centroidOf(input.parcel);
  const pushRoad = (pt: WorldPoint | null): void => {
    if (!pt) return;
    const z = sampleTerrainZ(pt, input.terrain, input.maxRadiusM);
    if (z !== null) {
      out.push({ x: pt.x, y: pt.y, z, label: koteLabel(z), layer: "B", kind: "road" });
    }
  };
  pushRoad(input.centerline ? nearestOnPolyline({ x: pcx, y: pcy }, input.centerline) : null);
  for (const e of input.edges) pushRoad(nearestOnPolyline({ x: pcx, y: pcy }, e));

  if (input.terrain.length > 0) {
    const { low, high } = terrainExtrema(input.terrain);
    out.push({
      x: low.x,
      y: low.y,
      z: low.z,
      label: koteLabel(low.z),
      layer: "B",
      kind: "extremum",
    });
    out.push({
      x: high.x,
      y: high.y,
      z: high.z,
      label: koteLabel(high.z),
      layer: "B",
      kind: "extremum",
    });
  }
  return out;
}

/**
 * True when any corner of a neighbour building is within thresholdM of the parcel
 * boundary. Used to flag (not fabricate) a missing neighbour sokkelkote, since the
 * registry does not provide neighbour foundation levels.
 */
export function neighbourWithin(
  neighbour: [number, number][],
  parcel: [number, number][],
  thresholdM: number,
): boolean {
  for (const [x, y] of ringCorners(neighbour)) {
    const d = minDistanceToBoundaryM([x, y], { type: "Polygon", coordinates: [parcel] });
    if (d !== null && d <= thresholdM) return true;
  }
  return false;
}
