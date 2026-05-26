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
  const titleSvg = `
    <rect x="${tx}" y="0" width="${titleBlockW}" height="${h}" fill="#f8f8f8" stroke="#ccc" stroke-width="0.5"/>
    <text x="${tx + 5}" y="18" font-family="Arial" font-size="9" font-weight="bold">${esc(tb.title)}</text>
    <text x="${tx + 5}" y="32" font-family="Arial" font-size="7">${esc(tb.address)}</text>
    <text x="${tx + 5}" y="44" font-family="Arial" font-size="7">${esc(tb.matrikel)}</text>
    <text x="${tx + 5}" y="56" font-family="Arial" font-size="7">Maalestok: ${esc(tb.scale)}</text>
    <text x="${tx + 5}" y="68" font-family="Arial" font-size="7">Dato: ${esc(tb.date)}</text>
    <text x="${tx + 5}" y="80" font-family="Arial" font-size="7">Rev.: ${esc(tb.revision)}</text>
    ${tb.disclaimer ? `<text x="${tx + 5}" y="96" font-family="Arial" font-size="6" fill="#c00">${esc(tb.disclaimer)}</text>` : ""}
    ${tb.sourceList.map((s, i) => `<text x="${tx + 5}" y="${112 + i * 10}" font-family="Arial" font-size="5" fill="#666">${esc(s)}</text>`).join("\n")}
  `;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="white"/>
  <clipPath id="draw-clip"><rect width="${drawW}" height="${h}"/></clipPath>
  <g clip-path="url(#draw-clip)">
    ${featuresSvg}
    ${northArrowSvg(drawW - 30, 30, 18)}
  </g>
  <g id="title-block">${titleSvg}</g>
</svg>`;
}
