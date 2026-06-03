// src/hooks/useCockpitAnalysis.ts
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useProject } from "@/lib/project-store";
import { saveProjectPatch } from "@/lib/project-sync";
import { fetchCompliance, runByggeanalyse } from "@/lib/cockpit.functions";
import { runCockpitComplianceWorkflow } from "@/lib/cockpit-compliance-workflow";
import { runCockpitByggeanalyseWorkflow } from "@/lib/cockpit-byggeanalyse-workflow";
import { runProjectSaveWorkflow } from "@/lib/project-save-workflow";
import { routeMatchesAddress } from "@/hooks/cockpit-restore-utils";
import { EMPTY_ANALYSIS_SNAPSHOT, type AnalysisSnapshot } from "@/lib/project-restore-facade";
import { buildComplianceApplication } from "@/lib/cockpit-analysis-facade";
import { logger } from "@/lib/logger";

type Status = "loading" | "done" | "error";

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
    setAddress,
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
    setHeritageSaveValue,
    setIsFredet,
    setGrundareal,
    setBebyggetAreal,
    setHardStop,
    setBfeNr,
    setNeighborContextFacts,
    setServiceStates,
    setPlandataContext,
    setArealdataContext,
    setMatGeometri,
    setTjekditnetCoverage,
    setEnergimaerke,
    setAnalysisRunId,
  } = useProject();

  const [status, setStatus] = useState<Status>(
    routeMatchesAddress(address, adresseId) && bbrData ? "done" : "loading",
  );
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isRecomputing, setIsRecomputing] = useState(false);
  const [analysisSnapshot, setAnalysisSnapshot] = useState<AnalysisSnapshot>({
    ...EMPTY_ANALYSIS_SNAPSHOT,
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
      const state = useProject.getState();
      const workflowResult = await runCockpitByggeanalyseWorkflow(
        {
          projectId: state.currentProjectId,
          byggeoenske: state.byggeoenske,
        },
        {
          getSession,
          runByggeanalyse,
        },
      );

      if (workflowResult.status === "auth_error") {
        return;
      }

      if (workflowResult.status === "no_project") {
        logger.warn("[Cockpit] manuel AI-analyse afbrudt: intet currentProjectId");
        return;
      }

      if (workflowResult.status === "ok") {
        setByggeanalyseResultat(workflowResult.analyse);
        const analyse = workflowResult.analyse;
        void runProjectSaveWorkflow(
          {
            patch: { byggeanalyseResultat: analyse },
            projectId: state.currentProjectId,
          },
          {
            getSession,
            saveProjectPatch,
          },
        );
      } else if (workflowResult.status === "blocked") {
        logger.warn("[Cockpit] Byggeanalyse blokeret af Hard Stop:", workflowResult.hardStopReason);
      } else {
        logger.warn("[Cockpit] Byggeanalyse mangler data:", workflowResult.reason);
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
      const workflowResult = await runCockpitComplianceWorkflow(
        {
          address: currentAddress,
          projectId: useProject.getState().currentProjectId,
        },
        {
          fetchCompliance,
          getSession,
          isGuest,
        },
      );

      if (workflowResult.status === "missing_project") {
        // Stale tab: cockpit-URL'en peger på en adresse uden et aktivt
        // projektkontekst. Send brugeren tilbage til adresse-trinnet i stedet
        // for at brænde en orphan-analyse.
        navigate({ to: "/projekt/adresse" });
        return;
      }
      if (workflowResult.status !== "ok") {
        setFetchError(workflowResult.message);
        setStatus("error");
        return;
      }

      Promise.resolve(workflowResult.result)
        .then(async (result) => {
          const application = buildComplianceApplication({
            result,
            currentAddress: useProject.getState().address,
            currentByggeanalyseResultat: byggeanalyseResultat,
          });

          setBbrData(result.bbr);
          setLokalplaner(result.lokalplaner);
          setLokalplanExtract(result.lokalplanExtract);
          setKommuneplanramme(result.kommuneplanramme);
          setVurderingData(result.vurderingData ?? null);
          setSnapshotPatch(application.snapshotPatch);
          setComplianceFlags(application.complianceFlags);
          setComplianceMetrics(application.complianceMetrics);

          // Sync typed store fields immediately so UI reflects current analysis without reload.
          // Persist happens separately via the project save workflow, but the in-memory store
          // must also be updated for the current session.
          setHeritageSaveValue(application.heritageSaveValue);
          setIsFredet(application.isFredet);
          setGrundareal(application.grundarealM2);
          setBebyggetAreal(application.bebyggetArealM2);
          setBfeNr(application.bfeNr);
          setNeighborContextFacts(application.neighborFacts);
          setHardStop(application.hardStop, application.hardStopReason);

          // Persist enriched address fields from server-side DAR/MAT enrichment so typed columns
          // and store stay aligned in the current session.
          if (application.mergedAddress && result.addressPatch) {
            setAddress(application.mergedAddress);
          }

          setComplianceDone(true);
          setPhase("sandkassen", application.phaseUpdates.sandkassen);
          setPhase("matriklen", application.phaseUpdates.matriklen);
          setPhase("maskinrummet", application.phaseUpdates.maskinrummet);
          void runProjectSaveWorkflow(
            {
              patch: application.syncPatch,
              projectId: useProject.getState().currentProjectId,
            },
            {
              getSession,
              saveProjectPatch,
            },
          );
          if (application.serviceStates) {
            useProject.setState({ serviceStates: application.serviceStates });
          }
          const store = useProject.getState();
          store.setDataLastFetchedAt(application.fetchedAt);
          store.setDataStatusBulk(application.dataStatus);
          setStatus("done");
        })
        .catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : String(e);
          logger.error("[Compliance] pipeline fejlede:", e);
          setFetchError(
            msg.startsWith("ArchAI: manglende")
              ? msg
              : "Analyse kunne ikke gennemfores. Proev igen.",
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
    setAddress,
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
    setBebyggetAreal,
    setBfeNr,
    setGrundareal,
    setHardStop,
    setHeritageSaveValue,
    setIsFredet,
    setNeighborContextFacts,
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
