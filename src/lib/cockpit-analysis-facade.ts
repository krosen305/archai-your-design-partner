import type { ComplianceResult } from "@/lib/analysis-orchestrator";
import { calculateComplianceMetrics } from "@/lib/compliance-engine";
import { deriveComplianceFlags } from "@/lib/compliance-flags";
import { neighborContextFactsFromNeighborData } from "@/lib/neighbor-context-facts";
import type { ProjectPatch } from "@/integrations/supabase/project-persistence";
import type {
  Address,
  DataSourceKind,
  DataSourceStatus,
  PhaseStatus,
  PipelineServiceState,
} from "@/types/project-state";
import { evaluateHardStop } from "@/lib/rule-engine/hard-stop-adapter";
import type { AnalysisSnapshot } from "@/lib/project-restore-facade";
import type {
  RuleEnginePlandataContext,
  RuleEngineArealdataContext,
} from "@/domain/contracts/rule-engine.types";
import type { MatParcelGeometryPayload } from "@/domain/contracts/analysis.types";
import type { TjekditnetCoverageData } from "@/integrations/tjekditnet/client";
import type { EnergyLabelData } from "@/integrations/energimaerke/client";

type AnalysisDataStatus = Partial<Record<DataSourceKind, DataSourceStatus>>;

/**
 * Map a PipelineServiceState (what happened in the pipeline) to a
 * DataSourceStatus (what the UI should show). mock_* is surfaced as `stale`
 * so the user sees a warning pill rather than a green "fresh" badge.
 */
export function pipelineStateToDataStatus(state: PipelineServiceState): DataSourceStatus {
  switch (state) {
    case "success":
    case "cache_hit":
      return "fresh";
    case "mock":
    case "mock_cache_hit":
      return "stale";
    case "error":
      return "error";
    case "no_hit":
    case "skipped":
    case "not_run":
    default:
      return "missing";
  }
}

function deriveDataStatusFromServiceStates(
  states: Partial<Record<DataSourceKind, PipelineServiceState>>,
): AnalysisDataStatus {
  const out: AnalysisDataStatus = {};
  for (const [kind, state] of Object.entries(states) as [DataSourceKind, PipelineServiceState][]) {
    if (state) out[kind] = pipelineStateToDataStatus(state);
  }
  return out;
}

export type ComplianceApplication = {
  snapshotPatch: Partial<AnalysisSnapshot>;
  complianceFlags: ReturnType<typeof deriveComplianceFlags>;
  complianceMetrics: ReturnType<typeof calculateComplianceMetrics>;
  mergedAddress: Address | null;
  heritageSaveValue: number | null;
  isFredet: boolean | null;
  grundarealM2: number | null;
  bebyggetArealM2: number | null;
  bfeNr: string | null;
  neighborFacts: ReturnType<typeof neighborContextFactsFromNeighborData>;
  hardStop: boolean;
  hardStopReason: string | null;
  fetchedAt: string;
  dataStatus: AnalysisDataStatus;
  phaseUpdates: Record<"sandkassen" | "matriklen" | "maskinrummet", PhaseStatus>;
  syncPatch: ProjectPatch;
  serviceStates?: ComplianceResult["serviceStates"];
  analysisRunId: string | null;
  /** Typed fields hydrated into the store after analysis completes. */
  typedPatch: {
    plandataContext: RuleEnginePlandataContext | null;
    arealdataContext: RuleEngineArealdataContext | null;
    matGeometri: MatParcelGeometryPayload | null;
    tjekditnetCoverage: TjekditnetCoverageData | null;
    energimaerke: EnergyLabelData | null;
  };
};

