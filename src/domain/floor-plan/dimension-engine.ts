// src/domain/floor-plan/dimension-engine.ts
//
// Pure deterministic dimension-chain engine for floor-plan levels.
// No AI, no network, no Supabase. Domain core — may NOT import from src/lib/.
//
// Computes:
//  - Exterior chains (N/S/E/W facade dimension strings)
//  - Interior room dimensions (width + depth segments per room bounding box)

import type { Point2D } from "@/domain/geometry/geometry-2d.types";
import type { FloorLevel } from "./floor-plan.types";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type WitnessPoint = {
  /** Actual wall-face point (on the building facade). */
  worldPt: Point2D;
  /** End of the witness extension line (offset away from the building). */
  extensionEnd: Point2D;
};

export type DimensionSegment = {
  from: WitnessPoint;
  to: WitnessPoint;
  /** Segment length in meters, rounded to 2 decimal places. */
  labelM: number;
  /** Human-readable label, e.g. "3.84 m" */
  labelText: string;
};

export type DimensionChain = {
  segments: DimensionSegment[];
  /** Sum of all segment labelM values, rounded to 2 decimal places. */
  totalM: number;
  side: "north" | "south" | "east" | "west";
  /** Distance from building face to the chain line. */
  offsetM: number;
};

export type FloorDimensions = {
  /** One chain per facade side per offset (stacked exterior strings). */
  exteriorChains: DimensionChain[];
  /** Interior room-dimension segments (width + depth per room). */
  interiorDimensions: DimensionSegment[];
};

