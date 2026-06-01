// src/lib/floor-plan/floor-plan-render-model.ts
//
// Pure presentation projection: derive a structured render model from a
// FloorPlanDocument level (spec §7.1). The renderer owns nothing — areas, room
// names and geometry are read from the document, never computed as truth here.
// Coordinates stay in LOCAL_METER; SVG/PDF renderers apply scale and y-flip.

import { lineLengthM, polygonCentroid } from "@/domain/geometry/polygon-ops";
import type { Point2D } from "@/domain/geometry/geometry-2d.types";
import type { FloorPlanDocument } from "@/domain/floor-plan/floor-plan.types";
import { buildWallPoché, resolveWallJoins, wallPocheRect } from "./wall-poche";
import { getSymbol } from "./symbols/symbol-registry";
import type { SymbolKind } from "./symbols/symbol-registry";

export type RenderWall = {
  id: string;
  start: Point2D;
  end: Point2D;
  thicknessM: number;
  structural: boolean;
  /**
   * One or more closed poché polygons (LOCAL_METER, CCW winding, no repeated
   * last point). Includes boolean-subtracted gaps for any openings on this wall.
   * A single wall with an opening in the middle produces two polygons.
   * Empty array when the wall is degenerate (zero length).
   */
  pochePolygon: Point2D[][];
  /**
   * Openings that contributed a gap to `pochePolygon`, for reference.
   */
  gaps: Array<{ start: Point2D; end: Point2D; width: number }>;
};

export type RenderRoom = {
  id: string;
  name: string;
  areaM2: number;
  points: Point2D[];
  labelPoint: Point2D;
};

export type RenderOpening = {
  id: string;
  kind: string;
  center: Point2D;
  widthM: number;
  angleDeg: number;
};

export type RenderFixture = {
  id: string;
  kind: string;
  points: Point2D[];
  labelPoint: Point2D;
};

export type RenderSymbol = {
  id: string;
  kind: string;
  /** SVG path `d` strings already scaled and translated into SVG user units. */
  paths: string[];
  labelPoint: Point2D;
};

export type RenderViewBox = { minX: number; minY: number; width: number; height: number };

export type FloorPlanRenderModel = {
  levelId: string;
  levelName: string;
  viewBox: RenderViewBox;
  walls: RenderWall[];
  /**
   * Level-merged poché polygons for ALL walls (boolean union of every wall's
   * raw rectangle poché). Drawn once by the SVG renderer — not per-wall — so
   * join overlaps are never double-painted. May be empty for an empty level.
   */
  wallPoche: Point2D[][];
  rooms: RenderRoom[];
  openings: RenderOpening[];
  fixtures: RenderFixture[];
  /** Furniture items rendered as symbol paths (LOCAL_METER, centered on position). */
  furniture: RenderSymbol[];
};

const MARGIN_M = 1;

