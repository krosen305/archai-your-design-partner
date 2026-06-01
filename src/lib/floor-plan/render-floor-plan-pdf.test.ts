import { describe, expect, test } from "bun:test";
import { renderFloorPlanPdf } from "./render-floor-plan-pdf";
import type { FloorPlanRenderModel } from "./floor-plan-render-model";

const model: FloorPlanRenderModel = {
  levelId: "level_0",
  levelName: "Stueplan",
  viewBox: { minX: -1, minY: -1, width: 6, height: 5 },
  walls: [
    {
      id: "w_s",
      start: { x: 0, y: 0 },
      end: { x: 4, y: 0 },
      thicknessM: 0.12,
      structural: false,
      pochePolygon: [],
      gaps: [],
    },
    {
      id: "w_e",
      start: { x: 4, y: 0 },
      end: { x: 4, y: 3 },
      thicknessM: 0.12,
      structural: true,
      pochePolygon: [],
      gaps: [],
    },
  ],
  wallPoche: [],
  rooms: [
    {
      id: "room_1",
      name: "Stue",
      areaM2: 12,
      points: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 3 },
        { x: 0, y: 3 },
      ],
      labelPoint: { x: 2, y: 1.5 },
    },
  ],
  openings: [{ id: "door_1", kind: "door", center: { x: 1, y: 0 }, widthM: 0.9, angleDeg: 0 }],
  fixtures: [],
};

describe("renderFloorPlanPdf", () => {
  test("produces a non-empty PDF byte stream", async () => {
    const bytes = await renderFloorPlanPdf(model, {
      title: "Plantegning – Stue",
      statusLabel: "TECHNICAL_REVIEW",
    });
    expect(bytes.byteLength).toBeGreaterThan(100);
    // PDF magic header %PDF
    expect([bytes[0], bytes[1], bytes[2], bytes[3]]).toEqual([0x25, 0x50, 0x44, 0x46]);
  });

  test("does not throw on labels with Danish characters", async () => {
    const danish: FloorPlanRenderModel = {
      ...model,
      rooms: [{ ...model.rooms[0]!, name: "Køkken-alrum æøå" }],
    };
    const bytes = await renderFloorPlanPdf(danish, { title: "Tegning", statusLabel: "BLOCKED" });
    expect(bytes.byteLength).toBeGreaterThan(100);
  });
});
