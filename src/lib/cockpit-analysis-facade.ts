import type { ComplianceResult } from "@/lib/analysis-orchestrator";
import { calculateComplianceMetrics } from "@/lib/compliance-engine";
import { deriveComplianceFlags } from "@/lib/compliance-flags";
import { neighborContextFactsFromNeighborData } from "@/lib/neighbor-context-facts";
import type { ProjectPatch } from "@/integrations/supabase/project-persistence";
import type { Address, DataSourceStatus, PhaseStatus } from "@/types/project-state";
import { evaluateHardStop } from "@/lib/rule-engine/hard-stop-adapter";
import type { AnalysisSnapshot } from "@/lib/project-restore-facade";

type AnalysisDataStatus = Partial<
  Record<
    | "bbr"
    | "lokalplaner"
    | "kommuneplanramme"
    | "fbb"
    | "naturbeskyttelse"
    | "arealdata"
    | "geusRisk"
    | "servitutter"
    | "terrain"
    | "fjernvarme"
    | "naboer"
    | "vurdering",
    DataSourceStatus
  >
>;

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
      geusRisk: result.geusRisk ? "fresh" : "missing",
      servitutter: result.servitutter ? "fresh" : "missing",
      terrain: result.terrain ? "fresh" : "missing",
      fjernvarme: result.fjernvarme ? "fresh" : "missing",
      naboer: neighborFacts ? "fresh" : "missing",
      vurdering: result.vurderingData ? "fresh" : "missing",
    },
    phaseUpdates: {
      sandkassen: "complete",
      matriklen: "complete",
      maskinrummet: "active",
    },
    syncPatch: {
      ...(mergedAddress && result.addressPatch ? { address: mergedAddress } : {}),
      bbrData: result.bbr,
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
  };
}
