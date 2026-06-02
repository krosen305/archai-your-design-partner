// src/lib/floor-plan/floor-plan-render-model.ts
//
// Pure presentation projection: derive a structured render model from a
// FloorPlanDocument level (spec §7.1). The renderer owns nothing — areas, room
// names and geometry are read from the document, never computed as truth here.
// Coordinates stay in LOCAL_METER; SVG/PDF renderers apply scale and y-flip.

import { lineLengthM, polygonCentroid } from "@/domain/geometry/polygon-ops";
import type { Point2D } from "@/domain/geometry/geometry-2d.types";
import type { FloorPlanDocument } from "@/domain/floor-plan/floor-plan.types";
import { computeDimensions } from "@/domain/floor-plan/dimension-engine";
import { buildWallPoché, resolveWallJoins, wallPocheRect } from "./wall-poche";
import { getSymbol } from "./symbols/symbol-registry";
import type { SymbolKind } from "./symbols/symbol-registry";
import { buildHatchPaths } from "./hatch-patterns";
import type { HatchPattern } from "./hatch-patterns";
import { buildComplianceOverlay } from "./compliance-overlay";
import type { ComplianceOverlay } from "./compliance-overlay";
import type { VerificationFinding } from "@/domain/floor-plan/verification-engine";

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
  /** SVG path `d` strings in LOCAL_METER centered on (0,0). */
  paths: string[];
  /** World position (LOCAL_METER) — the SVG renderer applies translate(cx,cy). */
  centerX: number;
  centerY: number;
  /** Clockwise rotation in degrees in architectural space. */
  rotationDeg: number;
};

export type RenderZone = {
  id: string;
  kind: string;
  name: string;
  areaM2: number;
  points: Point2D[];
  labelPoint: Point2D;
  /** SVG path `d` strings for hatch lines (LOCAL_METER). */
  hatchPaths: string[];
  heated: boolean;
};

/**
 * Layer visibility flags. All default to `true`. Consumers (editor, PDF export)
 * can disable individual layers without re-building the render model.
 */
export type RenderLayers = {
  showDimensions: boolean;
  showFurniture: boolean;
  showZones: boolean;
  showHatch: boolean;
  /** Show compliance finding badges on rooms. Default: true. */
  showCompliance: boolean;
};

export const DEFAULT_RENDER_LAYERS: RenderLayers = {
  showDimensions: true,
  showFurniture: true,
  showZones: true,
  showHatch: true,
  showCompliance: true,
};

export type RenderViewBox = { minX: number; minY: number; width: number; height: number };

/**
 * One rendered dimension segment (witness lines + chain line + label) in
 * SVG/PDF screen coordinates (LOCAL_METER — scaled by renderer).
 */
export type RenderDimensionSegment = {
  /** Witness-line anchor on the building face (from-side). */
  from: Point2D;
  /** Witness-line anchor on the building face (to-side). */
  to: Point2D;
  /** Chain-line from-point (at the offset distance from the face). */
  chainFrom: Point2D;
  /** Chain-line to-point (at the offset distance from the face). */
  chainTo: Point2D;
  /** Human-readable label text, e.g. "3.84 m". */
  labelText: string;
  /** Midpoint of the chain line — where the label should be centered. */
  labelPt: Point2D;
};

export type RenderDimensionChain = {
  segments: RenderDimensionSegment[];
  side: string;
};

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
  /** Unheated/covered zone polygons with hatch patterns (drawn under rooms). */
  zones: RenderZone[];
  /** Layer visibility flags — all default to true. */
  layers: RenderLayers;
  /** Exterior facade dimension chains (stacked strings per side). */
  dimensionChains: RenderDimensionChain[];
  /** Interior room-dimension segments (width + depth per room). */
  interiorDimensions: RenderDimensionSegment[];
  /**
   * Compliance overlay: room-level BR18/verification findings + area summary.
   * Only present when findings are supplied to buildRenderModel via opts.findings.
   */
  complianceOverlay?: ComplianceOverlay;
};

// Re-export so consumers don't need a separate import from compliance-overlay.ts
export type { ComplianceOverlay, RoomCompliance } from "./compliance-overlay";

const MARGIN_M = 1;

export function buildRenderModel(
  doc: FloorPlanDocument,
  levelId: string,
  opts?: {
    /** BR18/compliance findings to attach as a compliance overlay on the model. */
    findings?: VerificationFinding[];
  },
): FloorPlanRenderModel {
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

  // Zones: unheated/covered areas drawn under rooms with hatch patterns.
  const zoneHatchMap: Record<string, HatchPattern> = {
    terrace: "diagonal",
    carport: "cross_hatch",
    covered_entrance: "diagonal",
    balcony: "diagonal",
  };

  const zones: RenderZone[] = (level.zones ?? []).map((zone) => ({
    id: zone.id,
    kind: zone.zoneKind,
    name: zone.name,
    areaM2: zone.areaM2,
    points: zone.polygon.vertices,
    labelPoint: polygonCentroid(zone.polygon),
    hatchPaths: buildHatchPaths({
      polygon: zone.polygon.vertices,
      pattern: (zoneHatchMap[zone.zoneKind] as HatchPattern | undefined) ?? "none",
    }),
    heated: zone.heated,
  }));

  // Furniture: resolve symbol paths in LOCAL_METER centered on (0,0).
  // The SVG renderer applies a <g transform="translate(cx,cy) rotate(r) scale(s,-s)">
  // per symbol so paths never need to be pre-translated here.
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
    return {
      id: item.id,
      kind: item.furnitureKind,
      paths: symbol.paths,
      centerX: item.position.x,
      centerY: item.position.y,
      rotationDeg: item.rotationDeg,
    };
  });

  // Compute dimension chains via domain engine and project into render model.
  const floorDimensions = computeDimensions(level);
  const dimensionChains: RenderDimensionChain[] = floorDimensions.exteriorChains.map((chain) => ({
    side: chain.side,
    segments: chain.segments.map((seg) => {
      const chainFrom = seg.from.extensionEnd;
      const chainTo = seg.to.extensionEnd;
      return {
        from: seg.from.worldPt,
        to: seg.to.worldPt,
        chainFrom,
        chainTo,
        labelText: seg.labelText,
        labelPt: { x: (chainFrom.x + chainTo.x) / 2, y: (chainFrom.y + chainTo.y) / 2 },
      };
    }),
  }));

  const interiorDimensions: RenderDimensionSegment[] = floorDimensions.interiorDimensions.map(
    (seg) => {
      const chainFrom = seg.from.extensionEnd;
      const chainTo = seg.to.extensionEnd;
      return {
        from: seg.from.worldPt,
        to: seg.to.worldPt,
        chainFrom,
        chainTo,
        labelText: seg.labelText,
        labelPt: { x: (chainFrom.x + chainTo.x) / 2, y: (chainFrom.y + chainTo.y) / 2 },
      };
    },
  );

  const complianceOverlay =
    opts?.findings !== undefined ? buildComplianceOverlay(level, opts.findings) : undefined;

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
    zones,
    layers: DEFAULT_RENDER_LAYERS,
    dimensionChains,
    interiorDimensions,
    complianceOverlay,
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
