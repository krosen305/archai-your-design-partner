// src/domain/drawing/drawing-model.ts

export type DrawingLayerKind =
  | "parcel_boundary"
  | "neighbor_parcels"
  | "existing_buildings"
  | "proposed_buildings"
  | "setback_lines"
  | "building_lines"
  | "terrain_points"
  | "utilities"
  | "site_use"
  | "dimensions"
  | "labels"
  | "title_block"
  | "legend"
  | "dimension_lines"
  | "terrain_labels"
  | "utility_lines"
  | "utility_wells"
  | "hatch_areas"
  | "road_label"
  | "scale_bar"
  | "mandatory_annotations"
  | "north_arrow";

export type DrawingFeature = {
  id: string;
  kind: DrawingLayerKind;
  svgElement: string;
  label: string | null;
  labelX: number | null;
  labelY: number | null;
  zIndex: number;
};

export type DrawingTitleBlock = {
  title: string;
  address: string;
  matrikel: string;
  bygherre: string | null;
  sagNr: string | null;
  scale: string;
  paperSize: string;
  date: string;
  revision: string;
  disclaimer: string | null;
  sourceList: string[];
};

export type DrawingModel = {
  page: {
    size: "A3" | "A2" | "A1";
    orientation: "landscape" | "portrait";
    scale: 250 | 500;
    widthMm: number;
    heightMm: number;
  };
  viewport: { bbox25832: [number, number, number, number]; metersPerMm: number };
  features: DrawingFeature[];
  titleBlock: DrawingTitleBlock;
  legend: Array<{ symbol: string; label: string }>;
  northArrowRotationDeg: number;
  readinessStatus: string;
};

export const PAGE_SIZES = {
  A3: { widthMm: 420, heightMm: 297 },
  A2: { widthMm: 594, heightMm: 420 },
  A1: { widthMm: 841, heightMm: 594 },
} as const;

export function computeViewport(
  bbox25832: [number, number, number, number],
  scale: 250 | 500,
): DrawingModel["viewport"] {
  return { bbox25832, metersPerMm: scale / 1000 };
}
