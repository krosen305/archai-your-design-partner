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

import type {
  RuleEngineBbrData,
  RuleEngineDkJordResultat,
  RuleEngineFbbResult,
  RuleEngineGeusRiskData,
  RuleEngineKommuneplanramme,
  RuleEngineLokalplan,
  RuleEngineLokalplanExtract,
  RuleEngineNaturbeskyttelsesResultat,
  RuleEngineTerrainData,
  RuleEngineTinglysningResult,
} from "@/domain/contracts/rule-engine.types";
import type {
  FjernvarmeResultat,
  MatParcelGeometryPayload,
  NeighborBuildingData,
  VurData,
} from "@/domain/contracts/analysis.types";
import type { RuleEngineResult } from "@/lib/rule-engine/types";
import { selectPrimaryLokalplanForPdf } from "@/integrations/plandata/selectors";
import {
  finishAnalysisRun,
  startAnalysisRun,
  type AnalysisTraceContext,
} from "@/lib/analysis-tracing";
import type { DataSourceKind, PipelineServiceState } from "@/types/project-state";
import { enrichAddressDetails } from "@/lib/analysis/address-enrichment";
import { runLayer1Analysis } from "@/lib/analysis/layer1-analysis";
import { runLokalplanExtractionStep } from "@/lib/analysis/lokalplan-extraction-step";
import { runServitutStep } from "@/lib/analysis/servitut-step";
import { runGeoRiskStep } from "@/lib/analysis/geo-risk-step";
import { shouldSkipExpensiveLayer4 } from "@/lib/analysis/hard-stop-gate";

// ---------------------------------------------------------------------------
// Shared ComplianceResult type (ARCH-6)
// ---------------------------------------------------------------------------

export type ComplianceResult = {
  bbr: RuleEngineBbrData | null;
  lokalplaner: RuleEngineLokalplan[];
  kommuneplanramme: RuleEngineKommuneplanramme | null;
  analysedAt: string;
  lokalplanExtract: RuleEngineLokalplanExtract | null;
  naturbeskyttelse: RuleEngineNaturbeskyttelsesResultat | null;
  dkjord: RuleEngineDkJordResultat | null;
  geusRisk: RuleEngineGeusRiskData | null;
  servitutter: RuleEngineTinglysningResult | null;
  terrain: RuleEngineTerrainData | null;
  naboer: NeighborBuildingData | null;
  fjernvarme: FjernvarmeResultat | null;
  fbbData: RuleEngineFbbResult | null; // ARCH-131: SAVE-bevaringsværdi (1-9) + fredningsstatus fra FBB
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
// Dependency injection types
// ---------------------------------------------------------------------------

export type AnalysisOrchestratorDeps = {
  enrichAddressDetails: typeof enrichAddressDetails;
  runLayer1Analysis: typeof runLayer1Analysis;
  selectPrimaryLokalplanForPdf: typeof selectPrimaryLokalplanForPdf;
  runLokalplanExtractionStep: typeof runLokalplanExtractionStep;
  runServitutStep: typeof runServitutStep;
  runGeoRiskStep: typeof runGeoRiskStep;
  startAnalysisRun: typeof startAnalysisRun;
  finishAnalysisRun: typeof finishAnalysisRun;
  now: () => number;
  /** Called once at the start of each analysis run for fail-fast env validation. */
  validateEnv: typeof validateEnv;
};

const defaultDeps: AnalysisOrchestratorDeps = {
  enrichAddressDetails,
  runLayer1Analysis,
  selectPrimaryLokalplanForPdf,
  runLokalplanExtractionStep,
  runServitutStep,
  runGeoRiskStep,
  startAnalysisRun,
  finishAnalysisRun,
  now: () => Date.now(),
  validateEnv,
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createAnalysisOrchestrator(deps: AnalysisOrchestratorDeps) {
  return {
    analyseAddress: (input: AnalysisInput) => analyseAddressWithDeps(input, deps),
  };
}

// ---------------------------------------------------------------------------
// Internal implementation with explicit deps
// ---------------------------------------------------------------------------

async function analyseAddressWithDeps(
  input: AnalysisInput,
  deps: AnalysisOrchestratorDeps,
): Promise<ComplianceResult> {
  deps.validateEnv();
  const startedAt = deps.now();
  const trace = await deps.startAnalysisRun({
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
    const result = await analyseAddressWithTrace(input, trace, deps);
    await deps.finishAnalysisRun(trace, "done", startedAt);
    return { ...result, analysisRunId: trace.runId };
  } catch (e) {
    await deps.finishAnalysisRun(trace, "failed", startedAt, e);
    throw e;
  }
}

async function analyseAddressWithTrace(
  input: AnalysisInput,
  trace: AnalysisTraceContext,
  deps: AnalysisOrchestratorDeps,
): Promise<ComplianceResult> {
  const { addressId, koordinater } = input;

  // ── Step 1: Enrich address details via DAR (if needed) ───────────────────
  const enriched = await deps.enrichAddressDetails(
    addressId,
    {
      adgangsadresseid: input.adgangsadresseid,
      ejerlavskode: input.ejerlavskode,
      matrikelnummer: input.matrikelnummer,
      grundareal: input.grundareal ?? null,
      samletFastEjendomLokalId: null,
    },
    trace,
  );

  // ── Step 2: Layer 1 (BBR + Plandata + VUR) ───────────────────────────────
  const { complianceBase, states: layer1States } = await deps.runLayer1Analysis(
    {
      addressId,
      adgangsadresseid: enriched.adgangsadresseid,
      ejerlavskode: enriched.ejerlavskode,
      matrikelnummer: enriched.matrikelnummer,
      grundareal: enriched.grundareal,
      koordinater,
      samletFastEjendomLokalId: enriched.samletFastEjendomLokalId,
    },
    trace,
  );

  // ── Step 3: Select primary lokalplan PDF for Layer 2 ─────────────────────
  const primaryLokalplan = deps.selectPrimaryLokalplanForPdf(complianceBase.lokalplaner);
  const primaryPdfUrl = primaryLokalplan?.plandokumentLink ?? null;

  // ── Step 4: Layers 2 + 3 + 4 in parallel ─────────────────────────────────
  // Layer 2 (lokalplan PDF), Layer 3 (servitutter) og Layer 4 (geodata)
  // behøver alle kun Layer 1's output. Parallel Promise.all sparer ~2s live.
  const [lokalplanExtract, servitutter, geoRisk] = await Promise.all([
    deps.runLokalplanExtractionStep(addressId, primaryPdfUrl, trace),
    deps.runServitutStep(addressId, enriched.ejerlavskode, enriched.matrikelnummer, trace),
    deps.runGeoRiskStep(
      {
        addressId,
        koordinater,
        jordstykkeId: complianceBase.bbr?.jordstykke_lokal_id ?? null,
        bygningIds: complianceBase.bbr?.alle_bygning_lokal_ids ?? [],
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

// ---------------------------------------------------------------------------
// analyseAddress: trace-wrapped public entry point (public API preserved)
// ---------------------------------------------------------------------------

export async function analyseAddress(input: AnalysisInput): Promise<ComplianceResult> {
  return createAnalysisOrchestrator(defaultDeps).analyseAddress(input);
}
