import type { DimensionLine, GeoJsonPolygon25832 } from "@/domain/drawing/beliggenhedsplan.types";

function sideLength(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);
}

function sideDirection(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): "north" | "south" | "east" | "west" {
  const dx = bx - ax;
  const dy = by - ay;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "east" : "west";
  return dy >= 0 ? "north" : "south";
}

export function buildDimensionLines(polygon: GeoJsonPolygon25832): DimensionLine[] {
  const ring = polygon.coordinates[0];
  if (!ring || ring.length < 4) return [];

  const lines: DimensionLine[] = [];

  for (let i = 0; i < ring.length - 1; i++) {
    const [ax, ay] = ring[i]!;
    const [bx, by] = ring[i + 1]!;
    const len = sideLength(ax, ay, bx, by);
    if (len < 0.1) continue;

    lines.push({
      fromPoint: { type: "Point", crs: "EPSG:25832", coordinates: [ax, ay] },
      toPoint: { type: "Point", crs: "EPSG:25832", coordinates: [bx, by] },
      labelM: Math.round(len * 100) / 100,
      side: sideDirection(ax, ay, bx, by),
    });
  }

  return lines;
}
