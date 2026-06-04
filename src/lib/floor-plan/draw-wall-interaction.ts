// src/lib/floor-plan/draw-wall-interaction.ts
//
// Pure helpers for the "Tegn væg" (draw_wall) tool in FloorPlanCanvas.
// No React, no DOM, no Supabase — pure domain math only.

import type { Point2D } from "@/domain/geometry/geometry-2d.types";
import type { FloorPlanCommand } from "@/domain/floor-plan/commands";

/**
 * Snap `raw` to a purely horizontal or vertical line from `start`
 * (axis-aligned orthogonal constraint). Horizontal wins on tie (dx === dy).
 */
export function orthoSnapEndpoint(start: Point2D, raw: Point2D): Point2D {
  const dx = Math.abs(raw.x - start.x);
  const dy = Math.abs(raw.y - start.y);
  return dx >= dy ? { x: raw.x, y: start.y } : { x: start.x, y: raw.y };
}

/**
 * Build a valid `add_wall` command for an interior wall between two
 * LOCAL_METER points. Default thickness is 0.1 m (10 cm).
 */
export function buildAddWallCommand(
  levelId: string,
  start: Point2D,
  end: Point2D,
): Extract<FloorPlanCommand, { type: "add_wall" }> {
  return {
    type: "add_wall",
    levelId,
    start,
    end,
    thicknessM: 0.1,
    wallKind: "interior",
  };
}
