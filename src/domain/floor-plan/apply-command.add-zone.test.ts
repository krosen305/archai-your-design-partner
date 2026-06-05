import { describe, expect, it } from "bun:test";
import { applyCommand } from "./apply-command";
import { generateSeedFloorPlan } from "./seed-generator";

describe("add_zone", () => {
  it("tilføjer en carport-zone med korrekt areal", () => {
    const doc = generateSeedFloorPlan({
      projectId: "p1",
      targetAreaM2: 50,
      rooms: [{ name: "Stue", roomType: "living" }],
    });
    const levelId = doc.levels[0]!.id;
    const out = applyCommand(doc, {
      type: "add_zone",
      levelId,
      zoneKind: "carport",
      name: "Carport",
      heated: false,
      polygon: {
        vertices: [
          { x: 0, y: 0 },
          { x: 5, y: 0 },
          { x: 5, y: 6 },
          { x: 0, y: 6 },
        ],
      },
    });
    expect(out.accepted).toBe(true);
    if (out.accepted) {
      const zones = out.document.levels[0]!.zones;
      expect(zones.length).toBe(1);
      expect(zones[0]!.zoneKind).toBe("carport");
      expect(zones[0]!.areaM2).toBeCloseTo(30, 5);
      expect(zones[0]!.heated).toBe(false);
    }
  });
  it("afviser ukendt level", () => {
    const doc = generateSeedFloorPlan({
      projectId: "p1",
      targetAreaM2: 50,
      rooms: [{ name: "Stue", roomType: "living" }],
    });
    const out = applyCommand(doc, {
      type: "add_zone",
      levelId: "nope",
      zoneKind: "carport",
      name: "C",
      heated: false,
      polygon: {
        vertices: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
        ],
      },
    });
    expect(out.accepted).toBe(false);
  });
});
