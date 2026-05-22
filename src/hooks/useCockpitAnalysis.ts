// src/hooks/useCockpitAnalysis.ts
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useProject } from "@/lib/project-store";
import { deriveComplianceFlags } from "@/lib/compliance-flags";
import { syncPatch } from "@/lib/project-sync";
import { calculateComplianceMetrics } from "@/lib/compliance-engine";
import { fetchCompliance, runByggeanalyse } from "@/lib/cockpit.functions";
import { logger } from "@/lib/logger";
import type { Lokalplan } from "@/integrations/plandata/client";
import type { GeusRiskData } from "@/integrations/geus/client";
import type { TinglysningResult } from "@/integrations/tinglysning/client";
import type { TerrainData } from "@/integrations/sdfi/dhm-client";
import type { FjernvarmeResultat } from "@/integrations/plandata/fjernvarme";
import type { NeighborBuildingData } from "@/integrations/bbr/neighbor-client";
import type { FbbResultat } from "@/integrations/fbb/client";
import type { NaturbeskyttelsesResultat } from "@/integrations/sdfi/naturbeskyttelse";
import type { DkJordResultat } from "@/integrations/miljoe/dkjord";
import { routeMatchesAddress } from "./useCockpitRestore";

export type AnalysisSnapshot = {
  lokalplaner: Lokalplan[];
  geusRisk: GeusRiskData | null;
  servitutter: TinglysningResult | null;
  terrain: TerrainData | null;
  fjernvarme: FjernvarmeResultat | null;
  naboer: NeighborBuildingData | null;
  fbbData: FbbResultat | null;
  naturbeskyttelse: NaturbeskyttelsesResultat | null;
  dkjord: DkJordResultat | null;
};

type Status = "loading" | "done" | "error";

const EMPTY_SNAPSHOT: AnalysisSnapshot = {
  lokalplaner: [],
  geusRisk: null,
  servitutter: null,
  terrain: null,
  fjernvarme: null,
  naboer: null,
  fbbData: null,
  naturbeskyttelse: null,
  dkjord: null,
};

