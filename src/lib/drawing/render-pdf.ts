// src/lib/drawing/render-pdf.ts
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type { PDFPage, PDFFont } from "pdf-lib";
import type { DrawingModel } from "@/domain/drawing/drawing-model";

const PX_TO_PT = 0.75;
const PT_PER_MM = 2.8346;

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.trim().toLowerCase();
  if (clean === "none" || clean === "transparent") return null;
  if (clean === "black") return { r: 0, g: 0, b: 0 };
  if (clean === "white") return { r: 1, g: 1, b: 1 };
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

function drawPolygon(page: PDFPage, pageH: number, svgEl: string): void {
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
      return { x: x * PX_TO_PT, y: pageH - y * PX_TO_PT };
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

function drawLine(page: PDFPage, pageH: number, svgEl: string): void {
  const x1 = parseFloat(attr(svgEl, "x1") ?? "0");
  const y1 = parseFloat(attr(svgEl, "y1") ?? "0");
  const x2 = parseFloat(attr(svgEl, "x2") ?? "0");
  const y2 = parseFloat(attr(svgEl, "y2") ?? "0");
  const strokeStr = attr(svgEl, "stroke") ?? "#000";
  const strokeW = parseFloat(attr(svgEl, "stroke-width") ?? "1");
  const strokeRgb = hexToRgb(strokeStr);
  if (!strokeRgb) return;

  page.drawLine({
    start: { x: x1 * PX_TO_PT, y: pageH - y1 * PX_TO_PT },
    end: { x: x2 * PX_TO_PT, y: pageH - y2 * PX_TO_PT },
    color: rgb(strokeRgb.r, strokeRgb.g, strokeRgb.b),
    thickness: strokeW * PX_TO_PT,
  });
}

function drawTextEl(page: PDFPage, pageH: number, svgEl: string, font: PDFFont): void {
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
    x: x * PX_TO_PT,
    y: pageH - y * PX_TO_PT,
    font,
    size: fontSize * PX_TO_PT,
    color: fillRgb ? rgb(fillRgb.r, fillRgb.g, fillRgb.b) : rgb(0, 0, 0),
  });
}

function drawCircleEl(page: PDFPage, pageH: number, svgEl: string): void {
  const cx = parseFloat(attr(svgEl, "cx") ?? "0");
  const cy = parseFloat(attr(svgEl, "cy") ?? "0");
  const r = parseFloat(attr(svgEl, "r") ?? "2");
  const fillStr = attr(svgEl, "fill") ?? "#000";
  const strokeStr = attr(svgEl, "stroke") ?? "none";
  const strokeW = parseFloat(attr(svgEl, "stroke-width") ?? "1");
  const fillRgb = hexToRgb(fillStr);
  const strokeRgb = hexToRgb(strokeStr);

  page.drawCircle({
    x: cx * PX_TO_PT,
    y: pageH - cy * PX_TO_PT,
    size: r * PX_TO_PT,
    color: fillRgb ? rgb(fillRgb.r, fillRgb.g, fillRgb.b) : undefined,
    borderColor: strokeRgb ? rgb(strokeRgb.r, strokeRgb.g, strokeRgb.b) : undefined,
    borderWidth: strokeRgb ? strokeW * PX_TO_PT : undefined,
  });
}

function drawRectEl(page: PDFPage, pageH: number, svgEl: string): void {
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
    x: x * PX_TO_PT,
    y: pageH - (y + h) * PX_TO_PT,
    width: w * PX_TO_PT,
    height: h * PX_TO_PT,
    color: fillRgb ? rgb(fillRgb.r, fillRgb.g, fillRgb.b) : undefined,
    borderColor: strokeRgb ? rgb(strokeRgb.r, strokeRgb.g, strokeRgb.b) : undefined,
    borderWidth: strokeRgb ? strokeW * PX_TO_PT : undefined,
  });
}

function renderSvgElement(page: PDFPage, pageH: number, svgEl: string, font: PDFFont): void {
  if (svgEl.trim().startsWith("<g")) {
    const inner = svgEl.replace(/^<g[^>]*>/, "").replace(/<\/g>\s*$/, "");
    const childMatches = inner.match(
      /<(?:polygon|line|text|circle|rect)[^>]*(?:\/>|>[^<]*<\/[^>]+>)/g,
    );
    if (childMatches) {
      for (const child of childMatches) {
        renderSvgElement(page, pageH, child, font);
      }
    }
    return;
  }

  if (svgEl.includes("<polygon")) drawPolygon(page, pageH, svgEl);
  else if (svgEl.includes("<line")) drawLine(page, pageH, svgEl);
  else if (svgEl.includes("<text")) drawTextEl(page, pageH, svgEl, font);
  else if (svgEl.includes("<circle")) drawCircleEl(page, pageH, svgEl);
  else if (svgEl.includes("<rect")) drawRectEl(page, pageH, svgEl);
}

export async function renderPdf(model: DrawingModel): Promise<Uint8Array> {
  const widthPt = model.page.widthMm * PT_PER_MM;
  const heightPt = model.page.heightMm * PT_PER_MM;

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(model.titleBlock.title);
  pdfDoc.setSubject(model.titleBlock.address);

  const page = pdfDoc.addPage([widthPt, heightPt]);

  // White background
  page.drawRectangle({
    x: 0,
    y: 0,
    width: widthPt,
    height: heightPt,
    color: rgb(1, 1, 1),
  });

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Draw features sorted by zIndex
  const sorted = [...model.features].sort((a, b) => a.zIndex - b.zIndex);
  for (const feature of sorted) {
    try {
      renderSvgElement(page, heightPt, feature.svgElement, font);
    } catch {
      // Skip features that cannot be parsed
    }
  }

  // Title block
  const titleBlockW = 60 * PT_PER_MM;
  const drawW = widthPt - titleBlockW;
  const tb = model.titleBlock;

  page.drawRectangle({
    x: drawW,
    y: 0,
    width: titleBlockW,
    height: heightPt,
    color: rgb(0.98, 0.98, 0.98),
    borderColor: rgb(0.73, 0.73, 0.73),
    borderWidth: 0.5,
  });

  const tbTextX = drawW + 4;
  const tbLines: Array<{ text: string; size: number }> = [
    { text: tb.title, size: 9 },
    { text: tb.address, size: 7 },
    { text: tb.matrikel, size: 7 },
    { text: "", size: 7 },
    ...tb.sourceList.map((s) => ({ text: s, size: 6 })),
    { text: "", size: 6 },
    ...(tb.bygherre ? [{ text: `Bygherre: ${tb.bygherre}`, size: 6 }] : []),
    ...(tb.sagNr ? [{ text: `Sagsnr.: ${tb.sagNr}`, size: 6 }] : []),
    { text: "", size: 6 },
    { text: `Dato: ${tb.date}`, size: 6 },
    { text: `Mål: ${tb.scale}  Ark: ${tb.paperSize}`, size: 6 },
    { text: `Rev.: ${tb.revision}`, size: 6 },
    ...(tb.disclaimer ? [{ text: tb.disclaimer, size: 6 }] : []),
  ];

  let tbY = heightPt - 14;
  for (const line of tbLines) {
    if (line.text) {
      page.drawText(line.text, {
        x: tbTextX,
        y: tbY,
        font,
        size: line.size,
        color: rgb(0.13, 0.13, 0.13),
      });
    }
    tbY -= 9;
  }

  return pdfDoc.save();
}
