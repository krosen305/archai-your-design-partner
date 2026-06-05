import { describe, expect, it } from "bun:test";
import { deltaForTargetLength, wallCoordinate } from "./dimension-edit";

describe("type-to-set-dimension", () => {
  it("delta = mål - nuværende", () => {
    expect(deltaForTargetLength(4.0, 5.0)).toBeCloseTo(1.0, 6);
    expect(deltaForTargetLength(3.2, 2.0)).toBeCloseTo(-1.2, 6);
  });
  it("wallCoordinate giver start.x for lodret væg (axis x)", () => {
    const wall = { centerline: { start: { x: 2, y: 0 }, end: { x: 2, y: 5 } } };
    expect(wallCoordinate(wall as never, "x")).toBe(2);
  });
  it("wallCoordinate giver start.y for vandret væg (axis y)", () => {
    const wall = { centerline: { start: { x: 0, y: 3 }, end: { x: 5, y: 3 } } };
    expect(wallCoordinate(wall as never, "y")).toBe(3);
  });
});
