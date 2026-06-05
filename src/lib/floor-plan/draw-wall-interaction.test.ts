import { describe, expect, it } from "bun:test";
import { orthoSnapEndpoint, buildAddWallCommand, polylineStep } from "./draw-wall-interaction";

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

import { polylineStep } from "./draw-wall-interaction";

describe("polyline wall drawing", () => {
  it("første punkt starter kæden uden at udsende en kommando", () => {
    const r = polylineStep({ levelId: "level_0", last: null }, { x: 0, y: 0 });
    expect(r.command).toBeNull();
    expect(r.state.last).toEqual({ x: 0, y: 0 });
  });
  it("efterfølgende punkt udsender add_wall fra forrige (ortho-snappet) og avancerer kæden", () => {
    const r = polylineStep({ levelId: "level_0", last: { x: 0, y: 0 } }, { x: 4, y: 0.2 });
    expect(r.command?.type).toBe("add_wall");
    expect(r.command?.start).toEqual({ x: 0, y: 0 });
    expect(r.command?.end).toEqual({ x: 4, y: 0 }); // ortho-snapped
    expect(r.state.last).toEqual({ x: 4, y: 0 });
  });
});
