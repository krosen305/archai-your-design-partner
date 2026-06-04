import { describe, expect, it } from "bun:test";
import { orthoSnapEndpoint, buildAddWallCommand } from "./draw-wall-interaction";

describe("draw-wall ortho-snap", () => {
  it("snapper til vandret når dx >= dy", () => {
    expect(orthoSnapEndpoint({ x: 0, y: 0 }, { x: 5, y: 0.3 })).toEqual({ x: 5, y: 0 });
  });
  it("snapper til lodret når dy > dx", () => {
    expect(orthoSnapEndpoint({ x: 0, y: 0 }, { x: 0.2, y: 4 })).toEqual({ x: 0, y: 4 });
  });
  it("bygger en gyldig add_wall-kommando (interior, positiv tykkelse)", () => {
    const cmd = buildAddWallCommand("level_0", { x: 0, y: 0 }, { x: 3, y: 0 });
    expect(cmd.type).toBe("add_wall");
    expect(cmd.levelId).toBe("level_0");
    expect(cmd.wallKind).toBe("interior");
    expect(cmd.thicknessM).toBeGreaterThan(0);
    expect(cmd.start).toEqual({ x: 0, y: 0 });
    expect(cmd.end).toEqual({ x: 3, y: 0 });
  });
});
