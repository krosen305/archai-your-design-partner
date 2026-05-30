// Hook til at håndtere debounced byggeønsker-patch med reaktiv compliance-opdatering.
// Udtrukket fra ByggeoenskeAccordion i src/components/cockpit/index.tsx.
//
// Caller ansvar:
//  - Memoiser `reactiveContext`-objektet for at undgå unødvendige re-renders.
//  - Kald `patch()` fra event handlers — ikke under render.

import { useEffect, useRef } from "react";
import type {
  RuleEngineDkJordResultat,
  RuleEngineFbbResult,
  RuleEngineGeusRiskData,
  RuleEngineNaturbeskyttelsesResultat,
  RuleEngineTerrainData,
  RuleEngineTinglysningResult,
} from "@/domain/contracts/rule-engine.types";
import { getSession } from "@/lib/auth";
import { useProject } from "@/lib/project-store";
import { saveProjectPatch } from "@/lib/project-sync";
import { runProjectSaveWorkflow } from "@/lib/project-save-workflow";
import { computePartialUpdate } from "@/lib/reactive-compliance";
import type { Byggeoenske } from "@/types/project-state";

export type ReactiveContext = {
  geusRisk: RuleEngineGeusRiskData | null;
  servitutter: RuleEngineTinglysningResult | null;
  terrain: RuleEngineTerrainData | null;
  fbbData: RuleEngineFbbResult | null;
  naturbeskyttelse: RuleEngineNaturbeskyttelsesResultat | null;
  dkjord: RuleEngineDkJordResultat | null;
};

/**
 * Giver en `patch`-funktion der:
 *  1. Opdaterer Zustand-store øjeblikkeligt (UI reaktiv)
 *  2. Kører `computePartialUpdate` client-side (ingen API-kald) — opdaterer complianceMetrics + flags
 *  3. Beregner boligoenskeValidering (etager/areal) mod plangrænser
 *  4. Debouncer `syncPatch` med 500 ms
 */
export function useCockpitByggeoensker(reactiveContext: ReactiveContext): {
  patch: (partial: Partial<Byggeoenske>) => void;
} {
  const { setByggeoenske } = useProject();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  // Debounced patch: opdater store straks (UI reaktiv) — vent 500ms før sync + re-analyse.
  // computePartialUpdate kører øjeblikkeligt client-side (ingen API-kald) så Gauge-felterne
  // opdateres i realtid mens brugeren justerer byggeønsker.
  const patch = (partial: Partial<Byggeoenske>) => {
    setByggeoenske(partial);

    const state = useProject.getState();
    if (state.bbrData) {
      const { complianceMetrics: cm, complianceFlags } = computePartialUpdate({
        bbr: state.bbrData,
        ramme: state.kommuneplanramme,
        lokalplanExtract: state.lokalplanExtract,
        lokalplaner: state.lokalplaner,
        naturbeskyttelse: reactiveContext.naturbeskyttelse,
        geusRisk: reactiveContext.geusRisk,
        servitutter: reactiveContext.servitutter,
        terrain: reactiveContext.terrain,
        fbbData: reactiveContext.fbbData,
        dkjord: reactiveContext.dkjord,
        byggeoenske: { ...state.byggeoenske, ...partial },
        municipality: state.address?.kommune ?? "",
        kommunekode: state.address?.kommunekode ?? "",
      });
      state.setComplianceMetrics(cm);
      state.setComplianceFlags(complianceFlags);
    }

    // Beregn boligoenske-validering (etager + areal) mod plangrænser
    const merged = { ...state.byggeoenske, ...partial };
    const valgtEtager = typeof merged.antalEtager === "number" ? merged.antalEtager : null;
    const valgtAreal = typeof merged.oensketAreal === "number" ? merged.oensketAreal : null;
    const eksAreal = state.bbrData?.bebygget_areal ?? 0;
    const grundareal = state.complianceMetrics?.grundareal ?? null;
    const samletAreal =
      merged.byggetype === "tilbyg" ? eksAreal + (valgtAreal ?? 0) : (valgtAreal ?? eksAreal);
    const beregnetPct = grundareal && grundareal > 0 ? (samletAreal / grundareal) * 100 : null;
    const maxPct = state.complianceMetrics?.maxBebyggelsesprocent ?? null;
    const maxEtager = state.complianceMetrics?.maxEtager ?? null;
    const etagerStatus: "ok" | "dispensation" | "ingen_data" =
      valgtEtager == null || maxEtager == null
        ? "ingen_data"
        : valgtEtager > maxEtager
          ? "dispensation"
          : "ok";
    const arealStatus: "ok" | "dispensation" | "ingen_data" =
      valgtAreal == null || maxPct == null || beregnetPct == null
        ? "ingen_data"
        : beregnetPct > maxPct
          ? "dispensation"
          : "ok";
    const prev = state.boligoenskeValidering;
    state.setBoligoenskeValidering({
      etagerStatus,
      arealStatus,
      beregnetBebyggelsespct: beregnetPct,
      etagerDispensationAcknowledged:
        etagerStatus === "dispensation" ? (prev?.etagerDispensationAcknowledged ?? false) : false,
      arealDispensationAcknowledged:
        arealStatus === "dispensation" ? (prev?.arealDispensationAcknowledged ?? false) : false,
    });

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const currentState = useProject.getState();
      const next = { ...currentState.byggeoenske };
      void runProjectSaveWorkflow(
        {
          patch: { byggeoenske: next },
          projectId: currentState.currentProjectId,
        },
        {
          getSession,
          saveProjectPatch,
        },
      );
    }, 500);
  };

  return { patch };
}
