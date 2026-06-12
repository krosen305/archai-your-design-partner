import { describe, it, expect } from "bun:test";
import { createProjector, rotateWorld } from "./projector";

describe("createProjector", () => {
  it("at rotation=0 reproduces the legacy (x-minX)*s, (maxY-y)*s mapping", () => {
    const p = createProjector({ pivot: [0, 0], rotationDeg: 0, minX: 100, maxY: 200, scale: 2 });
    expect(p(100, 200)).toEqual([0, 0]);
    expect(p(110, 190)).toEqual([20, 20]); // (110-100)*2 , (200-190)*2
  });

  it("rotation is rigid: preserves distances between points", () => {
    const p = createProjector({
      pivot: [500, 500],
      rotationDeg: 30,
      minX: 0,
      maxY: 1000,
      scale: 1,
    });
    const a = p(500, 500);
    const b = p(510, 500); // 10 m east of pivot
    const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    expect(d).toBeCloseTo(10, 6); // scale=1 ⇒ 10 px
  });

  it("CCW world rotation about pivot moves a due-north point screen-left (y-flip aware)", () => {
    const p = createProjector({ pivot: [0, 0], rotationDeg: 90, minX: -100, maxY: 100, scale: 1 });
    const pivotPx = p(0, 0);
    const northPx = p(0, 10); // 10 m world-north of pivot
    // 90° CCW world rotation sends world-north (+Y) to world-west (−X) ⇒ screen-left.
    expect(northPx[0]).toBeLessThan(pivotPx[0]);
    expect(Math.abs(northPx[1] - pivotPx[1])).toBeLessThan(1e-6);
  });
});

describe("rotateWorld", () => {
  it("rotates about pivot without projecting (90° CCW: east → north)", () => {
    const [x, y] = rotateWorld(10, 0, [0, 0], 90); // 10 m east of origin
    expect(x).toBeCloseTo(0, 6);
    expect(y).toBeCloseTo(10, 6); // becomes 10 m north
  });
});
