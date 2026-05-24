import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { wgs84ToUtm32 } from "@/lib/geometry-utils";
import { makeErrorResult, makeMockResult, makeOkResult } from "@/lib/source-result";
import type { SourceResult } from "@/lib/source-result";
import { z } from "zod";

const GEUS_WFS = "https://data.geus.dk/geusmap/ows/25832.jsp";
const GROUNDWATER_RADIUS_M = 500;
const MAX_GROUNDWATER_FEATURES = 50;

const nullableNumberSchema = z.preprocess((value) => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value.replace(",", "."));
  return value;
}, z.number().finite().nullable());

const nullableStringSchema = z.preprocess((value) => {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}, z.string().nullable());

const jupiterPejlingFeatureSchema = z
  .object({
    geometry: z
      .object({
        coordinates: z.tuple([z.number(), z.number()]).optional(),
      })
      .passthrough()
      .optional(),
    properties: z
      .object({
        borid: z.union([z.string(), z.number()]).optional(),
        dgu_nr: nullableStringSchema.optional(),
        url_borerapport: nullableStringSchema.optional(),
        vsp_mtu_seneste: nullableNumberSchema.optional(),
        terraen_kote: nullableNumberSchema.optional(),
        kote_seneste: nullableNumberSchema.optional(),
        indtags_bjergart: nullableStringSchema.optional(),
        xutm32euref89: nullableNumberSchema.optional(),
        yutm32euref89: nullableNumberSchema.optional(),
      })
      .passthrough(),
  })
  .passthrough()
  .transform((feature) => {
    const x = feature.properties.xutm32euref89 ?? feature.geometry?.coordinates?.[0] ?? null;
    const y = feature.properties.yutm32euref89 ?? feature.geometry?.coordinates?.[1] ?? null;
    return {
      borid:
        typeof feature.properties.borid === "number"
          ? `${feature.properties.borid}`
          : (feature.properties.borid ?? null),
      dguNr: feature.properties.dgu_nr ?? null,
      reportUrl: feature.properties.url_borerapport ?? null,
      groundwaterDepthM: feature.properties.vsp_mtu_seneste ?? null,
      terrainKoteM: feature.properties.terraen_kote ?? null,
      latestWaterKoteM: feature.properties.kote_seneste ?? null,
      jordart: feature.properties.indtags_bjergart ?? null,
      x,
      y,
    };
  });

const jupiterPejlingerResponseSchema = z.object({
  features: z.array(jupiterPejlingFeatureSchema).default([]),
});

type JupiterPejling = z.infer<typeof jupiterPejlingFeatureSchema>;

export type GeusRiskData = {
  radonRisk: "low" | "medium" | "high" | "unknown";
  groundwaterDepthM: number | null;
  groundwaterDataSource: string | null;
  groundwaterDepthWinterM: number | null;
  groundwaterDepthSummerM: number | null;
  groundwaterModelUncertaintyM: number | null;
  geoteknikJordart: string | null;
  kilde: "geus" | "mock";
};

type GroundwaterFetchResult = {
  depthM: number | null;
  boringId: string | null;
  jordart: string | null;
  featureCount: number;
};

function buildGroundwaterUrl(lat: number, lng: number): string {
  const { x, y } = wgs84ToUtm32(lat, lng);
  const minX = x - GROUNDWATER_RADIUS_M;
  const minY = y - GROUNDWATER_RADIUS_M;
  const maxX = x + GROUNDWATER_RADIUS_M;
  const maxY = y + GROUNDWATER_RADIUS_M;

  return (
    `${GEUS_WFS}?SERVICE=WFS&VERSION=1.0.0&REQUEST=GetFeature` +
    `&TYPENAME=jupiter_pejlinger&SRSNAME=EPSG:25832` +
    `&BBOX=${minX},${minY},${maxX},${maxY},EPSG:25832` +
    `&MAXFEATURES=${MAX_GROUNDWATER_FEATURES}&OUTPUTFORMAT=geojson`
  );
}

function getDistanceSquared(
  point: { x: number; y: number },
  candidate: Pick<JupiterPejling, "x" | "y">,
): number {
  if (candidate.x === null || candidate.y === null) return Number.POSITIVE_INFINITY;
  return (candidate.x - point.x) ** 2 + (candidate.y - point.y) ** 2;
}

function selectNearestGroundwaterFeature(
  features: JupiterPejling[],
  point: { x: number; y: number },
): JupiterPejling | null {
  const withDepth = features.filter((feature) => feature.groundwaterDepthM !== null);
  if (withDepth.length === 0) return null;

  return withDepth.reduce<JupiterPejling | null>((nearest, feature) => {
    if (!nearest) return feature;
    return getDistanceSquared(point, feature) < getDistanceSquared(point, nearest)
      ? feature
      : nearest;
  }, null);
}

async function fetchGroundwater(lat: number, lng: number): Promise<GroundwaterFetchResult> {
  const response = await fetch(buildGroundwaterUrl(lat, lng), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok) throw new Error(`GEUS Jupiter WFS HTTP ${response.status}`);

  const raw = await response.json();
  const data = jupiterPejlingerResponseSchema.parse(raw);
  const point = wgs84ToUtm32(lat, lng);
  const nearest = selectNearestGroundwaterFeature(data.features, point);

  if (!nearest) {
    return {
      depthM: null,
      boringId: null,
      jordart: null,
      featureCount: data.features.length,
    };
  }

  return {
    depthM:
      nearest.groundwaterDepthM !== null ? Math.round(nearest.groundwaterDepthM * 10) / 10 : null,
    boringId: nearest.dguNr ?? nearest.borid ?? nearest.reportUrl ?? null,
    jordart: nearest.jordart,
    featureCount: data.features.length,
  };
}

export const GeusService = {
  async getRiskData(lat: number, lng: number): Promise<SourceResult<GeusRiskData>> {
    if (FEATURE_FLAGS.geusMock) {
      return makeMockResult(
        {
          radonRisk: "medium",
          groundwaterDepthM: 3.8,
          groundwaterDataSource: "DGU-boring 199.3042",
          groundwaterDepthWinterM: 3.4,
          groundwaterDepthSummerM: 3.8,
          groundwaterModelUncertaintyM: 0.6,
          geoteknikJordart: "Moræneler",
          kilde: "mock",
        },
        { kilde: "geus", sourceUrl: GEUS_WFS, rawFeatureCount: 1, confidence: "estimated" },
      );
    }

    try {
      const groundwater = await fetchGroundwater(lat, lng);

      return makeOkResult(
        {
          radonRisk: "unknown",
          groundwaterDepthM: groundwater.depthM,
          groundwaterDataSource: groundwater.boringId,
          groundwaterDepthWinterM: groundwater.depthM,
          groundwaterDepthSummerM: groundwater.depthM,
          groundwaterModelUncertaintyM: null,
          geoteknikJordart: groundwater.jordart,
          kilde: "geus",
        },
        {
          kilde: "geus",
          sourceUrl: GEUS_WFS,
          rawFeatureCount: groundwater.featureCount,
          confidence: "unknown",
        },
      );
    } catch (error) {
      return makeErrorResult<GeusRiskData>(error, { kilde: "geus", sourceUrl: GEUS_WFS });
    }
  },
};
