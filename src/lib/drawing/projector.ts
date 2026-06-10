// src/lib/drawing/projector.ts
//
// Single source of truth for the beliggenhedsplan's world→sheet transform.
// Every coordinate the builder and layer builders emit goes through a Projector
// so the rotation that aligns EPSG:25832 grid-north to geographic north is
// applied uniformly — while text rendered AT the projected positions stays
// upright (a group-level SVG rotation would tilt labels, which we never want).

export type Projector = (x: number, y: number) => [number, number];

export type ProjectorOptions = {
  /** World rotation centre (parcel centroid), EPSG:25832 metres. */
  pivot: [number, number];
  /** Rotation applied about the pivot before mapping. +ve = CCW in world space. */
  rotationDeg: number;
  /** Min easting of the (rotated) fitted bbox, world metres. */
  minX: number;
  /** Max northing of the (rotated) fitted bbox, world metres. */
  maxY: number;
  /** Pixels per world-metre. */
  scale: number;
};

/** Rotate world point about pivot by rotationDeg (CCW), then translate/scale/flip Y. */
export function createProjector(opts: ProjectorOptions): Projector {
  const { pivot, rotationDeg, minX, maxY, scale } = opts;
  const a = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const [px, py] = pivot;
  return (x: number, y: number): [number, number] => {
    const dx = x - px;
    const dy = y - py;
    const rx = px + dx * cos - dy * sin;
    const ry = py + dx * sin + dy * cos;
    return [(rx - minX) * scale, (maxY - ry) * scale];
  };
}

/**
 * Rotate a world point about a pivot (no projection). Used to recompute the
 * fitted bbox from already-rotated geometry so the rotated drawing fits the page.
 */
export function rotateWorld(
  x: number,
  y: number,
  pivot: [number, number],
  rotationDeg: number,
): [number, number] {
  const a = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const dx = x - pivot[0];
  const dy = y - pivot[1];
  return [pivot[0] + dx * cos - dy * sin, pivot[1] + dx * sin + dy * cos];
}
