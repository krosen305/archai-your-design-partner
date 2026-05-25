export type Crs25832 = "EPSG:25832";
export type BBox25832 = [number, number, number, number];

export type GeoJsonPoint25832 = {
  type: "Point";
  coordinates: [number, number];
  crs: Crs25832;
};

export type GeoJsonLineString25832 = {
  type: "LineString";
  coordinates: [number, number][];
  crs: Crs25832;
};

export type GeoJsonPolygon25832 = {
  type: "Polygon";
  coordinates: [number, number][][];
  crs: Crs25832;
};

export type DataConfidence = "high" | "medium" | "low" | "unknown";
export type DataSource =
  | "survey"
  | "registry"
  | "cad_upload"
  | "manual"
  | "generated"
  | "estimated";

export type LayerSourceMeta = {
  source: DataSource;
  confidence: DataConfidence;
  fetchedAt: string | null;
  requiresReview: boolean;
};

export type BoundarySegment = {
  id: string;
  start: GeoJsonPoint25832;
  end: GeoJsonPoint25832;
  type: "road" | "neighbor" | "internal" | "unknown";
  source: LayerSourceMeta;
};

export type NeighborParcel = {
  matrikelnummer: string;
  polygon25832: GeoJsonPolygon25832 | null;
  labelPoint25832: GeoJsonPoint25832;
};

export type ParcelLayer = {
  idLokalId: string;
  bfeNr: string;
  matrikelnummer: string;
  ejerlavskode: number;
  ejerlavsnavn: string;
  polygon25832: GeoJsonPolygon25832;
  areaRegisteredM2: number;
  areaGeometryM2: number;
  areaDiscrepancyM2: number;
  boundarySegments: BoundarySegment[];
  neighborParcels: NeighborParcel[];
  labelPoint25832: GeoJsonPoint25832;
  source: LayerSourceMeta;
};

export type TerrainPoint = {
  x: number;
  y: number;
  z: number;
  label: string;
  source: DataSource;
};

export type TerrainLayer = {
  verticalDatum: "DVR90";
  points: TerrainPoint[];
  slopePercent: number | null;
  lowPointM: number | null;
  source: LayerSourceMeta;
};

export type SurveyLayer = {
  uploadedAt: string;
  surveyDate: string | null;
  terrainPoints: TerrainPoint[];
  boundaryPoints: GeoJsonPoint25832[];
  notes: string[];
  source: LayerSourceMeta;
};

export type ExistingBuilding = {
  bbrId: string | null;
  footprint25832: GeoJsonPolygon25832;
  usageCode: string | null;
  areaM2: number;
  sokkelKoteM: number | null;
  source: LayerSourceMeta;
};

export type ExistingFeaturesLayer = {
  buildings: ExistingBuilding[];
  fences: GeoJsonLineString25832[];
  source: LayerSourceMeta;
};

export type ProposedBuildingLayer = {
  footprint25832: GeoJsonPolygon25832;
  rotationDeg: number;
  footprintAreaM2: number;
  storeys: number;
  heightM: number | null;
  sokkelKoteM: number | null;
  source: LayerSourceMeta;
};

export type ConstraintLayer = {
  type:
    | "br18_setback"
    | "localplan_building_line"
    | "road_building_line"
    | "servitut"
    | "building_field";
  geometry25832: GeoJsonPolygon25832 | GeoJsonLineString25832;
  label: string;
  ruleText: string | null;
  source: LayerSourceMeta;
};

export type UtilityLayer = {
  type: "water" | "sewer" | "electric" | "gas" | "rainwater" | "wastewater";
  geometry25832: GeoJsonPoint25832 | GeoJsonLineString25832;
  label: string;
  source: LayerSourceMeta;
};

export type SiteUseLayer = {
  type:
    | "parking"
    | "waste_sorting"
    | "driveway"
    | "geothermal_field"
    | "terrace"
    | "future_structure";
  geometry25832: GeoJsonPolygon25832;
  label: string;
  source: LayerSourceMeta;
};

export type DrawingMetadata = {
  title: string;
  address: string;
  matrikel: string;
  bygherre: string | null;
  sagNr: string | null;
  revision: string;
  date: string;
  scale: 250 | 500;
  paperSize: "A3" | "A2" | "A1";
};

export type BeliggenhedsplanInput = {
  crs: Crs25832;
  parcel: ParcelLayer;
  survey: SurveyLayer | null;
  existing: ExistingFeaturesLayer;
  proposed: ProposedBuildingLayer;
  constraints: ConstraintLayer[];
  utilities: UtilityLayer[];
  siteUse: SiteUseLayer[];
  terrain: TerrainLayer | null;
  metadata: DrawingMetadata;
};
