// src/lib/drawing/render-pdf.ts
//
// Renders a DrawingModel to PDF with the same sheet layout as the SVG renderer:
// a left info/note column drawn from the structured InfoPanel (real text, not
// regex-scraped SVG) and a right situation plan built from the plan features.

import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type { PDFPage, PDFFont } from "pdf-lib";
import type { DrawingModel } from "@/domain/drawing/drawing-model";
import {
  buildInfoLines,
  INFO_COL_MM,
  PX_PER_MM,
  planContentOffsetPx,
  severityColor,
  wrapText,
  type InfoLine,
} from "./sheet-layout";

const PX_TO_PT = 0.75;
const PT_PER_MM = 2.8346;

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.trim().toLowerCase();
  if (clean === "none" || clean === "transparent") return null;
  if (clean === "black") return { r: 0, g: 0, b: 0 };
  if (clean === "white") return { r: 1, g: 1, b: 1 };
  if (clean === "red") return { r: 1, g: 0, b: 0 };
  if (clean.startsWith("#")) {
    const h = clean.slice(1);
    if (h.length === 3) {
      return {
        r: parseInt(h[0] + h[0], 16) / 255,
        g: parseInt(h[1] + h[1], 16) / 255,
        b: parseInt(h[2] + h[2], 16) / 255,
      };
    }
    if (h.length === 6) {
      return {
        r: parseInt(h.slice(0, 2), 16) / 255,
        g: parseInt(h.slice(2, 4), 16) / 255,
        b: parseInt(h.slice(4, 6), 16) / 255,
      };
    }
  }
  return null;
}

function attr(el: string, name: string): string | null {
  const m = el.match(new RegExp(`${name}="([^"]*)"`));
  return m ? m[1] : null;
}

// --- Plan-feature drawing (regex over feature SVG) with x offset in points ---

function drawPolygon(page: PDFPage, pageH: number, dx: number, svgEl: string): void {
  const pointsStr = attr(svgEl, "points");
  if (!pointsStr) return;
  const fillStr = attr(svgEl, "fill") ?? "none";
  const strokeStr = attr(svgEl, "stroke") ?? "none";
  const strokeW = parseFloat(attr(svgEl, "stroke-width") ?? "1");

  const pts = pointsStr
    .trim()
    .split(/\s+/)
    .map((p) => {
      const [x, y] = p.split(",").map(Number);
      return { x: x * PX_TO_PT + dx, y: pageH - y * PX_TO_PT };
    });
  if (pts.length < 2) return;

  const pathParts = [`M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`];
  for (let i = 1; i < pts.length; i++) {
    pathParts.push(`L ${pts[i].x.toFixed(2)} ${pts[i].y.toFixed(2)}`);
  }
  pathParts.push("Z");

  const fillRgb = hexToRgb(fillStr);
  const strokeRgb = hexToRgb(strokeStr);

  page.drawSvgPath(pathParts.join(" "), {
    x: 0,
    y: 0,
    color: fillRgb ? rgb(fillRgb.r, fillRgb.g, fillRgb.b) : undefined,
    borderColor: strokeRgb ? rgb(strokeRgb.r, strokeRgb.g, strokeRgb.b) : undefined,
    borderWidth: strokeRgb ? strokeW * PX_TO_PT : undefined,
  });
}

function drawLine(page: PDFPage, pageH: number, dx: number, svgEl: string): void {
  const x1 = parseFloat(attr(svgEl, "x1") ?? "0");
  const y1 = parseFloat(attr(svgEl, "y1") ?? "0");
  const x2 = parseFloat(attr(svgEl, "x2") ?? "0");
  const y2 = parseFloat(attr(svgEl, "y2") ?? "0");
  const strokeStr = attr(svgEl, "stroke") ?? "#000";
  const strokeW = parseFloat(attr(svgEl, "stroke-width") ?? "1");
  const strokeRgb = hexToRgb(strokeStr);
  if (!strokeRgb) return;

  page.drawLine({
    start: { x: x1 * PX_TO_PT + dx, y: pageH - y1 * PX_TO_PT },
    end: { x: x2 * PX_TO_PT + dx, y: pageH - y2 * PX_TO_PT },
    color: rgb(strokeRgb.r, strokeRgb.g, strokeRgb.b),
    thickness: strokeW * PX_TO_PT,
  });
}

