// src/lib/floor-plan/render-floor-plan-pdf.ts
//
// Render a FloorPlanRenderModel to PDF via pdf-lib, drawing directly from the
// structured model (no SVG-string re-parsing). pdf-lib's origin is bottom-left
// and y-up, which matches architectural LOCAL_METER, so no y-flip is needed.
// Authority-near export carries a title block with title, status, scale and date
// (FR-DRAW-006). The renderer never invents geometry — it reads the model.

import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type { PDFFont, PDFPage } from "pdf-lib";
import type { Point2D } from "@/domain/geometry/geometry-2d.types";
import type { FloorPlanRenderModel } from "./floor-plan-render-model";

export type RenderFloorPlanPdfOptions = {
  title: string;
  statusLabel: string;
  /** PDF points per meter. */
  ptPerM?: number;
  scaleText?: string;
};

const TITLE_BLOCK_W = 150;
const MARGIN = 24;

/** WinAnsi-safe text drawing — skips glyphs the standard font cannot encode. */
function safeText(
  page: PDFPage,
  text: string,
  opts: { x: number; y: number; size: number; font: PDFFont; color?: ReturnType<typeof rgb> },
): void {
  try {
    page.drawText(text, {
      x: opts.x,
      y: opts.y,
      size: opts.size,
      font: opts.font,
      color: opts.color,
    });
  } catch {
    // Drop characters outside the font encoding rather than failing the export.
    const ascii = text.replace(/[^\x20-\x7E æøåÆØÅ²]/g, "");
    try {
      page.drawText(ascii, {
        x: opts.x,
        y: opts.y,
        size: opts.size,
        font: opts.font,
        color: opts.color,
      });
    } catch {
      /* give up on this label */
    }
  }
}

export async function renderFloorPlanPdf(
  model: FloorPlanRenderModel,
  options: RenderFloorPlanPdfOptions,
): Promise<Uint8Array> {
  const scale = options.ptPerM ?? 50;
  const { minX, minY, width, height } = model.viewBox;
  const drawW = width * scale;
  const drawH = height * scale;
  const pageW = drawW + 2 * MARGIN + TITLE_BLOCK_W;
  const pageH = Math.max(drawH + 2 * MARGIN, 260);

  const map = (p: Point2D) => ({
    x: MARGIN + (p.x - minX) * scale,
    y: MARGIN + (p.y - minY) * scale,
  });

  const pdf = await PDFDocument.create();
  pdf.setTitle(options.title);
  const page = pdf.addPage([pageW, pageH]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  page.drawRectangle({ x: 0, y: 0, width: pageW, height: pageH, color: rgb(1, 1, 1) });

  // Rooms (fill)
  for (const room of model.rooms) {
    page.drawSvgPath(pathYDown(room.points.map(map), pageH), {
      x: 0,
      y: 0,
      color: rgb(0.96, 0.95, 0.92),
    });
  }

  // Walls
  for (const wall of model.walls) {
    const a = map(wall.start);
    const b = map(wall.end);
    page.drawLine({
      start: a,
      end: b,
      thickness: Math.max(wall.thicknessM * scale, 1.5),
      color: wall.structural ? rgb(0.1, 0.1, 0.1) : rgb(0.2, 0.2, 0.2),
    });
  }

  // Openings
  for (const op of model.openings) {
    const c = map(op.center);
    page.drawCircle({
      x: c.x,
      y: c.y,
      size: Math.max((op.widthM * scale) / 2, 3),
      borderColor: rgb(0, 0.6, 0.4),
      borderWidth: 1.5,
      color: rgb(1, 1, 1),
    });
  }

  // Fixtures
  for (const fx of model.fixtures) {
    page.drawSvgPath(pathYDown(fx.points.map(map), pageH), {
      x: 0,
      y: 0,
      borderColor: rgb(0.4, 0.4, 0.4),
      borderWidth: 1,
    });
  }

  // Room stamps
  for (const room of model.rooms) {
    const c = map(room.labelPoint);
    safeText(page, room.name, { x: c.x - 12, y: c.y, size: 9, font: fontBold });
    safeText(page, `${(Math.round(room.areaM2 * 10) / 10).toFixed(1)} m²`, {
      x: c.x - 12,
      y: c.y - 11,
      size: 8,
      font,
      color: rgb(0.3, 0.3, 0.3),
    });
  }

  drawTitleBlock(page, font, fontBold, { pageW, pageH, ...options });
  return pdf.save();
}

/**
 * Build a closed path string for drawSvgPath (placed at x:0,y:0). Input points
 * are in pdf-lib y-up page space; convert to the y-down space drawSvgPath uses.
 */
function pathYDown(points: Array<{ x: number; y: number }>, pageH: number): string {
  if (points.length === 0) return "";
  const parts = points.map(
    (p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${(pageH - p.y).toFixed(2)}`,
  );
  parts.push("Z");
  return parts.join(" ");
}

function drawTitleBlock(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  o: { pageW: number; pageH: number; title: string; statusLabel: string; scaleText?: string },
): void {
  const x = o.pageW - TITLE_BLOCK_W;
  page.drawRectangle({
    x,
    y: 0,
    width: TITLE_BLOCK_W,
    height: o.pageH,
    color: rgb(0.98, 0.98, 0.98),
    borderColor: rgb(0.73, 0.73, 0.73),
    borderWidth: 0.5,
  });
  const tx = x + 8;
  let ty = o.pageH - 20;
  const line = (text: string, size: number, bold = false) => {
    safeText(page, text, {
      x: tx,
      y: ty,
      size,
      font: bold ? fontBold : font,
      color: rgb(0.13, 0.13, 0.13),
    });
    ty -= size + 5;
  };
  line(o.title, 10, true);
  line(`Status: ${o.statusLabel}`, 8, true);
  line(o.scaleText ?? "Mål: vejledende", 7);
  line(`Dato: ${new Date().toISOString().slice(0, 10)}`, 7);
  ty -= 6;
  line("Foreløbig — ikke myndighedsgodkendt.", 6);
}
