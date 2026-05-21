// SERVER-SIDE ONLY – never import this from browser code.
//
// Cache-first orchestrator for address analysis (ARCH-32: fuldt paralleliseret).
// Thin coordinator over step modules in src/lib/analysis/. Each layer (BBR/Plandata,
// lokalplan PDF, servitut, geo-risk) is cached independently inside its step module.
//
// Paralleliseringsstrategi:
//   Layer 1: BBR + Plandata + VUR (parallel) — runLayer1Analysis
//   Layer 2+3+4: lokalplan PDF, servitutter, geodata (alle tre parallel efter Layer 1)
//   Target: < 5 sekunder live (primært begrænset af PDF-udtræk ~2s)
//
// A returning user for a previously-analysed address pays $0.00 in AI costs.

import { validateEnv } from "@/lib/env";
validateEnv();

import type { BbrKompliantData } from "@/integrations/bbr/client";
import type { Lokalplan, Kommuneplanramme } from "@/integrations/plandata/client";
import type { LokalplanExtract } from "@/integrations/ai/pdf-extractor";
import type { NaturbeskyttelsesResultat } from "@/integrations/sdfi/naturbeskyttelse";
import type { DkJordResultat } from "@/integrations/miljoe/dkjord";
import type { GeusRiskData } from "@/integrations/geus/client";
import type { TinglysningResult } from "@/integrations/tinglysning/client";
import type { TerrainData } from "@/integrations/sdfi/dhm-client";
import type { NeighborBuildingData } from "@/integrations/bbr/neighbor-client";
import type { MatParcelGeometryPayload } from "@/integrations/mat/geometry";
import type { FjernvarmeResultat } from "@/integrations/plandata/fjernvarme";
import type { FbbResultat } from "@/integrations/fbb/client";
import type { RuleEngineResult } from "@/lib/rule-engine/types";
import type { VurData } from "@/integrations/vur/client";
import { selectPrimaryLokalplanForPdf } from "@/integrations/plandata/selectors";
import {
  finishAnalysisRun,
  startAnalysisRun,
  type AnalysisTraceContext,
} from "@/lib/analysis-tracing";
import type { DataSourceKind, PipelineServiceState } from "@/types/project-state";
import { enrichAddressDetails } from "@/lib/analysis/address-enrichment";
import { runLayer1Analysis } from "@/lib/analysis/layer1-analysis";
import { shouldSkipExpensiveLayer4 } from "@/lib/analysis/hard-stop-gate";
import { runLokalplanExtractionStep } from "@/lib/analysis/lokalplan-extraction-step";
import { runServitutStep } from "@/lib/analysis/servitut-step";
import { runGeoRiskStep } from "@/lib/analysis/geo-risk-step";

// ---------------------------------------------------------------------------
// Shared ComplianceResult type (ARCH-6)
// ---------------------------------------------------------------------------

export type ComplianceResult = {
  bbr: BbrKompliantData | null;
  lokalplaner: Lokalplan[];
  kommuneplanramme: Kommuneplanramme | null;
  analysedAt: string;
  lokalplanExtract: LokalplanExtract | null;
  naturbeskyttelse: NaturbeskyttelsesResultat | null;
  dkjord: DkJordResultat | null;
  geusRisk: GeusRiskData | null;
  servitutter: TinglysningResult | null;
  terrain: TerrainData | null;
  naboer: NeighborBuildingData | null;
  fjernvarme: FjernvarmeResultat | null;
  fbbData: FbbResultat | null; // ARCH-131: SAVE-bevaringsværdi (1-9) + fredningsstatus fra FBB
  matGeometri: MatParcelGeometryPayload | null; // ARCH-240: parcelpolygon + skel-metrics
  vurderingData: VurData | null; // ARCH-119: EBR+VUR ejendomsværdi og grundværdi
  ruleEngine?: RuleEngineResult; // sættes af runByggeanalyse (ARCH-109)
  analysisRunId?: string | null;
  serviceStates?: Partial<Record<DataSourceKind, PipelineServiceState>>;
};

// ---------------------------------------------------------------------------
// Input type
// ---------------------------------------------------------------------------

