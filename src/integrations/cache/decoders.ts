import { z } from "zod";
import type { SourceResult, SourceStatus, SourceConfidence } from "@/lib/source-result";

// ---------------------------------------------------------------------------
// SourceResult metadata schema (envelope fields — not the payload/data)
// ---------------------------------------------------------------------------

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

/**
 * Decode a raw `address_source_results` DB row into a typed `SourceResult<T>`.
 * Returns null if the row fails schema validation.
 */
export function decodeSourceResultRow<T>(raw: unknown): SourceResult<T> | null {
  const parsed = sourceResultRowSchema.safeParse(raw);
  if (!parsed.success) return null;
  const r = parsed.data;
  return {
    status: r.status as SourceStatus,
    confidence: r.confidence as SourceConfidence,
    isMock: r.is_mock,
    fetchedAt: r.fetched_at,
    sourceUrl: r.source_url,
    rawFeatureCount: r.raw_feature_count,
    data: (r.payload ?? null) as T | null,
    kilde: r.source_kind,
  };
}

// ---------------------------------------------------------------------------
// ComplianceResult shape guard
// ---------------------------------------------------------------------------
// Verifies the key structural property: analysedAt must be a non-empty string.
// Prevents empty cached objects from being returned as valid ComplianceResult.

export function isValidComplianceResultShape(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v["analysedAt"] === "string" && v["analysedAt"].length > 0;
}

// ---------------------------------------------------------------------------
// LokalplanExtract shape guard
// ---------------------------------------------------------------------------

export function isValidLokalplanExtractShape(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return "bebyggelsesprocent" in v || "maxEtager" in v || "maxHoejde" in v || "formaal" in v;
}
