// src/domain/geometry/local-transform.ts
//
// Deterministic LOCAL_METER <-> EPSG:25832 transform (spec §23.3.4).
// A local point is rotated by rotationDeg (counter-clockwise) and translated
// by origin25832.

import type { LocalToSiteTransform, Point2D } from "./geometry-2d.types";

const DEG_TO_RAD = Math.PI / 180;

/** Map a LOCAL_METER point to EPSG:25832 [easting, northing]. */
export function localToSite25832(
  point: Point2D,
  transform: LocalToSiteTransform,
): [number, number] {
  const theta = transform.rotationDeg * DEG_TO_RAD;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const [ox, oy] = transform.origin25832;
  return [ox + point.x * cos - point.y * sin, oy + point.x * sin + point.y * cos];
}

/** Inverse of {@link localToSite25832}. */
export function site25832ToLocal(
  coord: [number, number],
  transform: LocalToSiteTransform,
): Point2D {
  const theta = transform.rotationDeg * DEG_TO_RAD;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const [ox, oy] = transform.origin25832;
  const dx = coord[0] - ox;
  const dy = coord[1] - oy;
  // Inverse rotation (transpose of the rotation matrix).
  return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
}
