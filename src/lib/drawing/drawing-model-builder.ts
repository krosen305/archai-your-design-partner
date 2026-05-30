// src/lib/drawing/drawing-model-builder.ts
import type { BeliggenhedsplanInput } from "@/domain/drawing/beliggenhedsplan.types";
import type { DrawingReadinessDecision } from "@/domain/drawing/decision-engine";
import type { DrawingModel, DrawingFeature } from "@/domain/drawing/drawing-model";
import { PAGE_SIZES, computeViewport } from "@/domain/drawing/drawing-model";
import { buildDimensionLines } from "./dimension-lines";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function coordsToSvgPoints(
  coords: [number, number][],
  minX: number,
  maxY: number,
  scale: number,
): string {
  return coords.map(([x, y]) => `${(x - minX) * scale},${(maxY - y) * scale}`).join(" ");
}

function polygonFeature(
  id: string,
  kind: DrawingFeature["kind"],
  coords: [number, number][],
  minX: number,
  maxY: number,
  scale: number,
  style: string,
  label: string | null = null,
  zIndex = 10,
): DrawingFeature {
  const pts = coordsToSvgPoints(coords, minX, maxY, scale);
  const cx = coords.reduce((s, c) => s + c[0], 0) / coords.length;
  const cy = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  return {
    id,
    kind,
    svgElement: `<polygon points="${pts}" ${style}/>`,
    label,
    labelX: (cx - minX) * scale,
    labelY: (maxY - cy) * scale,
    zIndex,
  };
}

