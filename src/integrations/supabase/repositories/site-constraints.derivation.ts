// Pure derivation functions — no Supabase, no env vars, no side effects.
// Importable in tests without live DB or Supabase credentials.

import type { Database } from "@/integrations/supabase/types";
import type { GeusRiskData } from "@/integrations/geus/client";
import type { TerrainData } from "@/integrations/sdfi/dhm-client";
import type { ProjectPatch } from "@/integrations/supabase/project-persistence";
import { selectPrimaryLokalplanForPdf } from "@/integrations/plandata/selectors";
import type { DkJordResultat } from "@/integrations/miljoe/dkjord";
import { deriveSaneringsRisiko } from "@/domain/bbr/sanerings-risiko";

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

export function deriveGroundwaterDepthForColumn(
  geusRisk: GeusRiskData | null | undefined,
  season: "winter" | "summer",
): number | null {
  if (!geusRisk) return null;
  if (season === "winter") return geusRisk.groundwaterDepthWinterM ?? geusRisk.groundwaterDepthM;
  return geusRisk.groundwaterDepthSummerM ?? geusRisk.groundwaterDepthM;
}

export function deriveTerrainLowPoint(terrain: TerrainData | null | undefined): number | null {
  if (!terrain) return null;
  return terrain.lowPointM ?? terrain.minElevationM;
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

  if (patch.plandataContext !== undefined) {
    hasConstraintField = true;
    sitePatch.zone_type = patch.plandataContext?.zoneType ?? null;
    sitePatch.future_zone_type = patch.plandataContext?.futureZoneType ?? null;
    sitePatch.landzone_permit_required = patch.plandataContext?.landzonePermitRequired ?? null;
    sitePatch.lokalplan_byggefelt_present =
      patch.plandataContext?.lokalplanByggefeltPresent ?? null;
    sitePatch.within_building_field = patch.plandataContext?.withinBuildingField ?? null;
    sitePatch.building_field_source_id = patch.plandataContext?.buildingFieldSourceId ?? null;
    sitePatch.wastewater_plan_status = patch.plandataContext?.wastewaterPlanStatus ?? null;
    sitePatch.sewer_area_type = patch.plandataContext?.sewerAreaType ?? null;
    sitePatch.source_lokalplan_id =
      patch.plandataContext?.sourceLokalplanId ?? sitePatch.source_lokalplan_id ?? null;
    sitePatch.source_kommuneplan_id =
      patch.plandataContext?.sourceKommuneplanId ?? sitePatch.source_kommuneplan_id ?? null;
  }

  if (patch.arealdataContext !== undefined) {
    hasConstraintField = true;
    sitePatch.paragraph3_nature = patch.arealdataContext?.paragraph3Nature ?? null;
    sitePatch.natura2000 = patch.arealdataContext?.natura2000 ?? null;
    sitePatch.protected_dige = patch.arealdataContext?.protectedDige ?? null;
    sitePatch.fortidsminde = patch.arealdataContext?.fortidsminde ?? null;
    sitePatch.fortidsminde_buffer = patch.arealdataContext?.fortidsmindeBuffer ?? null;
    sitePatch.bnbo = patch.arealdataContext?.bnbo ?? null;
    sitePatch.osd = patch.arealdataContext?.osd ?? null;
    sitePatch.raw_material_area = patch.arealdataContext?.rawMaterialArea ?? null;
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
    // ARCH-246: BBR due-diligence
    sitePatch.bbr_vandforsyning_kode = patch.bbrData.vandforsyning_kode ?? null;
    sitePatch.bbr_afloebsforhold_kode = patch.bbrData.afloebsforhold_kode ?? null;
    sitePatch.bbr_ombygningsaar = patch.bbrData.ombygningsaar ?? null;
    sitePatch.bbr_sanerings_risiko =
      deriveSaneringsRisiko(
        patch.bbrData.byggeaar != null ? parseInt(patch.bbrData.byggeaar, 10) : null,
        patch.bbrData.ydervaegs_materiale_kode ?? null,
        patch.bbrData.tagdaekning_kode ?? null,
      ) ?? null;
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

  if (patch.geusRisk !== undefined) {
    hasConstraintField = true;
    sitePatch.grundvand_depth_winter_m = deriveGroundwaterDepthForColumn(patch.geusRisk, "winter");
    sitePatch.grundvand_depth_summer_m = deriveGroundwaterDepthForColumn(patch.geusRisk, "summer");
    sitePatch.grundvand_model_uncertainty_m = patch.geusRisk?.groundwaterModelUncertaintyM ?? null;
    sitePatch.geoteknik_jordart = patch.geusRisk?.geoteknikJordart ?? null;
  }

  if (patch.terrain !== undefined) {
    hasConstraintField = true;
    sitePatch.terrain_slope_pct = patch.terrain?.slopePercent ?? null;
    sitePatch.terrain_low_point_m = deriveTerrainLowPoint(patch.terrain);
    sitePatch.bluespot_risk = patch.terrain?.bluespotRisk ?? null;
  }

  // ARCH-248: Energimærke
  if (patch.energimaerke !== undefined) {
    hasConstraintField = true;
    const em = patch.energimaerke;
    sitePatch.energimaerke_klasse = em?.energimaerke_klasse ?? null;
    sitePatch.energimaerke_gyldig_til = em?.gyldig_til ?? null;
    sitePatch.energimaerke_er_udloebet = em?.er_udloebet ?? null;
    sitePatch.energimaerke_rapport_url = em?.rapport_url ?? null;
    sitePatch.energimaerke_rapport_id = em?.rapport_id ?? null;
    sitePatch.energimaerke_rapportdato = em?.rapportdato ?? null;
  }

  // ARCH-247: Tjekditnet bredbåndscoverage
  if (patch.tjekditnetCoverage !== undefined) {
    hasConstraintField = true;
    const cov = patch.tjekditnetCoverage;
    sitePatch.broadband_fiber_mbit = cov?.fiber_download_mbit ?? null;
    sitePatch.broadband_kabel_mbit = cov?.kabel_tv_download_mbit ?? null;
    sitePatch.broadband_xdsl_mbit = cov?.xdsl_download_mbit ?? null;
    sitePatch.broadband_fast_traadloes_mbit = cov?.fast_traadloes_download_mbit ?? null;
    sitePatch.broadband_mobil_mbit = cov?.mobil_download_mbit ?? null;
    sitePatch.broadband_max_fast_mbit = cov?.max_fast_download_mbit ?? null;
    sitePatch.broadband_match_type = cov?.match_type ?? null;
  }

  return hasConstraintField ? sitePatch : null;
}
