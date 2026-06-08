import type { DrawingFeature } from "@/domain/drawing/drawing-model";
import type {
  NaturbeskyttelseLayer,
  NaturbeskyttelseType,
} from "@/domain/drawing/beliggenhedsplan.types";

const NATUR_COLORS: Record<NaturbeskyttelseType, string> = {
  strandbeskyttelse: "#fbbf24",
  skovbyggelinje: "#34d399",
  åbeskyttelse: "#60a5fa",
  fortidsmindebeskyttelse: "#a78bfa",
  klitfredning: "#f97316",
};

const NATUR_LABELS: Record<NaturbeskyttelseType, string> = {
  strandbeskyttelse: "Strandbeskyttelse 300m",
  skovbyggelinje: "Skovbyggelinje 300m",
  åbeskyttelse: "Åbeskyttelse 150m",
  fortidsmindebeskyttelse: "Fortidsminde 100m",
  klitfredning: "Klitfredning",
};

function toSvg(coords: [number, number][], minX: number, maxY: number, scale: number): string {
  return coords
    .map(([x, y]) => `${((x - minX) * scale).toFixed(1)},${((maxY - y) * scale).toFixed(1)}`)
    .join(" ");
}

export function buildNaturbeskyttelseFeatures(
  layers: NaturbeskyttelseLayer[],
  minX: number,
  maxY: number,
  scale: number,
): DrawingFeature[] {
  return layers.flatMap((layer, i): DrawingFeature[] => {
    const color = NATUR_COLORS[layer.type];
    const label = NATUR_LABELS[layer.type];
    const opacity = layer.intersectsProposedBuilding ? "0.35" : "0.15";
    const strokeColor = layer.intersectsProposedBuilding ? "#dc2626" : color;

    if (layer.geometry25832.type === "Polygon") {
      const ring = layer.geometry25832.coordinates[0] as [number, number][];
      const pts = toSvg(ring, minX, maxY, scale);
      return [
        {
          id: `natur-${i}`,
          kind: "naturbeskyttelse_zones" as const,
          svgElement: `<polygon points="${pts}" fill="${color}" fill-opacity="${opacity}" stroke="${strokeColor}" stroke-width="0.5" stroke-dasharray="6,3"/>`,
          label,
          labelX: null,
          labelY: null,
          zIndex: 5,
        },
      ];
    }

    if (layer.geometry25832.type === "LineString") {
      const pts = toSvg(layer.geometry25832.coordinates, minX, maxY, scale);
      return [
        {
          id: `natur-${i}`,
          kind: "naturbeskyttelse_zones" as const,
          svgElement: `<polyline points="${pts}" fill="none" stroke="${strokeColor}" stroke-width="${layer.intersectsProposedBuilding ? "1.5" : "0.8"}" stroke-dasharray="8,4"/>`,
          label,
          labelX: null,
          labelY: null,
          zIndex: 5,
        },
      ];
    }

    return [];
  });
}
