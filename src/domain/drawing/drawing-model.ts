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
  | "road_centerline"
  | "road_edge"
  | "road_label"
  | "nature_protection"
  | "scale_bar"
  | "mandatory_annotations"
  | "north_arrow"
  | "road_fill"
  | "naturbeskyttelse_zones"
  | "ler_lines"
  | "placeholder"
  | "watermark";

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
  drawingType: string; // "Beliggenhedsplan"
  tegnNr: string; // drawing number, e.g. "1"
  address: string;
  matrikel: string;
  bfeNr: string | null;
  bygherre: string | null;
  sagNr: string | null;
  buildingCode: "BR18" | "BR20" | null;
  scale: string;
  paperSize: string;
  date: string;
  revision: string;
  disclaimer: string | null;
};

// --- Structured info-panel sections (left column of the sheet) -------------
// These carry typed data, never pre-rendered SVG. The renderer owns layout;
// the domain owns what data exists and whether it is documented.

export type SiteMetricRow = {
  label: string;
  /** Raw value in m² (or percent for coverage); null = not documented. */
  value: number | null;
  /** Render-ready Danish-formatted string, or "ikke dokumenteret". */
  display: string;
  documented: boolean;
};

export type SiteMetrics = {
  grundarealM2: number | null;
  bebyggetArealM2: number | null;
  etagearealM2: number | null;
  bebyggelsesprocent: number | null;
  calculationBasis: string;
  rows: SiteMetricRow[];
};

export type SourceRegisterEntry = {
  /** Human label, e.g. "Matrikel (MAT WFS)". */
  label: string;
  source: string; // DataSource
  confidence: string; // DataConfidence
  fetchedAt: string | null;
  documented: boolean;
};

export type TerrainSummary = {
  koteDatum: string | null;
  sokkelKoteDisplay: string;
  gulvKoteDisplay: string;
  rygningsKoteDisplay: string;
  terrainPointCount: number;
  documented: boolean;
  /** Set when no terrain data exists at all. */
  note: string | null;
};

export type TechnicalNoteCategory =
  | "kote"
  | "kloak"
  | "rottespaerre"
  | "overkoersel"
  | "regnvand"
  | "ledning"
  | "generel";

export type TechnicalNote = {
  category: TechnicalNoteCategory;
  text: string;
};

export type MissingDataSeverity = "blocking" | "placeholder" | "estimat";

export type MissingDataWarning = {
  label: string;
  responsibleParty: string | null;
  blocksSubmission: boolean;
  severity: MissingDataSeverity;
};

export type InfoPanel = {
  siteMetrics: SiteMetrics;
  sourceRegister: SourceRegisterEntry[];
  terrain: TerrainSummary;
  technicalNotes: TechnicalNote[];
  missingDataWarnings: MissingDataWarning[];
  /** e.g. "UDKAST — 4 punkter mangler", or null when ready. */
  completenessStatus: string | null;
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
  infoPanel: InfoPanel;
  legend: Array<{ symbol: string; label: string }>;
  /** Rotation of the north arrow itself (deg). 0 when geometry is pre-rotated to true north. */
  northArrowRotationDeg: number;
  /** How far the EPSG:25832 grid was rotated about the centroid to reach geographic north. */
  projectionRotationDeg: number;
  readinessStatus: string;
};

export const PAGE_SIZES = {
  A3: { widthMm: 420, heightMm: 297 },
  A2: { widthMm: 594, heightMm: 420 },
  A1: { widthMm: 841, heightMm: 594 },
} as const;

export function computeViewport(
  bbox25832: [number, number, number, number],
  metersPerMm: number,
): DrawingModel["viewport"] {
  return { bbox25832, metersPerMm };
}
