import type { DrawingFeature } from "@/domain/drawing/drawing-model";
import type { DrawingCompleteness } from "@/domain/drawing/completeness-engine";
import type { ParcelLayer, ProposedBuildingLayer } from "@/domain/drawing/beliggenhedsplan.types";
import type { Projector } from "@/lib/drawing/projector";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function orangeText(text: string, x: number, y: number, fontSize = 5): string {
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="Arial" font-size="${fontSize}" fill="#f97316" font-style="italic" font-weight="bold">${esc(text)}</text>`;
}

export function buildPlaceholderFeatures(
  completeness: DrawingCompleteness,
  parcel: ParcelLayer,
  proposed: ProposedBuildingLayer,
  project: Projector,
): DrawingFeature[] {
  const features: DrawingFeature[] = [];
  const { fields } = completeness;

  // Find road-facing parcel boundary segment
  const roadSegment = parcel.boundarySegments.find((s) => s.type === "road");
  const skelMidX = roadSegment
    ? (roadSegment.start.coordinates[0] + roadSegment.end.coordinates[0]) / 2
    : parcel.labelPoint25832.coordinates[0];
  const skelMidY = roadSegment
    ? (roadSegment.start.coordinates[1] + roadSegment.end.coordinates[1]) / 2
    : parcel.labelPoint25832.coordinates[1];

  // Find nearest building point to road for stikledning start
  const footprintRing = proposed.footprint25832.coordinates[0] as [number, number][];
  const bldNearestPt = footprintRing.reduce(
    (best, pt) => {
      const d = Math.sqrt((pt[0] - skelMidX) ** 2 + (pt[1] - skelMidY) ** 2);
      return d < best.d ? { pt, d } : best;
    },
    { pt: footprintRing[0]!, d: Infinity },
  );

  // Kloakstikledning placeholder (always rendered)
  if (fields.kloakStikledning.status === "placeholder") {
    const [bx, by] = project(bldNearestPt.pt[0], bldNearestPt.pt[1]);
    const [sx, sy] = project(skelMidX, skelMidY);

    features.push({
      id: "placeholder-sewer-connection",
      kind: "placeholder",
      svgElement: [
        `<line x1="${bx.toFixed(1)}" y1="${by.toFixed(1)}" x2="${sx.toFixed(1)}" y2="${sy.toFixed(1)}" stroke="#f97316" stroke-width="1.2" stroke-dasharray="6,3"/>`,
        `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="3" fill="none" stroke="#f97316" stroke-width="1" stroke-dasharray="3,2"/>`,
        orangeText("[Stikledning — kloakmester]", sx + 5, sy),
      ].join("\n"),
      label: "Stikledning",
      labelX: sx,
      labelY: sy,
      zIndex: 15,
    });
  }

  // Regnvandsløsning placeholder
  if (fields.regnvandsløsning.status === "placeholder") {
    const buildingCx = footprintRing.reduce((s, p) => s + p[0], 0) / footprintRing.length;
    const buildingCy = footprintRing.reduce((s, p) => s + p[1], 0) / footprintRing.length;
    const parcelCx = parcel.labelPoint25832.coordinates[0];
    const parcelCy = parcel.labelPoint25832.coordinates[1];

    const dx = parcelCx - buildingCx;
    const dy = parcelCy - buildingCy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const offsetScale = Math.min(8 / dist, 0.4);
    const faskineX = buildingCx + dx * offsetScale;
    const faskineY = buildingCy + dy * offsetScale;

    const [fx, fy] = project(faskineX, faskineY);
    const sizeM = proposed.footprintAreaM2 * 0.08;

    features.push({
      id: "placeholder-faskine",
      kind: "placeholder",
      svgElement: [
        `<rect x="${(fx - 6).toFixed(1)}" y="${(fy - 4).toFixed(1)}" width="12" height="8" fill="none" stroke="#f97316" stroke-width="1" stroke-dasharray="4,2"/>`,
        orangeText(`[Faskine ca. ${sizeM.toFixed(0)} m³ — kloakmester]`, fx - 30, fy + 14, 4.5),
      ].join("\n"),
      label: "Faskine",
      labelX: fx,
      labelY: fy,
      zIndex: 15,
    });
  }

  // Overkørsel placeholder
  if (fields.overkørsel.status === "placeholder") {
    const [ox, oy] = project(skelMidX, skelMidY);
    features.push({
      id: "placeholder-overkørsel",
      kind: "placeholder",
      svgElement: [
        `<line x1="${(ox - 8).toFixed(1)}" y1="${oy.toFixed(1)}" x2="${(ox + 8).toFixed(1)}" y2="${oy.toFixed(1)}" stroke="#f97316" stroke-width="2" stroke-dasharray="4,2"/>`,
        orangeText("[Overkørsel — bekræftes af kommunen]", ox + 10, oy + 3, 4.5),
      ].join("\n"),
      label: "Overkørsel",
      labelX: ox,
      labelY: oy,
      zIndex: 15,
    });
  }

  // Sokkelkote annotation
  if (fields.sokkelKote.status !== "auto" && proposed.sokkelKoteM !== null) {
    const [cx, cy] = project(footprintRing[0]![0], footprintRing[0]![1]);
    const isEstimated = fields.sokkelKote.status === "estimated";
    features.push({
      id: "annotation-sokkelkote",
      kind: "placeholder",
      svgElement: `<text x="${(cx + 2).toFixed(1)}" y="${(cy - 3).toFixed(1)}" font-family="Arial" font-size="4.5" fill="${isEstimated ? "#6b7280" : "#f97316"}" font-style="italic">${isEstimated ? `~DVR90 +${proposed.sokkelKoteM.toFixed(2)}m (DHM est.)` : "[Sokkelkote — kloakmester]"}</text>`,
      label: null,
      labelX: cx,
      labelY: cy,
      zIndex: 13,
    });
  }

  return features;
}
