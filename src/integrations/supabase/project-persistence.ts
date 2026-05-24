// SERVER-SIDE ONLY — bruger supabaseAdmin (service role).
// Thin orchestration facade: delegates to repositories and buildProjectUpdate.
// This file may not contain inline Supabase queries or domain derivation logic.

import type { Json } from "@/integrations/supabase/types";
import type { FbbResultat } from "@/integrations/fbb/client";
import type {
  Address,
  HusDna,
  ComplianceFlag,
  Byggeoenske,
  DesignPlacement,
} from "@/types/project-state";
import type { Lokalplan, Kommuneplanramme } from "@/integrations/plandata/client";
import type { BbrKompliantData } from "@/integrations/bbr/client";
import type { ByggeanalyseResultat } from "@/integrations/ai/byggeanalyse";
import type { BilledeAnalyseResultat } from "@/lib/billede-analyse-vocabulary";
import type { VurData } from "@/integrations/vur/client";
import type { NaturbeskyttelsesResultat } from "@/integrations/sdfi/naturbeskyttelse";
import type { ArealdataContextResult } from "@/integrations/arealdata/client";
import type { DkJordResultat } from "@/integrations/miljoe/dkjord";
import type { GeusRiskData } from "@/integrations/geus/client";
import type { TinglysningResult } from "@/integrations/tinglysning/client";
import type { TerrainData } from "@/integrations/sdfi/dhm-client";
import type { NeighborBuildingData } from "@/integrations/bbr/neighbor-client";
import type { FjernvarmeResultat } from "@/integrations/plandata/fjernvarme";
import type { PlanContextResult } from "@/integrations/plandata/client";
import {
  getUserId,
  getOrCreateProject,
  createNewProject,
  getProjectComplianceSnapshot,
  updateProject,
  loadProject as loadProjectFromRepo,
  deleteProjectRow,
  verifyProjectOwnership,
} from "@/integrations/supabase/repositories/projects.repository";
import {
  deriveSiteConstraintsPatch,
  syncSiteConstraints,
  deriveSoilContaminationStatus,
} from "@/integrations/supabase/repositories/site-constraints.repository";
import { deriveSaneringsRisiko } from "@/domain/bbr/sanerings-risiko";
import {
  hasDesignIterationFields,
  syncActiveDesignIteration,
} from "@/integrations/supabase/repositories/design-iterations.repository";
import { syncBuildingTasks } from "@/integrations/supabase/repositories/building-tasks.repository";
import { cleanupProjectStorage } from "@/integrations/supabase/repositories/project-storage.repository";
import { buildProjectUpdate, hasComplianceFields } from "@/lib/project-update-builder";
import { recordAnalysisEvent, type AnalysisTraceContext } from "@/lib/analysis-tracing";
import { logServerEvent } from "@/lib/server-logger";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ProjectPatch = {
  address?: Address;
  bbrData?: BbrKompliantData | null;
  husDna?: HusDna | null;
  byggeoenske?: Byggeoenske;
  designPlacement?: DesignPlacement | null;
  complianceFlags?: ComplianceFlag[];
  lokalplaner?: Lokalplan[];
  kommuneplanramme?: Kommuneplanramme | null;
  plandataContext?: PlanContextResult | null;
  arealdataContext?: ArealdataContextResult | null;
  byggeanalyseResultat?: ByggeanalyseResultat | null;
  vurderingData?: VurData | null;
  naturbeskyttelse?: NaturbeskyttelsesResultat | null;
  dkjord?: DkJordResultat | null;
  geusRisk?: GeusRiskData | null;
  servitutter?: TinglysningResult | null;
  terrain?: TerrainData | null;
  naboer?: NeighborBuildingData | null;
  fjernvarme?: FjernvarmeResultat | null;
  fbbData?: FbbResultat | null;
  billedanalyse?: BilledeAnalyseResultat | null;
  complianceDone?: boolean;
  currentStep?: string;
  projectDataStatus?: Json | null;
  analysisRunId?: string | null;
  budget_estimate?: number | null;
};