function drawTextEl(page: PDFPage, pageH: number, dx: number, svgEl: string, font: PDFFont): void {
  const x = parseFloat(attr(svgEl, "x") ?? "0");
  const y = parseFloat(attr(svgEl, "y") ?? "0");
  const fontSize = parseFloat(attr(svgEl, "font-size") ?? "7");
  const fillStr = attr(svgEl, "fill") ?? "#000";
  const fillRgb = hexToRgb(fillStr);
  const textMatch = svgEl.match(/>([^<]+)</);
  const text = textMatch
    ? textMatch[1]
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
    : "";
  if (!text.trim()) return;

  page.drawText(text, {
    x: x * PX_TO_PT + dx,
    y: pageH - y * PX_TO_PT,
    font,
    size: fontSize * PX_TO_PT,
    color: fillRgb ? rgb(fillRgb.r, fillRgb.g, fillRgb.b) : rgb(0, 0, 0),
  });
}

function drawCircleEl(page: PDFPage, pageH: number, dx: number, svgEl: string): void {
  const cx = parseFloat(attr(svgEl, "cx") ?? "0");
  const cy = parseFloat(attr(svgEl, "cy") ?? "0");
  const r = parseFloat(attr(svgEl, "r") ?? "2");
  const fillStr = attr(svgEl, "fill") ?? "#000";
  const strokeStr = attr(svgEl, "stroke") ?? "none";
  const strokeW = parseFloat(attr(svgEl, "stroke-width") ?? "1");
  const fillRgb = hexToRgb(fillStr);
  const strokeRgb = hexToRgb(strokeStr);

  page.drawCircle({
    x: cx * PX_TO_PT + dx,
    y: pageH - cy * PX_TO_PT,
    size: r * PX_TO_PT,
    color: fillRgb ? rgb(fillRgb.r, fillRgb.g, fillRgb.b) : undefined,
    borderColor: strokeRgb ? rgb(strokeRgb.r, strokeRgb.g, strokeRgb.b) : undefined,
    borderWidth: strokeRgb ? strokeW * PX_TO_PT : undefined,
  });
}

function drawRectEl(page: PDFPage, pageH: number, dx: number, svgEl: string): void {
  const x = parseFloat(attr(svgEl, "x") ?? "0");
  const y = parseFloat(attr(svgEl, "y") ?? "0");
  const w = parseFloat(attr(svgEl, "width") ?? "0");
  const h = parseFloat(attr(svgEl, "height") ?? "0");
  const fillStr = attr(svgEl, "fill") ?? "none";
  const strokeStr = attr(svgEl, "stroke") ?? "none";
  const strokeW = parseFloat(attr(svgEl, "stroke-width") ?? "1");
  const fillRgb = hexToRgb(fillStr);
  const strokeRgb = hexToRgb(strokeStr);

  page.drawRectangle({
    x: x * PX_TO_PT + dx,
    y: pageH - (y + h) * PX_TO_PT,
    width: w * PX_TO_PT,
    height: h * PX_TO_PT,
    color: fillRgb ? rgb(fillRgb.r, fillRgb.g, fillRgb.b) : undefined,
    borderColor: strokeRgb ? rgb(strokeRgb.r, strokeRgb.g, strokeRgb.b) : undefined,
    borderWidth: strokeRgb ? strokeW * PX_TO_PT : undefined,
  });
}

function renderSvgElement(
  page: PDFPage,
  pageH: number,
  dx: number,
  svgEl: string,
  font: PDFFont,
): void {
  if (svgEl.trim().startsWith("<g")) {
    const inner = svgEl.replace(/^<g[^>]*>/, "").replace(/<\/g>\s*$/, "");
    const childMatches = inner.match(
      /<(?:polygon|line|text|circle|rect)[^>]*(?:\/>|>[^<]*<\/[^>]+>)/g,
    );
    if (childMatches) {
      for (const child of childMatches) {
        renderSvgElement(page, pageH, dx, child, font);
      }
    }
    return;
  }

  if (svgEl.includes("<polygon")) drawPolygon(page, pageH, dx, svgEl);
  else if (svgEl.includes("<line")) drawLine(page, pageH, dx, svgEl);
  else if (svgEl.includes("<text")) drawTextEl(page, pageH, dx, svgEl, font);
  else if (svgEl.includes("<circle")) drawCircleEl(page, pageH, dx, svgEl);
  else if (svgEl.includes("<rect")) drawRectEl(page, pageH, dx, svgEl);
}

