// src/domain/drawing/beliggenhedsplan.types.ts
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
  roadName: string | null;
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
  surveyorName: string | null;
  surveyorLicenseNr: string | null;
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
  nedrives: boolean;
  source: LayerSourceMeta;
};

export type ExistingFeaturesLayer = {
  buildings: ExistingBuilding[];
  fences: GeoJsonLineString25832[];
  source: LayerSourceMeta;
};

export type DimensionLine = {
  fromPoint: GeoJsonPoint25832;
  toPoint: GeoJsonPoint25832;
  labelM: number;
  side: "north" | "south" | "east" | "west" | "auto";
};

export type ProposedBuildingLayer = {
  footprint25832: GeoJsonPolygon25832;
  rotationDeg: number;
  footprintAreaM2: number;
  storeys: number;
  heightM: number | null;
  sokkelKoteM: number | null;
  finishedFloorKoteM: number | null;
  terrainOffsetM: number | null;
  dimensions: DimensionLine[];
  tagform: "sadeltag" | "fladt" | "mansard" | "pulttag" | null;
  taghaldningGrad: number | null;
  rygningsKoteM: number | null;
  source: LayerSourceMeta;
};

export type ConstraintLayer = {
  type:
    | "br18_setback"
    | "localplan_building_line"
    | "road_boundary_setback"
    | "road_centerline_deklaration"
    | "servitut"
    | "building_field";
  geometry25832: GeoJsonPolygon25832 | GeoJsonLineString25832;
  label: string;
  ruleText: string | null;
  ruleReference: string | null;
  source: LayerSourceMeta;
};

export type UtilityLayer = {
  type:
    | "water"
    | "sewer"
    | "electric"
    | "gas"
    | "rainwater"
    | "wastewater"
    | "inspection_well"
    | "sand_trap"
    | "rat_barrier";
  geometry25832: GeoJsonPoint25832 | GeoJsonLineString25832;
  label: string;
  dkKoteM: number | null;
  diameterMm: number | null;
  lineStyle: "solid" | "dashed" | "dotted" | null;
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
  widthM: number | null;
  isExisting: boolean;
  permitRequired: boolean | null;
  legalBasis: "br18_notification" | "br18_permit_required" | null;
  note: string | null;
  hatchPattern: "diagonal" | "cross" | "dots" | null;
  source: LayerSourceMeta;
};

// --- New layer types for authority-grade drawing ---

export type VejLayer = {
  vejnavn: string;
  centerline25832: GeoJsonLineString25832 | null;
  vejkant25832: GeoJsonLineString25832 | null;
  vejbreddeM: number | null;
  source: LayerSourceMeta;
};

export type NaturbeskyttelseType =
  | "strandbeskyttelse"
  | "skovbyggelinje"
  | "åbeskyttelse"
  | "fortidsmindebeskyttelse"
  | "klitfredning";

export type NaturbeskyttelseLayer = {
  type: NaturbeskyttelseType;
  geometry25832: GeoJsonPolygon25832 | GeoJsonLineString25832;
  bufferDistanceM: number;
  intersectsProposedBuilding: boolean;
  source: LayerSourceMeta;
};

export type LerLedningType =
  | "kloak_spildevand"
  | "kloak_regnvand"
  | "kloak_faelles"
  | "vand"
  | "el"
  | "naturgas"
  | "fjernvarme"
  | "telekom";

export type LerLedning = {
  type: LerLedningType;
  geometry25832: GeoJsonLineString25832;
  ejer: string | null;
  dybdeM: number | null;
  diameterMm: number | null;
  source: LayerSourceMeta;
};

export type RevisionEntry = {
  nr: string;
  description: string;
  date: string;
  by: string;
};

export type AreaTable = {
  grundarealM2: number;
  groundFloorM2: number;
  firstFloorM2: number | null;
  doubleHeightDeductionM2: number;
  totalResidentialM2: number;
  coveragePercent: number;
  calculationBasis: string;
};

export type MandatoryAnnotations = {
  koteDatum: string | null;
  terrainSurveyedBy: string | null;
  sewerResponsibility: string | null;
  ratBarrierNote: string | null;
};

export type DrawingMetadata = {
  title: string;
  address: string;
  matrikel: string;
  bfeNr: string | null;
  bygherre: string | null;
  sagNr: string | null;
  buildingCode: "BR18" | "BR20" | null;
  draughtsman: string | null;
  responsibleFirm: string | null;
  revisions: RevisionEntry[];
  areaTable: AreaTable | null;
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
  mandatoryAnnotations: MandatoryAnnotations;
  vej: VejLayer | null;
  naturbeskyttelse: NaturbeskyttelseLayer[];
  lerLedninger: LerLedning[];
  kloakoplandType: "separat" | "faelles" | null;
};
