// src/domain/drawing/beliggenhedsplan.schemas.ts
import { z } from "zod";

const Crs25832Schema = z.literal("EPSG:25832");

export const GeoJsonPoint25832Schema = z.object({
  type: z.literal("Point"),
  coordinates: z.tuple([z.number(), z.number()]),
  crs: Crs25832Schema,
});

export const GeoJsonLineString25832Schema = z.object({
  type: z.literal("LineString"),
  coordinates: z.array(z.tuple([z.number(), z.number()])).min(2),
  crs: Crs25832Schema,
});

export const GeoJsonPolygon25832Schema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))).min(1),
  crs: Crs25832Schema,
});

const DataConfidenceSchema = z.enum(["high", "medium", "low", "unknown"]);
const DataSourceSchema = z.enum([
  "survey",
  "registry",
  "cad_upload",
  "manual",
  "generated",
  "estimated",
]);

const LayerSourceMetaSchema = z.object({
  source: DataSourceSchema,
  confidence: DataConfidenceSchema,
  fetchedAt: z.string().nullable(),
  requiresReview: z.boolean(),
  reviewReasons: z.array(z.string()).optional(),
});

const BoundarySegmentSchema = z.object({
  id: z.string(),
  start: GeoJsonPoint25832Schema,
  end: GeoJsonPoint25832Schema,
  type: z.enum(["road", "neighbor", "internal", "unknown"]),
  source: LayerSourceMetaSchema,
});

const NeighborParcelSchema = z.object({
  matrikelnummer: z.string(),
  polygon25832: GeoJsonPolygon25832Schema.nullable(),
  labelPoint25832: GeoJsonPoint25832Schema,
});

export const ParcelLayerSchema = z.object({
  idLokalId: z.string(),
  bfeNr: z.string(),
  matrikelnummer: z.string(),
  ejerlavskode: z.number(),
  ejerlavsnavn: z.string(),
  polygon25832: GeoJsonPolygon25832Schema,
  areaRegisteredM2: z.number().positive(),
  areaGeometryM2: z.number().positive(),
  areaDiscrepancyM2: z.number(),
  boundarySegments: z.array(BoundarySegmentSchema),
  neighborParcels: z.array(NeighborParcelSchema),
  labelPoint25832: GeoJsonPoint25832Schema,
  roadName: z.string().nullable(),
  source: LayerSourceMetaSchema,
});

export const SurveyLayerSchema = z.object({
  uploadedAt: z.string(),
  surveyDate: z.string().nullable(),
  surveyorName: z.string().nullable(),
  surveyorLicenseNr: z.string().nullable(),
  terrainPoints: z.array(
    z.object({
      x: z.number(),
      y: z.number(),
      z: z.number(),
      label: z.string(),
      source: DataSourceSchema,
    }),
  ),
  boundaryPoints: z.array(GeoJsonPoint25832Schema),
  notes: z.array(z.string()),
  source: LayerSourceMetaSchema,
});

export const ExistingFeaturesLayerSchema = z.object({
  buildings: z.array(
    z.object({
      bbrId: z.string().nullable(),
      footprint25832: GeoJsonPolygon25832Schema,
      usageCode: z.string().nullable(),
      areaM2: z.number(),
      sokkelKoteM: z.number().nullable(),
      nedrives: z.boolean().default(false),
      source: LayerSourceMetaSchema,
    }),
  ),
  fences: z.array(GeoJsonLineString25832Schema),
  source: LayerSourceMetaSchema,
});

const DimensionLineSchema = z.object({
  fromPoint: GeoJsonPoint25832Schema,
  toPoint: GeoJsonPoint25832Schema,
  labelM: z.number(),
  side: z.enum(["north", "south", "east", "west", "auto"]),
});

export const ProposedBuildingLayerSchema = z.object({
  footprint25832: GeoJsonPolygon25832Schema,
  rotationDeg: z.number(),
  footprintAreaM2: z.number().positive(),
  storeys: z.number().int().positive(),
  heightM: z.number().nullable(),
  sokkelKoteM: z.number().nullable(),
  finishedFloorKoteM: z.number().nullable(),
  terrainOffsetM: z.number().nullable(),
  dimensions: z.array(DimensionLineSchema),
  tagform: z.enum(["sadeltag", "fladt", "mansard", "pulttag"]).nullable(),
  taghaldningGrad: z.number().min(0).max(60).nullable(),
  rygningsKoteM: z.number().nullable(),
  source: LayerSourceMetaSchema,
});

export const ConstraintLayerSchema = z.object({
  type: z.enum([
    "br18_setback",
    "localplan_building_line",
    "road_boundary_setback",
    "road_centerline_deklaration",
    "servitut",
    "building_field",
  ]),
  geometry25832: z.union([GeoJsonPolygon25832Schema, GeoJsonLineString25832Schema]),
  label: z.string(),
  ruleText: z.string().nullable(),
  ruleReference: z.string().nullable(),
  source: LayerSourceMetaSchema,
});

export const UtilityLayerSchema = z.object({
  type: z.enum([
    "water",
    "sewer",
    "electric",
    "gas",
    "rainwater",
    "wastewater",
    "inspection_well",
    "sand_trap",
    "rat_barrier",
  ]),
  geometry25832: z.union([GeoJsonPoint25832Schema, GeoJsonLineString25832Schema]),
  label: z.string(),
  dkKoteM: z.number().nullable(),
  diameterMm: z.number().nullable(),
  lineStyle: z.enum(["solid", "dashed", "dotted"]).nullable(),
  source: LayerSourceMetaSchema,
});

