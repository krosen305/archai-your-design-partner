import type { Wall } from "@/domain/floor-plan/floor-plan.types";

/**
 * Compute the delta (in metres) needed to move a wall from its current
 * coordinate to the target coordinate on the given axis.
 *
 * deltaM = targetM - currentM
 */
export function deltaForTargetLength(currentM: number, targetM: number): number {
  return targetM - currentM;
}

/**
 * Return the wall's current position coordinate on the given drag axis.
 *
 * For a vertical wall that moves along x: returns start.x
 * For a horizontal wall that moves along y: returns start.y
 */
export function wallCoordinate(wall: Wall, axis: "x" | "y"): number {
  return axis === "x" ? wall.centerline.start.x : wall.centerline.start.y;
}
