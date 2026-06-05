import { describe, expect, it } from "bun:test";
import { applyCommand } from "./apply-command";
import { generateSeedFloorPlan } from "./seed-generator";

describe("add_annotation", () => {
  it("tilføjer en note-annotation til level", () => {
    const doc = generateSeedFloorPlan({
      projectId: "p1",
      targetAreaM2: 40,
      rooms: [{ name: "Stue", roomType: "living" }],
    });
    const levelId = doc.levels[0]!.id;
    const out = applyCommand(doc, {
      type: "add_annotation",
      levelId,
      kind: "note",
      text: "Brandadskillelse",
      position: { x: 2, y: 2 },
    });
    expect(out.accepted).toBe(true);
    if (out.accepted) {
      const anns = out.document.levels[0]!.annotations;
      expect(anns.some((a) => a.text === "Brandadskillelse" && a.kind === "note")).toBe(true);
    }
  });
  it("afviser ukendt level", () => {
    const doc = generateSeedFloorPlan({
      projectId: "p1",
      targetAreaM2: 40,
      rooms: [{ name: "Stue", roomType: "living" }],
    });
    const out = applyCommand(doc, {
      type: "add_annotation",
      levelId: "nope",
      kind: "note",
      text: "x",
      position: { x: 0, y: 0 },
    });
    expect(out.accepted).toBe(false);
  });
});