// --- Left info column (structured, real text) ------------------------------

function drawInfoColumn(
  page: PDFPage,
  pageHpt: number,
  colWpx: number,
  lines: InfoLine[],
  font: PDFFont,
  fontBold: PDFFont,
): void {
  const margin = 5;
  const innerW = colWpx - margin * 2;
  const maxChars = Math.floor(innerW / 3.0);
  const colWpt = colWpx * PX_TO_PT;

  // Column background
  page.drawRectangle({
    x: 0,
    y: 0,
    width: colWpt,
    height: pageHpt,
    color: rgb(0.98, 0.98, 0.98),
    borderColor: rgb(0.6, 0.6, 0.6),
    borderWidth: 0.7,
  });

  let yPx = 16;
  const toPt = (px: number) => pageHpt - px * PX_TO_PT;

  const put = (
    xPx: number,
    s: string,
    sizePx: number,
    hex: string,
    opts: { bold?: boolean; anchorEnd?: boolean } = {},
  ): void => {
    const c = hexToRgb(hex) ?? { r: 0.1, g: 0.1, b: 0.1 };
    const usedFont = opts.bold ? fontBold : font;
    const sizePt = sizePx * PX_TO_PT;
    let xPt = xPx * PX_TO_PT;
    if (opts.anchorEnd) {
      xPt -= usedFont.widthOfTextAtSize(s, sizePt);
    }
    page.drawText(s, {
      x: xPt,
      y: toPt(yPx),
      font: usedFont,
      size: sizePt,
      color: rgb(c.r, c.g, c.b),
    });
  };

  const hline = (atPx: number, hex: string): void => {
    const c = hexToRgb(hex) ?? { r: 0.8, g: 0.8, b: 0.8 };
    page.drawLine({
      start: { x: margin * PX_TO_PT, y: toPt(atPx) },
      end: { x: (colWpx - margin) * PX_TO_PT, y: toPt(atPx) },
      color: rgb(c.r, c.g, c.b),
      thickness: 0.5,
    });
  };

  for (const line of lines) {
    if (toPt(yPx) < 6) break; // never draw past the sheet bottom
    switch (line.kind) {
      case "title":
        put(margin, line.text, 11, "#111", { bold: true });
        yPx += 14;
        break;
      case "subtitle":
        put(margin, line.text, 7.5, "#333");
        yPx += 12;
        break;
      case "heading":
        yPx += 3;
        put(margin, line.text.toUpperCase(), 6.5, "#111", { bold: true });
        hline(yPx + 2, "#cbd5e1");
        yPx += 11;
        break;
      case "keyvalue":
        put(margin, line.key, 6, "#555");
        put(colWpx - margin, line.value, 6, line.muted ? "#9ca3af" : "#111", { anchorEnd: true });
        yPx += 9;
        break;
      case "text":
        for (const w of wrapText(line.text, maxChars)) {
          if (toPt(yPx) < 6) break;
          put(margin, w, 5.5, line.muted ? "#6b7280" : "#333");
          yPx += 7.5;
        }
        break;
      case "warning": {
        const color = severityColor(line.severity);
        wrapText(line.text, maxChars - 2).forEach((w, i) => {
          if (toPt(yPx) < 6) return;
          put(margin, `${i === 0 ? "• " : "   "}${w}`, 5.5, color);
          yPx += 7.5;
        });
        break;
      }
      case "legend": {
        const stroke = attr(line.symbol, "stroke");
        const fill = attr(line.symbol, "fill");
        const swatch = hexToRgb(fill ?? "none") ??
          hexToRgb(stroke ?? "#333") ?? { r: 0.2, g: 0.2, b: 0.2 };
        page.drawRectangle({
          x: margin * PX_TO_PT,
          y: toPt(yPx) - 1,
          width: 12 * PX_TO_PT,
          height: 6 * PX_TO_PT,
          color: rgb(swatch.r, swatch.g, swatch.b),
          borderColor: rgb(0.4, 0.4, 0.4),
          borderWidth: 0.3,
        });
        put(margin + 19, line.label, 5.5, "#333");
        yPx += 10;
        break;
      }
      case "status":
        page.drawRectangle({
          x: margin * PX_TO_PT,
          y: toPt(yPx) - 2,
          width: innerW * PX_TO_PT,
          height: 11 * PX_TO_PT,
          color: rgb(0.996, 0.953, 0.78),
        });
        put(margin + 3, line.text, 6, "#92400e", { bold: true });
        yPx += 14;
        break;
      case "disclaimer":
        page.drawRectangle({
          x: margin * PX_TO_PT,
          y: toPt(yPx) - 2,
          width: innerW * PX_TO_PT,
          height: 11 * PX_TO_PT,
          color: rgb(0.996, 0.886, 0.886),
        });
        put(margin + 3, line.text, 6, "#b00020", { bold: true });
        yPx += 14;
        break;
      case "divider":
        hline(yPx, "#e2e8f0");
        yPx += 6;
        break;
    }
  }
}

