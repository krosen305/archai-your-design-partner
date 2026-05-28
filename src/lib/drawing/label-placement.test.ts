import { describe, it, expect } from "bun:test";
import { findLabelPosition, type PlacedLabel } from "./label-placement";

describe("findLabelPosition", () => {
  it("returnerer nordøst-position når ingen konflikter", () => {
    const pos = findLabelPosition({ anchorX: 100, anchorY: 100, text: "27.20", existingLabels: [] });
    expect(pos.x).toBeGreaterThan(100);
    expect(pos.y).toBeGreaterThan(100);
    expect(pos.requiresManualReview).toBe(false);
  });

  it("undgår eksisterende label ved at vælge anden kandidat", () => {
    const blocking: PlacedLabel = { x: 108, y: 108, width: 20, height: 8 };
    const pos = findLabelPosition({
      anchorX: 100, anchorY: 100, text: "27.20",
      existingLabels: [blocking],
    });
    const overlapsBlocking =
      pos.x < blocking.x + blocking.width &&
      pos.x + pos.width > blocking.x &&
      pos.y < blocking.y + blocking.height &&
      pos.y + pos.height > blocking.y;
    expect(overlapsBlocking).toBe(false);
  });

  it("sætter requiresManualReview=true når alle positioner er blokerede", () => {
    const allBlocked: PlacedLabel[] = [
      { x: 90, y: 90, width: 40, height: 30 },
      { x: 60, y: 90, width: 40, height: 30 },
      { x: 90, y: 60, width: 40, height: 30 },
      { x: 60, y: 60, width: 40, height: 30 },
      { x: 90, y: 120, width: 40, height: 30 },
      { x: 60, y: 120, width: 40, height: 30 },
      { x: 120, y: 90, width: 40, height: 30 },
      { x: 120, y: 60, width: 40, height: 30 },
    ];
    const pos = findLabelPosition({ anchorX: 100, anchorY: 100, text: "27.20", existingLabels: allBlocked });
    expect(pos.requiresManualReview).toBe(true);
  });
});
