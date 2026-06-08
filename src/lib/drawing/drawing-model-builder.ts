// src/lib/drawing/drawing-model-builder.ts
import type { BeliggenhedsplanInput } from "@/domain/drawing/beliggenhedsplan.types";
import type { DrawingReadinessDecision } from "@/domain/drawing/decision-engine";
import type { DrawingModel, DrawingFeature } from "@/domain/drawing/drawing-model";
import { PAGE_SIZES, computeViewport } from "@/domain/drawing/drawing-model";
import { buildDimensionLines } from "./dimension-lines";
import { buildSetbackAnnotations } from "@/domain/drawing/geometry-engine";

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

function lineFeature(
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
  return {
    id,
    kind,
    svgElement: `<polyline points="${pts}" fill="none" ${style}/>`,
    label,
    labelX: null,
    labelY: null,
    zIndex,
  };
}

function lineLabelFeature(
  id: string,
  label: string,
  coords: [number, number][],
  minX: number,
  maxY: number,
  scale: number,
): DrawingFeature | null {
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (!first || !last) return null;

  const mid = coords[Math.floor(coords.length / 2)] ?? first;
  const x = (mid[0] - minX) * scale;
  const y = (maxY - mid[1]) * scale - 4;
  const angle = (-Math.atan2(last[1] - first[1], last[0] - first[0]) * 180) / Math.PI;

  return {
    id,
    kind: "road_label",
    svgElement: `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" transform="rotate(${angle.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})" text-anchor="middle" font-family="Arial" font-size="6.5" fill="#555" font-style="italic">${esc(label)}</text>`,
    label,
    labelX: x,
    labelY: y,
    zIndex: 45,
  };
}

function naturbeskyttelseLabel(
  type: BeliggenhedsplanInput["naturbeskyttelse"][number]["type"],
): string {
  switch (type) {
    case "strandbeskyttelse":
      return "Strandbeskyttelse";
    case "skovbyggelinje":
      return "Skovbyggelinje";
    case "åbeskyttelse":
      return "Åbeskyttelse";
    case "fortidsmindebeskyttelse":
      return "Fortidsmindebeskyttelse";
    case "klitfredning":
      return "Klitfredning";
  }
}

function naturbeskyttelseStyle(
  type: BeliggenhedsplanInput["naturbeskyttelse"][number]["type"],
  intersectsProposedBuilding: boolean,
): string {
  if (intersectsProposedBuilding) {
    return 'fill="#fee2e2" fill-opacity="0.28" stroke="#dc2626" stroke-width="1" stroke-dasharray="5,2"';
  }

  switch (type) {
    case "strandbeskyttelse":
      return 'fill="#dbeafe" fill-opacity="0.24" stroke="#2563eb" stroke-width="0.7" stroke-dasharray="5,3"';
    case "skovbyggelinje":
      return 'fill="#dcfce7" fill-opacity="0.22" stroke="#16a34a" stroke-width="0.7" stroke-dasharray="5,3"';
    case "åbeskyttelse":
      return 'fill="#ccfbf1" fill-opacity="0.22" stroke="#0f766e" stroke-width="0.7" stroke-dasharray="5,3"';
    case "fortidsmindebeskyttelse":
      return 'fill="#fef3c7" fill-opacity="0.25" stroke="#b45309" stroke-width="0.7" stroke-dasharray="5,3"';
    case "klitfredning":
      return 'fill="#fef9c3" fill-opacity="0.24" stroke="#a16207" stroke-width="0.7" stroke-dasharray="5,3"';
  }
}


