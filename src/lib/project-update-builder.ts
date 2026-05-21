// Pure function: converts a ProjectPatch + existing compliance JSONB
// into a typed Supabase ProjectUpdate — no Supabase imports, fully unit-testable.

import type { Database, Json } from "@/integrations/supabase/types";
import type { ProjectPatch } from "@/integrations/supabase/project-persistence";
import { evaluateHardStop } from "@/lib/rule-engine/hard-stop-adapter";

type ProjectUpdate = Database["public"]["Tables"]["projects"]["Update"];

export function hasComplianceFields(patch: ProjectPatch): boolean {
  return (
    patch.bbrData !== undefined ||
    patch.complianceFlags !== undefined ||
    patch.lokalplaner !== undefined ||
    patch.kommuneplanramme !== undefined ||
    patch.byggeanalyseResultat !== undefined ||
    patch.vurderingData !== undefined ||
    patch.naturbeskyttelse !== undefined ||
    patch.dkjord !== undefined ||
    patch.geusRisk !== undefined ||
    patch.servitutter !== undefined ||
    patch.terrain !== undefined ||
    patch.naboer !== undefined ||
    patch.fjernvarme !== undefined ||
    patch.fbbData !== undefined
  );
}

/**
 * Build a Supabase projects UPDATE payload from a wizard patch.
 *
 * @param patch - Partial state update from the wizard/UI
 * @param prevCompliance - Existing compliance_data JSONB from the projects row.
 *   Pass `{}` when creating a new project or when the existing row is not available.
 */
export function buildProjectUpdate(
  patch: ProjectPatch,
  prevCompliance: Record<string, unknown>,
): ProjectUpdate {
  const update: ProjectUpdate = {};

  // ── Address ────────────────────────────────────────────────────────────────
  if (patch.address !== undefined) {
    update.address_full = patch.address.adresse;
    update.address_kommune = patch.address.kommune;
    update.address_matrikel = patch.address.matrikel;
    update.address_bbr = patch.address.adgangsadresseid;
    update.address_adresseid = patch.address.adresseid;
    update.adresse_dar_id = patch.address.adresseid;
    update.address_postnr = patch.address.postnr;
    update.address_postnrnavn = patch.address.postnrnavn;
    update.address_koordinater = patch.address.koordinater as unknown as Json;
    update.address_ejerlavskode = patch.address.ejerlavskode;
    update.address_matrikelnummer = patch.address.matrikelnummer;
  }

  // ── Byggeoenske ────────────────────────────────────────────────────────────
  if (patch.byggeoenske !== undefined) {
    update.brief_data = patch.byggeoenske as unknown as Json;
  }

  // ── HusDna ─────────────────────────────────────────────────────────────────
  if (patch.husDna !== undefined) {
    update.hus_dna = patch.husDna ?? null;
  }

  // ── Billedanalyse ──────────────────────────────────────────────────────────
  if (patch.billedanalyse !== undefined) {
    update.billedanalyse = patch.billedanalyse ?? null;
  }

  // ── Compliance JSONB + typed columns ───────────────────────────────────────
  const hasComplianceData = hasComplianceFields(patch);

  if (hasComplianceData) {
    update.compliance_data = {
      ...prevCompliance,
      ...(patch.bbrData !== undefined && { bbr: patch.bbrData }),
      ...(patch.complianceFlags !== undefined && { flags: patch.complianceFlags }),
      ...(patch.lokalplaner !== undefined && { lokalplaner: patch.lokalplaner }),
      ...(patch.kommuneplanramme !== undefined && { kommuneplanramme: patch.kommuneplanramme }),
      ...(patch.byggeanalyseResultat !== undefined && {
        byggeanalyseResultat: patch.byggeanalyseResultat,
      }),
      ...(patch.vurderingData !== undefined && { vurderingData: patch.vurderingData }),
      ...(patch.naturbeskyttelse !== undefined && { naturbeskyttelse: patch.naturbeskyttelse }),
      ...(patch.dkjord !== undefined && { dkjord: patch.dkjord }),
      ...(patch.geusRisk !== undefined && { geusRisk: patch.geusRisk }),
      ...(patch.servitutter !== undefined && { servitutter: patch.servitutter }),
      ...(patch.terrain !== undefined && { terrain: patch.terrain }),
      ...(patch.naboer !== undefined && { naboer: patch.naboer }),
      ...(patch.fjernvarme !== undefined && { fjernvarme: patch.fjernvarme }),
      ...(patch.fbbData !== undefined && { fbbData: patch.fbbData }),
    } as Json;

    // Typed compliance columns — only written when source data is in this patch
    if (patch.fbbData !== undefined) {
      const saveVal = patch.fbbData?.fbb_bedste_bygning?.bevaringsvaerdi ?? null;
      update.heritage_save_value = saveVal !== null && saveVal >= 1 ? saveVal : null;
    }

    if (patch.fbbData !== undefined) {
      update.is_fredet = patch.fbbData?.fbb_er_fredet ?? patch.bbrData?.fredet ?? null;
    } else if (patch.bbrData !== undefined) {
      update.is_fredet = patch.bbrData?.fredet ?? null;
    }

    if (patch.bbrData !== undefined && patch.bbrData !== null) {
      update.grundareal_m2 = patch.bbrData.grundareal;
      update.bebygget_areal_m2 = patch.bbrData.bebygget_areal;
    }

    // Hard stop — only recomputed when triggering data sources are present.
    // Prevents byggeanalyseResultat-only patches from resetting hard_stop=false.
    const hasHardStopTrigger = patch.fbbData !== undefined || patch.bbrData !== undefined;
    if (hasHardStopTrigger) {
      const saveValue = update.heritage_save_value ?? null;
      const isFredet = update.is_fredet ?? null;
      const strandbeskyttelse = patch.bbrData?.mat_strandbeskyttelse ?? null;
      const fredskov = patch.bbrData?.mat_fredskov ?? null;
      const klitfredning = patch.bbrData?.mat_klitfredning ?? null;

      const { hardStop, hardStopReason } = evaluateHardStop({
        saveValue,
        isFredet,
        strandbeskyttelse,
        fredskov,
        klitfredning,
        projectType: "demolition_and_new",
      });
      update.hard_stop = hardStop;
      update.hard_stop_reason = hardStop ? hardStopReason : null;
    }
  }

  // ── Non-compliance fields ──────────────────────────────────────────────────
  if (patch.complianceDone !== undefined) {
    update.compliance_done = patch.complianceDone;
  }
  if (patch.currentStep !== undefined) {
    update.current_step = patch.currentStep;
  }
  if (patch.projectDataStatus !== undefined) {
    update.project_data_status = patch.projectDataStatus;
  }
  if (patch.budget_estimate !== undefined) {
    update.budget_estimate = patch.budget_estimate ?? null;
  }

  return update;
}