export type PersistedProject = {
  id: string;
  address_full: string | null;
  address_kommune: string | null;
  address_matrikel: string | null;
  address_bbr: string | null;
  address_adresseid: string | null;
  address_postnr: string | null;
  address_postnrnavn: string | null;
  address_koordinater: Json | null;
  address_ejerlavskode: number | null;
  address_matrikelnummer: string | null;
  compliance_data: Json | null;
  design_byggeoenske: Json | null;
  compliance_done: boolean;
  current_step: string;
  project_data_status: Json | null;
  heritage_save_value: number | null;
  is_fredet: boolean | null;
  grundareal_m2: number | null;
  bebygget_areal_m2: number | null;
  hard_stop: boolean;
  hard_stop_reason: string | null;
  budget_estimate: number | null;
  bfe_nr: string | null;
  billedanalyse: Json | null;
  design_hus_dna: Json | null;
  design_placement: Json | null;
  updated_at: string | null;
};

// ---------------------------------------------------------------------------
// createProject
// ---------------------------------------------------------------------------

export async function createProject(accessToken: string): Promise<string | null> {
  const userId = await getUserId(accessToken);
  if (!userId) return null;
  return createNewProject(userId);
}

// ---------------------------------------------------------------------------
// deleteProject
// ---------------------------------------------------------------------------

export async function deleteProject(accessToken: string, projectId: string): Promise<void> {
  const userId = await getUserId(accessToken);
  if (!userId) throw new Error("[Persistence] deleteProject: ikke autoriseret");
  if (!projectId?.trim()) throw new Error("[Persistence] deleteProject: projectId mangler");

  const owned = await verifyProjectOwnership(projectId, userId);
  if (!owned) {
    throw new Error(
      "[Persistence] deleteProject: projekt findes ikke eller tilhører ikke brugeren",
    );
  }

  await cleanupProjectStorage(userId, projectId);

  const { error: diErr } = await supabaseAdmin
    .from("design_iterations")
    .delete()
    .eq("project_id", projectId);
  if (diErr) {
    logServerEvent({
      module: "project-persistence",
      operation: "deleteProject.design_iterations",
      severity: "degraded",
      message: "deleteProject: design_iterations",
      error: diErr.message,
      trace: null,
      metadata: { projectId },
    });
  }

  const { error: btErr } = await supabaseAdmin
    .from("building_tasks")
    .delete()
    .eq("project_id", projectId);
  if (btErr) {
    logServerEvent({
      module: "project-persistence",
      operation: "deleteProject.building_tasks",
      severity: "degraded",
      message: "deleteProject: building_tasks",
      error: btErr.message,
      trace: null,
      metadata: { projectId },
    });
  }

  await deleteProjectRow(projectId, userId);
}

// ---------------------------------------------------------------------------
// saveProject
// ---------------------------------------------------------------------------

function createPersistenceTrace(
  patch: ProjectPatch,
  projectId: string,
  userId: string,
): AnalysisTraceContext | null {
  if (!patch.analysisRunId) return null;
  return {
    runId: patch.analysisRunId,
    runKind: "full_analysis",
    projectId,
    userId,
    addressId: patch.address?.adresseid ?? null,
    source: "project-persistence",
  };
}