export type AnalysisInput = {
  addressId: string; // DAWA adresseid — used as cache key
  adgangsadresseid: string; // for BBR lookup
  ejerlavskode: number | null; // for MAT (grundareal) — fallback hvis grundareal mangler
  matrikelnummer: string | null; // for MAT (grundareal) — fallback hvis grundareal mangler
  koordinater: { lat: number; lng: number } | null; // for Plandata
  grundareal?: number | null; // Pre-fetched fra DAR_Jordstykke — skip MAT-kald hvis tilgængeligt
  projectId?: string | null;
  userId?: string | null;
};

// ---------------------------------------------------------------------------
// analyseAddress: trace-wrapped public entry point
// ---------------------------------------------------------------------------

export async function analyseAddress(input: AnalysisInput): Promise<ComplianceResult> {
  const startedAt = Date.now();
  const trace = await startAnalysisRun({
    runKind: "full_analysis",
    projectId: input.projectId ?? null,
    addressId: input.addressId,
    userId: input.userId ?? null,
    source: "analyseAddress",
    metadata: {
      has_prefetched_grundareal: input.grundareal !== undefined && input.grundareal !== null,
      has_coordinates: !!input.koordinater,
    },
  });

  try {
    const result = await analyseAddressWithTrace(input, trace);
    await finishAnalysisRun(trace, "done", startedAt);
    return { ...result, analysisRunId: trace.runId };
  } catch (e) {
    await finishAnalysisRun(trace, "failed", startedAt, e);
    throw e;
  }
}

async function analyseAddressWithTrace(
  input: AnalysisInput,
  trace: AnalysisTraceContext,
): Promise<ComplianceResult> {
  const { addressId, koordinater } = input;

  // ── Step 1: Enrich address details via DAR (if needed) ───────────────────
  const enriched = await enrichAddressDetails(
    addressId,
    {
      adgangsadresseid: input.adgangsadresseid,
      ejerlavskode: input.ejerlavskode,
      matrikelnummer: input.matrikelnummer,
      grundareal: input.grundareal ?? null,
    },
    trace,
  );

  // ── Step 2: Layer 1 (BBR + Plandata + VUR) ───────────────────────────────
  const { complianceBase, states: layer1States } = await runLayer1Analysis(
    {
      addressId,
      adgangsadresseid: enriched.adgangsadresseid,
      ejerlavskode: enriched.ejerlavskode,
      matrikelnummer: enriched.matrikelnummer,
      grundareal: enriched.grundareal,
      koordinater,
    },
    trace,
  );

  // ── Step 3: Select primary lokalplan PDF for Layer 2 ─────────────────────
  const primaryLokalplan = selectPrimaryLokalplanForPdf(complianceBase.lokalplaner);
  const primaryPdfUrl = primaryLokalplan?.plandokumentLink ?? null;

  // ── Step 4: Layers 2 + 3 + 4 in parallel ─────────────────────────────────
  // Layer 2 (lokalplan PDF), Layer 3 (servitutter) og Layer 4 (geodata)
  // behøver alle kun Layer 1's output. Parallel Promise.all sparer ~2s live.
  const [lokalplanExtract, servitutter, geoRisk] = await Promise.all([
    runLokalplanExtractionStep(addressId, primaryPdfUrl, trace),
    runServitutStep(addressId, enriched.ejerlavskode, enriched.matrikelnummer, trace),
    runGeoRiskStep(
      {
        addressId,
        koordinater,
        jordstykkeId: complianceBase.bbr?.jordstykke_lokal_id ?? null,
        bygningIds: complianceBase.bbr?.alle_bbr_public_ids ?? [],
        grundareal: enriched.grundareal,
        skipExpensive: shouldSkipExpensiveLayer4(complianceBase.bbr),
      },
      trace,
    ),
  ]);

  // ── Step 5: Merge service states from layer1 and geoRisk ─────────────────
  const serviceStates: Partial<Record<DataSourceKind, PipelineServiceState>> = {
    ...layer1States,
    ...geoRisk.states,
  };

  // ── Step 6: Assemble ComplianceResult ────────────────────────────────────
  return {
    ...complianceBase,
    lokalplanExtract,
    naturbeskyttelse: geoRisk.naturbeskyttelse,
    dkjord: geoRisk.dkjord,
    geusRisk: geoRisk.geusRisk,
    servitutter,
    terrain: geoRisk.terrain,
    naboer: geoRisk.naboer,
    fjernvarme: geoRisk.fjernvarme,
    fbbData: geoRisk.fbbData,
    matGeometri: geoRisk.matGeometri,
    vurderingData: complianceBase.vurderingData,
    serviceStates,
  };
}