export const SiteUseLayerSchema = z.object({
  type: z.enum([
    "parking",
    "waste_sorting",
    "driveway",
    "geothermal_field",
    "terrace",
    "future_structure",
  ]),
  geometry25832: GeoJsonPolygon25832Schema,
  label: z.string(),
  widthM: z.number().nullable(),
  isExisting: z.boolean(),
  permitRequired: z.boolean().nullable(),
  legalBasis: z.enum(["br18_notification", "br18_permit_required"]).nullable(),
  note: z.string().nullable(),
  hatchPattern: z.enum(["diagonal", "cross", "dots"]).nullable(),
  source: LayerSourceMetaSchema,
});

export const TerrainLayerSchema = z.object({
  verticalDatum: z.literal("DVR90"),
  points: z.array(
    z.object({
      x: z.number(),
      y: z.number(),
      z: z.number(),
      label: z.string(),
      source: DataSourceSchema,
    }),
  ),
  slopePercent: z.number().nullable(),
  lowPointM: z.number().nullable(),
  source: LayerSourceMetaSchema,
});

export const VejLayerSchema = z.object({
  vejnavn: z.string().nullable(),
  centerline25832: GeoJsonLineString25832Schema.nullable(),
  vejkant25832: z.array(GeoJsonLineString25832Schema),
  vejbreddeM: z.number().positive().nullable(),
  source: LayerSourceMetaSchema,
});

export const NaturbeskyttelseLayerSchema = z.object({
  type: z.enum([
    "strandbeskyttelse",
    "skovbyggelinje",
    "åbeskyttelse",
    "fortidsmindebeskyttelse",
    "klitfredning",
  ]),
  geometry25832: z.union([GeoJsonPolygon25832Schema, GeoJsonLineString25832Schema]),
  bufferDistanceM: z.number(),
  intersectsProposedBuilding: z.boolean(),
  source: LayerSourceMetaSchema,
});

export const LerLedningSchema = z.object({
  type: z.enum([
    "kloak_spildevand",
    "kloak_regnvand",
    "kloak_faelles",
    "vand",
    "el",
    "naturgas",
    "fjernvarme",
    "telekom",
  ]),
  geometry25832: GeoJsonLineString25832Schema,
  ejer: z.string().nullable(),
  dybdeM: z.number().nullable(),
  diameterMm: z.number().nullable(),
  source: LayerSourceMetaSchema,
});

const FjernvarmeSourceKindSchema = z.enum([
  "forsyningsomraade",
  "tilslutningspligtomraade",
  "forsyningsforbudomraade",
  "varmeplansomraade",
]);

const FjernvarmeSchema = z
  .object({
    fjernvarmeDaekket: z.boolean().nullable(),
    fjernvarmePlanlagt: z.boolean().nullable(),
    tilslutningspligt: z.boolean().nullable(),
    forsyningsforbud: z.boolean().nullable(),
    forsyningsselskabNavn: z.string().nullable(),
    forsyningsselskabCvr: z.string().nullable(),
    planNavn: z.string().nullable(),
    delomraadeNavn: z.string().nullable(),
    vedtagetDato: z.string().nullable(),
    konverteringStartAar: z.number().nullable(),
    konverteringSlutAar: z.number().nullable(),
    dokumentUrl: z.string().nullable(),
    sourceKinds: z.array(FjernvarmeSourceKindSchema),
    confidence: z.enum(["confirmed", "estimated", "missing", "unknown"]),
    hits: z.array(z.unknown()),
    fejl: z.string().nullable(),
  })
  .passthrough();

const RevisionEntrySchema = z.object({
  nr: z.string(),
  description: z.string(),
  date: z.string(),
  by: z.string(),
});

const AreaTableSchema = z.object({
  grundarealM2: z.number(),
  groundFloorM2: z.number(),
  firstFloorM2: z.number().nullable(),
  doubleHeightDeductionM2: z.number(),
  totalResidentialM2: z.number(),
  coveragePercent: z.number(),
  calculationBasis: z.string(),
});

export const DrawingMetadataSchema = z.object({
  title: z.string().min(1),
  address: z.string().min(1),
  matrikel: z.string().min(1),
  bfeNr: z.string().nullable(),
  bygherre: z.string().nullable(),
  sagNr: z.string().nullable(),
  buildingCode: z.enum(["BR18", "BR20"]).nullable(),
  draughtsman: z.string().nullable(),
  responsibleFirm: z.string().nullable(),
  revisions: z.array(RevisionEntrySchema),
  areaTable: AreaTableSchema.nullable(),
  date: z.string(),
  scale: z.union([z.literal(250), z.literal(500)]),
  paperSize: z.enum(["A3", "A2", "A1"]),
});

const MandatoryAnnotationsSchema = z.object({
  koteDatum: z.string().nullable(),
  terrainSurveyedBy: z.string().nullable(),
  sewerResponsibility: z.string().nullable(),
  ratBarrierNote: z.string().nullable(),
});

export const BeliggenhedsplanInputSchema = z.object({
  crs: Crs25832Schema,
  parcel: ParcelLayerSchema,
  survey: SurveyLayerSchema.nullable(),
  existing: ExistingFeaturesLayerSchema,
  proposed: ProposedBuildingLayerSchema,
  constraints: z.array(ConstraintLayerSchema),
  utilities: z.array(UtilityLayerSchema),
  siteUse: z.array(SiteUseLayerSchema),
  terrain: TerrainLayerSchema.nullable(),
  metadata: DrawingMetadataSchema,
  mandatoryAnnotations: MandatoryAnnotationsSchema,
  vej: VejLayerSchema.nullable(),
  naturbeskyttelse: z.array(NaturbeskyttelseLayerSchema),
  lerLedninger: z.array(LerLedningSchema),
  kloakoplandType: z.enum(["separat", "faelles"]).nullable(),
  fjernvarme: FjernvarmeSchema.nullable().optional().default(null),
});