export function useCockpitAnalysis(params: {
  adresseId: string;
  restorePhase: "pending" | "checked";
  initialSnapshot?: Partial<AnalysisSnapshot>;
}): {
  status: Status;
  fetchError: string | null;
  analysisSnapshot: AnalysisSnapshot;
  isRecomputing: boolean;
  setSnapshotPatch: (patch: Partial<AnalysisSnapshot>) => void;
  triggerRefresh: () => void;
  runManualAnalyse: () => Promise<void>;
} {
  const { adresseId, restorePhase, initialSnapshot } = params;
  const navigate = useNavigate();
  const {
    address,
    bbrData,
    complianceDone,
    lokalplaner,
    byggeoenske,
    byggeanalyseResultat,
    setBbrData,
    setComplianceDone,
    setComplianceFlags,
    setComplianceMetrics,
    setLokalplaner,
    setLokalplanExtract,
    setPhase,
    setKommuneplanramme,
    setVurderingData,
    setByggeanalyseResultat,
  } = useProject();

  const [status, setStatus] = useState<Status>(
    routeMatchesAddress(address, adresseId) && bbrData ? "done" : "loading",
  );
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isRecomputing, setIsRecomputing] = useState(false);
  const [analysisSnapshot, setAnalysisSnapshot] = useState<AnalysisSnapshot>({
    ...EMPTY_SNAPSHOT,
    lokalplaner: routeMatchesAddress(useProject.getState().address, adresseId)
      ? useProject.getState().lokalplaner
      : [],
    ...initialSnapshot,
  });
  const analysisStartedRef = useRef(false);

  const setSnapshotPatch = useCallback((patch: Partial<AnalysisSnapshot>) => {
    setAnalysisSnapshot((prev) => ({ ...prev, ...patch }));
  }, []);

  const triggerRefresh = useCallback(() => {
    analysisStartedRef.current = false;
    setComplianceDone(false);
    setBbrData(null);
    setStatus("loading");
  }, [setBbrData, setComplianceDone]);

  const runManualAnalyse = useCallback(async () => {
    if (!bbrData || !address) return;
    setIsRecomputing(true);
    try {
      const { getSession } = await import("@/lib/auth");
      const session = await getSession();
      if (!session) {
        setIsRecomputing(false);
        return;
      }
      const state = useProject.getState();
      if (!state.currentProjectId) {
        logger.warn("[Cockpit] manuel AI-analyse afbrudt: intet currentProjectId");
        return;
      }
      const gatedResult = await runByggeanalyse({
        data: {
          projectId: state.currentProjectId,
          accessToken: session.access_token,
          byggeoenske: state.byggeoenske,
        },
      });
      if (gatedResult.status === "ok") {
        const { status: _status, ...analyse } = gatedResult;
        setByggeanalyseResultat(analyse);
        syncPatch({ byggeanalyseResultat: analyse });
      } else if (gatedResult.status === "blocked") {
        logger.warn("[Cockpit] Byggeanalyse blokeret af Hard Stop:", gatedResult.hardStopReason);
      } else {
        logger.warn("[Cockpit] Byggeanalyse mangler data:", gatedResult.reason);
      }
    } catch (e) {
      logger.warn("[Cockpit] manuel AI-analyse fejlede:", e);
    } finally {
      setIsRecomputing(false);
    }
  }, [bbrData, address, setByggeanalyseResultat]);

  useEffect(() => {
    if (restorePhase !== "checked") return;
    const currentAddress = useProject.getState().address;

    if (bbrData && routeMatchesAddress(currentAddress, adresseId)) {
      if (analysisSnapshot.lokalplaner.length === 0 && lokalplaner.length > 0) {
        setSnapshotPatch({ lokalplaner });
      }
      setStatus("done");
      return;
    }

    if (!currentAddress?.adresseid) {
      navigate({ to: "/projekt/adresse" });
      return;
    }
    if (!routeMatchesAddress(currentAddress, adresseId)) {
      navigate({ to: "/projekt/adresse" });
      return;
    }
    if (analysisStartedRef.current) return;
    analysisStartedRef.current = true;

    (async () => {
      const { getSession, isGuest } = await import("@/lib/auth");
      const session = await getSession();

      if (!session) {
        const guest = isGuest();
        setFetchError(
          guest
            ? "Start fra adresse-trinnet som gæst for at hente grunddata."
            : "Login krævet - log ind for at hente analyse.",
        );
        setStatus("error");
        return;
      }

      fetchCompliance({
        data: {
          addressId: currentAddress.adresseid,
          adgangsadresseid: currentAddress.adgangsadresseid,
          ejerlavskode: currentAddress.ejerlavskode ?? null,
          matrikelnummer: currentAddress.matrikelnummer ?? null,
          koordinater: currentAddress.koordinater ?? null,
          grundareal: currentAddress.grundareal ?? null,
          projectId: useProject.getState().currentProjectId,
          token: session.access_token,
        },
      })
        .then(async (result) => {
          setBbrData(result.bbr);
          setLokalplaner(result.lokalplaner);
          setLokalplanExtract(result.lokalplanExtract);
          setKommuneplanramme(result.kommuneplanramme);
          setVurderingData(result.vurderingData ?? null);
          setSnapshotPatch({
            lokalplaner: result.lokalplaner,
            geusRisk: result.geusRisk ?? null,
            servitutter: result.servitutter ?? null,
            terrain: result.terrain ?? null,
            fjernvarme: result.fjernvarme ?? null,
            naboer: result.naboer ?? null,
            fbbData: result.fbbData ?? null,
            naturbeskyttelse: result.naturbeskyttelse ?? null,
            dkjord: result.dkjord ?? null,
          });
          const flags = deriveComplianceFlags(
            result.bbr,
            result.kommuneplanramme,
            result.naturbeskyttelse,
            result.dkjord,
            result.geusRisk,
          );
          setComplianceFlags(flags);
          setComplianceMetrics(calculateComplianceMetrics(result.bbr, result.kommuneplanramme));
          setComplianceDone(true);
          setPhase("hus-dna", "complete");
          setPhase("match", "complete");
          syncPatch({
            bbrData: result.bbr,
            complianceFlags: flags,
            lokalplaner: result.lokalplaner,
            kommuneplanramme: result.kommuneplanramme,
            naturbeskyttelse: result.naturbeskyttelse,
            dkjord: result.dkjord,
            geusRisk: result.geusRisk,
            servitutter: result.servitutter,
            terrain: result.terrain,
            naboer: result.naboer,
            fjernvarme: result.fjernvarme,
            fbbData: result.fbbData,
            byggeanalyseResultat: byggeanalyseResultat,
            vurderingData: result.vurderingData,
            complianceDone: true,
            currentStep: "byggeanalyse",
            analysisRunId: result.analysisRunId,
          });
          if (result.serviceStates) {
            useProject.setState({ serviceStates: result.serviceStates });
          }
          const nowIso = new Date().toISOString();
          const store = useProject.getState();
          store.setDataLastFetchedAt(nowIso);
          store.setDataStatusBulk({
            bbr: result.bbr ? "fresh" : "missing",
            lokalplaner: result.lokalplaner.length > 0 ? "fresh" : "missing",
            kommuneplanramme: result.kommuneplanramme ? "fresh" : "missing",
            fbb: result.fbbData ? "fresh" : "missing",
            naturbeskyttelse: result.naturbeskyttelse ? "fresh" : "missing",
            geusRisk: result.geusRisk ? "fresh" : "missing",
            servitutter: result.servitutter ? "fresh" : "missing",
            terrain: result.terrain ? "fresh" : "missing",
            fjernvarme: result.fjernvarme ? "fresh" : "missing",
            naboer: result.naboer ? "fresh" : "missing",
            vurdering: result.vurderingData ? "fresh" : "missing",
          });
          setStatus("done");
        })
        .catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : String(e);
          logger.error("[Compliance] pipeline fejlede:", msg);
          setFetchError(
            msg.startsWith("ArchAI: manglende") ? msg : "BBR-data kunne ikke hentes. Prøv igen.",
          );
          setStatus("error");
        });
    })();
  }, [
    adresseId,
    bbrData,
    complianceDone,
    lokalplaner,
    analysisSnapshot.lokalplaner.length,
    navigate,
    restorePhase,
    byggeanalyseResultat,
    setBbrData,
    setComplianceDone,
    setComplianceFlags,
    setComplianceMetrics,
    setKommuneplanramme,
    setLokalplanExtract,
    setLokalplaner,
    setPhase,
    setVurderingData,
    setSnapshotPatch,
  ]);

  return {
    status,
    fetchError,
    analysisSnapshot,
    isRecomputing,
    setSnapshotPatch,
    triggerRefresh,
    runManualAnalyse,
  };
}
