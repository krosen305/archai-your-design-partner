// src/lib/floor-plan/floor-plan-sheet.ts
//
// Sheet layout: combines buildRenderModel + renderFloorPlanSvg with a north
// arrow and title block to produce a print-ready sheet for a FloorPlanDocument
// level (WS6 — Ark, titelblok & skala).
//
// Kept in a separate module to avoid a circular dependency:
//   floor-plan-render-model  →  (no render-svg import)
//   render-floor-plan-svg    →  floor-plan-render-model (type only)
//   floor-plan-sheet         →  both of the above  (leaf, no importers)

import type { FloorPlanDocument } from "@/domain/floor-plan/floor-plan.types";
import { northArrowSvg } from "@/lib/drawing/drawing-symbols";
import { buildRenderModel } from "./floor-plan-render-model";
import { renderFloorPlanSvg } from "./render-floor-plan-svg";
import { buildTitleBlock } from "./title-block";

/** Paper sizes in mm (landscape orientation). */
const PAPER_SIZES = {
  A3: { widthMm: 420, heightMm: 297 },
  A2: { widthMm: 594, heightMm: 420 },
} as const;

/** 96 dpi: 1 mm = 96/25.4 px ≈ 3.7795 */
const PX_PER_MM = 96 / 25.4;

/** Structured metadata for the authority-required sheet elements. */
export type FloorPlanSheetMeta = {
  /** Nominal drawing scale denominator, e.g. 100 for 1:100. */
  scaleDenominator: number;
  /** Human-readable scale label, e.g. "1:100". */
  scaleLabel: string;
  /** True when a north arrow is present on the sheet. */
  northArrow: boolean;
  /** Title block structured fields. */
  titleBlock: {
    address: string | null;
    /** ISO date string from document metadata. */
    createdAt: string | null;
    /** Scale label as rendered in the title block, e.g. "Plantegning 1:100". */
    scaleText: string;
  };
  /** Rows in the area schedule (rooms + unheated zones). */
  areaSchedule: Array<{
    label: string;
    areaM2: number;
    heated: boolean;
  }>;
};

export type FloorPlanSheet = {
  /** All SVG elements: plan + north arrow + title block (no outer <svg> wrapper). */
  svgElements: string[];
  /** Total sheet width in SVG user-units (px). */
  totalWidthPx: number;
  /** Total sheet height in SVG user-units (px). */
  totalHeightPx: number;
  /** Pixels per mm for this sheet (typically 3.78 at 96 dpi). */
  pxPerMm: number;
  /** Structured metadata for authority-required sheet elements (scale, north arrow, title block, area schedule). */
  sheetMeta: FloorPlanSheetMeta;
};

/**
 * Build a complete, print-ready sheet layout for a floor-plan level.
 *
 * Scale rule: 1 real-world meter maps to `scale * PX_PER_MM` SVG user-units,
 * so at 1:100 one metre = ~3.78 px (true to a 96 dpi printout).
 *
 * Layout:
 * - Plan drawing: top-left (with sheet margin).
 * - North arrow: top-right corner of the plan area.
 * - Title block (address, scale, area table, date, branding, copyright):
 *   bottom-right corner of the sheet.
 *
 * Returns raw SVG element strings.  Wrap in `<svg width="…" height="…">…</svg>`
 * to render or export.
 */
export function buildFloorPlanSheet(
  doc: FloorPlanDocument,
  levelId: string,
  opts: {
    /** 1:scale, default 100 */
    scale?: number;
    /** Paper size (landscape). Default "A3". */
    paperSize?: "A3" | "A2";
    address?: string;
  } = {},
): FloorPlanSheet {
  const scale = opts.scale ?? 100;
  const paper = PAPER_SIZES[opts.paperSize ?? "A3"];

  // Pixels per meter at this drawing scale
  const pxPerM = scale * PX_PER_MM;

  // Total sheet dimensions in px (landscape)
  const totalWidthPx = Math.round(paper.widthMm * PX_PER_MM);
  const totalHeightPx = Math.round(paper.heightMm * PX_PER_MM);

  // Build render model and produce plan SVG with scale-correct pxPerM
  const model = buildRenderModel(doc, levelId);
  const planSvgString = renderFloorPlanSvg(model, { pxPerM });

  // Strip outer <svg> wrapper so we can re-embed the inner content in the sheet
  const planInner = planSvgString.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");

  // Plan area in px at this scale
  const planWidthPx = Math.round(model.viewBox.width * pxPerM);

  // Sheet margin (5 mm)
  const sheetMarginPx = Math.round(5 * PX_PER_MM);

  const elements: string[] = [];

  // --- Sheet background + border ---
  elements.push(
    `<rect x="0" y="0" width="${totalWidthPx}" height="${totalHeightPx}" fill="#ffffff" stroke="#888" stroke-width="1" />`,
  );

  // --- Plan group (offset by sheet margin) ---
  const planX = sheetMarginPx;
  const planY = sheetMarginPx;
  elements.push(`<g transform="translate(${planX},${planY})">`);
  elements.push(planInner);
  elements.push(`</g>`);

  // --- North arrow: top-right corner of the plan area ---
  const northArrowSize = 20;
  const northArrowX = planX + planWidthPx - northArrowSize - 4;
  const northArrowY = planY + northArrowSize + 4;
  elements.push(northArrowSvg(northArrowX, northArrowY, northArrowSize));

  // --- Title block: bottom-right corner of the sheet ---
  // Build area table rows: heated rooms + unheated zones
  const level = doc.levels.find((l) => l.id === levelId);
  const rows =
    level !== undefined
      ? [
          ...level.rooms.map((r) => ({
            label: r.name,
            areaM2: r.netAreaM2,
            heated: true,
          })),
          ...level.zones
            .filter((z) => !z.heated)
            .map((z) => ({
              label: z.name,
              areaM2: z.areaM2,
              heated: false,
            })),
        ]
      : [];

  const titleBlock = buildTitleBlock({
    address: opts.address,
    areaTableRows: rows,
    scale,
    paperWidthMm: paper.widthMm,
    paperHeightMm: paper.heightMm,
    createdAt: doc.metadata.createdAt,
    branding: "ArchAI",
  });

  const tbX = Math.round(totalWidthPx - titleBlock.blockWidthPx - sheetMarginPx);
  const tbY = Math.round(totalHeightPx - titleBlock.blockHeightPx - sheetMarginPx);
  elements.push(`<g transform="translate(${tbX},${tbY})">`);
  for (const el of titleBlock.svgElements) {
    elements.push(el);
  }
  elements.push(`</g>`);

  const sheetMeta: FloorPlanSheetMeta = {
    scaleDenominator: scale,
    scaleLabel: `1:${scale}`,
    northArrow: true,
    titleBlock: {
      address: opts.address ?? null,
      createdAt: doc.metadata.createdAt ?? null,
      scaleText: `Plantegning 1:${scale}`,
    },
    areaSchedule: rows,
  };

  return {
    svgElements: elements,
    totalWidthPx,
    totalHeightPx,
    pxPerMm: PX_PER_MM,
    sheetMeta,
  };
}
