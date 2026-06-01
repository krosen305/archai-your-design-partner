// src/domain/floor-plan/dimension-engine.test.ts
//
// Unit tests for the dimension-engine. Pure domain — no network, no DB.

import { describe, expect, test } from "bun:test";
import { computeDimensions } from "./dimension-engine";
import type { FloorLevel } from "./floor-plan.types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sourceMeta = {
  source: "generated",
  confidence: "medium",
  fetchedAt: null,
  requiresReview: false,
} as const;

function wall(
  id: string,
  a: [number, number],
  b: [number, number],
  kind: "exterior" | "interior" = "exterior",
) {
  return {
    id,
    levelId: "level_0",
    centerline: { start: { x: a[0], y: a[1] }, end: { x: b[0], y: b[1] } },
    thicknessM: 0.25,
    heightM: 2.5 as number | null,
    wallKind: kind,
    structuralRole: "non_bearing" as const,
    fireRole: "none" as const,
    assemblyId: null as string | null,
    locked: false,
    source: sourceMeta,
  };
}

function emptyLevel(walls: ReturnType<typeof wall>[], rooms: FloorLevel["rooms"] = []): FloorLevel {
  return {
    id: "level_0",
    name: "Stueplan",
    levelIndex: 0,
    elevationM: 0,
    floorToFloorHeightM: null,
    walls,
    rooms,
    openings: [],
    fixtures: [],
    furniture: [],
    stairs: [],
    annotations: [],
  };
}

function room(
  id: string,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): FloorLevel["rooms"][number] {
  return {
    id,
    levelId: "level_0",
    name: "Stue",
    roomType: "living",
    polygon: {
      vertices: [
        { x: minX, y: minY },
        { x: maxX, y: minY },
        { x: maxX, y: maxY },
        { x: minX, y: maxY },
      ],
    },
    netAreaM2: (maxX - minX) * (maxY - minY),
    minAreaM2: null,
    targetAreaM2: null,
    floorFinishAssemblyId: null,
    ceilingFinishAssemblyId: null,
    wallFinishAssemblyByWallId: {},
    ventilationNeed: "natural",
    wetRoomZone: false,
    daylightRelevant: true,
    source: sourceMeta,
  };
}

/**
 * Build a simple rectangular house: 12 × 8 m (X from 0→12, Y from 0→8).
 */
