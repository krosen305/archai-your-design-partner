// src/lib/drawing/render-svg.ts
import type { DrawingModel } from "@/domain/drawing/drawing-model";
import { northArrowSvg } from "./drawing-symbols";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderSvg(model: DrawingModel): string {
  const PX_PER_MM = 3.7795;
  const w = model.page.widthMm * PX_PER_MM;
  const h = model.page.heightMm * PX_PER_MM;
  const titleBlockW = 60 * PX_PER_MM;
  const drawW = w - titleBlockW;

  const sorted = [...model.features].sort((a, b) => a.zIndex - b.zIndex);
  const featuresSvg = sorted
    .map((f) => `<g id="${f.id}" data-kind="${f.kind}">${f.svgElement}</g>`)
    .join("\n");

  const { titleBlock: tb } = model;
  const tx = drawW;
  let lineY = 14;
  const lineH = 9;

  const tbLine = (text: string, size = 7, bold = false): string => {
    const weight = bold ? ' font-weight="bold"' : "";
    const svg = `<text x="${tx + 5}" y="${lineY}" font-family="Arial" font-size="${size}" fill="#222"${weight}>${esc(text)}</text>`;
    lineY += lineH;
    return svg;
  };

  const titleSvg = [
    `<rect x="${tx}" y="0" width="${titleBlockW}" height="${h}" fill="#f9f9f9" stroke="#bbb" stroke-width="0.5"/>`,
    tbLine(tb.title, 9, true),
    tbLine(tb.address),
    tbLine(tb.matrikel),
    `<line x1="${tx}" y1="${lineY + 2}" x2="${tx + titleBlockW}" y2="${lineY + 2}" stroke="#bbb" stroke-width="0.3"/>`,
    ...(() => {
      lineY += 6;
      return [];
    })(),
    ...tb.sourceList.map((s) => tbLine(s, 6)),
    `<line x1="${tx}" y1="${lineY + 2}" x2="${tx + titleBlockW}" y2="${lineY + 2}" stroke="#bbb" stroke-width="0.3"/>`,
    ...(() => {
      lineY += 6;
      return [];
    })(),
    ...(tb.bygherre ? [tbLine(`Bygherre: ${tb.bygherre}`, 6)] : []),
    ...(tb.sagNr ? [tbLine(`Sagsnr.: ${tb.sagNr}`, 6)] : []),
    `<line x1="${tx}" y1="${lineY + 2}" x2="${tx + titleBlockW}" y2="${lineY + 2}" stroke="#bbb" stroke-width="0.3"/>`,
    ...(() => {
      lineY += 6;
      return [];
    })(),
    tbLine(`Dato: ${tb.date}`, 6),
    tbLine(`Mål: ${tb.scale}  Ark: ${tb.paperSize}`, 6),
    tbLine(`Rev.: ${tb.revision}`, 6),
    ...(tb.completenessStatus
      ? [
          `<rect x="${tx}" y="${lineY}" width="${titleBlockW}" height="10" fill="#fef3c7"/>`,
          `<text x="${(tx + 5).toFixed(1)}" y="${(lineY + 7).toFixed(1)}" font-family="Arial" font-size="6" fill="#92400e" font-weight="bold">${esc(tb.completenessStatus)}</text>`,
          ...((): string[] => {
            lineY += 12;
            return [];
          })(),
        ]
      : []),
    ...(tb.disclaimer
      ? [
          `<text x="${tx + 5}" y="${lineY + 4}" font-family="Arial" font-size="6" fill="#c00" font-weight="bold">${esc(tb.disclaimer)}</text>`,
        ]
      : []),
    ...(model.legend.length > 0
      ? [
          `<line x1="${(tx + 2).toFixed(1)}" y1="${(lineY + 14).toFixed(1)}" x2="${(tx + titleBlockW - 2).toFixed(1)}" y2="${(lineY + 14).toFixed(1)}" stroke="#bbb" stroke-width="0.3"/>`,
          ...model.legend.map((item, i) => {
            const ly = lineY + 24 + i * 13;
            return [
              `<g transform="translate(${(tx + 5).toFixed(1)},${(ly - 7).toFixed(1)})"><svg width="14" height="9" viewBox="0 0 12 8">${item.symbol}</svg></g>`,
              `<text x="${(tx + 22).toFixed(1)}" y="${ly.toFixed(1)}" font-family="Arial" font-size="5.5" fill="#333">${esc(item.label)}</text>`,
            ].join("\n");
          }),
        ]
      : []),
    ...(model.legend.length > 0
      ? (() => {
          lineY += 14 + model.legend.length * 13;
          return [];
        })()
      : []),
  ].join("\n");

  const scaleBarM = model.page.scale === 250 ? 10 : 20;
  const metersPerMm = model.viewport.metersPerMm ?? model.page.scale / 1000;
  const scaleBarPx = (scaleBarM / metersPerMm) * PX_PER_MM;
  const scaleBarSvg = `<g transform="translate(10,${h - 20})">
  <rect x="0" y="0" width="${scaleBarPx / 2}" height="4" fill="#000"/>
  <rect x="${scaleBarPx / 2}" y="0" width="${scaleBarPx / 2}" height="4" fill="#fff" stroke="#000" stroke-width="0.5"/>
  <text x="0" y="12" font-family="Arial" font-size="5">0</text>
  <text x="${scaleBarPx / 2}" y="12" font-family="Arial" font-size="5" text-anchor="middle">${scaleBarM / 2}m</text>
  <text x="${scaleBarPx}" y="12" font-family="Arial" font-size="5" text-anchor="end">${scaleBarM}m  1:${model.page.scale}</text>
</g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="white"/>
  <clipPath id="draw-clip"><rect width="${drawW}" height="${h}"/></clipPath>
  <g clip-path="url(#draw-clip)">
    ${featuresSvg}
    ${northArrowSvg(drawW - 30, 30, 18)}
    ${scaleBarSvg}
  </g>
  <g id="title-block">${titleSvg}</g>
</svg>`;
}