export function buildRenderModel(doc: FloorPlanDocument, levelId: string): FloorPlanRenderModel {
  const level = doc.levels.find((l) => l.id === levelId);
  if (!level) throw new Error(`buildRenderModel: ukendt level "${levelId}"`);

  const wallsById = new Map(level.walls.map((wall) => [wall.id, wall]));

  // Group openings by wall so we can pass them to the poché builder
  const openingsByWallId = new Map<string, Array<{ offsetAlongWallM: number; widthM: number }>>();
  for (const op of level.openings) {
    const list = openingsByWallId.get(op.wallId) ?? [];
    list.push({ offsetAlongWallM: op.offsetAlongWallM, widthM: op.widthM });
    openingsByWallId.set(op.wallId, list);
  }

  // Build per-wall poche and gap metadata in a first pass.
  // pochePolygon (per-wall rectangle with openings cut) is kept for hit-testing
  // in the editor. The level-merged wallPoche is computed separately below.
  const rawWallData = level.walls.map((wall) => {
    const wallOpenings = openingsByWallId.get(wall.id) ?? [];
    const { start, end } = wall.centerline;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const gaps =
      len > 1e-9
        ? wallOpenings.map((op) => {
            const ux = dx / len;
            const uy = dy / len;
            const cx = start.x + ux * op.offsetAlongWallM;
            const cy = start.y + uy * op.offsetAlongWallM;
            return {
              start: { x: cx - (ux * op.widthM) / 2, y: cy - (uy * op.widthM) / 2 },
              end: { x: cx + (ux * op.widthM) / 2, y: cy + (uy * op.widthM) / 2 },
              width: op.widthM,
            };
          })
        : [];
    // Per-wall rectangle poché (with opening gaps) — used for hit-testing only,
    // NOT for SVG rendering (to avoid double-painting at joins).
    const pocheRect =
      wallOpenings.length === 0
        ? (() => {
            const r = wallPocheRect(start, end, wall.thicknessM);
            return r.length > 0 ? [r] : [];
          })()
        : buildWallPoché(start, end, wall.thicknessM, wallOpenings);
    // Per-wall poche WITH openings — fed into level-wide union below.
    const pocheForUnion = buildWallPoché(start, end, wall.thicknessM, wallOpenings);
    return {
      wall,
      start,
      end,
      pocheRect,
      pocheForUnion,
      gaps,
    };
  });

  // Level-wide merged poché: union all per-wall poche polygons into one flat
  // list so corner/T-junction overlaps are eliminated. This result is stored on
  // FloorPlanRenderModel.wallPoche and drawn ONCE by the SVG renderer.
  const joinInputs = rawWallData.map((d) => ({
    poche: d.pocheForUnion,
  }));
  const wallPoche: Point2D[][] = resolveWallJoins(joinInputs);

  const walls: RenderWall[] = rawWallData.map((d) => ({
    id: d.wall.id,
    start: d.start,
    end: d.end,
    thicknessM: d.wall.thicknessM,
    structural:
      d.wall.structuralRole === "bearing" || d.wall.structuralRole === "requires_engineer_review",
    pochePolygon: d.pocheRect,
    gaps: d.gaps,
  }));

  const rooms: RenderRoom[] = level.rooms.map((room) => ({
    id: room.id,
    name: room.name,
    areaM2: room.netAreaM2,
    points: room.polygon.vertices,
    labelPoint: polygonCentroid(room.polygon),
  }));

  const openings: RenderOpening[] = [];
  for (const opening of level.openings) {
    const wall = wallsById.get(opening.wallId);
    if (!wall) continue; // orphaned opening — flagged by verification, not drawn
    const { start, end } = wall.centerline;
    const len = lineLengthM(wall.centerline);
    if (len < 1e-9) continue;
    const ux = (end.x - start.x) / len;
    const uy = (end.y - start.y) / len;
    openings.push({
      id: opening.id,
      kind: opening.openingKind,
      center: {
        x: start.x + ux * opening.offsetAlongWallM,
        y: start.y + uy * opening.offsetAlongWallM,
      },
      widthM: opening.widthM,
      angleDeg: (Math.atan2(uy, ux) * 180) / Math.PI,
    });
  }

  const fixtures: RenderFixture[] = level.fixtures.map((fixture) => ({
    id: fixture.id,
    kind: fixture.fixtureKind,
    points: fixture.footprint.vertices,
    labelPoint: fixture.position,
  }));

  // Furniture: resolve symbol paths and translate them to world coordinates.
  // The symbol paths are in LOCAL_METER centered on (0,0); we translate each
  // path's coordinates to the furniture's world position here so the SVG
  // renderer only needs a scale transform (no per-symbol translate in SVG).
  const furniture: RenderSymbol[] = (level.furniture ?? []).map((item) => {
    const kindStr = item.furnitureKind as SymbolKind;
    let symbol;
    try {
      symbol = getSymbol(kindStr, item.widthM, item.depthM);
    } catch {
      // Unknown kind — emit an empty symbol rather than crashing the renderer
      symbol = {
        kind: kindStr,
        paths: [],
        defaultWidthM: item.widthM,
        defaultHeightM: item.depthM,
      };
    }
    // Translate each path from (0,0)-centered to world position
    const translatedPaths = symbol.paths.map((d) =>
      translatePath(d, item.position.x, item.position.y),
    );
    return {
      id: item.id,
      kind: item.furnitureKind,
      paths: translatedPaths,
      labelPoint: item.position,
    };
  });

  return {
    levelId: level.id,
    levelName: level.name,
    viewBox: computeViewBox(
      level.walls.flatMap((wall) => [wall.centerline.start, wall.centerline.end]),
    ),
    walls,
    wallPoche,
    rooms,
    openings,
    fixtures,
    furniture,
  };
}

/**
 * Translate all absolute coordinates in an SVG path `d` string by (dx, dy).
 * Only handles M, L, A, Z commands with absolute coordinates (uppercase),
 * which is the only form emitted by the symbol builders.
 */
function translatePath(d: string, dx: number, dy: number): string {
  if (dx === 0 && dy === 0) return d;
  // Replace each coordinate pair following M, L, or A commands.
  // A command: rx ry x-rotation large-arc-flag sweep-flag x y
  // We only translate the final x,y pair in A.
  return d
    .replace(
      /([MLma])\s*([-\d.e+]+),([-\d.e+]+)/g,
      (_match: string, cmd: string, xs: string, ys: string) => {
        const x = parseFloat(xs) + dx;
        const y = parseFloat(ys) + dy;
        return `${cmd}${round6(x)},${round6(y)}`;
      },
    )
    .replace(
      // A arc end-point: "A rx,ry x-rot laf sf x,y"
      /A([-\d.\s,e+]+?)([-\d.e+]+),([-\d.e+]+)(?=\s|$)/g,
      (_match: string, params: string, xs: string, ys: string) => {
        const x = parseFloat(xs) + dx;
        const y = parseFloat(ys) + dy;
        return `A${params}${round6(x)},${round6(y)}`;
      },
    );
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

function computeViewBox(points: Point2D[]): RenderViewBox {
  if (points.length === 0) return { minX: 0, minY: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return {
    minX: minX - MARGIN_M,
    minY: minY - MARGIN_M,
    width: maxX - minX + 2 * MARGIN_M,
    height: maxY - minY + 2 * MARGIN_M,
  };
}