export function buildDrawingModel(
  plan: BeliggenhedsplanInput,
  readiness: DrawingReadinessDecision,
): DrawingModel {
  const coords = plan.parcel.polygon25832.coordinates[0] as [number, number][];
  const roadLines = [
    ...(plan.vej?.centerline25832 ? [plan.vej.centerline25832] : []),
    ...(plan.vej?.vejkant25832 ?? []),
  ];
  const bboxCoords = [
    ...coords,
    ...roadLines.flatMap((line) => line.coordinates as [number, number][]),
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
  const titleBlockMm = 60;
  const PX_PER_MM = 3.7795;
  const drawWidthPx = (paperWidthMm - titleBlockMm) * PX_PER_MM;
  const drawHeightPx = paperHeightMm * PX_PER_MM;
  const scaleX = drawWidthPx / (bboxMaxX - bboxMinX);
  const scaleY = drawHeightPx / (bboxMaxY - bboxMinY);
  const scale = Math.min(scaleX, scaleY) * 0.9;

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

  // Vejgeometri
  plan.vej?.vejkant25832.forEach((edge, i) => {
    features.push(
      lineFeature(
        `road-edge-${i}`,
        "road_edge",
        edge.coordinates as [number, number][],
        bboxMinX,
        bboxMaxY,
        scale,
        'stroke="#9ca3af" stroke-width="0.7"',
        "Vejkant",
        8,
      ),
    );
  });

  let roadLabelRendered = false;
  if (plan.vej?.centerline25832) {
    const centerlineCoords = plan.vej.centerline25832.coordinates as [number, number][];
    features.push(
      lineFeature(
        "road-centerline",
        "road_centerline",
        centerlineCoords,
        bboxMinX,
        bboxMaxY,
        scale,
        'stroke="#6b7280" stroke-width="0.5" stroke-dasharray="4,3"',
        "Vejmidte",
        9,
      ),
    );

    const roadName = plan.vej.vejnavn ?? plan.parcel.roadName;
    if (roadName) {
      const labelFeature = lineLabelFeature(
        "road-name",
        roadName,
        centerlineCoords,
        bboxMinX,
        bboxMaxY,
        scale,
      );
      if (labelFeature) {
        features.push(labelFeature);
        roadLabelRendered = true;
      }
    }
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

  // Naturbeskyttelseszoner
  plan.naturbeskyttelse.forEach((layer, i) => {
    if (layer.geometry25832.type !== "Polygon") return;
    const label = layer.intersectsProposedBuilding ? naturbeskyttelseLabel(layer.type) : null;
    features.push(
      polygonFeature(
        `nature-protection-${i}`,
        "nature_protection",
        layer.geometry25832.coordinates[0] as [number, number][],
        bboxMinX,
        bboxMaxY,
        scale,
        naturbeskyttelseStyle(layer.type, layer.intersectsProposedBuilding),
        label,
        6,
      ),
    );
  });

  // Vejnavn-label — placeret syd for parcelpolygon
  if (plan.parcel.roadName && !roadLabelRendered) {
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
    const mx = (bx + px) / 2;
    const my = (by + py) / 2;
    const label = `${ann.distanceM.toFixed(2)} m`;
    features.push({
      id: `setback-ann-${i}`,
      kind: "dimension_lines",
      svgElement: `<g>
        <line x1="${bx.toFixed(1)}" y1="${by.toFixed(1)}" x2="${px.toFixed(1)}" y2="${py.toFixed(1)}" stroke="#b00" stroke-width="0.5" stroke-dasharray="3,1.5"/>
        <text x="${mx.toFixed(1)}" y="${(my - 2).toFixed(1)}" text-anchor="middle" font-family="Arial" font-size="5.5" fill="#b00" font-weight="bold">${label}</text>
      </g>`,
      label,
      labelX: mx,
      labelY: my,
      zIndex: 36,
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
    viewport: computeViewport([bboxMinX, bboxMinY, bboxMaxX, bboxMaxY], actualMetersPerMm),
    features,
    titleBlock: {
      title: plan.metadata.title,
      address: plan.metadata.address,
      matrikel: plan.metadata.matrikel,
      bygherre: plan.metadata.bygherre,
      sagNr: plan.metadata.sagNr,
      scale: `1:${actualScaleRounded}`,
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
        ...(plan.naturbeskyttelse.length > 0
          ? [`Naturbeskyttelse: ${plan.naturbeskyttelse.length} lag`]
          : []),

      ],
      completenessStatus: null,
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
      {
        symbol:
          '<line x1="0" y1="4" x2="12" y2="4" stroke="#6b7280" stroke-width="0.5" stroke-dasharray="4,3"/>',
        label: "Vejmidte",
      },
      {
        symbol: '<line x1="0" y1="4" x2="12" y2="4" stroke="#9ca3af" stroke-width="0.7"/>',
        label: "Vejkant",
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
    ],
    northArrowRotationDeg: 0,
    readinessStatus: readiness.status,
  };
}