export function buildComplianceApplication(params: {
  result: ComplianceResult;
  currentAddress: Address | null;
  currentByggeanalyseResultat: ProjectPatch["byggeanalyseResultat"];
  fetchedAt?: string;
}): ComplianceApplication {
  const { result, currentAddress, currentByggeanalyseResultat } = params;
  const fetchedAt = params.fetchedAt ?? new Date().toISOString();
  const complianceFlags = deriveComplianceFlags(
    result.bbr,
    result.kommuneplanramme,
    result.naturbeskyttelse,
    result.dkjord,
    result.geusRisk,
  );
  const complianceMetrics = calculateComplianceMetrics(result.bbr, result.kommuneplanramme);
  const heritageSaveValue = result.fbbData?.fbb_bedste_bygning?.bevaringsvaerdi ?? null;
  const isFredet = result.fbbData?.fbb_er_fredet ?? result.bbr?.fredet ?? null;
  const neighborFacts = neighborContextFactsFromNeighborData(
    result.naboer,
    result.serviceStates?.naboer ?? null,
  );
  const { hardStop, hardStopReason } = evaluateHardStop({
    saveValue: heritageSaveValue,
    isFredet,
    strandbeskyttelse: result.bbr?.mat_strandbeskyttelse ?? null,
    fredskov: result.bbr?.mat_fredskov ?? null,
    klitfredning: result.bbr?.mat_klitfredning ?? null,
  });
  const mergedAddress =
    currentAddress && result.addressPatch
      ? { ...currentAddress, ...result.addressPatch }
      : currentAddress;

  return {
    snapshotPatch: {
      lokalplaner: result.lokalplaner,
      geusRisk: result.geusRisk ?? null,
      servitutter: result.servitutter ?? null,
      terrain: result.terrain ?? null,
      fjernvarme: result.fjernvarme ?? null,
      naboer: result.naboer ?? null,
      fbbData: result.fbbData ?? null,
      naturbeskyttelse: result.naturbeskyttelse ?? null,
      dkjord: result.dkjord ?? null,
    },
    complianceFlags,
    complianceMetrics,
    mergedAddress,
    heritageSaveValue,
    isFredet,
    grundarealM2: result.bbr?.grundareal ?? null,
    bebyggetArealM2: result.bbr?.bebygget_areal ?? null,
    bfeNr: result.vurderingData?.bfeNr ?? null,
    neighborFacts,
    hardStop,
    hardStopReason: hardStopReason ?? null,
    fetchedAt,
    dataStatus: {
      bbr: result.bbr ? "fresh" : "missing",
      lokalplaner: result.lokalplaner.length > 0 ? "fresh" : "missing",
      kommuneplanramme: result.kommuneplanramme ? "fresh" : "missing",
      fbb: result.fbbData ? "fresh" : "missing",
      naturbeskyttelse: result.naturbeskyttelse ? "fresh" : "missing",
      arealdata: result.arealdataContext ? "fresh" : "missing",
      dkjord: result.dkjord ? "fresh" : "missing",
      geusRisk: result.geusRisk ? "fresh" : "missing",
      servitutter: result.servitutter ? "fresh" : "missing",
      terrain: result.terrain ? "fresh" : "missing",
      fjernvarme: result.fjernvarme ? "fresh" : "missing",
      naboer: neighborFacts ? "fresh" : "missing",
      matGeometri: result.matGeometri ? "fresh" : "missing",
      vurdering: result.vurderingData ? "fresh" : "missing",
      tjekditnet: result.tjekditnetCoverage ? "fresh" : "missing",
      energimaerke: result.energimaerke ? "fresh" : "missing",
      // serviceStates (when present) override the value-only fallback above —
      // they carry richer signal (error, cache_hit, mock, no_hit).
      ...(result.serviceStates ? deriveDataStatusFromServiceStates(result.serviceStates) : {}),
    },
    phaseUpdates: {
      sandkassen: "complete",
      matriklen: "complete",
      maskinrummet: "active",
    },
    syncPatch: {
      ...(mergedAddress && result.addressPatch ? { address: mergedAddress } : {}),
      bbrData: result.bbr,
      bbrDueDiligence: result.bbrDueDiligence,
      complianceFlags,
      lokalplaner: result.lokalplaner,
      kommuneplanramme: result.kommuneplanramme,
      plandataContext: result.plandataContext,
      arealdataContext: result.arealdataContext,
      naturbeskyttelse: result.naturbeskyttelse,
      dkjord: result.dkjord,
      geusRisk: result.geusRisk,
      servitutter: result.servitutter,
      terrain: result.terrain,
      naboer: result.naboer,
      fjernvarme: result.fjernvarme,
      fbbData: result.fbbData,
      byggeanalyseResultat: currentByggeanalyseResultat,
      vurderingData: result.vurderingData,
      tjekditnetCoverage: result.tjekditnetCoverage,
      energimaerke: result.energimaerke,
      complianceDone: true,
      currentStep: "byggeanalyse",
      analysisRunId: result.analysisRunId,
    },
    serviceStates: result.serviceStates,
    analysisRunId: result.analysisRunId ?? null,
    typedPatch: {
      plandataContext: result.plandataContext ?? null,
      arealdataContext: result.arealdataContext ?? null,
      matGeometri: result.matGeometri ?? null,
      tjekditnetCoverage: result.tjekditnetCoverage ?? null,
      energimaerke: result.energimaerke ?? null,
    },
  };
}
