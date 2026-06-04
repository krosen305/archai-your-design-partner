// src/domain/floor-plan/layout-engine.ts
//
// Deterministic 2D orthogonal layout engine. Produces a closed exterior shell
// and weighted interior partitions arranged in a 2D grid (columns × rows).
// Rooms are later derived by the topology engine (detectRooms) so the wall
// graph must form a valid planar graph: every partition endpoint must land
// exactly on the shell or another partition.
//
// Pure domain. No React, Supabase, AI or src/lib imports.

import type { ElementSourceMeta, RoomZone, Wall } from "./floor-plan.types";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type LayoutBrief = {
  widthM: number;
  depthM: number;
  rooms: Array<{ name: string; roomType: RoomZone["roomType"] }>;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXTERIOR_THICKNESS_M = 0.3;
const INTERIOR_THICKNESS_M = 0.1;
const WALL_HEIGHT_M = 2.5;

const GENERATED: ElementSourceMeta = {
  source: "generated",
  confidence: "medium",
  fetchedAt: null,
  requiresReview: false,
};

// ---------------------------------------------------------------------------
// Room-type weights (drive differing room sizes)
// ---------------------------------------------------------------------------

const ROOM_TYPE_WEIGHT: Record<RoomZone["roomType"], number> = {
  bathroom: 0.5,
  utility: 0.6,
  technical: 0.6,
  storage: 0.6,
  kitchen: 1.3,
  living: 1.6,
  bedroom: 1.1,
  entrance: 0.8,
  hall: 0.8,
  office: 1.0,
  stair: 0.7,
  garage: 1.2,
  other: 1.0,
};

function weightFor(roomType: RoomZone["roomType"]): number {
  return ROOM_TYPE_WEIGHT[roomType] ?? 1.0;
}

// ---------------------------------------------------------------------------
// Coordinate helper
// ---------------------------------------------------------------------------

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// Wall factories (same shape as seed-generator)
// ---------------------------------------------------------------------------

let wallCounter = 0;

function makeWall(
  a: [number, number],
  b: [number, number],
  wallKind: Wall["wallKind"],
  thicknessM: number,
): Wall {
  const id = `w_layout_${++wallCounter}`;
  return {
    id,
    levelId: "level_0",
    centerline: {
      start: { x: a[0], y: a[1] },
      end: { x: b[0], y: b[1] },
    },
    thicknessM,
    heightM: WALL_HEIGHT_M,
    wallKind,
    structuralRole: wallKind === "exterior" ? "bearing" : "non_bearing",
    fireRole: "none",
    assemblyId: null,
    locked: false,
    source: GENERATED,
  };
}

function exteriorWall(a: [number, number], b: [number, number]): Wall {
  return makeWall(a, b, "exterior", EXTERIOR_THICKNESS_M);
}

function interiorWall(a: [number, number], b: [number, number]): Wall {
  return makeWall(a, b, "interior", INTERIOR_THICKNESS_M);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Build a deterministic orthogonal wall layout for a rectangular footprint.
 *
 * Algorithm:
 * 1. 4 exterior shell walls (south, east, north, west — CCW).
 * 2. Grid: cols = max(1, round(sqrt(N))), rows = ceil(N / cols).
 * 3. Column widths weighted by sum of weights in that column.
 * 4. Within each column, row heights weighted by individual room weight.
 * 5. Vertical partitions run full depth so they connect south shell to north
 *    shell (valid planar graph edges).
 * 6. Horizontal partitions within each column run from the column's west
 *    boundary to its east boundary (connecting to vertical partitions or
 *    exterior shell at exact rounded coordinates).
 */
export function layoutWalls(brief: LayoutBrief): Wall[] {
  // Reset counter for determinism across calls in the same process.
  wallCounter = 0;

  const { widthM: W, depthM: D, rooms } = brief;
  const N = Math.max(1, rooms.length);

  // --- 1. Exterior shell (CCW) ---
  const exterior: Wall[] = [
    exteriorWall([0, 0], [W, 0]),   // south
    exteriorWall([W, 0], [W, D]),   // east
    exteriorWall([W, D], [0, D]),   // north
    exteriorWall([0, D], [0, 0]),   // west
  ];

  if (N === 1) {
    return exterior;
  }

  // --- 2. Grid dimensions ---
  const cols = Math.max(1, Math.round(Math.sqrt(N)));
  const rows = Math.ceil(N / cols);

  // Assign rooms to cells in row-major order (left→right, bottom→top).
  // roomAt[col][row] = room index or undefined if grid is larger than N.
  const roomAt: Array<Array<number | undefined>> = [];
  for (let c = 0; c < cols; c++) {
    roomAt[c] = [];
    for (let r = 0; r < rows; r++) {
      const idx = c * rows + r;
      roomAt[c]![r] = idx < N ? idx : undefined;
    }
  }

  // --- 3. Column widths (weighted by sum of weights in each column) ---
  const colWeights: number[] = [];
  for (let c = 0; c < cols; c++) {
    let sum = 0;
    for (let r = 0; r < rows; r++) {
      const idx = roomAt[c]![r];
      sum += idx !== undefined ? weightFor(rooms[idx]!.roomType) : 0;
    }
    colWeights.push(sum > 0 ? sum : 1);
  }
  const totalColWeight = colWeights.reduce((a, b) => a + b, 0);

  // Cumulative x-positions of column boundaries (including x=0 and x=W).
  const colX: number[] = [0];
  let cumW = 0;
  for (let c = 0; c < cols; c++) {
    cumW += (colWeights[c]! / totalColWeight) * W;
    colX.push(round3(cumW));
  }
  // Force last to exact W to avoid floating-point drift.
  colX[cols] = round3(W);

  // --- 4. Vertical partitions at column boundaries (full depth) ---
  const partitions: Wall[] = [];
  for (let c = 1; c < cols; c++) {
    const x = colX[c]!;
    partitions.push(interiorWall([x, 0], [x, D]));
  }

  // --- 5. Horizontal partitions within each column ---
  // For each column, compute row heights weighted by the room's own weight.
  for (let c = 0; c < cols; c++) {
    const xLeft = colX[c]!;
    const xRight = colX[c + 1]!;

    // Collect row weights for this column.
    const rowWeightsInCol: number[] = [];
    for (let r = 0; r < rows; r++) {
      const idx = roomAt[c]![r];
      rowWeightsInCol.push(idx !== undefined ? weightFor(rooms[idx]!.roomType) : 1);
    }
    const totalRowWeight = rowWeightsInCol.reduce((a, b) => a + b, 0);

    // Cumulative y-positions (including y=0 and y=D).
    const rowY: number[] = [0];
    let cumD = 0;
    for (let r = 0; r < rows; r++) {
      cumD += (rowWeightsInCol[r]! / totalRowWeight) * D;
      rowY.push(round3(cumD));
    }
    rowY[rows] = round3(D);

    // Add horizontal partitions at interior row boundaries (not at 0 or D).
    for (let r = 1; r < rows; r++) {
      const y = rowY[r]!;
      // Endpoints land exactly on colX boundaries (rounded) so topology
      // engine collapses coincident nodes.
      partitions.push(interiorWall([xLeft, y], [xRight, y]));
    }
  }

  return [...exterior, ...partitions];
}