function rect12x8(): FloorLevel {
  return emptyLevel([
    wall("w_s", [0, 0], [12, 0]),
    wall("w_e", [12, 0], [12, 8]),
    wall("w_n", [12, 8], [0, 8]),
    wall("w_w", [0, 8], [0, 0]),
  ]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("computeDimensions — empty level", () => {
  test("returns empty chains for a level with no walls", () => {
    const result = computeDimensions(emptyLevel([]));
    expect(result.exteriorChains).toHaveLength(0);
    expect(result.interiorDimensions).toHaveLength(0);
  });
});

describe("computeDimensions — simple 12×8 rectangle", () => {
  const level = rect12x8();

  test("north chain (offset[0]) has totalM = 12.0", () => {
    const result = computeDimensions(level, { exteriorOffsets: [0.5] });
    const northChain = result.exteriorChains.find((c) => c.side === "north" && c.offsetM === 0.5);
    expect(northChain).toBeDefined();
    expect(northChain!.totalM).toBeCloseTo(12.0, 2);
  });

  test("south chain has totalM = 12.0", () => {
    const result = computeDimensions(level, { exteriorOffsets: [0.5] });
    const southChain = result.exteriorChains.find((c) => c.side === "south");
    expect(southChain).toBeDefined();
    expect(southChain!.totalM).toBeCloseTo(12.0, 2);
  });

  test("east chain has totalM = 8.0", () => {
    const result = computeDimensions(level, { exteriorOffsets: [0.5] });
    const eastChain = result.exteriorChains.find((c) => c.side === "east");
    expect(eastChain).toBeDefined();
    expect(eastChain!.totalM).toBeCloseTo(8.0, 2);
  });

  test("west chain has totalM = 8.0", () => {
    const result = computeDimensions(level, { exteriorOffsets: [0.5] });
    const westChain = result.exteriorChains.find((c) => c.side === "west");
    expect(westChain).toBeDefined();
    expect(westChain!.totalM).toBeCloseTo(8.0, 2);
  });

  test("single-offset N chain has exactly 1 segment", () => {
    const result = computeDimensions(level, { exteriorOffsets: [0.5] });
    const northChain = result.exteriorChains.find((c) => c.side === "north");
    expect(northChain!.segments).toHaveLength(1);
  });

  test("no interior dimensions when includeInterior = false", () => {
    const result = computeDimensions(level, { includeInterior: false });
    expect(result.interiorDimensions).toHaveLength(0);
  });

  test("no interior dimensions when level has no rooms", () => {
    const result = computeDimensions(level);
    expect(result.interiorDimensions).toHaveLength(0);
  });

  test("segment labelText format is '12.00 m'", () => {
    const result = computeDimensions(level, { exteriorOffsets: [0.5] });
    const northChain = result.exteriorChains.find((c) => c.side === "north");
    expect(northChain!.segments[0]!.labelText).toBe("12.00 m");
  });
});

describe("computeDimensions — house with a projection / step", () => {
  /**
   * House with a notch on the north side:
   *   Main body: X 0→12, Y 0→8
   *   Plus a projection at X 4→8 extending north to Y 10
   *
   * Wall endpoints on the north side at X: 0, 4, 8, 12
   * So the N-chain subdivision should have 3 segments summing to 12m.
   */
  function stepHouse(): FloorLevel {
    return emptyLevel([
      // Main south wall
      wall("w_s", [0, 0], [12, 0]),
      // East wall
      wall("w_e", [12, 0], [12, 8]),
      // North wall right segment
      wall("w_nr", [12, 8], [8, 8]),
      // Projection east wall
      wall("w_pe", [8, 8], [8, 10]),
      // Projection north wall
      wall("w_pn", [8, 10], [4, 10]),
      // Projection west wall
      wall("w_pw", [4, 10], [4, 8]),
      // North wall left segment
      wall("w_nl", [4, 8], [0, 8]),
      // West wall
      wall("w_w", [0, 8], [0, 0]),
    ]);
  }

  test("N-chain totalM = 12.0 (spans full width)", () => {
    const result = computeDimensions(stepHouse(), { exteriorOffsets: [0.5, 1.0] });
    // The outermost north chain at offset 0.5 covers total north facade
    const northTotalChain = result.exteriorChains.find(
      (c) => c.side === "north" && c.segments.length === 1,
    );
    expect(northTotalChain).toBeDefined();
    expect(northTotalChain!.totalM).toBeCloseTo(12.0, 2);
  });

  test("subdivided N-chain segments sum to 12.0", () => {
    const result = computeDimensions(stepHouse(), { exteriorOffsets: [0.5, 1.0] });
    const northSubChain = result.exteriorChains.find(
      (c) => c.side === "north" && c.segments.length > 1,
    );
    expect(northSubChain).toBeDefined();
    const segSum = northSubChain!.segments.reduce((s, seg) => s + seg.labelM, 0);
    expect(Math.round(segSum * 100) / 100).toBeCloseTo(12.0, 2);
  });

  test("subdivided N-chain has more than 1 segment", () => {
    const result = computeDimensions(stepHouse(), { exteriorOffsets: [0.5, 1.0] });
    const northSubChain = result.exteriorChains.find(
      (c) => c.side === "north" && c.segments.length > 1,
    );
    expect(northSubChain!.segments.length).toBeGreaterThan(1);
  });
});

describe("computeDimensions — minSegmentM filtering", () => {
  test("segments below minSegmentM are excluded", () => {
    // Wall with a very small endpoint gap (0.05 m)
    const level = emptyLevel([
      wall("w_s", [0, 0], [12, 0]),
      wall("w_e", [12, 0], [12, 8]),
      wall("w_n", [12, 8], [0.05, 8]), // creates a 0.05m gap at X=0 to X=0.05
      wall("w_n2", [0.05, 8], [0, 8]),
      wall("w_w", [0, 8], [0, 0]),
    ]);

    // With default minSegment (0.1 m), the 0.05 m stub should be filtered out
    const result = computeDimensions(level, {
      exteriorOffsets: [0.5, 1.0],
      minSegmentM: 0.1,
    });

    // All segments should be >= 0.1 m
    for (const chain of result.exteriorChains) {
      for (const seg of chain.segments) {
        expect(seg.labelM).toBeGreaterThanOrEqual(0.1);
      }
    }
  });

  test("no segments emitted when all projections are shorter than minSegmentM", () => {
    // Wall that's only 0.05 m long
    const level = emptyLevel([wall("w_tiny", [0, 0], [0.05, 0])]);
    const result = computeDimensions(level, { minSegmentM: 0.1, exteriorOffsets: [0.5] });
    for (const chain of result.exteriorChains) {
      expect(chain.segments).toHaveLength(0);
    }
  });
});

describe("computeDimensions — interior dimensions", () => {
  test("room produces width and depth segments", () => {
    const level = emptyLevel(
      [
        wall("w_s", [0, 0], [6, 0]),
        wall("w_e", [6, 0], [6, 4]),
        wall("w_n", [6, 4], [0, 4]),
        wall("w_w", [0, 4], [0, 0]),
      ],
      [room("r1", 0, 0, 6, 4)],
    );

    const result = computeDimensions(level);
    // Should have 2 segments per room: width and depth
    expect(result.interiorDimensions).toHaveLength(2);
    const labels = result.interiorDimensions.map((s) => s.labelM).sort((a, b) => a - b);
    expect(labels[0]).toBeCloseTo(4.0, 2); // depth
    expect(labels[1]).toBeCloseTo(6.0, 2); // width
  });

  test("multiple rooms produce 2 segments each", () => {
    const level = emptyLevel(
      [wall("w_s", [0, 0], [10, 0]), wall("w_n", [10, 5], [0, 5])],
      [room("r1", 0, 0, 5, 5), room("r2", 5, 0, 10, 5)],
    );

    const result = computeDimensions(level);
    expect(result.interiorDimensions).toHaveLength(4);
  });

  test("no rooms → empty interiorDimensions", () => {
    const level = rect12x8(); // no rooms
    const result = computeDimensions(level);
    expect(result.interiorDimensions).toHaveLength(0);
  });
});

describe("computeDimensions — witness point geometry", () => {
  test("north chain witness extension ends point outward (positive Y offset)", () => {
    const level = rect12x8();
    const result = computeDimensions(level, { exteriorOffsets: [0.5] });
    const northChain = result.exteriorChains.find((c) => c.side === "north");
    expect(northChain).toBeDefined();
    const seg = northChain!.segments[0]!;
    // North face is at Y=8; extension end should be at Y=8+0.5=8.5
    expect(seg.from.extensionEnd.y).toBeCloseTo(8.5, 4);
    expect(seg.to.extensionEnd.y).toBeCloseTo(8.5, 4);
    // worldPt should be on the face
    expect(seg.from.worldPt.y).toBeCloseTo(8.0, 4);
  });

  test("south chain extension ends point outward (negative Y offset)", () => {
    const level = rect12x8();
    const result = computeDimensions(level, { exteriorOffsets: [0.5] });
    const southChain = result.exteriorChains.find((c) => c.side === "south");
    const seg = southChain!.segments[0]!;
    // South face at Y=0; extension end at Y=-0.5
    expect(seg.from.extensionEnd.y).toBeCloseTo(-0.5, 4);
  });
});