export async function renderPdf(model: DrawingModel): Promise<Uint8Array> {
  const widthPt = model.page.widthMm * PT_PER_MM;
  const heightPt = model.page.heightMm * PT_PER_MM;
  const infoColPx = INFO_COL_MM * PX_PER_MM;
  const dx = INFO_COL_MM * PT_PER_MM; // shift plan features right of the info column

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(model.titleBlock.title);
  pdfDoc.setSubject(model.titleBlock.address);

  const page = pdfDoc.addPage([widthPt, heightPt]);
  page.drawRectangle({ x: 0, y: 0, width: widthPt, height: heightPt, color: rgb(1, 1, 1) });

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Plan features (shifted right by the info column, centred in the plan area).
  // Folding the centring offset into dx and pageH avoids per-primitive plumbing.
  const planWpx = (model.page.widthMm - INFO_COL_MM) * PX_PER_MM;
  const planHpx = model.page.heightMm * PX_PER_MM;
  const offset = planContentOffsetPx(model, planWpx, planHpx);
  const featureDx = dx + offset.x * PX_TO_PT;
  const featurePageH = heightPt - offset.y * PX_TO_PT;
  const sorted = [...model.features].sort((a, b) => a.zIndex - b.zIndex);
  for (const feature of sorted) {
    try {
      renderSvgElement(page, featurePageH, featureDx, feature.svgElement, font);
    } catch {
      // Skip features that cannot be parsed
    }
  }

  // North arrow (plan area, top-left)
  const naCx = dx + 30 * PX_TO_PT;
  const naTop = heightPt - 17 * PX_TO_PT;
  const naBot = heightPt - 47 * PX_TO_PT;
  page.drawSvgPath(
    `M ${naCx} ${naTop} L ${naCx + 4} ${heightPt - 37 * PX_TO_PT} L ${naCx} ${heightPt - 33 * PX_TO_PT} L ${naCx - 4} ${heightPt - 37 * PX_TO_PT} Z`,
    { x: 0, y: 0, color: rgb(0.13, 0.13, 0.13) },
  );
  page.drawText("N", {
    x: naCx - 2,
    y: naBot,
    font: fontBold,
    size: 7 * PX_TO_PT,
    color: rgb(0.13, 0.13, 0.13),
  });

  // Scale bar (plan area, bottom-left)
  const metersPerMm = model.viewport.metersPerMm ?? model.page.scale / 1000;
  const scaleBarM = model.page.scale === 250 ? 10 : 20;
  const scaleBarPt = (scaleBarM / metersPerMm) * PT_PER_MM;
  const sbX = dx + 14 * PX_TO_PT;
  const sbY = 18 * PX_TO_PT;
  page.drawRectangle({ x: sbX, y: sbY, width: scaleBarPt / 2, height: 3, color: rgb(0, 0, 0) });
  page.drawRectangle({
    x: sbX + scaleBarPt / 2,
    y: sbY,
    width: scaleBarPt / 2,
    height: 3,
    borderColor: rgb(0, 0, 0),
    borderWidth: 0.5,
  });
  page.drawText(`0          ${scaleBarM} m   1:${model.page.scale}`, {
    x: sbX,
    y: sbY - 7,
    font,
    size: 4,
    color: rgb(0, 0, 0),
  });

  // Left info column
  drawInfoColumn(page, heightPt, infoColPx, buildInfoLines(model), font, fontBold);

  // Page border
  page.drawRectangle({
    x: 0,
    y: 0,
    width: widthPt,
    height: heightPt,
    borderColor: rgb(0.2, 0.2, 0.2),
    borderWidth: 1,
  });

  return pdfDoc.save();
}
