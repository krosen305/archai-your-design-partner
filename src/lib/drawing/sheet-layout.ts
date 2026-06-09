// src/lib/drawing/sheet-layout.ts
//
// Shared, pure sheet-layout logic for the beliggenhedsplan. Turns the
// structured DrawingModel into an ordered list of info-panel lines that both
// the SVG and PDF renderers consume, so the left info column stays identical
// across output formats. No drawing primitives here — only layout content.

import type { DrawingModel, MissingDataSeverity } from "@/domain/drawing/drawing-model";

export const PX_PER_MM = 3.7795;
/** Width reserved on the left of the sheet for the info/note column. */
export const INFO_COL_MM = 80;

/**
 * Offset (in px) that centres the situation-plan content within the plan area.
 * The builder anchors content at the bbox top-left; this recovers balanced
 * margins so a small parcel does not hug the left edge of a wide A3 sheet.
 */
export function planContentOffsetPx(
  model: DrawingModel,
  planWpx: number,
  planHpx: number,
): { x: number; y: number } {
  const [minX, minY, maxX, maxY] = model.viewport.bbox25832;
  const metersPerMm = model.viewport.metersPerMm || model.page.scale / 1000;
  const contentWpx = ((maxX - minX) / metersPerMm) * PX_PER_MM;
  const contentHpx = ((maxY - minY) / metersPerMm) * PX_PER_MM;
  return {
    x: Math.max(0, (planWpx - contentWpx) / 2),
    y: Math.max(0, (planHpx - contentHpx) / 2),
  };
}

/** Greedy word-wrap to a maximum character count per line. */
export function wrapText(text: string, maxChars: number): string[] {
  if (maxChars <= 0 || text.length <= maxChars) return [text];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current.length === 0) {
      current = word;
    } else if (current.length + 1 + word.length <= maxChars) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

/** Severity → hex colour, shared by SVG and PDF renderers. */
export function severityColor(severity: MissingDataSeverity): string {
  if (severity === "blocking") return "#b00020";
  if (severity === "placeholder") return "#b45309";
  return "#6b7280"; // estimat
}

export type InfoLine =
  | { kind: "title"; text: string }
  | { kind: "subtitle"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "keyvalue"; key: string; value: string; muted: boolean }
  | { kind: "text"; text: string; muted: boolean }
  | { kind: "warning"; text: string; severity: MissingDataSeverity }
  | { kind: "legend"; symbol: string; label: string }
  | { kind: "status"; text: string }
  | { kind: "disclaimer"; text: string }
  | { kind: "divider" };

export function buildInfoLines(model: DrawingModel): InfoLine[] {
  const tb = model.titleBlock;
  const ip = model.infoPanel;
  const lines: InfoLine[] = [];

  // --- Identity / title block ---
  lines.push({ kind: "title", text: tb.drawingType });
  lines.push({ kind: "subtitle", text: tb.address });
  lines.push({ kind: "keyvalue", key: "Matr.nr.", value: tb.matrikel, muted: false });
  if (tb.bfeNr) lines.push({ kind: "keyvalue", key: "BFE-nr.", value: tb.bfeNr, muted: false });
  if (tb.bygherre) {
    lines.push({ kind: "keyvalue", key: "Bygherre", value: tb.bygherre, muted: false });
  }
  if (tb.sagNr) lines.push({ kind: "keyvalue", key: "Sagsnr.", value: tb.sagNr, muted: false });
  lines.push({ kind: "keyvalue", key: "Tegn.nr.", value: tb.tegnNr, muted: false });
  lines.push({ kind: "divider" });

  // --- Arealer / siteMetrics ---
  lines.push({ kind: "heading", text: "Arealer" });
  for (const row of ip.siteMetrics.rows) {
    lines.push({ kind: "keyvalue", key: row.label, value: row.display, muted: !row.documented });
  }
  lines.push({
    kind: "keyvalue",
    key: "Beregningsgrundlag",
    value: ip.siteMetrics.calculationBasis,
    muted: false,
  });
  lines.push({ kind: "divider" });

  // --- Datagrundlag / sourceRegister ---
  lines.push({ kind: "heading", text: "Datagrundlag" });
  for (const e of ip.sourceRegister) {
    const meta = e.fetchedAt ? `${e.source} · ${e.fetchedAt.slice(0, 10)}` : e.source;
    lines.push({ kind: "keyvalue", key: e.label, value: meta, muted: false });
  }
  lines.push({ kind: "divider" });

  // --- Terræn og koter ---
  lines.push({ kind: "heading", text: "Terræn og koter" });
  if (ip.terrain.koteDatum) {
    lines.push({ kind: "text", text: ip.terrain.koteDatum, muted: true });
  }
  lines.push({
    kind: "keyvalue",
    key: "Sokkelkote",
    value: ip.terrain.sokkelKoteDisplay,
    muted: !ip.terrain.documented,
  });
  lines.push({
    kind: "keyvalue",
    key: "Gulvkote",
    value: ip.terrain.gulvKoteDisplay,
    muted: ip.terrain.gulvKoteDisplay === "ikke dokumenteret",
  });
  lines.push({
    kind: "keyvalue",
    key: "Rygningskote",
    value: ip.terrain.rygningsKoteDisplay,
    muted: true,
  });
  if (ip.terrain.note) {
    lines.push({ kind: "warning", text: ip.terrain.note, severity: "placeholder" });
  }
  lines.push({ kind: "divider" });

  // --- Tekniske noter ---
  if (ip.technicalNotes.length > 0) {
    lines.push({ kind: "heading", text: "Tekniske noter" });
    for (const n of ip.technicalNotes) {
      lines.push({ kind: "text", text: n.text, muted: true });
    }
    lines.push({ kind: "divider" });
  }

  // --- Manglende / ikke-verificeret data ---
  if (ip.missingDataWarnings.length > 0) {
    lines.push({ kind: "heading", text: "Manglende / ikke-verificeret data" });
    for (const w of ip.missingDataWarnings) {
      const suffix = w.responsibleParty ? ` (${w.responsibleParty})` : "";
      lines.push({ kind: "warning", text: `${w.label}${suffix}`, severity: w.severity });
    }
  }
  if (ip.completenessStatus) {
    lines.push({ kind: "status", text: ip.completenessStatus });
  }
  lines.push({ kind: "divider" });

  // --- Signaturforklaring / legend ---
  if (model.legend.length > 0) {
    lines.push({ kind: "heading", text: "Signaturforklaring" });
    for (const item of model.legend) {
      lines.push({ kind: "legend", symbol: item.symbol, label: item.label });
    }
    lines.push({ kind: "divider" });
  }

  // --- Footer / sheet metadata ---
  lines.push({ kind: "keyvalue", key: "Dato", value: tb.date, muted: false });
  lines.push({
    kind: "keyvalue",
    key: "Mål",
    value: `${tb.scale} (${tb.paperSize})`,
    muted: false,
  });
  lines.push({ kind: "keyvalue", key: "Rev.", value: tb.revision, muted: false });
  if (tb.buildingCode) {
    lines.push({ kind: "keyvalue", key: "Opføres efter", value: tb.buildingCode, muted: false });
  }
  if (tb.disclaimer) {
    lines.push({ kind: "disclaimer", text: tb.disclaimer });
  }

  return lines;
}
