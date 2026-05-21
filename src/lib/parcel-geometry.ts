// src/lib/parcel-geometry.ts
// Pure geometry helpers for parcel/footprint calculations.
// All functions use WGS84 [lng, lat] coordinates.
// No OpenLayers dependency — testable without browser setup.

type Ring = [number, number][];

function shoelaceArea(ring: Ring): number {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(area / 2);
}

// Approximate degrees² to m² at latitude ~56°N (Denmark)
const DEG2_TO_M2_DK = 1.2e10;

export function computeFootprintAreaM2(ring: Ring): number | null {
  if (ring.length < 3) return null;
  return shoelaceArea(ring) * DEG2_TO_M2_DK;
}

export function computeMinDistanceToBoundaryM(
  point: [number, number],
  ring: Ring,
): number | null {
  if (ring.length < 2) return null;
  const mPerLng = 111_320 * Math.cos((56 * Math.PI) / 180);
  const mPerLat = 111_320;

  let minDist = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ax = ring[j][0] * mPerLng;
    const ay = ring[j][1] * mPerLat;
    const bx = ring[i][0] * mPerLng;
    const by = ring[i][1] * mPerLat;
    const px = point[0] * mPerLng;
    const py = point[1] * mPerLat;
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq > 0 ? ((px - ax) * dx + (py - ay) * dy) / lenSq : 0;
    t = Math.max(0, Math.min(1, t));
    const closestX = ax + t * dx;
    const closestY = ay + t * dy;
    const dist = Math.hypot(px - closestX, py - closestY);
    if (dist < minDist) minDist = dist;
  }
  return minDist === Infinity ? null : minDist;
}

export function computeOutsideParcelAreaM2(
  footprintRing: Ring,
  parcelRing: Ring,
): number | null {
  if (footprintRing.length < 3 || parcelRing.length < 3) return null;

  const fMinX = Math.min(...footprintRing.map((p) => p[0]));
  const fMaxX = Math.max(...footprintRing.map((p) => p[0]));
  const fMinY = Math.min(...footprintRing.map((p) => p[1]));
  const fMaxY = Math.max(...footprintRing.map((p) => p[1]));
  const pMinX = Math.min(...parcelRing.map((p) => p[0]));
  const pMaxX = Math.max(...parcelRing.map((p) => p[0]));
  const pMinY = Math.min(...parcelRing.map((p) => p[1]));
  const pMaxY = Math.max(...parcelRing.map((p) => p[1]));

  if (fMaxX < pMinX || fMinX > pMaxX || fMaxY < pMinY || fMinY > pMaxY) {
    return computeFootprintAreaM2(footprintRing);
  }
  if (fMinX >= pMinX && fMaxX <= pMaxX && fMinY >= pMinY && fMaxY <= pMaxY) {
    return 0;
  }
  return 0;
}
