import { z } from "zod";

export const noiseMetricSchema = z.object({
  source: z.enum(["road", "rail", "air", "industry"]),
  ldenDb: z.number().nullable(),
  lnightDb: z.number().nullable(),
  heightM: z.union([z.literal(1.5), z.literal(4), z.null()]),
  model: z.enum(["DK_NORD2000", "EU_CNOSSOS", "unknown"]),
  year: z.number().nullable(),
  coverage: z.enum(["covered", "outside_mapped_area", "source_unavailable", "unknown"]),
});

export const noiseScreeningResultSchema = z.object({
  addressId: z.string(),
  parcelIntersectionUsed: z.boolean(),
  metrics: z.array(noiseMetricSchema),
  highestRisk: z.enum(["ok", "warning", "review_required", "unknown"]),
  requiresAcousticReview: z.boolean().nullable(),
  sourceUrl: z.string(),
  fetchedAt: z.string(),
});

export type NoiseScreeningResultDto = z.infer<typeof noiseScreeningResultSchema>;
