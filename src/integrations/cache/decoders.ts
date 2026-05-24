import { z } from "zod";
import type * as GeoJSON from "geojson";
import type { ComplianceResult } from "@/lib/analysis-orchestrator";
import type { SourceResult } from "@/lib/source-result";
import {
  fjernvarmeResultatSchema,
  lokalplanExtractSchema,
  matParcelGeometryPayloadSchema,
  neighborBuildingDataSchema,
  ruleEngineBbrDataSchema,
  ruleEngineDkJordResultatSchema,
  ruleEngineFbbResultSchema,
  ruleEngineGeusRiskDataSchema,
  ruleEngineKommuneplanrammeSchema,
  ruleEngineLokalplanSchema,
  ruleEngineNaturbeskyttelsesResultatSchema,
  ruleEnginePlandataContextSchema,
  ruleEngineTerrainDataSchema,
  ruleEngineTinglysningResultSchema,
  vurDataSchema,
} from "@/types/project-restore.schemas";

const sourceStatusSchema = z.enum(["ok", "error", "skipped", "mock"]);
const sourceConfidenceSchema = z.enum(["confirmed", "estimated", "missing", "unknown"]);

export const sourceResultRowSchema = z.object({
  status: sourceStatusSchema,
  confidence: sourceConfidenceSchema,
  is_mock: z.boolean(),
  fetched_at: z.string(),
  source_url: z.string().nullable(),
  raw_feature_count: z.number().int().nullable(),
  payload: z.unknown().nullable(),
  source_kind: z.string(),
});

export type SourceResultRow = z.infer<typeof sourceResultRowSchema>;

export function decodeSourceResultRow<T>(
  raw: unknown,
  payloadSchema?: z.ZodType<T>,
): SourceResult<T> | null {
  const parsed = sourceResultRowSchema.safeParse(raw);
  if (!parsed.success) return null;

  const payloadResult =
    parsed.data.payload === null
      ? { success: true as const, data: null }
      : payloadSchema
        ? payloadSchema.safeParse(parsed.data.payload)
        : { success: true as const, data: parsed.data.payload as T };

  if (!payloadResult.success) return null;

  return {
    status: parsed.data.status,
    confidence: parsed.data.confidence,
    isMock: parsed.data.is_mock,
    fetchedAt: parsed.data.fetched_at,
    sourceUrl: parsed.data.source_url,
    rawFeatureCount: parsed.data.raw_feature_count,
    data: payloadResult.data,
    kilde: parsed.data.source_kind,
  };
}

const dataSourceKindSchema = z.enum([
  "bbr",
  "lokalplaner",
  "kommuneplanramme",
  "fbb",
  "naturbeskyttelse",
  "dkjord",
  "geusRisk",
  "servitutter",
  "terrain",
  "fjernvarme",
  "naboer",
  "matGeometri",
  "vurdering",
  "byggeanalyse",
  "billedanalyse",
  "husDna",
]);

const pipelineServiceStateSchema = z.enum([
  "success",
  "no_hit",
  "error",
  "skipped",
  "mock",
  "cache_hit",
  "not_run",
]);

const complianceResultSchema = z
  .object({
    bbr: ruleEngineBbrDataSchema.nullable(),
    lokalplaner: z.array(ruleEngineLokalplanSchema),
    kommuneplanramme: ruleEngineKommuneplanrammeSchema.nullable(),
    analysedAt: z.string().min(1),
    lokalplanExtract: lokalplanExtractSchema.nullable(),
    naturbeskyttelse: ruleEngineNaturbeskyttelsesResultatSchema.nullable(),
    dkjord: ruleEngineDkJordResultatSchema.nullable(),
    geusRisk: ruleEngineGeusRiskDataSchema.nullable(),
    servitutter: ruleEngineTinglysningResultSchema.nullable(),
    terrain: ruleEngineTerrainDataSchema.nullable(),
    naboer: neighborBuildingDataSchema.nullable(),
    fjernvarme: fjernvarmeResultatSchema.nullable(),
    fbbData: ruleEngineFbbResultSchema.nullable(),
    plandataContext: ruleEnginePlandataContextSchema.nullable().optional(),
    matGeometri: matParcelGeometryPayloadSchema.nullable(),
    vurderingData: vurDataSchema.nullable(),
    analysisRunId: z.string().nullable().optional(),
    serviceStates: z.record(dataSourceKindSchema, pipelineServiceStateSchema).optional(),
  })
  .passthrough();

export function decodeComplianceResult(value: unknown): ComplianceResult | null {
  const parsed = complianceResultSchema.safeParse(value);
  return parsed.success ? (parsed.data as ComplianceResult) : null;
}

export function decodeLokalplanExtract(value: unknown) {
  const parsed = lokalplanExtractSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

const geoJsonGeometrySchema = z
  .object({
    type: z.string(),
    coordinates: z.unknown(),
  })
  .passthrough();

const geoJsonFeatureSchema = z
  .object({
    type: z.literal("Feature"),
    geometry: geoJsonGeometrySchema.nullable(),
    properties: z.record(z.unknown()).nullable().optional(),
    id: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();

const geoJsonFeatureCollectionSchema = z
  .object({
    type: z.literal("FeatureCollection"),
    features: z.array(geoJsonFeatureSchema),
  })
  .passthrough();

export function decodeGeoJsonFeatureCollection(value: unknown): GeoJSON.FeatureCollection | null {
  const parsed = geoJsonFeatureCollectionSchema.safeParse(value);
  return parsed.success ? (parsed.data as GeoJSON.FeatureCollection) : null;
}
