// src/domain/geometry/geometry-2d.types.ts
//
// Shared lower-level 2D geometry types for the LOCAL_METER coordinate system.
// Imported by both domain/drawing and domain/floor-plan to avoid import cycles
// (see spec §23.3.4 / §24.5). Pure data — no JSTS, no runtime dependency.

/** A point in LOCAL_METER coordinates (meters). */
export type Point2D = { x: number; y: number };

/** A straight segment between two LOCAL_METER points. */
export type Line2D = { start: Point2D; end: Point2D };

/**
 * A simple polygon, outer ring only, implicitly closed.
 * `vertices` must NOT repeat the first point as the last point.
 */
export type Polygon2D = { vertices: Point2D[] };

/**
 * Parameters to map LOCAL_METER coordinates onto the site CRS (EPSG:25832).
 * Structurally compatible with the floor-plan FloorPlanTransform so that
 * domain/floor-plan can pass its transform without importing this module's
 * consumers.
 */
export type LocalToSiteTransform = {
  origin25832: [number, number];
  rotationDeg: number;
};
