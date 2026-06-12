import { describe, it, expect } from "bun:test";
import {
  sampleTerrainZ,
  terrainExtrema,
  selectLayerAKoter,
  selectLayerBKoter,
  neighbourWithin,
  type TerrainSample,
} from "./kote-engine";

const grid: TerrainSample[] = [
  { x: 0, y: 0, z: 10.0 },
  { x: 10, y: 0, z: 10.5 },
  { x: 0, y: 10, z: 11.0 },
  { x: 10, y: 10, z: 12.4 },
];

describe("sampleTerrainZ", () => {
  it("returns nearest point's z within radius", () => {
    expect(sampleTerrainZ({ x: 1, y: 1 }, grid, 5)).toBe(10.0);
    expect(sampleTerrainZ({ x: 9, y: 9 }, grid, 5)).toBe(12.4);
  });
  it("returns null when nearest point is beyond maxRadiusM", () => {
    expect(sampleTerrainZ({ x: 100, y: 100 }, grid, 5)).toBeNull();
  });
  it("returns null for empty terrain", () => {
    expect(sampleTerrainZ({ x: 0, y: 0 }, [], 5)).toBeNull();
  });
});

describe("terrainExtrema", () => {
  it("returns the lowest and highest measured koter", () => {
    const { low, high } = terrainExtrema(grid);
    expect(low.z).toBe(10.0);
    expect(high.z).toBe(12.4);
  });
});

describe("selectLayerAKoter", () => {
  const building: [number, number][] = [
    [2, 2],
    [8, 2],
    [8, 8],
    [2, 8],
    [2, 2],
  ];
  const parcel: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ];
  const terrain: TerrainSample[] = [
    { x: 2, y: 2, z: 10 },
    { x: 8, y: 2, z: 10.2 },
    { x: 8, y: 8, z: 10.4 },
    { x: 2, y: 8, z: 10.1 },
    { x: 0, y: 0, z: 9.9 },
    { x: 10, y: 0, z: 9.8 },
    { x: 10, y: 10, z: 10.6 },
    { x: 0, y: 10, z: 10.0 },
  ];

  it("places one kote per building corner + one per parcel corner (layer A)", () => {
    const koter = selectLayerAKoter({
      building,
      parcel,
      terrain,
      cornerOffsetM: 0.15,
      maxRadiusM: 3,
    });
    expect(koter.filter((k) => k.kind === "building_corner")).toHaveLength(4);
    expect(koter.filter((k) => k.kind === "parcel_corner")).toHaveLength(4);
    expect(koter.every((k) => k.layer === "A")).toBe(true);
  });

  it("nudges building-corner markers OUTWARD from the building centroid", () => {
    const koter = selectLayerAKoter({
      building,
      parcel,
      terrain,
      cornerOffsetM: 0.15,
      maxRadiusM: 3,
    });
    const c = koter.find((k) => k.kind === "building_corner")!;
    // building centroid is (5,5); raw corner (2,2) is sqrt(18)≈4.243 away.
    const dist = Math.hypot(c.x - 5, c.y - 5);
    expect(dist).toBeGreaterThan(4.24);
    expect(dist).toBeCloseTo(4.243 + 0.15, 2);
  });

  it("skips a corner when no terrain sample is within maxRadiusM", () => {
    const koter = selectLayerAKoter({
      building,
      parcel,
      terrain: [{ x: 2, y: 2, z: 10 }], // only covers one building corner
      cornerOffsetM: 0.15,
      maxRadiusM: 1,
    });
    expect(koter.filter((k) => k.kind === "building_corner")).toHaveLength(1);
  });
});

describe("selectLayerBKoter", () => {
  const parcel: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ];
  const terrain: TerrainSample[] = [
    { x: 0, y: 0, z: 9.5 },
    { x: 5, y: -3, z: 9.2 },
    { x: 10, y: 0, z: 9.8 },
    { x: 5, y: 12, z: 11.9 },
  ];

  it("plots a road kote (nearest centreline point to parcel) and both extrema", () => {
    const centerline: [number, number][] = [
      [-2, -3],
      [12, -3],
    ];
    const koter = selectLayerBKoter({ parcel, terrain, centerline, edges: [], maxRadiusM: 4 });
    expect(koter.some((k) => k.kind === "road")).toBe(true);
    expect(koter.filter((k) => k.kind === "extremum")).toHaveLength(2);
    expect(koter.every((k) => k.layer === "B")).toBe(true);
  });

  it("works with no road geometry (still emits both extrema)", () => {
    const koter = selectLayerBKoter({
      parcel,
      terrain,
      centerline: null,
      edges: [],
      maxRadiusM: 4,
    });
    expect(koter.filter((k) => k.kind === "road")).toHaveLength(0);
    expect(koter.filter((k) => k.kind === "extremum")).toHaveLength(2);
  });
});

describe("neighbourWithin", () => {
  const parcel: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ];
  it("flags a neighbour building within threshold of the boundary", () => {
    const near: [number, number][] = [
      [10.5, 4],
      [12, 4],
      [12, 6],
      [10.5, 6],
      [10.5, 4],
    ];
    expect(neighbourWithin(near, parcel, 2.5)).toBe(true);
  });
  it("does not flag a distant neighbour", () => {
    const far: [number, number][] = [
      [20, 4],
      [22, 4],
      [22, 6],
      [20, 6],
      [20, 4],
    ];
    expect(neighbourWithin(far, parcel, 2.5)).toBe(false);
  });
});
