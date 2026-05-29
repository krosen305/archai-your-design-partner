import { z } from "zod";
import type * as GeoJSON from "geojson";
import type {
  GeoDanmarkBuildingFeature,
  GeoDanmarkRoadCenterline,
  GeoDanmarkSiteContext,
} from "./geodanmark.types";

const positionSchema: z.ZodType<GeoJSON.Position> = z.array(z.number()).min(2);
const bboxSchema: z.ZodType<GeoJSON.BBox> = z.union([
  z.tuple([z.number(), z.number(), z.number(), z.number()]),
  z.tuple([z.number(), z.number(), z.number(), z.number(), z.number(), z.number()]),
]);

const polygonSchema: z.ZodType<GeoJSON.Polygon> = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(z.array(positionSchema)),
  bbox: bboxSchema.optional(),
});

const multiPolygonSchema: z.ZodType<GeoJSON.MultiPolygon> = z.object({
  type: z.literal("MultiPolygon"),
  coordinates: z.array(z.array(z.array(positionSchema))),
  bbox: bboxSchema.optional(),
});

const lineStringSchema: z.ZodType<GeoJSON.LineString> = z.object({
  type: z.literal("LineString"),
  coordinates: z.array(positionSchema),
  bbox: bboxSchema.optional(),
});

const multiLineStringSchema: z.ZodType<GeoJSON.MultiLineString> = z.object({
  type: z.literal("MultiLineString"),
  coordinates: z.array(z.array(positionSchema)),
  bbox: bboxSchema.optional(),
});

export const geoDanmarkPolygonGeometrySchema = z.union([polygonSchema, multiPolygonSchema]);
export const geoDanmarkLineGeometrySchema = z.union([lineStringSchema, multiLineStringSchema]);

export const geoDanmarkBuildingFeatureSchema: z.ZodType<GeoDanmarkBuildingFeature> = z.object({
  sourceId: z.string(),
  bbrUuid: z.string().nullable(),
  geometry: geoDanmarkPolygonGeometrySchema,
  footprintAreaM2: z.number().nullable(),
  distanceToParcelM: z.number().nullable(),
  relationToParcel: z.enum(["own", "neighbor", "unknown"]),
  geometrySource: z.literal("geodanmark"),
});

export const geoDanmarkRoadCenterlineSchema: z.ZodType<GeoDanmarkRoadCenterline> = z.object({
  sourceId: z.string(),
  geometry: geoDanmarkLineGeometrySchema,
  distanceToParcelM: z.number().nullable(),
  geometrySource: z.literal("geodanmark"),
});

export const geoDanmarkSiteContextSchema: z.ZodType<GeoDanmarkSiteContext> = z.object({
  ownBuildings: z.array(geoDanmarkBuildingFeatureSchema),
  neighborBuildings: z.array(geoDanmarkBuildingFeatureSchema),
  roadCenterlines: z.array(geoDanmarkRoadCenterlineSchema),
  coverage: z.enum(["covered", "source_unavailable", "unknown"]),
});
