// src/lib/floor-plan/render-floor-plan-svg.ts
//
// Stateless SVG renderer over a FloorPlanRenderModel. Same model feeds editor
// preview, SVG and (later) PDF (spec §7.1, FR-DRAW-005). LOCAL_METER is mapped
// to SVG user units with a y-flip (architectural y-up -> SVG y-down).
//
// Symbols (furniture, door arcs, window lines) are rendered via <path> elements
// rather than generic <circle> or <polygon> placeholders.

import type { Point2D } from "@/domain/geometry/geometry-2d.types";
import type { FloorPlanRenderModel, RoomCompliance } from "./floor-plan-render-model";
import { getSymbol } from "./symbols/symbol-registry";

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

  // Layer flags — use defaults if the model predates the layers field
  const layers = model.layers ?? {
    showDimensions: true,
    showFurniture: true,
    showZones: true,
    showHatch: true,
    showCompliance: true,
  };

  // Zones: drawn first (under rooms) with dashed outline and hatch lines
  const zoneEls = layers.showZones
    ? (model.zones ?? []).flatMap((zone) => {
        const pts = zone.points.map((p) => pointStr(px(p))).join(" ");
        const label = px(zone.labelPoint);
        const hatchEls = layers.showHatch
          ? zone.hatchPaths.map((d) => {
              const svgD = transformHatchPath(d, { minX, maxY, scale });
              return `<path d="${svgD}" stroke="#888" stroke-width="0.5" fill="none" />`;
            })
          : [];
        return [
          `<polygon data-zone-id="${attr(zone.id)}" data-zone-kind="${attr(zone.kind)}" points="${pts}" fill="rgba(200,200,200,0.15)" stroke="#888" stroke-width="1" stroke-dasharray="5,3" />`,
          ...hatchEls,
          `<text data-zone-label="${attr(zone.id)}" x="${fmt(label.x)}" y="${fmt(label.y)}" text-anchor="middle" font-size="10" fill="#888">${esc(zone.name)}</text>`,
          `<text data-zone-area="${attr(zone.id)}" x="${fmt(label.x)}" y="${fmt(label.y + 12)}" text-anchor="middle" font-size="9" fill="#999">${esc((Math.round(zone.areaM2 * 10) / 10).toFixed(1))} m²</text>`,
        ];
      })
    : [];

  // Build a quick lookup: roomId → RoomCompliance entry
  const roomComplianceMap = new Map<string, RoomCompliance>();
  if (model.complianceOverlay && (layers.showCompliance ?? true)) {
    for (const rc of model.complianceOverlay.roomCompliance) {
      roomComplianceMap.set(rc.roomId, rc);
    }
  }

  const roomEls = model.rooms.map((room) => {
    const pts = room.points.map((p) => pointStr(px(p))).join(" ");
    const label = px(room.labelPoint);
    const roomHatchEls =
      layers.showHatch && room.floorHatchPaths.length > 0
        ? room.floorHatchPaths.map((d) => {
            const svgD = transformHatchPath(d, { minX, maxY, scale });
            return `<path d="${svgD}" stroke="#ccc" stroke-width="0.5" fill="none" pointer-events="none" />`;
          })
        : [];
    const baseEls = [
      `<polygon data-room-id="${attr(room.id)}" points="${pts}" fill="#f4f1ea" stroke="none" />`,
      ...roomHatchEls,
      `<text data-room-label="${attr(room.id)}" x="${fmt(label.x)}" y="${fmt(label.y)}" text-anchor="middle" font-size="12">${esc(room.name)}</text>`,
      `<text data-room-area="${attr(room.id)}" x="${fmt(label.x)}" y="${fmt(label.y + 14)}" text-anchor="middle" font-size="10">${esc(formatArea(room.areaM2))}</text>`,
    ];

    // Compliance badges in the top-left corner of the room bounding box
    const rc = roomComplianceMap.get(room.id);
    if (rc && rc.findings.length > 0 && (layers.showCompliance ?? true)) {
      // Top-left corner of the room polygon (min x, max y in architectural space → min y in SVG)
      let minPx = Infinity;
      let minPy = Infinity;
      for (const p of room.points) {
        const svgPt = px(p);
        if (svgPt.x < minPx) minPx = svgPt.x;
        if (svgPt.y < minPy) minPy = svgPt.y;
      }
      // Draw badges: blocking first, then warning, then info
      const badgeEls: string[] = [];
      let bx = minPx + 8;
      const by = minPy + 8;
      for (const finding of rc.findings) {
        const titleText = attr(finding.shortLabel || finding.message.slice(0, 30));
        if (finding.severity === "blocking") {
          badgeEls.push(
            `<circle data-badge="${attr(finding.id)}" cx="${fmt(bx)}" cy="${fmt(by)}" r="6" fill="#e53935"><title>${titleText}</title></circle>`,
            `<text x="${fmt(bx)}" y="${fmt(by + 4)}" text-anchor="middle" font-size="5" fill="white" pointer-events="none">!</text>`,
          );
          bx += 15;
        } else if (finding.severity === "review_required" || finding.severity === "warning") {
          badgeEls.push(
            `<circle data-badge="${attr(finding.id)}" cx="${fmt(bx)}" cy="${fmt(by)}" r="5" fill="#fb8c00"><title>${titleText}</title></circle>`,
          );
          bx += 13;
        } else {
          // info
          badgeEls.push(
            `<circle data-badge="${attr(finding.id)}" cx="${fmt(bx)}" cy="${fmt(by)}" r="4" fill="#1565c0"><title>${titleText}</title></circle>`,
          );
          bx += 11;
        }
      }
      baseEls.push(...badgeEls);
    }

    return baseEls.join("\n");
  });

  // Draw level-merged poché ONCE to avoid double-painting overlaps at joins.
  // wall.pochePolygon (per-wall rectangle) is NOT rendered here — it is kept
  // on RenderWall only for hit-testing in the editor.
  const wallPocheEls = model.wallPoche
    .filter((poly) => poly.length >= 3)
    .map((poly, i) => {
      const pts = poly.map((p) => pointStr(px(p))).join(" ");
      return `<polygon data-wall-poche="${i}" points="${pts}" fill="#1a1a1a" stroke="none" />`;
    });

  // Fallback: for walls whose poché could not be merged (e.g. degenerate zero-
  // length walls), draw a thin stroke line so the wall is still visible.
  const wallFallbackEls = model.walls.flatMap((wall) => {
    const hasPolyInMerged = model.wallPoche.length > 0;
    // Only emit fallback line for degenerate walls (no pochePolygon and no merged coverage).
    const validPerWall = wall.pochePolygon.filter((poly) => poly.length >= 3);
    if (validPerWall.length > 0 || hasPolyInMerged) return [];
    const fill = wall.structural ? "#1a1a1a" : "#333333";
    const a = px(wall.start);
    const b = px(wall.end);
    const strokeWidth = fmt(Math.max(wall.thicknessM * scale, 2));
    return [
      `<line data-wall-id="${attr(wall.id)}" x1="${fmt(a.x)}" y1="${fmt(a.y)}" x2="${fmt(b.x)}" y2="${fmt(b.y)}" stroke="${fill}" stroke-width="${strokeWidth}" stroke-linecap="square" />`,
    ];
  });

  const openingEls = model.openings.flatMap((op) => {
    const c = px(op.center);
    const cx = fmt(c.x);
    const cy = fmt(c.y);

    // Resolve symbol paths for the opening kind
    let symbolPaths: string[] = [];
    try {
      if (op.kind === "door") {
        symbolPaths = getSymbol("door_left", op.widthM).paths;
      } else if (op.kind === "sliding_door") {
        symbolPaths = getSymbol("sliding_door", op.widthM).paths;
      } else if (op.kind === "window") {
        symbolPaths = getSymbol("window", op.widthM).paths;
      } else if (op.kind === "garage_door") {
        symbolPaths = getSymbol("garage_door", op.widthM).paths;
      }
    } catch {
      symbolPaths = [];
    }

    if (symbolPaths.length > 0) {
      // Transform: translate to center, scale from LOCAL_METER to SVG units,
      // apply wall rotation, and apply y-flip.
      // SVG transform: translate(cx,cy) rotate(angleDeg) scale(scale, -scale)
      const transformAttr = `translate(${cx},${cy}) rotate(${fmt(-op.angleDeg)}) scale(${fmt(scale)},${fmt(-scale)})`;
      const pathEls = symbolPaths.map(
        (d) => `<path fill="none" stroke="#0a6" stroke-width="1.5" d="${attr(d)}" />`,
      );
      return [
        `<g data-opening-id="${attr(op.id)}" data-opening-kind="${attr(op.kind)}" transform="${transformAttr}">`,
        ...pathEls,
        `</g>`,
      ];
    }

    // Fallback for unrecognised opening kinds: draw a small circle
    const r = fmt(Math.max((op.widthM * scale) / 2, 3));
    return [
      `<circle data-opening-id="${attr(op.id)}" data-opening-kind="${attr(op.kind)}" cx="${cx}" cy="${cy}" r="${r}" fill="#ffffff" stroke="#0a6" stroke-width="2" />`,
    ];
  });

  const fixtureEls = model.fixtures.map((fx) => {
    const pts = fx.points.map((p) => pointStr(px(p))).join(" ");
    return `<polygon data-fixture-id="${attr(fx.id)}" data-fixture-kind="${attr(fx.kind)}" points="${pts}" fill="none" stroke="#666" stroke-width="1.5" />`;
  });

  // Furniture: paths are in LOCAL_METER centered on (0,0).
  // Apply translate(cx,cy) rotate(-rotationDeg) scale(scale,-scale) so that:
  //   - the symbol is placed at its world position,
  //   - rotation is applied before the y-flip (negated because y-flip inverts direction),
  //   - scale converts LOCAL_METER to SVG user units and flips the y-axis.
  // stroke-width is in the symbol's pre-scale space so 1.5/scale gives ~1.5px on screen.
  const furnitureEls = (model.furniture ?? []).flatMap((item) => {
    if (item.paths.length === 0) return [];
    const cx = fmt((item.centerX - minX) * scale);
    const cy = fmt((maxY - item.centerY) * scale);
    const rot = fmt(-item.rotationDeg);
    const sw = fmt(1.5 / scale);
    const transformAttr =
      rot !== 0
        ? `translate(${cx},${cy}) rotate(${rot}) scale(${fmt(scale)},${fmt(-scale)})`
        : `translate(${cx},${cy}) scale(${fmt(scale)},${fmt(-scale)})`;
    const pathEls = item.paths.map(
      (d) => `<path fill="none" stroke="#888" stroke-width="${sw}" d="${attr(d)}" />`,
    );
    return [
      `<g data-furniture-id="${attr(item.id)}" data-furniture-kind="${attr(item.kind)}" transform="${transformAttr}">`,
      ...pathEls,
      `</g>`,
    ];
  });

  // Dimension chains: exterior facade strings
  const dimensionEls = (model.dimensionChains ?? []).flatMap((chain) =>
    chain.segments.flatMap((seg) => {
      const f = px(seg.from);
      const t = px(seg.to);
      const cf = px(seg.chainFrom);
      const ct = px(seg.chainTo);
      const mid = { x: (cf.x + ct.x) / 2, y: (cf.y + ct.y) / 2 };
      const arrowSize = fmt(4);
      const ARROWHEAD_WIDTH_RATIO = 0.4;

      // Chain direction vector (normalised, in SVG pixel space)
      const dx = ct.x - cf.x;
      const dy = ct.y - cf.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const ux = len > 1e-9 ? dx / len : 1;
      const uy = len > 1e-9 ? dy / len : 0;
      // Perpendicular (into chain from start)
      const px_ = -uy;
      const py_ = ux;

      // Arrowhead at chain-from end (pointing in chain direction)
      const af1 = `${fmt(cf.x + ux * arrowSize)},${fmt(cf.y + uy * arrowSize)}`;
      const af2 = `${fmt(cf.x + px_ * arrowSize * ARROWHEAD_WIDTH_RATIO)},${fmt(cf.y + py_ * arrowSize * ARROWHEAD_WIDTH_RATIO)}`;
      const af3 = `${fmt(cf.x - px_ * arrowSize * ARROWHEAD_WIDTH_RATIO)},${fmt(cf.y - py_ * arrowSize * ARROWHEAD_WIDTH_RATIO)}`;

      // Arrowhead at chain-to end (pointing against chain direction)
      const at1 = `${fmt(ct.x - ux * arrowSize)},${fmt(ct.y - uy * arrowSize)}`;
      const at2 = `${fmt(ct.x + px_ * arrowSize * ARROWHEAD_WIDTH_RATIO)},${fmt(ct.y + py_ * arrowSize * ARROWHEAD_WIDTH_RATIO)}`;
      const at3 = `${fmt(ct.x - px_ * arrowSize * ARROWHEAD_WIDTH_RATIO)},${fmt(ct.y - py_ * arrowSize * ARROWHEAD_WIDTH_RATIO)}`;

      return [
        // Witness lines (face → chain line)
        `<line x1="${fmt(f.x)}" y1="${fmt(f.y)}" x2="${fmt(cf.x)}" y2="${fmt(cf.y)}" stroke="#333" stroke-width="0.5" />`,
        `<line x1="${fmt(t.x)}" y1="${fmt(t.y)}" x2="${fmt(ct.x)}" y2="${fmt(ct.y)}" stroke="#333" stroke-width="0.5" />`,
        // Chain line
        `<line x1="${fmt(cf.x)}" y1="${fmt(cf.y)}" x2="${fmt(ct.x)}" y2="${fmt(ct.y)}" stroke="#333" stroke-width="0.5" />`,
        // Arrowheads
        `<polygon points="${af1} ${af2} ${af3}" fill="#333" />`,
        `<polygon points="${at1} ${at2} ${at3}" fill="#333" />`,
        // Label
        `<text x="${fmt(mid.x)}" y="${fmt(mid.y - 3)}" text-anchor="middle" font-size="9" fill="#333">${esc(seg.labelText)}</text>`,
      ];
    }),
  );

  // Interior dimensions
  const interiorDimEls = (model.interiorDimensions ?? []).flatMap((seg) => {
    const cf = px(seg.chainFrom);
    const ct = px(seg.chainTo);
    const mid = { x: (cf.x + ct.x) / 2, y: (cf.y + ct.y) / 2 };
    return [
      `<line x1="${fmt(cf.x)}" y1="${fmt(cf.y)}" x2="${fmt(ct.x)}" y2="${fmt(ct.y)}" stroke="#555" stroke-width="0.5" stroke-dasharray="3,2" />`,
      `<text x="${fmt(mid.x)}" y="${fmt(mid.y - 3)}" text-anchor="middle" font-size="8" fill="#555">${esc(seg.labelText)}</text>`,
    ];
  });

  // Area table: shown in the top-left corner of the SVG when complianceOverlay is present.
  const areaTableEls: string[] = [];
  if (model.complianceOverlay && (layers.showCompliance ?? true)) {
    const { areaSummary } = model.complianceOverlay;
    const tableLines: string[] = [
      `<g data-area-table="true" transform="translate(5, 5)">`,
      `<text font-size="8" font-weight="bold" fill="#222">Arealer</text>`,
    ];
    let rowY = 15;
    for (const row of areaSummary.rows) {
      const fill = row.type === "unheated_zone" ? "#888" : "#333";
      tableLines.push(
        `<text y="${rowY}" font-size="7" fill="${fill}">${esc(row.label)} ${esc(row.areaFormatted)}</text>`,
      );
      rowY += 10;
    }
    // Summary line
    tableLines.push(
      `<text y="${rowY}" font-size="7" fill="#555">Total opvarmet: ${esc(formatArea(areaSummary.totalHeatedM2))}</text>`,
    );
    tableLines.push(`</g>`);
    areaTableEls.push(...tableLines);
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`,
    `<g data-level-id="${attr(model.levelId)}">`,
    ...zoneEls,
    ...roomEls,
    ...wallPocheEls,
    ...wallFallbackEls,
    ...openingEls,
    ...fixtureEls,
    ...furnitureEls,
    ...dimensionEls,
    ...interiorDimEls,
    ...areaTableEls,
    `</g>`,
    `</svg>`,
  ].join("\n");
}

function pointStr(p: { x: number; y: number }): string {
  return `${Math.round(p.x * 100) / 100},${Math.round(p.y * 100) / 100}`;
}

/**
 * Transform hatch path `d` strings from LOCAL_METER to SVG pixel coordinates.
 * Hatch paths are emitted as "M x,y L x,y" by buildHatchPaths in LOCAL_METER.
 * The same minX/maxY/scale transform used for polygon points is applied here.
 */
function transformHatchPath(
  d: string,
  opts: { minX: number; maxY: number; scale: number },
): string {
  const { minX, maxY, scale } = opts;
  return d.replace(
    /([ML])\s*([\d.-]+)\s*,\s*([\d.-]+)/g,
    (_, cmd: string, xStr: string, yStr: string) => {
      const sx = Math.round((parseFloat(xStr) - minX) * scale * 100) / 100;
      const sy = Math.round((maxY - parseFloat(yStr)) * scale * 100) / 100;
      return `${cmd}${sx},${sy}`;
    },
  );
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
