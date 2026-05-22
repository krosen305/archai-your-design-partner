// Pure derivation functions — no Supabase, no env vars, no side effects.
// Importable in tests without live DB or Supabase credentials.

import type { Database } from "@/integrations/supabase/types";
import type { ProjectPatch } from "@/integrations/supabase/project-persistence";
import { selectPrimaryLokalplanForPdf } from "@/integrations/plandata/selectors";
import type { DkJordResultat } from "@/integrations/miljoe/dkjord";

type SiteConstraintsUpsert = Database["public"]["Tables"]["site_constraints"]["Insert"];
type ProjectUpdate = Database["public"]["Tables"]["projects"]["Update"];

export function deriveSoilContaminationStatus(
  dkjord: DkJordResultat | null | undefined,
): "clean" | "registered" | "contaminated" | "unknown" | null {
  if (!dkjord) return null;
  if (dkjord.v2Kortlagt === null || dkjord.v1Kortlagt === null) return "unknown";
  if (dkjord.v2Kortlagt === true) return "contaminated";
  if (dkjord.v1Kortlagt === true) return "registered";
  return "clean";
}

export function deriveSiteConstraintsPatch(
  addressId: string | null,
  patch: ProjectPatch,
  update: ProjectUpdate,
): SiteConstraintsUpsert | null {
  if (!addressId) return null;

  const sitePatch: SiteConstraintsUpsert = {
    address_id: addressId,
    confidence: "confirmed",
    extracted_at: new Date().toISOString(),
  };
  let hasConstraintField = false;

  if (patch.kommuneplanramme !== undefined) {
    hasConstraintField = true;
    sitePatch.max_bebyggelsesprocent = patch.kommuneplanramme?.bebygpct ?? null;
    sitePatch.max_etager = patch.kommuneplanramme?.maxetager ?? null;
    sitePatch.max_height_m = patch.kommuneplanramme?.maxbygnhjd ?? null;
    sitePatch.source_kommuneplan_id = patch.kommuneplanramme?.planid ?? null;
  }

  if (patch.lokalplaner !== undefined) {
    hasConstraintField = true;
    sitePatch.source_lokalplan_id = selectPrimaryLokalplanForPdf(patch.lokalplaner)?.planid ?? null;
  }

  if (patch.fbbData !== undefined) {
    hasConstraintField = true;
    const saveValue = patch.fbbData?.fbb_bedste_bygning?.bevaringsvaerdi ?? null;
    sitePatch.save_value = saveValue !== null && saveValue >= 1 ? saveValue : null;
  }

  if (patch.fbbData !== undefined || patch.bbrData !== undefined) {
    hasConstraintField = true;
    sitePatch.is_fredet = update.is_fredet ?? null;
  }

  if (patch.bbrData !== undefined && patch.bbrData !== null) {
    hasConstraintField = true;
    sitePatch.strandbeskyttelse = patch.bbrData.mat_strandbeskyttelse ?? false;
    sitePatch.fredskov = patch.bbrData.mat_fredskov ?? false;
    sitePatch.klitfredning = patch.bbrData.mat_klitfredning ?? false;
  }

  if (patch.dkjord !== undefined) {
    hasConstraintField = true;
    sitePatch.soil_contamination_status = deriveSoilContaminationStatus(patch.dkjord);
    sitePatch.jordforurening_v1 = patch.dkjord?.v1Kortlagt ?? null;
    sitePatch.jordforurening_v2 = patch.dkjord?.v2Kortlagt ?? null;
    sitePatch.jordforurening_olietank = patch.dkjord?.olietank.eksisterer ?? null;
    sitePatch.omraadeklassificering = patch.dkjord?.omraadeklassificering ?? null;
    sitePatch.jordforurening_nuancering = patch.dkjord?.nuancering ?? null;
    sitePatch.jordforurening_lokalitet_id = patch.dkjord?.lokalitetsId ?? null;
  }

  return hasConstraintField ? sitePatch : null;
}
