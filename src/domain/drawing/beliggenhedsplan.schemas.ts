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
  source: LayerSourceMetaSchema,
});

export const SurveyLayerSchema = z.object({
  uploadedAt: z.string(),
  surveyDate: z.string().nullable(),
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
      source: LayerSourceMetaSchema,
    }),
  ),
  fences: z.array(GeoJsonLineString25832Schema),
  source: LayerSourceMetaSchema,
});

export const ProposedBuildingLayerSchema = z.object({
  footprint25832: GeoJsonPolygon25832Schema,
  rotationDeg: z.number(),
  footprintAreaM2: z.number().positive(),
  storeys: z.number().int().positive(),
  heightM: z.number().nullable(),
  sokkelKoteM: z.number().nullable(),
  source: LayerSourceMetaSchema,
});

export const ConstraintLayerSchema = z.object({
  type: z.enum([
    "br18_setback",
    "localplan_building_line",
    "road_building_line",
    "servitut",
    "building_field",
  ]),
  geometry25832: z.union([GeoJsonPolygon25832Schema, GeoJsonLineString25832Schema]),
  label: z.string(),
  ruleText: z.string().nullable(),
  source: LayerSourceMetaSchema,
});

export const DrawingMetadataSchema = z.object({
  title: z.string().min(1),
  address: z.string().min(1),
  matrikel: z.string().min(1),
  bygherre: z.string().nullable(),
  sagNr: z.string().nullable(),
  revision: z.string(),
  date: z.string(),
  scale: z.union([z.literal(250), z.literal(500)]),
  paperSize: z.enum(["A3", "A2", "A1"]),
});

export const BeliggenhedsplanInputSchema = z.object({
  crs: Crs25832Schema,
  parcel: ParcelLayerSchema,
  survey: SurveyLayerSchema.nullable(),
  existing: ExistingFeaturesLayerSchema,
  proposed: ProposedBuildingLayerSchema,
  constraints: z.array(ConstraintLayerSchema),
  utilities: z.array(z.unknown()),
  siteUse: z.array(z.unknown()),
  terrain: z.unknown().nullable(),
  metadata: DrawingMetadataSchema,
});
