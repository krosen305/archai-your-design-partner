// SERVER-SIDE ONLY – never import this from browser code.
//
// Cache-first orchestrator for address analysis.
// Checks Supabase before making any AI or data API calls.
// Each layer (BBR/Plandata, lokalplan PDF, servitut) is cached independently.
//
// A returning user for a previously-analysed address pays $0.00 in AI costs.
//
// Current layer status:
//   compliance_result  ✅  BBR + MAT + Plandata pipeline (live)
//   lokalplan_extracted ⏳  ARCH-25 (lokalplan PDF parser not yet built)
//   servitut_extracted  ⏳  ARCH-26 (Tinglysning parser not yet built)
//   report_text         ⏳  ARCH-27 (AI compliance summarizer not yet built)

import type { BbrKompliantData } from '@/integrations/bbr/client';
import type { Lokalplan, Kommuneplanramme } from '@/integrations/plandata/client';
import {
  getCachedCompliance,
  setCachedCompliance,
} from '@/integrations/cache/client';

// ---------------------------------------------------------------------------
// Shared ComplianceResult type (ARCH-6)
// ---------------------------------------------------------------------------

export type ComplianceResult = {
  bbr: BbrKompliantData | null;
  lokalplaner: Lokalplan[];
  kommuneplanramme: Kommuneplanramme | null;
  analysedAt: string;
};

// ---------------------------------------------------------------------------
// Input type
// ---------------------------------------------------------------------------

export type AnalysisInput = {
  addressId: string;             // DAWA adresseid — used as cache key
  adgangsadresseid: string;      // for BBR lookup
  ejerlavskode: number | null;   // for MAT (grundareal)
  matrikelnummer: string | null; // for MAT (grundareal)
  koordinater: { lat: number; lng: number } | null; // for Plandata
};

// ---------------------------------------------------------------------------
// analyseAddress: cache-first orchestration
// ---------------------------------------------------------------------------

export async function analyseAddress(input: AnalysisInput): Promise<ComplianceResult> {
  const { addressId, adgangsadresseid, ejerlavskode, matrikelnummer, koordinater } = input;

  // ── Layer 1: compliance_result (BBR + MAT + Plandata) ──────────────────
  const cached = await getCachedCompliance(addressId);
  if (cached) return cached;

  // Cache miss — run the full pipeline
  const [bbrResult, plandataResult] = await Promise.all([
    fetchBbr(adgangsadresseid, ejerlavskode, matrikelnummer),
    fetchPlandata(koordinater),
  ]);

  const result: ComplianceResult = {
    bbr: bbrResult,
    lokalplaner: plandataResult.lokalplaner,
    kommuneplanramme: plandataResult.kommuneplanramme,
    analysedAt: new Date().toISOString(),
  };

  await setCachedCompliance(addressId, result);

  // ── Layer 2: lokalplan_extracted ────────────────────────────────────────
  // ARCH-25 pending: PDF parser not yet built.
  // When implemented, call getCachedLokalplan / lokalplanPdfParser here
  // and pass currentPdfUrl for URL-based cache invalidation.

  // ── Layer 3: servitut_extracted ─────────────────────────────────────────
  // ARCH-26 pending: Tinglysning parser not yet built.

  return result;
}

// ---------------------------------------------------------------------------
// Internal fetchers (mirrors the existing compliance server function logic)
// ---------------------------------------------------------------------------

async function fetchBbr(
  adgangsadresseid: string,
  ejerlavskode: number | null,
  matrikelnummer: string | null
): Promise<BbrKompliantData | null> {
  try {
    let grundareal: number | null = null;
    if (ejerlavskode && matrikelnummer) {
      const { MatService } = await import('@/integrations/mat/client');
      const mat = await MatService.getGrundareal(ejerlavskode, matrikelnummer);
      grundareal = mat.registreretAreal;
    }
    const { BbrService } = await import('@/integrations/bbr/client');
    return BbrService.getKompliantData(adgangsadresseid, grundareal);
  } catch (e) {
    console.error('[Orchestrator] BBR fejlede:', (e as Error).message);
    return null;
  }
}

async function fetchPlandata(
  koordinater: { lat: number; lng: number } | null
): Promise<{ lokalplaner: Lokalplan[]; kommuneplanramme: Kommuneplanramme | null }> {
  if (!koordinater) return { lokalplaner: [], kommuneplanramme: null };

  const { PlandataService } = await import('@/integrations/plandata/client');

  const [lokalplanerResult, kommuneplanrammeResult] = await Promise.all([
    PlandataService.getLokalplanerForKoordinat(
      koordinater.lng,
      koordinater.lat,
      true
    ).catch(() => ({ lokalplaner: [], fejl: null, rawCount: 0 })),
    PlandataService.getKommuneplanrammeForKoordinat(
      koordinater.lng,
      koordinater.lat
    ).catch(() => ({ ramme: null, fejl: null })),
  ]);

  return {
    lokalplaner: lokalplanerResult.lokalplaner,
    kommuneplanramme: kommuneplanrammeResult.ramme,
  };
}
