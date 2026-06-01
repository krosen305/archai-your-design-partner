// src/lib/floor-plan/render-floor-plan-svg.ts
//
// Stateless SVG renderer over a FloorPlanRenderModel. Same model feeds editor
// preview, SVG and (later) PDF (spec §7.1, FR-DRAW-005). LOCAL_METER is mapped
// to SVG user units with a y-flip (architectural y-up -> SVG y-down).

import type { Point2D } from "@/domain/geometry/geometry-2d.types";
import type { FloorPlanRenderModel } from "./floor-plan-render-model";

export type RenderSvgOptions = {
  /** SVG user units per meter. */
  pxPerM?: number;
};

export function renderFloorPlanSvg(
  model: FloorPlanRenderModel,
  options: RenderSvgOptions = {},
): string {
  const scale = options.pxPerM ?? 100;
  const { minX, minY, width, height } = model.viewBox;
  const maxY = minY + height;
  const px = (p: Point2D) => ({ x: (p.x - minX) * scale, y: (maxY - p.y) * scale });
  const fmt = (n: number) => Math.round(n * 100) / 100;

  const w = fmt(width * scale);
  const h = fmt(height * scale);

  const roomEls = model.rooms.map((room) => {
    const pts = room.points.map((p) => pointStr(px(p))).join(" ");
    const label = px(room.labelPoint);
    return [
      `<polygon data-room-id="${attr(room.id)}" points="${pts}" fill="#f4f1ea" stroke="none" />`,
      `<text data-room-label="${attr(room.id)}" x="${fmt(label.x)}" y="${fmt(label.y)}" text-anchor="middle" font-size="12">${esc(room.name)}</text>`,
      `<text data-room-area="${attr(room.id)}" x="${fmt(label.x)}" y="${fmt(label.y + 14)}" text-anchor="middle" font-size="10">${esc(formatArea(room.areaM2))}</text>`,
    ].join("\n");
  });

  const wallEls = model.walls.flatMap((wall) => {
    const fill = wall.structural ? "#1a1a1a" : "#333333";
    const validPolys = wall.pochePolygon.filter((poly) => poly.length >= 3);

    // Fallback to a thin stroke line when all poché polygons are degenerate
    if (validPolys.length === 0) {
      const a = px(wall.start);
      const b = px(wall.end);
      const strokeWidth = fmt(Math.max(wall.thicknessM * scale, 2));
      return [
        `<line data-wall-id="${attr(wall.id)}" x1="${fmt(a.x)}" y1="${fmt(a.y)}" x2="${fmt(b.x)}" y2="${fmt(b.y)}" stroke="${fill}" stroke-width="${strokeWidth}" stroke-linecap="square" />`,
      ];
    }

    // One <polygon> element per poché piece (typically one; two when a gap is in the middle)
    return validPolys.map((poly, idx) => {
      const pts = poly.map((p) => pointStr(px(p))).join(" ");
      const idAttr =
        idx === 0
          ? `data-wall-id="${attr(wall.id)}"`
          : `data-wall-id="${attr(wall.id)}" data-wall-piece="${idx}"`;
      return `<polygon ${idAttr} points="${pts}" fill="${fill}" stroke="none" />`;
    });
  });

  const openingEls = model.openings.map((op) => {
    const c = px(op.center);
    const r = fmt(Math.max((op.widthM * scale) / 2, 3));
    return `<circle data-opening-id="${attr(op.id)}" data-opening-kind="${attr(op.kind)}" cx="${fmt(c.x)}" cy="${fmt(c.y)}" r="${r}" fill="#ffffff" stroke="#0a6" stroke-width="2" />`;
  });

  const fixtureEls = model.fixtures.map((fx) => {
    const pts = fx.points.map((p) => pointStr(px(p))).join(" ");
    return `<polygon data-fixture-id="${attr(fx.id)}" data-fixture-kind="${attr(fx.kind)}" points="${pts}" fill="none" stroke="#666" stroke-width="1.5" />`;
  });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`,
    `<g data-level-id="${attr(model.levelId)}">`,
    ...roomEls,
    ...wallEls,
    ...openingEls,
    ...fixtureEls,
    `</g>`,
    `</svg>`,
  ].join("\n");
}

function pointStr(p: { x: number; y: number }): string {
  return `${Math.round(p.x * 100) / 100},${Math.round(p.y * 100) / 100}`;
}

function formatArea(areaM2: number): string {
  return `${(Math.round(areaM2 * 10) / 10).toFixed(1)} m²`;
}

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function attr(value: string): string {
  return esc(value).replace(/"/g, "&quot;");
}
