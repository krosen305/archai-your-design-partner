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

import { supabaseAdmin } from '@/integrations/supabase/client.server';
import type { Json } from '@/integrations/supabase/types';
import type { ComplianceResult } from '@/lib/analysis-orchestrator';

const DAYS_MS = (n: number) => n * 24 * 60 * 60 * 1000;

const TTL = {
  lokalplan:  DAYS_MS(30),
  servitut:   DAYS_MS(7),
  compliance: DAYS_MS(30),
  report:     DAYS_MS(30),
};

function isFresh(timestamp: string | null, ttlMs: number): boolean {
  if (!timestamp) return false;
  return Date.now() - new Date(timestamp).getTime() < ttlMs;
}

// ---------------------------------------------------------------------------
// Upsert helper
// ---------------------------------------------------------------------------

async function upsert(addressId: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await supabaseAdmin
    .from('address_analysis')
    .upsert(
      { address_id: addressId, ...patch },
      { onConflict: 'address_id' }
    );
  if (error) console.error('[Cache] upsert fejlede:', error.message);
}

async function getRow(addressId: string) {
  const { data, error } = await supabaseAdmin
    .from('address_analysis')
    .select('*')
    .eq('address_id', addressId)
    .maybeSingle();
  if (error) console.error('[Cache] select fejlede:', error.message);
  return data ?? null;
}

// ---------------------------------------------------------------------------
// Lokalplan extraction
// ---------------------------------------------------------------------------

export async function getCachedLokalplan(
  addressId: string,
  currentPdfUrl?: string
): Promise<Json | null> {
  const row = await getRow(addressId);
  if (!row) return null;
  if (!isFresh(row.lokalplan_extracted_at, TTL.lokalplan)) return null;
  // Invalidate if the PDF URL has changed
  if (currentPdfUrl && row.lokalplan_pdf_url !== currentPdfUrl) return null;
  return row.lokalplan_extracted;
}

export async function setCachedLokalplan(
  addressId: string,
  pdfUrl: string,
  result: Json
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
  if (!isFresh(row.servitut_extracted_at, TTL.servitut)) return null;
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
  if (!isFresh(row.compliance_result_at, TTL.compliance)) return null;
  return row.compliance_result as unknown as ComplianceResult;
}

export async function setCachedCompliance(
  addressId: string,
  result: ComplianceResult
): Promise<void> {
  await upsert(addressId, {
    compliance_result: result as unknown as Json,
    compliance_result_at: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Report text
// ---------------------------------------------------------------------------

export async function getCachedReport(addressId: string): Promise<string | null> {
  const row = await getRow(addressId);
  if (!row) return null;
  if (!isFresh(row.report_generated_at, TTL.report)) return null;
  return row.report_text;
}

export async function setCachedReport(addressId: string, report: string): Promise<void> {
  await upsert(addressId, {
    report_text: report,
    report_generated_at: new Date().toISOString(),
  });
}
