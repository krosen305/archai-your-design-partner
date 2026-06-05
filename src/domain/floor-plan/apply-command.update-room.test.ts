import { describe, expect, it } from "bun:test";
import { applyCommand } from "./apply-command";
import { generateSeedFloorPlan } from "./seed-generator";

describe("update_room", () => {
  it("omdøber rum og skifter rumtype", () => {
    const doc = generateSeedFloorPlan({
      projectId: "p1",
      targetAreaM2: 40,
      rooms: [{ name: "Rum", roomType: "other" }],
    });
    const roomId = doc.levels[0]!.rooms[0]!.id;
    const out = applyCommand(doc, {
      type: "update_room",
      roomId,
      name: "Køkken",
      roomType: "kitchen",
    });
    expect(out.accepted).toBe(true);
    if (out.accepted) {
      const r = out.document.levels[0]!.rooms.find((x) => x.id === roomId)!;
      expect(r.name).toBe("Køkken");
      expect(r.roomType).toBe("kitchen");
    }
  });

  it("sætter targetAreaM2", () => {
    const doc = generateSeedFloorPlan({
      projectId: "p1",
      targetAreaM2: 40,
      rooms: [{ name: "Rum", roomType: "other" }],
    });
    const roomId = doc.levels[0]!.rooms[0]!.id;
    const out = applyCommand(doc, {
      type: "update_room",
      roomId,
      targetAreaM2: 20,
    });
    expect(out.accepted).toBe(true);
    if (out.accepted) {
      const r = out.document.levels[0]!.rooms.find((x) => x.id === roomId)!;
      expect(r.targetAreaM2).toBe(20);
    }
  });

  it("afviser ukendt rum", () => {
    const doc = generateSeedFloorPlan({
      projectId: "p1",
      targetAreaM2: 40,
      rooms: [{ name: "Rum", roomType: "other" }],
    });
    const out = applyCommand(doc, { type: "update_room", roomId: "nope", name: "X" });
    expect(out.accepted).toBe(false);
  });
});
