import { describe, expect, it } from "bun:test";
import { buildAddOpeningCommand } from "./add-opening-interaction";

describe("add-opening", () => {
  it("bygger en dør-kommando med standard bredde/højde og venstre-sving", () => {
    const cmd = buildAddOpeningCommand("level_0", "w1", 1.5, "door");
    expect(cmd).toEqual({
      type: "add_opening",
      levelId: "level_0",
      wallId: "w1",
      openingKind: "door",
      offsetAlongWallM: 1.5,
      widthM: 0.9,
      heightM: 2.1,
      swing: "left",
    });
  });
  it("bygger en vindue-kommando med swing none", () => {
    const cmd = buildAddOpeningCommand("level_0", "w1", 2, "window");
    expect(cmd.openingKind).toBe("window");
    expect(cmd.swing).toBe("none");
    expect(cmd.widthM).toBeGreaterThan(0);
    expect(cmd.heightM).toBeGreaterThan(0);
  });
});
