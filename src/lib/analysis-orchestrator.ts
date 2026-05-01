// SERVER-SIDE ONLY – never import this from browser code.
//
// Cache-first orchestrator for address analysis.
// Checks Supabase before making any AI or data API calls.
// Each layer (BBR/Plandata, lokalplan PDF, servitut) is cached independently.
//
// A returning user for a previously-analysed address pays $0.00 in AI costs.
//
// Current layer status:
//   compliance_result   ✅  BBR + MAT + Plandata pipeline (live)
//   lokalplan_extracted ✅  live Anthropic PDF-parsing (ARCH-53)
//   servitut_extracted  ⏳  IS_MOCK=true — ARCH-26 (live Tinglysning API ikke implementeret)
//   report_text         ⏳  ARCH-27 (AI compliance summarizer not yet built)

import type { BbrKompliantData } from '@/integrations/bbr/client';
import type { Lokalplan, Kommuneplanramme } from '@/integrations/plandata/client';
import type { LokalplanExtract } from '@/integrations/ai/pdf-extractor';
import type { Json } from '@/integrations/supabase/types';
import {
  getCachedCompliance,
  setCachedCompliance,
  getCachedLokalplan,
  setCachedLokalplan,
  getCachedServitut,
  setCachedServitut,
} from '@/integrations/cache/client';

// ---------------------------------------------------------------------------
// Shared ComplianceResult type (ARCH-6)
// ---------------------------------------------------------------------------

export type ComplianceResult = {
  bbr: BbrKompliantData | null;
  lokalplaner: Lokalplan[];
  kommuneplanramme: Kommuneplanramme | null;
  analysedAt: string;
  lokalplanExtract: LokalplanExtract | null;
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
  type ComplianceBase = Omit<ComplianceResult, 'lokalplanExtract'>;
  let complianceBase: ComplianceBase | null = null;
  try {
    const cached = await getCachedCompliance(addressId);
    if (cached) complianceBase = cached;
  } catch (e) {
    console.warn('[Orchestrator] cache-læsning fejlede (behandles som cache-miss):', (e as Error).message);
  }

  if (!complianceBase) {
    const [bbrResult, plandataResult] = await Promise.all([
      fetchBbr(adgangsadresseid, ejerlavskode, matrikelnummer),
      fetchPlandata(koordinater),
    ]);
    complianceBase = {
      bbr: bbrResult,
      lokalplaner: plandataResult.lokalplaner,
      kommuneplanramme: plandataResult.kommuneplanramme,
      analysedAt: new Date().toISOString(),
    };
    try {
      await setCachedCompliance(addressId, { ...complianceBase, lokalplanExtract: null });
    } catch (e) {
      console.warn('[Orchestrator] compliance-cache-skriv fejlede (returnerer resultat uncached):', (e as Error).message);
    }
  }

  // ── Layer 2: lokalplan_extracted ────────────────────────────────────────
  const primaryPdfUrl = complianceBase.lokalplaner[0]?.plandokumentLink ?? null;
  let lokalplanExtract: LokalplanExtract | null = null;
  try {
    const cached = await getCachedLokalplan(addressId, primaryPdfUrl ?? undefined);
    if (cached) {
      lokalplanExtract = cached as unknown as LokalplanExtract;
    } else if (primaryPdfUrl) {
      const { PdfExtractorService } = await import('@/integrations/ai/pdf-extractor');
      const extract = await PdfExtractorService.extractLokalplan(primaryPdfUrl);
      await setCachedLokalplan(addressId, primaryPdfUrl, extract as unknown as Json);
      lokalplanExtract = extract;
    }
  } catch (e) {
    console.warn('[Orchestrator] lokalplan PDF-udtræk fejlede:', (e as Error).message);
  }

  // ── Layer 3: servitut_extracted (IS_MOCK=true) ──────────────────────────
  try {
    const cachedServitut = await getCachedServitut(addressId);
    if (!cachedServitut) {
      const { TinglysningService } = await import('@/integrations/tinglysning/client');
      const servitutter = await TinglysningService.getServitutter(addressId);
      await setCachedServitut(addressId, servitutter as unknown as Json);
    }
  } catch (e) {
    console.warn('[Orchestrator] servitut-udtræk fejlede:', (e as Error).message);
  }

  return { ...complianceBase, lokalplanExtract };
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
