// SERVER- AND CLIENT-SAFE — no env access, no Datafordeler calls.
// All functions operate on EPSG:25832 (UTM32N, metres) coordinate pairs,
// which is the CRS returned by Datafordeler MAT WFS.
// Coordinates: [easting_m, northing_m] — same convention as proj4's output.

import proj4 from "proj4";
import type * as GeoJSON from "geojson";

const EPSG25832 = "+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs +type=crs";
const WGS84 = "EPSG:4326";

type Ring = [number, number][];

function ringAreaM2(ring: Ring): number {
  let area = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = ring[i]!;
    const [x2, y2] = ring[(i + 1) % n]!;
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

export function computePolygonAreaM2(
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): number | null {
  if (geometry.type === "Polygon") {
    const [outer, ...holes] = geometry.coordinates as Ring[];
    if (!outer?.length) return null;
    return ringAreaM2(outer) - holes.reduce((s, h) => s + ringAreaM2(h), 0);
  }
  if (geometry.type === "MultiPolygon") {
    let total = 0;
    for (const poly of geometry.coordinates as Ring[][]) {
      const [outer, ...holes] = poly;
      if (!outer?.length) continue;
      total += ringAreaM2(outer) - holes.reduce((s, h) => s + ringAreaM2(h), 0);
    }
    return total > 0 ? total : null;
  }
  return null;
}

export function computeCentroidUtm32(
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): [number, number] | null {
  const ring: Ring | undefined =
    geometry.type === "Polygon"
      ? (geometry.coordinates[0] as Ring)
      : (geometry.coordinates[0]?.[0] as Ring | undefined);
  if (!ring?.length) return null;
  const n = ring.length;
  let area = 0,
    cx = 0,
    cy = 0;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = ring[i]!;
    const [x2, y2] = ring[(i + 1) % n]!;
    const cross = x1 * y2 - x2 * y1;
    area += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  area /= 2;
  if (Math.abs(area) < 1e-10) return null;
  return [cx / (6 * area), cy / (6 * area)];
}

export function utm32ToWgs84(x: number, y: number): { lat: number; lng: number } {
  const [lng, lat] = proj4(EPSG25832, WGS84, [x, y]) as [number, number];
  return { lat, lng };
}

export function wgs84ToUtm32(lat: number, lng: number): { x: number; y: number } {
  const [x, y] = proj4(WGS84, EPSG25832, [lng, lat]) as [number, number];
  return {
    x: Math.round(x * 100) / 100,
    y: Math.round(y * 100) / 100,
  };
}

export function computeBbox25832(
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): [number, number, number, number] | null {
  const ring: Ring | undefined =
    geometry.type === "Polygon"
      ? (geometry.coordinates[0] as Ring)
      : (geometry.coordinates[0]?.[0] as Ring | undefined);
  if (!ring?.length) return null;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

export function minDistanceToBoundaryM(
  point: [number, number],
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): number | null {
  const ring: Ring | undefined =
    geometry.type === "Polygon"
      ? (geometry.coordinates[0] as Ring)
      : (geometry.coordinates[0]?.[0] as Ring | undefined);
  if (!ring?.length) return null;
  const [px, py] = point;
  let minDist = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i]!;
    const [bx, by] = ring[(i + 1) % ring.length]!;
    const dx = bx - ax,
      dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq > 0 ? ((px - ax) * dx + (py - ay) * dy) / lenSq : 0;
    t = Math.max(0, Math.min(1, t));
    const nearX = ax + t * dx,
      nearY = ay + t * dy;
    const d = Math.sqrt((px - nearX) ** 2 + (py - nearY) ** 2);
    if (d < minDist) minDist = d;
  }
  return minDist === Infinity ? null : minDist;
}
