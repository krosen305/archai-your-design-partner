import type { DrawingFeature } from "@/domain/drawing/drawing-model";
import type { LerLedning, LerLedningType } from "@/domain/drawing/beliggenhedsplan.types";
import type { Projector } from "@/lib/drawing/projector";

const LER_COLORS: Record<LerLedningType, string> = {
  kloak_spildevand: "#78350f",
  kloak_regnvand: "#1d4ed8",
  kloak_faelles: "#525252",
  vand: "#0891b2",
  el: "#ca8a04",
  naturgas: "#ea580c",
  fjernvarme: "#dc2626",
  telekom: "#16a34a",
};

function toSvg(coords: [number, number][], project: Projector): string {
  return coords
    .map(([x, y]) => {
      const [sx, sy] = project(x, y);
      return `${sx.toFixed(1)},${sy.toFixed(1)}`;
    })
    .join(" ");
}

export function buildLerFeatures(ledninger: LerLedning[], project: Projector): DrawingFeature[] {
  return ledninger.map((l, i): DrawingFeature => {
    const color = LER_COLORS[l.type];
    const pts = toSvg(l.geometry25832.coordinates, project);
    const label = l.ejer ? `${l.type} (${l.ejer})` : l.type;

    return {
      id: `ler-${i}`,
      kind: "ler_lines" as const,
      svgElement: `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1" stroke-dasharray="5,2" opacity="0.8"/>`,
      label,
      labelX: null,
      labelY: null,
      zIndex: 4,
    };
  });
}

export function buildLerLegendEntries(
  ledninger: LerLedning[],
): Array<{ symbol: string; label: string }> {
  const seen = new Set<LerLedningType>();
  return ledninger
    .filter((l) => !seen.has(l.type) && seen.add(l.type))
    .map((l) => ({
      symbol: `<line x1="0" y1="4" x2="12" y2="4" stroke="${LER_COLORS[l.type]}" stroke-width="1.5" stroke-dasharray="4,2"/>`,
      label: l.type.replace(/_/g, " "),
    }));
}
