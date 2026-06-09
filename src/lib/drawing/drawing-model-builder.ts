// src/lib/drawing/drawing-model-builder.ts
import type { BeliggenhedsplanInput } from "@/domain/drawing/beliggenhedsplan.types";
import type { DrawingReadinessDecision } from "@/domain/drawing/decision-engine";
import type { DrawingModel, DrawingFeature } from "@/domain/drawing/drawing-model";
import { PAGE_SIZES, computeViewport } from "@/domain/drawing/drawing-model";
import { buildDimensionLines } from "./dimension-lines";
import { buildSetbackAnnotations } from "@/domain/drawing/geometry-engine";
import { buildRoadFeatures } from "./layers/render-road-layer";
import { buildNaturbeskyttelseFeatures } from "./layers/render-naturbeskyttelse-layer";
import { buildLerFeatures, buildLerLegendEntries } from "./layers/render-ler-layer";
import { buildPlaceholderFeatures } from "./layers/render-placeholder-layer";
import { buildWatermarkFeature } from "./layers/render-watermark";
import { computeDrawingCompleteness } from "@/domain/drawing/completeness-engine";
import { buildInfoPanel } from "@/domain/drawing/info-panel";
import { findLabelPosition, type PlacedLabel } from "./label-placement";
import { INFO_COL_MM, PX_PER_MM } from "./sheet-layout";

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
  const labelX = (cx - minX) * scale;
  const labelY = (maxY - cy) * scale;
  const labelSvg = label
    ? `<text x="${labelX.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="middle" font-family="Arial" font-size="6" fill="#444">${esc(label)}</text>`
    : "";
  return {
    id,
    kind,
    svgElement: labelSvg
      ? `<g><polygon points="${pts}" ${style}/>${labelSvg}</g>`
      : `<polygon points="${pts}" ${style}/>`,
    label,
    labelX,
    labelY,
    zIndex,
  };
}

