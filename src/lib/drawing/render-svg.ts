// src/lib/drawing/render-svg.ts
//
// Renders a DrawingModel to an A3/A2-style sheet: a left info/note column
// (title block, arealer, datagrundlag, terræn, tekniske noter, manglende data,
// signaturforklaring) and a right situation plan. The renderer owns layout and
// presentation only — never compliance decisions.

import type { DrawingModel } from "@/domain/drawing/drawing-model";
import {
  buildInfoLines,
  type InfoLine,
  INFO_COL_MM,
  PX_PER_MM,
  planContentOffsetPx,
  severityColor,
  wrapText,
} from "./sheet-layout";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderInfoColumn(lines: InfoLine[], colW: number, pageH: number): string {
  const margin = 5;
  const innerW = colW - margin * 2;
  const maxChars = Math.floor(innerW / 3.0); // ~font-size 5.5 average glyph width
  const parts: string[] = [
    `<rect x="0" y="0" width="${colW.toFixed(1)}" height="${pageH.toFixed(1)}" fill="#fafafa" stroke="#999" stroke-width="0.7"/>`,
  ];
  let y = 16;

  const text = (
    x: number,
    s: string,
    size: number,
    fill: string,
    opts: { bold?: boolean; anchor?: "start" | "end" | "middle"; italic?: boolean } = {},
  ): string => {
    const weight = opts.bold ? ' font-weight="bold"' : "";
    const style = opts.italic ? ' font-style="italic"' : "";
    const anchor = opts.anchor ? ` text-anchor="${opts.anchor}"` : "";
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="Arial" font-size="${size}" fill="${fill}"${weight}${style}${anchor}>${esc(s)}</text>`;
  };

  for (const line of lines) {
    if (y > pageH - 6) break; // never draw past the sheet bottom
    switch (line.kind) {
      case "title":
        parts.push(text(margin, line.text, 11, "#111", { bold: true }));
        y += 14;
        break;
      case "subtitle":
        parts.push(text(margin, line.text, 7.5, "#333"));
        y += 12;
        break;
      case "heading":
        y += 3;
        parts.push(text(margin, line.text.toUpperCase(), 6.5, "#111", { bold: true }));
        parts.push(
          `<line x1="${margin}" y1="${(y + 2).toFixed(1)}" x2="${(colW - margin).toFixed(1)}" y2="${(y + 2).toFixed(1)}" stroke="#cbd5e1" stroke-width="0.5"/>`,
        );
        y += 11;
        break;
      case "keyvalue": {
        parts.push(text(margin, line.key, 6, "#555"));
        const valColor = line.muted ? "#9ca3af" : "#111";
        parts.push(text(colW - margin, line.value, 6, valColor, { anchor: "end" }));
        y += 9;
        break;
      }
      case "text": {
        const wrapped = wrapText(line.text, maxChars);
        for (const w of wrapped) {
          if (y > pageH - 6) break;
          parts.push(text(margin, w, 5.5, line.muted ? "#6b7280" : "#333"));
          y += 7.5;
        }
        break;
      }
      case "warning": {
        const color = severityColor(line.severity);
        const wrapped = wrapText(line.text, maxChars - 2);
        wrapped.forEach((w, i) => {
          if (y > pageH - 6) return;
          const prefix = i === 0 ? "• " : "   ";
          parts.push(text(margin, `${prefix}${w}`, 5.5, color));
          y += 7.5;
        });
        break;
      }
      case "legend": {
        parts.push(
          `<g transform="translate(${margin},${(y - 6).toFixed(1)})"><svg width="14" height="9" viewBox="0 0 12 8">${line.symbol}</svg></g>`,
        );
        parts.push(text(margin + 19, line.label, 5.5, "#333"));
        y += 10;
        break;
      }
      case "status": {
        parts.push(
          `<rect x="${margin}" y="${(y - 7).toFixed(1)}" width="${innerW.toFixed(1)}" height="11" fill="#fef3c7" stroke="#f59e0b" stroke-width="0.4"/>`,
        );
        parts.push(text(margin + 3, line.text, 6, "#92400e", { bold: true }));
        y += 14;
        break;
      }
      case "disclaimer": {
        parts.push(
          `<rect x="${margin}" y="${(y - 7).toFixed(1)}" width="${innerW.toFixed(1)}" height="11" fill="#fee2e2" stroke="#dc2626" stroke-width="0.5"/>`,
        );
        parts.push(text(margin + 3, line.text, 6, "#b00020", { bold: true }));
        y += 14;
        break;
      }
      case "divider":
        parts.push(
          `<line x1="${margin}" y1="${y.toFixed(1)}" x2="${(colW - margin).toFixed(1)}" y2="${y.toFixed(1)}" stroke="#e2e8f0" stroke-width="0.5"/>`,
        );
        y += 6;
        break;
    }
  }

  return parts.join("\n");
}

function northArrow(cx: number, cy: number): string {
  return `<g transform="translate(${cx},${cy})">
    <polygon points="0,-15 5,5 0,1 -5,5" fill="#222"/>
    <polygon points="0,15 5,-5 0,-1 -5,-5" fill="#fff" stroke="#222" stroke-width="0.5"/>
    <text x="0" y="-19" text-anchor="middle" font-family="Arial" font-size="8" font-weight="bold" fill="#222">N</text>
  </g>`;
}

function scaleBar(x: number, y: number, scale: number, metersPerMm: number): string {
  const scaleBarM = scale === 250 ? 10 : 20;
  const scaleBarPx = (scaleBarM / metersPerMm) * PX_PER_MM;
  return `<g transform="translate(${x},${y})">
  <rect x="0" y="0" width="${(scaleBarPx / 2).toFixed(1)}" height="4" fill="#000"/>
  <rect x="${(scaleBarPx / 2).toFixed(1)}" y="0" width="${(scaleBarPx / 2).toFixed(1)}" height="4" fill="#fff" stroke="#000" stroke-width="0.5"/>
  <text x="0" y="12" font-family="Arial" font-size="5">0</text>
  <text x="${(scaleBarPx / 2).toFixed(1)}" y="12" font-family="Arial" font-size="5" text-anchor="middle">${scaleBarM / 2} m</text>
  <text x="${scaleBarPx.toFixed(1)}" y="12" font-family="Arial" font-size="5" text-anchor="end">${scaleBarM} m   1:${scale}</text>
</g>`;
}

export function renderSvg(model: DrawingModel): string {
  const w = model.page.widthMm * PX_PER_MM;
  const h = model.page.heightMm * PX_PER_MM;
  const infoColPx = INFO_COL_MM * PX_PER_MM;
  const planW = w - infoColPx;

  const sorted = [...model.features].sort((a, b) => a.zIndex - b.zIndex);
  const featuresSvg = sorted
    .map((f) => `<g id="${f.id}" data-kind="${f.kind}">${f.svgElement}</g>`)
    .join("\n");

  const metersPerMm = model.viewport.metersPerMm ?? model.page.scale / 1000;
  const offset = planContentOffsetPx(model, planW, h);
  const infoColumnSvg = renderInfoColumn(buildInfoLines(model), infoColPx, h);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(1)}" height="${h.toFixed(1)}" viewBox="0 0 ${w.toFixed(1)} ${h.toFixed(1)}">
  <rect width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="white"/>
  <clipPath id="plan-clip"><rect x="${infoColPx.toFixed(1)}" y="0" width="${planW.toFixed(1)}" height="${h.toFixed(1)}"/></clipPath>
  <g clip-path="url(#plan-clip)">
    <g transform="translate(${infoColPx.toFixed(1)},0)">
      <g transform="translate(${offset.x.toFixed(1)},${offset.y.toFixed(1)})">
        ${featuresSvg}
      </g>
      ${northArrow(30, 32)}
      ${scaleBar(14, h - 24, model.page.scale, metersPerMm)}
    </g>
  </g>
  <g id="info-panel">${infoColumnSvg}</g>
  <rect x="0" y="0" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="none" stroke="#333" stroke-width="1"/>
</svg>`;
}
