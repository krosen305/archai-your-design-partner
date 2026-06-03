// src/lib/floor-plan/title-block.ts
//
// Pure helper: builds SVG elements for an authority-grade drawing title block
// (titelblok) with area table, scale text, date, branding and copyright.
// All output is in SVG user-units (px).  No external dependencies.

export type TitleBlockOptions = {
  address?: string;
  areaTableRows: Array<{ label: string; areaM2: number; heated: boolean }>;
  /** e.g. 50 for 1:50, 100 for 1:100 */
  scale: number;
  /** A3=420, A2=594 */
  paperWidthMm: number;
  /** A3=297, A2=420 */
  paperHeightMm: number;
  /** ISO date string, e.g. "2026-06-01T00:00:00.000Z" */
  createdAt?: string;
  /** Defaults to "ArchAI" */
  branding?: string;
};

export type TitleBlockLayout = {
  /** SVG element strings ready to insert inside an <svg> or <g>. */
  svgElements: string[];
  /** Width in SVG user-units. */
  blockWidthPx: number;
  /** Height in SVG user-units. */
  blockHeightPx: number;
};

// 96 dpi: 1mm = 96/25.4 px ≈ 3.7795
const PX_PER_MM = 96 / 25.4;

/** Format an ISO date string to Danish format "dd.mm.yyyy". */
function formatDate(iso?: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const yyyy = d.getUTCFullYear();
    return `${dd}.${mm}.${yyyy}`;
  } catch {
    return iso;
  }
}

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmt(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Build SVG elements for a title block.
 *
 * The returned elements are positioned with (0,0) at the top-left of the block.
 * The caller is responsible for translating the group to the desired position on
 * the sheet (typically bottom-right).
 */
export function buildTitleBlock(opts: TitleBlockOptions): TitleBlockLayout {
  const {
    address,
    areaTableRows,
    scale,
    paperWidthMm,
    paperHeightMm,
    createdAt,
    branding = "ArchAI",
  } = opts;

  // Block dimensions: fixed proportional to paper size
  // Width = 25% of paper width, min ~100mm
  const blockWidthMm = Math.max(paperWidthMm * 0.25, 100);
  // Rows: header (address+scale+date+branding) + table rows + footer (copyright)
  const headerMm = 28;
  const rowHeightMm = 6;
  const footerMm = 8;
  const tableHeightMm = areaTableRows.length * rowHeightMm + 6; // +6 for column header
  const blockHeightMm = headerMm + tableHeightMm + footerMm;
  // Clamp to paper height (should always fit for normal plans)
  const actualHeightMm = Math.min(blockHeightMm, paperHeightMm * 0.9);

  const W = fmt(blockWidthMm * PX_PER_MM);
  const H = fmt(actualHeightMm * PX_PER_MM);

  const p = (mm: number) => fmt(mm * PX_PER_MM); // convert mm → px

  const elements: string[] = [];

  // --- Outer border ---
  elements.push(
    `<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff" stroke="#222" stroke-width="1.5" />`,
  );

  // --- Header divider ---
  const headerH = p(headerMm);
  elements.push(
    `<line x1="0" y1="${headerH}" x2="${W}" y2="${headerH}" stroke="#222" stroke-width="0.8" />`,
  );

  // --- Address (bold, 12px) ---
  const addressText = address ? esc(address) : "—";
  elements.push(
    `<text x="${p(4)}" y="${p(8)}" font-family="Arial,sans-serif" font-size="12" font-weight="bold" fill="#111">${addressText}</text>`,
  );

  // --- Scale text ---
  elements.push(
    `<text x="${p(4)}" y="${p(16)}" font-family="Arial,sans-serif" font-size="10" fill="#333">Plantegning 1:${scale}</text>`,
  );

  // --- Date ---
  const dateStr = formatDate(createdAt);
  if (dateStr) {
    elements.push(
      `<text x="${p(4)}" y="${p(22)}" font-family="Arial,sans-serif" font-size="9" fill="#555">Dato: ${esc(dateStr)}</text>`,
    );
  }

  // --- Branding: logo placeholder (rect) + text ---
  const logoW = p(10);
  const logoH = p(7);
  const logoX = fmt(W - logoW - p(3));
  const logoY = p(4);
  elements.push(
    `<rect x="${logoX}" y="${logoY}" width="${logoW}" height="${logoH}" fill="#1a1a6e" rx="2" />`,
  );
  elements.push(
    `<text x="${fmt(logoX + logoW / 2)}" y="${fmt(logoY + logoH - p(1.5))}" font-family="Arial,sans-serif" font-size="7" font-weight="bold" fill="#ffffff" text-anchor="middle">${esc(branding)}</text>`,
  );

  // --- Area table ---
  const tableTop = headerH;
  const colHeaderH = p(6);
  // Column header row
  elements.push(
    `<rect x="0" y="${tableTop}" width="${W}" height="${colHeaderH}" fill="#e8e8e8" />`,
  );
  const col1W = fmt(W * 0.5);
  const col2W = fmt(W * 0.25);
  elements.push(
    `<text x="${p(2)}" y="${fmt(tableTop + p(4.5))}" font-family="Arial,sans-serif" font-size="8" font-weight="bold" fill="#222">Rum/zone</text>`,
  );
  elements.push(
    `<text x="${fmt(col1W + p(2))}" y="${fmt(tableTop + p(4.5))}" font-family="Arial,sans-serif" font-size="8" font-weight="bold" fill="#222">Areal (m²)</text>`,
  );
  elements.push(
    `<text x="${fmt(col1W + col2W + p(2))}" y="${fmt(tableTop + p(4.5))}" font-family="Arial,sans-serif" font-size="8" font-weight="bold" fill="#222">Type</text>`,
  );

  // Column separator lines
  elements.push(
    `<line x1="${col1W}" y1="${tableTop}" x2="${col1W}" y2="${fmt(tableTop + colHeaderH + areaTableRows.length * p(rowHeightMm))}" stroke="#bbb" stroke-width="0.5" />`,
  );
  elements.push(
    `<line x1="${fmt(col1W + col2W)}" y1="${tableTop}" x2="${fmt(col1W + col2W)}" y2="${fmt(tableTop + colHeaderH + areaTableRows.length * p(rowHeightMm))}" stroke="#bbb" stroke-width="0.5" />`,
  );

  // Data rows
  areaTableRows.forEach((row, i) => {
    const rowY = fmt(tableTop + colHeaderH + i * p(rowHeightMm));
    const textY = fmt(rowY + p(4.5));
    // Alternating row background
    if (i % 2 === 0) {
      elements.push(
        `<rect x="0" y="${rowY}" width="${W}" height="${p(rowHeightMm)}" fill="#fafafa" />`,
      );
    }
    elements.push(
      `<text x="${p(2)}" y="${textY}" font-family="Arial,sans-serif" font-size="8" fill="#222">${esc(row.label)}</text>`,
    );
    elements.push(
      `<text x="${fmt(col1W + p(2))}" y="${textY}" font-family="Arial,sans-serif" font-size="8" fill="#222">${(Math.round(row.areaM2 * 10) / 10).toFixed(1)}</text>`,
    );
    elements.push(
      `<text x="${fmt(col1W + col2W + p(2))}" y="${textY}" font-family="Arial,sans-serif" font-size="8" fill="${row.heated ? "#1a6e1a" : "#6e4a1a"}">${row.heated ? "opvarmet" : "uopvarmet"}</text>`,
    );
    // Row bottom border
    const rowBottom = fmt(rowY + p(rowHeightMm));
    elements.push(
      `<line x1="0" y1="${rowBottom}" x2="${W}" y2="${rowBottom}" stroke="#e0e0e0" stroke-width="0.3" />`,
    );
  });

  // --- Table bottom divider ---
  const tableBottom = fmt(tableTop + colHeaderH + areaTableRows.length * p(rowHeightMm));
  elements.push(
    `<line x1="0" y1="${tableBottom}" x2="${W}" y2="${tableBottom}" stroke="#222" stroke-width="0.8" />`,
  );

  // --- Copyright footer ---
  const year = createdAt ? new Date(createdAt).getUTCFullYear() : new Date().getUTCFullYear();
  elements.push(
    `<text x="${p(4)}" y="${fmt(tableBottom + p(5.5))}" font-family="Arial,sans-serif" font-size="8" fill="#666">© ${esc(branding)} ${year}</text>`,
  );

  return {
    svgElements: elements,
    blockWidthPx: W,
    blockHeightPx: H,
  };
}