export function buildDrawingModel(
  plan: BeliggenhedsplanInput,
  readiness: DrawingReadinessDecision,
): DrawingModel {
  const coords = plan.parcel.polygon25832.coordinates[0] as [number, number][];
  const bboxCoords = [
    ...coords,
    ...(plan.proposed.footprint25832.coordinates[0] as [number, number][]),
    ...plan.existing.buildings.flatMap(
      (building) => building.footprint25832.coordinates[0] as [number, number][],
    ),
  ];
  const xs = bboxCoords.map((c) => c[0]);
  const ys = bboxCoords.map((c) => c[1]);
  const pad = 20;
  const bboxMinX = Math.min(...xs) - pad;
  const bboxMinY = Math.min(...ys) - pad;
  const bboxMaxX = Math.max(...xs) + pad;
  const bboxMaxY = Math.max(...ys) + pad;

  const page = PAGE_SIZES[plan.metadata.paperSize];
  const paperWidthMm = page.widthMm;
  const paperHeightMm = page.heightMm;
  // The left info column reserves INFO_COL_MM; the situation plan fills the rest.
  // Parcel + buildings drive the scale here (bboxCoords excludes road/neighbors),
  // so a long road centerline can never blow up the drawing scale.
  const drawWidthPx = (paperWidthMm - INFO_COL_MM) * PX_PER_MM;
  const drawHeightPx = paperHeightMm * PX_PER_MM;
  const scaleX = drawWidthPx / (bboxMaxX - bboxMinX);
  const scaleY = drawHeightPx / (bboxMaxY - bboxMinY);
  const scale = Math.min(scaleX, scaleY) * 0.9;

  const completeness = computeDrawingCompleteness({
    hasParcelPolygon: true,
    proposedFootprintSource: plan.proposed.source.source,
    sokkelKoteM: plan.proposed.sokkelKoteM,
    sokkelSource: plan.proposed.source.source,
    tagform: plan.proposed.tagform,
    taghaldningGrad: plan.proposed.taghaldningGrad,
    rygningsKoteM: plan.proposed.rygningsKoteM,
    vejLayer: plan.vej,
    terrainLayer: plan.terrain,
    surveyTerrainPointCount: plan.survey?.terrainPoints.length ?? 0,
    kloakoplandType: plan.kloakoplandType,
    siteUseLayers: plan.siteUse,
    naturbeskyttelseFetchedAt:
      plan.naturbeskyttelse.length > 0 ? plan.naturbeskyttelse[0]!.source.fetchedAt : null,
  });
  const isDraft = completeness.overallStatus === "draft";

  // Actual scale: PX_PER_MM / (px per UTM-meter) = meters per mm of paper
  const actualMetersPerMm = PX_PER_MM / scale;
  const actualScaleRounded = Math.round(actualMetersPerMm * 1000);

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

  // Road layer (behind parcel, zIndex 1-4)
  const roadFeatures = buildRoadFeatures(plan.vej, bboxMinX, bboxMaxY, scale);
  roadFeatures.forEach((f) => features.push(f));

  // Fallback road name label — emitted when parcel has a roadName but vej layer
  // produced no road_label (no vejnavn or no centerline in vej layer)
  const hasRoadLabel = roadFeatures.some((f) => f.kind === "road_label");
  if (plan.parcel.roadName && !hasRoadLabel) {
    const centerX = coords.reduce((s, c) => s + c[0], 0) / coords.length;
    const southY = Math.min(...coords.map((c) => c[1]));
    const labelPxX = (centerX - bboxMinX) * scale;
    const labelPxY = (bboxMaxY - southY) * scale + 14;
    features.push({
      id: "road-name",
      kind: "road_label",
      svgElement: `<text x="${labelPxX.toFixed(1)}" y="${labelPxY.toFixed(1)}" text-anchor="middle" font-family="Arial" font-size="6.5" fill="#555" font-style="italic">${esc(plan.parcel.roadName)}</text>`,
      label: plan.parcel.roadName,
      labelX: labelPxX,
      labelY: labelPxY,
      zIndex: 45,
    });
  }

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

  // Naturbeskyttelseszoner (zIndex 5)
  const naturFeatures = buildNaturbeskyttelseFeatures(
    plan.naturbeskyttelse,
    bboxMinX,
    bboxMaxY,
    scale,
  );
  naturFeatures.forEach((f) => features.push(f));

  // --- Mål, afstande og koter med simpel label-kollisionsundgåelse ---
  const placedLabels: PlacedLabel[] = [];
  const placeLabel = (
    anchorX: number,
    anchorY: number,
    text: string,
    fontPx: number,
  ): PlacedLabel => {
    const pos = findLabelPosition({
      anchorX,
      anchorY,
      text,
      existingLabels: placedLabels,
      charWidthPx: fontPx * 0.6,
      fontHeightPx: fontPx,
    });
    placedLabels.push(pos);
    return pos;
  };

  // Parcel-sidemål — matrikelgrænsens kantlængder (dæmpet, uden for huskroppen)
  buildDimensionLines(plan.parcel.polygon25832).forEach((dl, i) => {
    const x1 = (dl.fromPoint.coordinates[0] - bboxMinX) * scale;
    const y1 = (bboxMaxY - dl.fromPoint.coordinates[1]) * scale;
    const x2 = (dl.toPoint.coordinates[0] - bboxMinX) * scale;
    const y2 = (bboxMaxY - dl.toPoint.coordinates[1]) * scale;
    const text = `${dl.labelM.toFixed(2)} m`;
    const pos = placeLabel((x1 + x2) / 2, (y1 + y2) / 2, text, 5.5);
    features.push({
      id: `parcel-dim-${i}`,
      kind: "dimension_lines",
      svgElement: `<g><line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#777" stroke-width="0.3" stroke-dasharray="2,2"/><text x="${pos.x.toFixed(1)}" y="${pos.y.toFixed(1)}" text-anchor="middle" font-family="Arial" font-size="5.5" fill="#555">${text}</text></g>`,
      label: text,
      labelX: pos.x,
      labelY: pos.y,
      zIndex: 34,
    });
  });

  // Bygningens sidemål
  buildDimensionLines(plan.proposed.footprint25832).forEach((dl, i) => {
    const x1 = (dl.fromPoint.coordinates[0] - bboxMinX) * scale;
    const y1 = (bboxMaxY - dl.fromPoint.coordinates[1]) * scale;
    const x2 = (dl.toPoint.coordinates[0] - bboxMinX) * scale;
    const y2 = (bboxMaxY - dl.toPoint.coordinates[1]) * scale;
    const text = dl.labelM.toFixed(2);
    const pos = placeLabel((x1 + x2) / 2, (y1 + y2) / 2 - 3, text, 6);
    features.push({
      id: `dim-${i}`,
      kind: "dimension_lines",
      svgElement: `<g><line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#00f" stroke-width="0.4"/><text x="${pos.x.toFixed(1)}" y="${pos.y.toFixed(1)}" text-anchor="middle" font-family="Arial" font-size="6" fill="#00f">${text}</text></g>`,
      label: null,
      labelX: pos.x,
      labelY: pos.y,
      zIndex: 35,
    });
  });

  // Skel-afstandsmål — obligatoriske afstandsannotationer til myndighed
  const setbackAnnotations = buildSetbackAnnotations(
    plan.proposed.footprint25832,
    plan.parcel.polygon25832,
  );
  setbackAnnotations.forEach((ann, i) => {
    const bx = (ann.buildingPt[0] - bboxMinX) * scale;
    const by = (bboxMaxY - ann.buildingPt[1]) * scale;
    const px = (ann.parcelPt[0] - bboxMinX) * scale;
    const py = (bboxMaxY - ann.parcelPt[1]) * scale;
    const label = `${ann.distanceM.toFixed(2)} m`;
    const pos = placeLabel((bx + px) / 2, (by + py) / 2 - 2, label, 5.5);
    features.push({
      id: `setback-ann-${i}`,
      kind: "dimension_lines",
      svgElement: `<g>
        <line x1="${bx.toFixed(1)}" y1="${by.toFixed(1)}" x2="${px.toFixed(1)}" y2="${py.toFixed(1)}" stroke="#b00" stroke-width="0.5" stroke-dasharray="3,1.5"/>
        <text x="${pos.x.toFixed(1)}" y="${pos.y.toFixed(1)}" text-anchor="middle" font-family="Arial" font-size="5.5" fill="#b00" font-weight="bold">${label}</text>
      </g>`,
      label,
      labelX: pos.x,
      labelY: pos.y,
      zIndex: 36,
    });
  });

  // Terrain-koter fra survey (kollisionsundgåede labels)
  if (plan.survey) {
    plan.survey.terrainPoints.forEach((tp, i) => {
      const px = (tp.x - bboxMinX) * scale;
      const py = (bboxMaxY - tp.y) * scale;
      const text = tp.z.toFixed(2);
      const pos = placeLabel(px + 4, py - 2, text, 6);
      features.push({
        id: `kote-${i}`,
        kind: "terrain_labels",
        svgElement: `<g><circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="1.5" fill="#555"/><text x="${pos.x.toFixed(1)}" y="${pos.y.toFixed(1)}" font-family="Arial" font-size="6" fill="#333">${text}</text></g>`,
        label: text,
        labelX: pos.x,
        labelY: pos.y,
        zIndex: 40,
      });
    });
  }

  // Obligatoriske noter, nordpil og målestok ejes af rendererens info-kolonne
  // og præsentationslag — ikke af plan-features.

  // LER ledninger (zIndex 4)
  const lerFeatures = buildLerFeatures(plan.lerLedninger, bboxMinX, bboxMaxY, scale);
  lerFeatures.forEach((f) => features.push(f));

  // Placeholder elements (zIndex 13-15)
  const placeholderFeatures = buildPlaceholderFeatures(
    completeness,
    plan.parcel,
    plan.proposed,
    bboxMinX,
    bboxMaxY,
    scale,
  );
  placeholderFeatures.forEach((f) => features.push(f));

  // Watermark (zIndex 19)
  const watermarkFeature = buildWatermarkFeature(isDraft, drawWidthPx, drawHeightPx);
  if (watermarkFeature) features.push(watermarkFeature);

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
    viewport: computeViewport([bboxMinX, bboxMinY, bboxMaxX, bboxMaxY], actualMetersPerMm),
    features,
    titleBlock: {
      title: plan.metadata.title,
      drawingType: "Beliggenhedsplan",
      tegnNr: "1",
      address: plan.metadata.address,
      matrikel: plan.metadata.matrikel,
      bfeNr: plan.metadata.bfeNr,
      bygherre: plan.metadata.bygherre,
      sagNr: plan.metadata.sagNr,
      buildingCode: plan.metadata.buildingCode,
      scale: `1:${actualScaleRounded}`,
      paperSize: plan.metadata.paperSize,
      date: plan.metadata.date,
      revision: revisions[0]?.nr ?? "A",
      disclaimer: readiness.status === "AUTO_DRAFT" ? "FORELØBIG — ikke til myndighedsbrug" : null,
    },
    infoPanel: buildInfoPanel({ plan, completeness }),
    legend: [
      {
        symbol: '<rect width="12" height="8" fill="none" stroke="#000" stroke-width="1.5"/>',
        label: "Matrikelskel",
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
      {
        symbol:
          '<line x1="0" y1="4" x2="12" y2="4" stroke="#b00" stroke-width="0.6" stroke-dasharray="3,1.5"/>',
        label: "Skelafstand",
      },
      {
        symbol:
          '<line x1="0" y1="4" x2="12" y2="4" stroke="#6b7280" stroke-width="0.5" stroke-dasharray="4,3"/>',
        label: "Vejmidte",
      },
      {
        symbol: '<line x1="0" y1="4" x2="12" y2="4" stroke="#9ca3af" stroke-width="0.7"/>',
        label: "Vejkant",
      },
      {
        symbol: '<circle cx="6" cy="4" r="1.5" fill="#555"/>',
        label: "Terrænkote (DVR90)",
      },
      ...(plan.naturbeskyttelse.length > 0
        ? [
            {
              symbol:
                '<rect width="12" height="8" fill="#dcfce7" fill-opacity="0.35" stroke="#16a34a" stroke-width="0.7" stroke-dasharray="5,3"/>',
              label: "Naturbeskyttelse",
            },
          ]
        : []),
      ...buildLerLegendEntries(plan.lerLedninger),
    ],
    northArrowRotationDeg: 0,
    readinessStatus: readiness.status,
  };
}
