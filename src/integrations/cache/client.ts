// SERVER-SIDE ONLY – uses supabaseAdmin (service role).
//
// Cache service for AI extraction results, keyed by DAWA/DAR address ID.
// Results are shared across users: one address → one cached row.
//
// Staleness rules:
//   lokalplan_extracted  → 30 days  (lokalplaner ændres sjældent)
//   servitut_extracted   → 7 days
//   compliance_result    → 30 days
//   report               → 30 days  (matches compliance_result lifetime)
//   Special: if lokalplan_pdf_url changes, lokalplan cache is busted regardless of age

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import type { ComplianceResult } from "@/lib/analysis-orchestrator";
import type * as GeoJSON from "geojson";
import { toJsonValue } from "@/lib/json-value";
import type { SourceResult } from "@/lib/source-result";
import { CACHE_TTL_DAYS, sourceResultTtlDays, daysToMs } from "@/lib/cache-policy";
import {
  decodeComplianceResult,
  decodeGeoJsonFeatureCollection,
  decodeLokalplanExtract,
  decodeSourceResultRow,
} from "./decoders";

function isFresh(timestamp: string | null, ttlMs: number): boolean {
  if (!timestamp) return false;
  return Date.now() - new Date(timestamp).getTime() < ttlMs;
}

// ---------------------------------------------------------------------------
// Upsert helper
// ---------------------------------------------------------------------------

async function upsert(addressId: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await supabaseAdmin
    .from("address_analysis")
    .upsert({ address_id: addressId, ...patch }, { onConflict: "address_id" });
  if (error) throw new Error(`[Cache] upsert fejlede for ${addressId}: ${error.message}`);
}

async function getRow(addressId: string) {
  const { data, error } = await supabaseAdmin
    .from("address_analysis")
    .select("*")
    .eq("address_id", addressId)
    .maybeSingle();
  if (error) throw new Error(`[Cache] select fejlede for ${addressId}: ${error.message}`);
  return data ?? null;
}

// ---------------------------------------------------------------------------
// Lokalplan extraction
// ---------------------------------------------------------------------------

export async function getCachedLokalplan(
  addressId: string,
  currentPdfUrl?: string,
): Promise<Json | null> {
  const row = await getRow(addressId);
  if (!row) return null;
  if (!isFresh(row.lokalplan_extracted_at, daysToMs(CACHE_TTL_DAYS.lokalplan))) return null;
  // Invalidate if the PDF URL has changed
  if (currentPdfUrl && row.lokalplan_pdf_url !== currentPdfUrl) return null;
  if (row.lokalplan_extracted !== null && !decodeLokalplanExtract(row.lokalplan_extracted)) {
    return null;
  }
  return row.lokalplan_extracted;
}

export async function setCachedLokalplan(
  addressId: string,
  pdfUrl: string,
  result: Json,
): Promise<void> {
  await upsert(addressId, {
    lokalplan_extracted: result,
    lokalplan_extracted_at: new Date().toISOString(),
    lokalplan_pdf_url: pdfUrl,
  });
}

// ---------------------------------------------------------------------------
// Servitut extraction
// ---------------------------------------------------------------------------

export async function getCachedServitut(addressId: string): Promise<Json | null> {
  const row = await getRow(addressId);
  if (!row) return null;
  if (!isFresh(row.servitut_extracted_at, daysToMs(CACHE_TTL_DAYS.servitut))) return null;
  return row.servitut_extracted;
}

export async function setCachedServitut(addressId: string, result: Json): Promise<void> {
  await upsert(addressId, {
    servitut_extracted: result,
    servitut_extracted_at: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Compliance result
// ---------------------------------------------------------------------------

export async function getCachedCompliance(addressId: string): Promise<ComplianceResult | null> {
  const row = await getRow(addressId);
  if (!row) return null;
  if (!isFresh(row.compliance_result_at, daysToMs(CACHE_TTL_DAYS.compliance))) return null;
  return decodeComplianceResult(row.compliance_result);
}

export async function setCachedCompliance(
  addressId: string,
  result: ComplianceResult,
): Promise<void> {
  await upsert(addressId, {
    compliance_result: toJsonValue(result) ?? null,
    compliance_result_at: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Report text
// ---------------------------------------------------------------------------

export async function getCachedReport(addressId: string): Promise<string | null> {
  const row = await getRow(addressId);
  if (!row) return null;
  if (!isFresh(row.report_generated_at, daysToMs(CACHE_TTL_DAYS.report))) return null;
  return row.report_text;
}

export async function setCachedReport(addressId: string, report: string): Promise<void> {
  await upsert(addressId, {
    report_text: report,
    report_generated_at: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Jordstykke polygon (WFS cache)
// ---------------------------------------------------------------------------

export async function getCachedJordstykkePolygon(
  addressId: string,
): Promise<GeoJSON.FeatureCollection | null> {
  const row = await getRow(addressId);
  if (!row) return null;
  if (!isFresh(row.jordstykke_polygon_at, daysToMs(CACHE_TTL_DAYS.jordstykke))) return null;
  return decodeGeoJsonFeatureCollection(row.jordstykke_polygon);
}

export async function setCachedJordstykkePolygon(
  addressId: string,
  featureCollection: GeoJSON.FeatureCollection,
): Promise<void> {
  await upsert(addressId, {
    jordstykke_polygon: toJsonValue(featureCollection) ?? null,
    jordstykke_polygon_at: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// address_source_results cache (ARCH-239)
// ---------------------------------------------------------------------------

export async function getCachedSourceResult<T>(
  addressId: string,
  sourceKind: string,
  payloadSchema?: import("zod").ZodType<T>,
): Promise<SourceResult<T> | null> {
  const { data, error } = await supabaseAdmin
    .from("address_source_results")
    .select("*")
    .eq("address_id", addressId)
    .eq("source_kind", sourceKind)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error)
    throw new Error(
      `[SourceCache] select fejlede for ${addressId}/${sourceKind}: ${error.message}`,
    );
  if (!data) return null;

  return decodeSourceResultRow<T>(data, payloadSchema);
}

export async function setCachedSourceResult<T>(
  addressId: string,
  sourceKind: string,
  result: SourceResult<T>,
  ttlDaysOverride?: number,
): Promise<void> {
  const ttlDays = ttlDaysOverride ?? sourceResultTtlDays(sourceKind);
  const expiresAt = new Date(Date.now() + daysToMs(ttlDays)).toISOString();

  const { error } = await supabaseAdmin.from("address_source_results").upsert(
    {
      address_id: addressId,
      source_kind: sourceKind,
      status: result.status,
      confidence: result.confidence,
      is_mock: result.isMock,
      fetched_at: result.fetchedAt,
      source_url: result.sourceUrl,
      raw_feature_count: result.rawFeatureCount,
      payload: toJsonValue(result.data) ?? null,
      expires_at: expiresAt,
    },
    { onConflict: "address_id,source_kind" },
  );

  if (error) {
    throw new Error(
      `[SourceCache] upsert fejlede for ${addressId}/${sourceKind}: ${error.message}`,
    );
  }
}
