// Pure function: converts a ProjectPatch + existing compliance JSONB
// into a typed Supabase ProjectUpdate. Design state is handled separately
// in the design_iterations repository.

import type { Database, Json } from "@/integrations/supabase/types";
import type { ProjectPatch } from "@/integrations/supabase/project-persistence";
import { toJsonObject, toJsonValue } from "@/lib/json-value";
import { evaluateHardStop } from "@/lib/rule-engine/hard-stop-adapter";

type ProjectUpdate = Database["public"]["Tables"]["projects"]["Update"];

export function hasComplianceFields(patch: ProjectPatch): boolean {
  return (
    patch.bbrData !== undefined ||
    patch.bbrDueDiligence !== undefined ||
    patch.complianceFlags !== undefined ||
    patch.lokalplaner !== undefined ||
    patch.kommuneplanramme !== undefined ||
    patch.plandataContext !== undefined ||
    patch.arealdataContext !== undefined ||
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

  if (patch.address !== undefined) {
    update.address_full = patch.address.adresse;
    update.address_kommune = patch.address.kommune;
    update.address_matrikel = patch.address.matrikel;
    update.address_bbr = patch.address.adgangsadresseid;
    update.address_adresseid = patch.address.adresseid;
    update.adresse_dar_id = patch.address.adresseid;
    update.address_postnr = patch.address.postnr;
    update.address_postnrnavn = patch.address.postnrnavn;
    update.address_koordinater = toJsonValue(patch.address.koordinater) ?? null;
    update.address_ejerlavskode = patch.address.ejerlavskode;
    update.address_matrikelnummer = patch.address.matrikelnummer;
  }

  if (patch.billedanalyse !== undefined) {
    update.billedanalyse = patch.billedanalyse ?? null;
  }

  const hasComplianceData = hasComplianceFields(patch);

  if (hasComplianceData) {
    const complianceData: Json = {
      ...toJsonObject(prevCompliance),
      ...(patch.bbrData !== undefined && { bbr: toJsonValue(patch.bbrData) }),
      ...(patch.bbrDueDiligence !== undefined && {
        bbrDueDiligence: toJsonValue(patch.bbrDueDiligence),
      }),
      ...(patch.complianceFlags !== undefined && { flags: toJsonValue(patch.complianceFlags) }),
      ...(patch.lokalplaner !== undefined && { lokalplaner: toJsonValue(patch.lokalplaner) }),
      ...(patch.kommuneplanramme !== undefined && {
        kommuneplanramme: toJsonValue(patch.kommuneplanramme),
      }),
      ...(patch.plandataContext !== undefined && {
        plandataContext: toJsonValue(patch.plandataContext),
      }),
      ...(patch.arealdataContext !== undefined && {
        arealdataContext: toJsonValue(patch.arealdataContext),
      }),
      ...(patch.byggeanalyseResultat !== undefined && {
        byggeanalyseResultat: toJsonValue(patch.byggeanalyseResultat),
      }),
      ...(patch.vurderingData !== undefined && { vurderingData: toJsonValue(patch.vurderingData) }),
      ...(patch.naturbeskyttelse !== undefined && {
        naturbeskyttelse: toJsonValue(patch.naturbeskyttelse),
      }),
      ...(patch.dkjord !== undefined && { dkjord: toJsonValue(patch.dkjord) }),
      ...(patch.geusRisk !== undefined && { geusRisk: toJsonValue(patch.geusRisk) }),
      ...(patch.servitutter !== undefined && { servitutter: toJsonValue(patch.servitutter) }),
      ...(patch.terrain !== undefined && { terrain: toJsonValue(patch.terrain) }),
      ...(patch.naboer !== undefined && { naboer: toJsonValue(patch.naboer) }),
      ...(patch.fjernvarme !== undefined && { fjernvarme: toJsonValue(patch.fjernvarme) }),
      ...(patch.fbbData !== undefined && { fbbData: toJsonValue(patch.fbbData) }),
    };
    update.compliance_data = complianceData;

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
