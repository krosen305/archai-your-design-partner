import { describe, it, expect } from "bun:test";
import { selectGridKoter, type PaperBox } from "./kote-grid";
import { createProjector } from "./projector";
import { PX_PER_MM } from "./sheet-layout";
import type { TerrainSample, KotePlacement } from "@/domain/drawing/kote-engine";

const project = createProjector({
  pivot: [0, 0],
  rotationDeg: 0,
  minX: 0,
  maxY: 100,
  scale: 3.7795,
});

function denseField(): TerrainSample[] {
  const terrain: TerrainSample[] = [];
  for (let x = 0; x <= 20; x++) for (let y = 0; y <= 20; y++) terrain.push({ x, y, z: 10 });
  return terrain;
}

describe("selectGridKoter", () => {
  it("thins a dense field to a sparse grid spaced >= minSpacingMm on paper", () => {
    const terrain = denseField();
    const minSpacingMm = 8;
    const grid = selectGridKoter({
      terrain,
      project,
      minSpacingMm,
      occupancy: [],
      alreadyPlaced: [],
    });

    expect(grid.length).toBeGreaterThan(0);
    expect(grid.length).toBeLessThan(terrain.length); // thinning happened
    expect(grid.every((k) => k.kind === "grid" && k.layer === "C")).toBe(true);

    const minPx = minSpacingMm * PX_PER_MM;
    for (let i = 0; i < grid.length; i++) {
      for (let j = i + 1; j < grid.length; j++) {
        const a = project(grid[i]!.x, grid[i]!.y);
        const b = project(grid[j]!.x, grid[j]!.y);
        expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeGreaterThanOrEqual(minPx - 1e-6);
      }
    }
  });

  it("never places a grid kote inside an occupancy box", () => {
    const terrain = denseField();
    const c0 = project(0, 6);
    const c1 = project(6, 0);
    const occupancy: PaperBox[] = [
      {
        x: Math.min(c0[0], c1[0]),
        y: Math.min(c0[1], c1[1]),
        width: Math.abs(c1[0] - c0[0]),
        height: Math.abs(c1[1] - c0[1]),
      },
    ];
    const grid = selectGridKoter({
      terrain,
      project,
      minSpacingMm: 8,
      occupancy,
      alreadyPlaced: [],
    });
    for (const k of grid) {
      const [px, py] = project(k.x, k.y);
      const b = occupancy[0]!;
      const inside = px >= b.x && px <= b.x + b.width && py >= b.y && py <= b.y + b.height;
      expect(inside).toBe(false);
    }
  });

  it("respects already-placed (Layer A/B) koter when thinning", () => {
    const terrain: TerrainSample[] = [
      { x: 0, y: 0, z: 10 },
      { x: 1, y: 0, z: 10 },
    ];
    const alreadyPlaced: KotePlacement[] = [
      { x: 0, y: 0, z: 10, label: "10.00", layer: "A", kind: "parcel_corner" },
    ];
    // minPx = 5mm*PX_PER_MM ≈ 18.9px = 5 world m. Both samples are <5 m from the
    // already-placed corner ⇒ both dropped.
    const grid = selectGridKoter({
      terrain,
      project,
      minSpacingMm: 5,
      occupancy: [],
      alreadyPlaced,
    });
    expect(grid).toHaveLength(0);
  });
});
