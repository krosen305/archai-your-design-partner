// src/lib/floor-plan/floor-plan-render-model.ts
//
// Pure presentation projection: derive a structured render model from a
// FloorPlanDocument level (spec §7.1). The renderer owns nothing — areas, room
// names and geometry are read from the document, never computed as truth here.
// Coordinates stay in LOCAL_METER; SVG/PDF renderers apply scale and y-flip.

import { lineLengthM, polygonCentroid } from "@/domain/geometry/polygon-ops";
import type { Point2D } from "@/domain/geometry/geometry-2d.types";
import type { FloorPlanDocument } from "@/domain/floor-plan/floor-plan.types";

export type RenderWall = {
  id: string;
  start: Point2D;
  end: Point2D;
  thicknessM: number;
  structural: boolean;
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

export type RenderViewBox = { minX: number; minY: number; width: number; height: number };

export type FloorPlanRenderModel = {
  levelId: string;
  levelName: string;
  viewBox: RenderViewBox;
  walls: RenderWall[];
  rooms: RenderRoom[];
  openings: RenderOpening[];
  fixtures: RenderFixture[];
};

const MARGIN_M = 1;

export function buildRenderModel(doc: FloorPlanDocument, levelId: string): FloorPlanRenderModel {
  const level = doc.levels.find((l) => l.id === levelId);
  if (!level) throw new Error(`buildRenderModel: ukendt level "${levelId}"`);

  const wallsById = new Map(level.walls.map((wall) => [wall.id, wall]));

  const walls: RenderWall[] = level.walls.map((wall) => ({
    id: wall.id,
    start: wall.centerline.start,
    end: wall.centerline.end,
    thicknessM: wall.thicknessM,
    structural:
      wall.structuralRole === "bearing" || wall.structuralRole === "requires_engineer_review",
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

  return {
    levelId: level.id,
    levelName: level.name,
    viewBox: computeViewBox(
      level.walls.flatMap((wall) => [wall.centerline.start, wall.centerline.end]),
    ),
    walls,
    rooms,
    openings,
    fixtures,
  };
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