export function buildDrawingModel(
  plan: BeliggenhedsplanInput,
  readiness: DrawingReadinessDecision,
): DrawingModel {
  const coords = plan.parcel.polygon25832.coordinates[0] as [number, number][];
  const xs = coords.map((c) => c[0]);
  const ys = coords.map((c) => c[1]);
  const pad = 20;
  const bboxMinX = Math.min(...xs) - pad;
  const bboxMinY = Math.min(...ys) - pad;
  const bboxMaxX = Math.max(...xs) + pad;
  const bboxMaxY = Math.max(...ys) + pad;

  const page = PAGE_SIZES[plan.metadata.paperSize];
  const paperWidthMm = page.widthMm;
  const paperHeightMm = page.heightMm;
  const titleBlockMm = 60;
  const PX_PER_MM = 3.7795;
  const drawWidthPx = (paperWidthMm - titleBlockMm) * PX_PER_MM;
  const drawHeightPx = paperHeightMm * PX_PER_MM;
  const scaleX = drawWidthPx / (bboxMaxX - bboxMinX);
  const scaleY = drawHeightPx / (bboxMaxY - bboxMinY);
  const scale = Math.min(scaleX, scaleY) * 0.9;

  const features: DrawingFeature[] = [];

  // Parcelpolygon
  features.push(
    polygonFeature(
      "parcel",
      "parcel_boundary",
      plan.parcel.polygon25832.coordinates[0] as [number, number][],
      bboxMinX,
      bboxMaxY,
      scale,
      'fill="none" stroke="#000" stroke-width="1.5"',
      plan.parcel.matrikelnummer,
      30,
    ),
  );

  // Nabomatrikler
  plan.parcel.neighborParcels.forEach((np, i) => {
    if (!np.polygon25832) return;
    features.push(
      polygonFeature(
        `neighbor-${i}`,
        "neighbor_parcels",
        np.polygon25832.coordinates[0] as [number, number][],
        bboxMinX,
        bboxMaxY,
        scale,
        'fill="none" stroke="#888" stroke-width="0.8" stroke-dasharray="3,2"',
        np.matrikelnummer,
        5,
      ),
    );
  });

  // Eksisterende bygninger
  plan.existing.buildings.forEach((b, i) => {
    features.push(
      polygonFeature(
        `existing-${i}`,
        "existing_buildings",
        b.footprint25832.coordinates[0] as [number, number][],
        bboxMinX,
        bboxMaxY,
        scale,
        'fill="#e8e8e8" stroke="#555" stroke-width="0.8"',
        null,
        15,
      ),
    );
  });

  // Foreslået bygning
  features.push(
    polygonFeature(
      "proposed",
      "proposed_buildings",
      plan.proposed.footprint25832.coordinates[0] as [number, number][],
      bboxMinX,
      bboxMaxY,
      scale,
      'fill="#d4e8ff" stroke="#00f" stroke-width="1"',
      null,
      20,
    ),
  );

  // Byggelinjer (constraints)
  plan.constraints.forEach((c, i) => {
    const isSetback = c.type === "br18_setback";
    const stroke = isSetback ? "#c00" : "#f80";
    const dash = isSetback ? "" : 'stroke-dasharray="6,3"';
    if (c.geometry25832.type === "Polygon") {
      const pts = coordsToSvgPoints(
        c.geometry25832.coordinates[0] as [number, number][],
        bboxMinX,
        bboxMaxY,
        scale,
      );
      features.push({
        id: `constraint-${i}`,
        kind: "setback_lines",
        svgElement: `<polygon points="${pts}" fill="none" stroke="${stroke}" stroke-width="0.6" ${dash}/>`,
        label: c.label,
        labelX: null,
        labelY: null,
        zIndex: 25,
      });
    }
  });

  // Mål-linjer
  const dimLines = buildDimensionLines(plan.proposed.footprint25832);
  dimLines.forEach((dl, i) => {
    const x1 = (dl.fromPoint.coordinates[0] - bboxMinX) * scale;
    const y1 = (bboxMaxY - dl.fromPoint.coordinates[1]) * scale;
    const x2 = (dl.toPoint.coordinates[0] - bboxMinX) * scale;
    const y2 = (bboxMaxY - dl.toPoint.coordinates[1]) * scale;
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    features.push({
      id: `dim-${i}`,
      kind: "dimension_lines",
      svgElement: `<g><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#00f" stroke-width="0.4"/><text x="${mx}" y="${my - 3}" text-anchor="middle" font-family="Arial" font-size="6" fill="#00f">${dl.labelM.toFixed(2)}</text></g>`,
      label: null,
      labelX: null,
      labelY: null,
      zIndex: 35,
    });
  });

  // Terrain-koter fra survey
  if (plan.survey) {
    plan.survey.terrainPoints.forEach((tp, i) => {
      const px = (tp.x - bboxMinX) * scale;
      const py = (bboxMaxY - tp.y) * scale;
      features.push({
        id: `kote-${i}`,
        kind: "terrain_labels",
        svgElement: `<g><circle cx="${px}" cy="${py}" r="1.5" fill="#555"/><text x="${px + 4}" y="${py - 2}" font-family="Arial" font-size="6" fill="#333">${tp.z.toFixed(2)}</text></g>`,
        label: String(tp.z),
        labelX: px,
        labelY: py,
        zIndex: 40,
      });
    });
  }

  // Obligatoriske noter
  const annots = plan.mandatoryAnnotations;
  const annotLines = [
    annots.koteDatum,
    annots.terrainSurveyedBy,
    annots.sewerResponsibility,
    annots.ratBarrierNote,
  ].filter(Boolean) as string[];

  if (annotLines.length > 0) {
    const annotSvg = annotLines
      .map(
        (line, i) =>
          `<text x="4" y="${drawHeightPx - 20 + i * 10}" font-family="Arial" font-size="5" fill="#333">${esc(line)}</text>`,
      )
      .join("\n");
    features.push({
      id: "mandatory-annotations",
      kind: "mandatory_annotations",
      svgElement: `<g>${annotSvg}</g>`,
      label: null,
      labelX: null,
      labelY: null,
      zIndex: 50,
    });
  }

  // Nordpil — fast SVG position øverst til venstre i tegnefeltet
  features.push({
    id: "north-arrow",
    kind: "north_arrow",
    svgElement: `<g transform="translate(24,24) rotate(0)">
    <polygon points="0,-14 5,4 0,0 -5,4" fill="#222" stroke="none"/>
    <polygon points="0,14 5,-4 0,0 -5,-4" fill="#fff" stroke="#222" stroke-width="0.5"/>
    <text x="0" y="-18" text-anchor="middle" font-family="Arial" font-size="7" font-weight="bold" fill="#222">N</text>
  </g>`,
    label: "N",
    labelX: 24,
    labelY: 10,
    zIndex: 60,
  });

  const areaTable = plan.metadata.areaTable ?? {
    grundarealM2: plan.parcel.areaRegisteredM2,
    groundFloorM2: plan.proposed.footprintAreaM2,
    firstFloorM2: null,
    doubleHeightDeductionM2: 0,
    totalResidentialM2: plan.proposed.footprintAreaM2,
    coveragePercent: (plan.proposed.footprintAreaM2 / plan.parcel.areaRegisteredM2) * 100,
    calculationBasis: "BR18 §452",
  };

  const revisions =
    plan.metadata.revisions.length > 0
      ? plan.metadata.revisions
      : [{ nr: "A", description: "Udgivelse", date: plan.metadata.date, by: "" }];

  return {
    page: {
      size: plan.metadata.paperSize,
      orientation: "landscape" as const,
      scale: plan.metadata.scale,
      ...page,
    },
    viewport: computeViewport([bboxMinX, bboxMinY, bboxMaxX, bboxMaxY], plan.metadata.scale),
    features,
    titleBlock: {
      title: plan.metadata.title,
      address: plan.metadata.address,
      matrikel: plan.metadata.matrikel,
      bygherre: plan.metadata.bygherre,
      sagNr: plan.metadata.sagNr,
      scale: `1:${plan.metadata.scale}`,
      paperSize: plan.metadata.paperSize,
      date: plan.metadata.date,
      revision: revisions[0]?.nr ?? "A",
      disclaimer: readiness.status === "AUTO_DRAFT" ? "FORELOEBIG — ikke til myndighedsbrug" : null,
      sourceList: [
        `Grundareal: ${areaTable.grundarealM2} m²`,
        `Bebyg.%: ${areaTable.coveragePercent.toFixed(2)}% (${areaTable.calculationBasis})`,
        ...(plan.metadata.buildingCode ? [`Opføres efter: ${plan.metadata.buildingCode}`] : []),
        ...(plan.metadata.bygherre ? [`Bygherre: ${plan.metadata.bygherre}`] : []),
        ...(plan.metadata.sagNr ? [`Sagsnr.: ${plan.metadata.sagNr}`] : []),
        ...(readiness.reviewRequiredBy.length > 0
          ? [`Review: ${readiness.reviewRequiredBy.join(", ")}`]
          : []),
      ],
    },
    legend: [
      {
        symbol: '<rect width="12" height="8" fill="none" stroke="#000" stroke-width="1.5"/>',
        label: "Parcel",
      },
      {
        symbol: '<rect width="12" height="8" fill="#d4e8ff" stroke="#00f" stroke-width="1"/>',
        label: "Nyt byggeri",
      },
      {
        symbol: '<rect width="12" height="8" fill="#e8e8e8" stroke="#555" stroke-width="0.8"/>',
        label: "Eksist. bygning",
      },
      {
        symbol: '<line x1="0" y1="4" x2="12" y2="4" stroke="#c00" stroke-width="0.6"/>',
        label: "Byggelinje BR18",
      },
    ],
    northArrowRotationDeg: 0,
    readinessStatus: readiness.status,
  };
}