export type DimensionOptions = {
  /**
   * Distances from the facade face to successive chain lines.
   * Default: [0.5, 1.0, 1.5]
   */
  exteriorOffsets?: number[];
  /** Whether to compute interior room dimensions. Default: true. */
  includeInterior?: boolean;
  /**
   * Ignore segments shorter than this (meters). Default: 0.1.
   */
  minSegmentM?: number;
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

const DEFAULT_OFFSETS = [0.5, 1.0, 1.5] as const;
const DEFAULT_MIN_SEGMENT = 0.1;

/**
 * Compute dimension chains for a FloorLevel.
 *
 * Exterior chains: For each facade (N/S/E/W), projects wall endpoints onto the
 * facade axis, sorts them, and builds segments. The chain line is offset
 * outward from the building face by `offsetM`.
 *
 * Interior dimensions: One segment per room axis (width + depth) derived from
 * the room polygon bounding box.
 */
export function computeDimensions(level: FloorLevel, opts?: DimensionOptions): FloorDimensions {
  const offsets = opts?.exteriorOffsets ?? [...DEFAULT_OFFSETS];
  const includeInterior = opts?.includeInterior ?? true;
  const minSeg = opts?.minSegmentM ?? DEFAULT_MIN_SEGMENT;

  if (level.walls.length === 0) {
    return { exteriorChains: [], interiorDimensions: [] };
  }

  // Build bounding box from all wall endpoints
  const allPts: Point2D[] = level.walls.flatMap((w) => [w.centerline.start, w.centerline.end]);
  const bbox = boundingBox(allPts);
  if (!bbox) {
    return { exteriorChains: [], interiorDimensions: [] };
  }

  const exteriorChains = buildExteriorChains(level, bbox, offsets, minSeg);
  const interiorDimensions = includeInterior ? buildInteriorDimensions(level, minSeg) : [];

  return { exteriorChains, interiorDimensions };
}

// ---------------------------------------------------------------------------
// Bounding box
// ---------------------------------------------------------------------------

type BBox = { minX: number; minY: number; maxX: number; maxY: number };

function boundingBox(pts: Point2D[]): BBox | null {
  if (pts.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

// ---------------------------------------------------------------------------
// Exterior chains
// ---------------------------------------------------------------------------

type Side = "north" | "south" | "east" | "west";

/**
 * For each side and each offset, collect the wall-endpoint projections on the
 * facade axis and build dimension segments.
 *
 * We generate chains at every offset level:
 *   offset[0] (innermost) = total facade span (1 segment)
 *   offset[1] = partial sub-divisions where wall endpoints fall
 *   offset[2] = finer sub-divisions
 *
 * For simplicity, all offsets share the same projection points. Chain[0] is
 * always exactly one segment (total facade). Subsequent chains provide the
 * sub-divisions. If only one offset is requested, we produce both total and
 * subdivisions at that single offset.
 */
function buildExteriorChains(
  level: FloorLevel,
  bbox: BBox,
  offsets: number[],
  minSeg: number,
): DimensionChain[] {
  if (offsets.length === 0) return [];

  const sides: Side[] = ["north", "south", "east", "west"];
  const result: DimensionChain[] = [];

  for (const side of sides) {
    const projections = collectProjections(level, bbox, side);
    if (projections.length < 2) continue;

    // Sort and deduplicate (within 1mm)
    const sorted = dedup(projections, 0.001);
    if (sorted.length < 2) continue;

    if (offsets.length === 1) {
      // Single offset: emit total chain at offset[0]
      const chain = buildChain(side, sorted, offsets[0]!, bbox, minSeg, true);
      if (chain) result.push(chain);
    } else {
      // First offset: total span only (one segment)
      const totalChain = buildChain(side, sorted, offsets[0]!, bbox, minSeg, true);
      if (totalChain) result.push(totalChain);

      // Remaining offsets: subdivisions
      for (let i = 1; i < offsets.length; i++) {
        const subChain = buildChain(side, sorted, offsets[i]!, bbox, minSeg, false);
        if (subChain) result.push(subChain);
      }
    }
  }

  return result;
}

/**
 * Collect all unique coordinate projections for a given facade side.
 *
 * For N/S facades we project onto the X-axis; for E/W onto the Y-axis.
 * We also include the bbox endpoints to always capture the full facade extent.
 */
function collectProjections(level: FloorLevel, bbox: BBox, side: Side): number[] {
  const coords: number[] = [];

  // Always include the bbox boundary coordinates so total length is correct
  if (side === "north" || side === "south") {
    coords.push(bbox.minX, bbox.maxX);
  } else {
    coords.push(bbox.minY, bbox.maxY);
  }

  // Add projections from all wall endpoints
  for (const wall of level.walls) {
    for (const pt of [wall.centerline.start, wall.centerline.end]) {
      if (side === "north" || side === "south") {
        coords.push(pt.x);
      } else {
        coords.push(pt.y);
      }
    }
  }

  return coords;
}

/**
 * Build a DimensionChain for a facade side from sorted projection coordinates.
 *
 * @param totalOnly  If true, emit a single segment spanning the full range.
 *                   If false, emit one segment per adjacent pair of projections.
 */
function buildChain(
  side: Side,
  sorted: number[],
  offsetM: number,
  bbox: BBox,
  minSeg: number,
  totalOnly: boolean,
): DimensionChain | null {
  const pairs: Array<[number, number]> = totalOnly
    ? [[sorted[0]!, sorted[sorted.length - 1]!]]
    : sorted.slice(0, -1).map((v, i) => [v, sorted[i + 1]!] as [number, number]);

  const segments: DimensionSegment[] = [];

  for (const [a, b] of pairs) {
    const distM = Math.round((b - a) * 100) / 100;
    if (distM < minSeg) continue;

    const seg = buildSegment(side, a, b, offsetM, bbox);
    segments.push(seg);
  }

  if (segments.length === 0) return null;

  const totalM = Math.round(segments.reduce((s, seg) => s + seg.labelM, 0) * 100) / 100;

  return { segments, totalM, side, offsetM };
}

/**
 * Build one DimensionSegment for a facade span [coordA, coordB] at offsetM.
 *
 * For N/S: coordA/B are X values. Face Y = bbox.maxY (north) or bbox.minY (south).
 * For E/W: coordA/B are Y values. Face X = bbox.maxX (east) or bbox.minX (west).
 */
function buildSegment(
  side: Side,
  coordA: number,
  coordB: number,
  offsetM: number,
  bbox: BBox,
): DimensionSegment {
  let worldA: Point2D;
  let worldB: Point2D;
  let extA: Point2D;
  let extB: Point2D;

  switch (side) {
    case "north": {
      const faceY = bbox.maxY;
      worldA = { x: coordA, y: faceY };
      worldB = { x: coordB, y: faceY };
      extA = { x: coordA, y: faceY + offsetM };
      extB = { x: coordB, y: faceY + offsetM };
      break;
    }
    case "south": {
      const faceY = bbox.minY;
      worldA = { x: coordA, y: faceY };
      worldB = { x: coordB, y: faceY };
      extA = { x: coordA, y: faceY - offsetM };
      extB = { x: coordB, y: faceY - offsetM };
      break;
    }
    case "east": {
      const faceX = bbox.maxX;
      worldA = { x: faceX, y: coordA };
      worldB = { x: faceX, y: coordB };
      extA = { x: faceX + offsetM, y: coordA };
      extB = { x: faceX + offsetM, y: coordB };
      break;
    }
    case "west": {
      const faceX = bbox.minX;
      worldA = { x: faceX, y: coordA };
      worldB = { x: faceX, y: coordB };
      extA = { x: faceX - offsetM, y: coordA };
      extB = { x: faceX - offsetM, y: coordB };
      break;
    }
  }

  const labelM = Math.round(Math.abs(coordB - coordA) * 100) / 100;
  const labelText = `${labelM.toFixed(2)} m`;

  return {
    from: { worldPt: worldA, extensionEnd: extA },
    to: { worldPt: worldB, extensionEnd: extB },
    labelM,
    labelText,
  };
}

// ---------------------------------------------------------------------------
// Interior dimensions
// ---------------------------------------------------------------------------

function buildInteriorDimensions(level: FloorLevel, minSeg: number): DimensionSegment[] {
  const result: DimensionSegment[] = [];

  for (const room of level.rooms) {
    const pts = room.polygon.vertices;
    if (pts.length < 3) continue;

    const roomBbox = boundingBox(pts);
    if (!roomBbox) continue;

    const widthM = Math.round((roomBbox.maxX - roomBbox.minX) * 100) / 100;
    const depthM = Math.round((roomBbox.maxY - roomBbox.minY) * 100) / 100;
    const midX = (roomBbox.minX + roomBbox.maxX) / 2;
    const midY = (roomBbox.minY + roomBbox.maxY) / 2;

    // Width segment: horizontal at the middle Y
    if (widthM >= minSeg) {
      // Interior: witness has no extension offset, unlike exterior chains
      const wFrom: WitnessPoint = {
        worldPt: { x: roomBbox.minX, y: midY },
        extensionEnd: { x: roomBbox.minX, y: midY },
      };
      const wTo: WitnessPoint = {
        worldPt: { x: roomBbox.maxX, y: midY },
        extensionEnd: { x: roomBbox.maxX, y: midY },
      };
      result.push({
        from: wFrom,
        to: wTo,
        labelM: widthM,
        labelText: `${widthM.toFixed(2)} m`,
      });
    }

    // Depth segment: vertical at the middle X
    if (depthM >= minSeg) {
      const dFrom: WitnessPoint = {
        worldPt: { x: midX, y: roomBbox.minY },
        extensionEnd: { x: midX, y: roomBbox.minY },
      };
      const dTo: WitnessPoint = {
        worldPt: { x: midX, y: roomBbox.maxY },
        extensionEnd: { x: midX, y: roomBbox.maxY },
      };
      result.push({
        from: dFrom,
        to: dTo,
        labelM: depthM,
        labelText: `${depthM.toFixed(2)} m`,
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sort numbers and remove values within `tol` of a previous value. */
function dedup(values: number[], tol: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const result: number[] = [];
  for (const v of sorted) {
    if (result.length === 0 || v - result[result.length - 1]! > tol) {
      result.push(v);
    }
  }
  return result;
}
