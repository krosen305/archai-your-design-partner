import { describe, expect, test } from "bun:test";
import { renderFloorPlanSvg } from "./render-floor-plan-svg";
import type { FloorPlanRenderModel } from "./floor-plan-render-model";

/** Helper: build a minimal poché rectangle for a wall used in test fixtures. */
function pocheRect(
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  t: number,
): Array<{ x: number; y: number }> {
  const dx = ex - sx;
  const dy = ey - sy;
  const len = Math.sqrt(dx * dx + dy * dy);
  const half = t / 2;
  const nx = (-dy / len) * half;
  const ny = (dx / len) * half;
  return [
    { x: sx + nx, y: sy + ny },
    { x: ex + nx, y: ey + ny },
    { x: ex - nx, y: ey - ny },
    { x: sx - nx, y: sy - ny },
  ];
}

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
      pochePolygon: [pocheRect(0, 0, 4, 0, 0.12)],
      gaps: [],
    },
    {
      id: "w_e",
      start: { x: 4, y: 0 },
      end: { x: 4, y: 3 },
      thicknessM: 0.12,
      structural: true,
      pochePolygon: [pocheRect(4, 0, 4, 3, 0.12)],
      gaps: [],
    },
    {
      id: "w_n",
      start: { x: 4, y: 3 },
      end: { x: 0, y: 3 },
      thicknessM: 0.12,
      structural: false,
      pochePolygon: [pocheRect(4, 3, 0, 3, 0.12)],
      gaps: [],
    },
    {
      id: "w_w",
      start: { x: 0, y: 3 },
      end: { x: 0, y: 0 },
      thicknessM: 0.12,
      structural: false,
      pochePolygon: [pocheRect(0, 3, 0, 0, 0.12)],
      gaps: [],
    },
  ],
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
  fixtures: [
    {
      id: "fx_cabinet",
      kind: "technical_cabinet",
      points: [
        { x: 0.8, y: 0.8 },
        { x: 1.2, y: 0.8 },
        { x: 1.2, y: 1.2 },
        { x: 0.8, y: 1.2 },
      ],
      labelPoint: { x: 1, y: 1 },
    },
  ],
};

describe("renderFloorPlanSvg", () => {
  const svg = renderFloorPlanSvg(model);

  test("produces a well-formed svg root", () => {
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
    expect(svg).toContain('viewBox="0 0');
  });

  test("draws one poché polygon per wall (no <line> when poché is valid)", () => {
    // walls in the test model all have pochePolygon with 4 vertices → <polygon>
    const wallPolygons = svg.match(/data-wall-id=/g) ?? [];
    expect(wallPolygons.length).toBe(4);
    // No <line> elements expected when all walls have valid poché polygons
    expect((svg.match(/<line/g) ?? []).length).toBe(0);
  });

  test("draws a polygon for the room and its stamp with name and area", () => {
    expect(svg).toContain("<polygon");
    expect(svg).toContain("Stue");
    expect(svg).toContain("12.0 m²");
  });

  test("tags openings and fixtures with their ids", () => {
    expect(svg).toContain('data-opening-id="door_1"');
    expect(svg).toContain('data-fixture-id="fx_cabinet"');
  });

  test("escapes XML special characters in labels", () => {
    const escaped = renderFloorPlanSvg({
      ...model,
      rooms: [{ ...model.rooms[0]!, name: "Bad & Bryggers" }],
    });
    expect(escaped).toContain("Bad &amp; Bryggers");
    expect(escaped).not.toContain("Bad & Bryggers");
  });
});
