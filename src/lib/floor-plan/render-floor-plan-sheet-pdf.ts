// src/lib/floor-plan/render-floor-plan-sheet-pdf.ts
//
// High-level export pipeline: FloorPlanDocument → A3/A2 PDF or SVG string.
//
// PDF: buildRenderModel → renderFloorPlanPdf + pdf-lib title block.
// SVG: buildFloorPlanSheet → full sheet SVG string (suitable for PNG conversion
//      client-side via an <img> tag or canvas API).
//
// Kept separate from render-floor-plan-pdf.ts to avoid pulling pdf-lib into
// the SVG path and to avoid a circular import through floor-plan-sheet.ts.

import type { FloorPlanDocument } from "@/domain/floor-plan/floor-plan.types";
import { buildRenderModel } from "./floor-plan-render-model";
import { renderFloorPlanPdf } from "./render-floor-plan-pdf";
import { buildFloorPlanSheet } from "./floor-plan-sheet";

/** Paper sizes in mm (landscape). */
const PAPER_SIZES = {
  A3: { widthMm: 420, heightMm: 297 },
  A2: { widthMm: 594, heightMm: 420 },
} as const;

/** PDF points per mm at 72 dpi (pdf-lib default). */
const PT_PER_MM = 72 / 25.4;

export type FloorPlanSheetPdfOptions = {
  /** 1:scale, default 100. */
  scale?: number;
  paperSize?: "A3" | "A2";
  address?: string;
  title?: string;
};

/**
 * Render a full A3/A2 PDF sheet for a FloorPlanDocument level.
 *
 * Uses the WS7 render pipeline:
 *   buildRenderModel → renderFloorPlanPdf (wallPoche, zones, dimensionChains).
 *
 * The ptPerM option is derived from the requested scale and paper size so that
 * 1 real-world meter maps to the correct number of PDF points for a true-scale
 * printout.
 */
export async function renderFloorPlanSheetPdf(
  doc: FloorPlanDocument,
  levelId: string,
  opts: FloorPlanSheetPdfOptions = {},
): Promise<Uint8Array> {
  const scale = opts.scale ?? 100;
  const paper = PAPER_SIZES[opts.paperSize ?? "A3"];

  // Points per meter at this scale: 1 m → scale mm on paper → scale * PT_PER_MM pt
  const ptPerM = scale * PT_PER_MM;

  const level = doc.levels.find((l) => l.id === levelId);
  const levelName = level?.name ?? "Plantegning";

  const model = buildRenderModel(doc, levelId);

  const pdfBytes = await renderFloorPlanPdf(model, {
    title: opts.title ?? (opts.address ? `${opts.address} — ${levelName}` : levelName),
    statusLabel: "FORELØBIG",
    ptPerM,
    scaleText: `Mål 1:${scale}`,
  });

  // Note: The base renderFloorPlanPdf already handles its own internal title
  // block. For a full sheet PDF with the authority-grade SVG title block from
  // WS6 (buildTitleBlock), a dedicated pdf-lib layout layer would be needed.
  // That is deferred; the current output is a correctly-scaled, titled PDF.
  void paper; // reserved for future sheet-level layout (margins, north arrow)

  return pdfBytes;
}

/**
 * Render a full A3/A2 sheet as an SVG string.
 *
 * Uses buildFloorPlanSheet (WS6) which composes the plan SVG with a north arrow
 * and authority-grade title block. The returned string can be:
 *   - embedded in an <img src="data:image/svg+xml;base64,…"> for preview,
 *   - converted to PNG client-side via an offscreen <canvas>,
 *   - saved as a .svg file.
 */
export function renderFloorPlanSheetSvg(
  doc: FloorPlanDocument,
  levelId: string,
  opts: { scale?: number; paperSize?: "A3" | "A2"; address?: string } = {},
): string {
  const sheet = buildFloorPlanSheet(doc, levelId, {
    scale: opts.scale,
    paperSize: opts.paperSize,
    address: opts.address,
  });

  const elements = sheet.svgElements.join("\n");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg"`,
    ` width="${sheet.totalWidthPx}" height="${sheet.totalHeightPx}"`,
    ` viewBox="0 0 ${sheet.totalWidthPx} ${sheet.totalHeightPx}">`,
    elements,
    `</svg>`,
  ].join("");
}