export async function saveProject(
  accessToken: string,
  patch: ProjectPatch,
  projectId?: string | null,
): Promise<void> {
  const userId = await getUserId(accessToken);
  if (!userId) return;

  const id = projectId?.trim() ? projectId : await getOrCreateProject(userId);
  const trace = createPersistenceTrace(patch, id, userId);

  const snapshot = await getProjectComplianceSnapshot(id, userId);

  await recordAnalysisEvent(trace, {
    eventType: "db_read",
    phase: "persistence",
    service: "Supabase",
    operation: "projects.select_existing_compliance",
    status: "ok",
    durationMs: 0,
    metadata: { table: "projects", columns: ["compliance_data", "address_adresseid"] },
  });

  const prevCompliance =
    typeof snapshot?.compliance_data === "object" && snapshot.compliance_data !== null
      ? snapshot.compliance_data
      : {};

  const update = buildProjectUpdate(patch, prevCompliance);
  const hasProjectUpdate = Object.keys(update).length > 0;
  const hasDesignUpdate = hasDesignIterationFields(patch);
  if (!hasProjectUpdate && !hasDesignUpdate) return;

  if (hasProjectUpdate) {
    const projectWriteStartedAt = Date.now();
    await updateProject(id, userId, update);

    await recordAnalysisEvent(trace, {
      eventType: "db_write",
      phase: "persistence",
      service: "Supabase",
      operation: "projects.update",
      status: "ok",
      durationMs: Date.now() - projectWriteStartedAt,
      metadata: { table: "projects", fields: Object.keys(update) },
    });
  }

  await syncActiveDesignIteration(id, patch, trace);

  const hasComplianceData = hasComplianceFields(patch);

  if (hasComplianceData) {
    const addressId = patch.address?.adresseid ?? snapshot?.address_adresseid ?? null;

    const sitePatch = deriveSiteConstraintsPatch(addressId, patch, update);
    if (sitePatch) {
      await syncSiteConstraints(sitePatch, trace);
    }

    const soilContamination = deriveSoilContaminationStatus(patch.dkjord);
    const saveVal = update.heritage_save_value ?? null;
    const isFredetVal = update.is_fredet ?? null;

    await syncBuildingTasks(
      {
        projectId: id,
        saveValue: saveVal,
        isFredet: isFredetVal,
        strandbeskyttelse: patch.bbrData?.mat_strandbeskyttelse ?? null,
        fredskov: patch.bbrData?.mat_fredskov ?? null,
        klitfredning: patch.bbrData?.mat_klitfredning ?? null,
        landzonePermitRequired: patch.plandataContext?.landzonePermitRequired ?? null,
        lokalplanByggefeltPresent: patch.plandataContext?.lokalplanByggefeltPresent ?? null,
        withinBuildingField: patch.plandataContext?.withinBuildingField ?? null,
        wastewaterPlanStatus: patch.plandataContext?.wastewaterPlanStatus ?? null,
        sewerAreaType: patch.plandataContext?.sewerAreaType ?? null,
        paragraph3Nature: patch.arealdataContext?.paragraph3Nature ?? null,
        natura2000: patch.arealdataContext?.natura2000 ?? null,
        protectedDige: patch.arealdataContext?.protectedDige ?? null,
        fortidsminde: patch.arealdataContext?.fortidsminde ?? null,
        fortidsmindeBuffer: patch.arealdataContext?.fortidsmindeBuffer ?? null,
        bnbo: patch.arealdataContext?.bnbo ?? null,
        osd: patch.arealdataContext?.osd ?? null,
        rawMaterialArea: patch.arealdataContext?.rawMaterialArea ?? null,
        soilContamination,
        jordforureningV1: patch.dkjord?.v1Kortlagt ?? null,
        jordforureningV2: patch.dkjord?.v2Kortlagt ?? null,
        omraadeklassificering: patch.dkjord?.omraadeklassificering ?? null,
        // ARCH-246: BBR Due-Diligence triggers
        jordforureningOlietank: patch.dkjord?.olietank.eksisterer ?? null,
        bbrAfloebsforholdKode: patch.bbrData?.afloebsforhold_kode ?? null,
        bbrSaneringsRisiko: patch.bbrData
          ? deriveSaneringsRisiko(
              patch.bbrData.byggeaar != null ? parseInt(patch.bbrData.byggeaar, 10) : null,
              patch.bbrData.ydervaegs_materiale_kode ?? null,
              patch.bbrData.tagdaekning_kode ?? null,
            )
          : null,
      },
      trace,
    );
  }
}

// ---------------------------------------------------------------------------
// loadProject
// ---------------------------------------------------------------------------

export async function loadProject(
  accessToken: string,
  projectId?: string | null,
  addressId?: string | null,
): Promise<PersistedProject | null> {
  const userId = await getUserId(accessToken);
  if (!userId) return null;
  return loadProjectFromRepo(userId, projectId, addressId);
}
