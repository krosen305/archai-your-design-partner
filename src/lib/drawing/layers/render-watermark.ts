import type { DrawingFeature } from "@/domain/drawing/drawing-model";

export function buildWatermarkFeature(
  isDraft: boolean,
  drawWidthPx: number,
  drawHeightPx: number,
): DrawingFeature | null {
  if (!isDraft) return null;

  const cx = drawWidthPx / 2;
  const cy = drawHeightPx / 2;
  const fontSize = drawWidthPx / 5;

  return {
    id: "watermark-udkast",
    kind: "watermark",
    svgElement: `<text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" font-family="Arial" font-size="${fontSize.toFixed(1)}" fill="#6b7280" fill-opacity="0.12" text-anchor="middle" dominant-baseline="middle" transform="rotate(-35,${cx.toFixed(1)},${cy.toFixed(1)})" font-weight="bold">UDKAST</text>`,
    label: null,
    labelX: cx,
    labelY: cy,
    zIndex: 19,
  };
}
