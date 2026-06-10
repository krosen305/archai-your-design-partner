import type { DrawingFeature } from "@/domain/drawing/drawing-model";
import type { VejLayer } from "@/domain/drawing/beliggenhedsplan.types";
import type { Projector } from "@/lib/drawing/projector";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toSvg(coords: [number, number][], project: Projector): string {
  return coords
    .map(([x, y]) => {
      const [sx, sy] = project(x, y);
      return `${sx.toFixed(1)},${sy.toFixed(1)}`;
    })
    .join(" ");
}

export function buildRoadFeatures(
  vej: VejLayer | null,
  project: Projector,
  scale: number,
): DrawingFeature[] {
  if (!vej) return [];

  const features: DrawingFeature[] = [];

  // Road fill (grey band — requires centerline + width)
  if (vej.centerline25832 && vej.vejbreddeM) {
    const pts = toSvg(vej.centerline25832.coordinates, project);
    const halfW = (vej.vejbreddeM / 2) * scale;
    features.push({
      id: "road-fill",
      kind: "road_fill",
      svgElement: `<polyline points="${pts}" fill="none" stroke="#e5e7eb" stroke-width="${(halfW * 2).toFixed(1)}" stroke-linecap="square"/>`,
      label: null,
      labelX: null,
      labelY: null,
      zIndex: 1,
    });
  }

  // Road centerline
  if (vej.centerline25832) {
    const pts = toSvg(vej.centerline25832.coordinates, project);
    features.push({
      id: "road-centerline",
      kind: "road_centerline",
      svgElement: `<polyline points="${pts}" fill="none" stroke="#d1d5db" stroke-width="0.3" stroke-dasharray="4,2"/>`,
      label: vej.vejnavn,
      labelX: null,
      labelY: null,
      zIndex: 2,
    });
  }

  // Vejkant (road edge lines — array)
  vej.vejkant25832.forEach((edge, i) => {
    const pts = toSvg(edge.coordinates, project);
    features.push({
      id: `road-edge-${i}`,
      kind: "road_edge",
      svgElement: `<polyline points="${pts}" fill="none" stroke="#9ca3af" stroke-width="0.5"/>`,
      label: null,
      labelX: null,
      labelY: null,
      zIndex: 3,
    });
  });

  // Road name label (positioned at midpoint of centerline)
  const lineCoords = vej.centerline25832?.coordinates ?? [];
  if (lineCoords.length >= 2 && vej.vejnavn) {
    const mid = Math.floor(lineCoords.length / 2);
    const [mx, my] = lineCoords[mid]!;
    const [svgX, svgY] = project(mx, my);

    const [x1, y1] = lineCoords[mid - 1] ?? lineCoords[0]!;
    const [x2, y2] = lineCoords[mid + 1] ?? lineCoords[lineCoords.length - 1]!;
    const [px1, py1] = project(x1, y1);
    const [px2, py2] = project(x2, y2);
    const angleDeg = Math.atan2(py2 - py1, px2 - px1) * (180 / Math.PI);

    features.push({
      id: "road-name-label",
      kind: "road_label",
      svgElement: `<text x="${svgX.toFixed(1)}" y="${svgY.toFixed(1)}" font-family="Arial" font-size="5" fill="#6b7280" text-anchor="middle" transform="rotate(${angleDeg.toFixed(1)},${svgX.toFixed(1)},${svgY.toFixed(1)})">${esc(vej.vejnavn)}</text>`,
      label: vej.vejnavn,
      labelX: svgX,
      labelY: svgY,
      zIndex: 4,
    });
  }

  return features;
}
