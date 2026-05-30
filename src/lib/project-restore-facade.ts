import type { PersistedProject } from "@/integrations/supabase/project-persistence";
import { useProject } from "@/lib/project-store";
import { deriveSourceStatus, parseComplianceData } from "@/types/project-state";
import type { FjernvarmeResultat, NeighborBuildingData } from "@/domain/contracts/analysis.types";
import type {
  RuleEngineDkJordResultat,
  RuleEngineFbbResult,
  RuleEngineGeusRiskData,
  RuleEngineLokalplan,
  RuleEngineNaturbeskyttelsesResultat,
  RuleEngineTerrainData,
  RuleEngineTinglysningResult,
} from "@/domain/contracts/rule-engine.types";
import {
  addressKoordinaterSchema,
  billedeAnalyseResultatSchema,
  byggeoenskeSchema,
  designPlacementSchema,
  fjernvarmeResultatSchema,
  husDnaSchema,
  neighborBuildingDataSchema,
  neighborContextFactsSchema,
  ruleEngineArealdataContextSchema,
  ruleEngineDkJordResultatSchema,
  ruleEngineFbbResultSchema,
  ruleEngineGeusRiskDataSchema,
  ruleEngineNaturbeskyttelsesResultatSchema,
  ruleEngineTerrainDataSchema,
  ruleEngineTinglysningResultSchema,
} from "@/types/project-restore.schemas";
import { decodeWithSchema, objectField } from "@/hooks/cockpit-restore-utils";

export type AnalysisSnapshot = {
  lokalplaner: RuleEngineLokalplan[];
  geusRisk: RuleEngineGeusRiskData | null;
  servitutter: RuleEngineTinglysningResult | null;
  terrain: RuleEngineTerrainData | null;
  fjernvarme: FjernvarmeResultat | null;
  naboer: NeighborBuildingData | null;
  fbbData: RuleEngineFbbResult | null;
  naturbeskyttelse: RuleEngineNaturbeskyttelsesResultat | null;
  dkjord: RuleEngineDkJordResultat | null;
};

export const EMPTY_ANALYSIS_SNAPSHOT: AnalysisSnapshot = {
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

export function hydrateProjectIntoStore(
  project: PersistedProject,
  options: { routeAddressId?: string | null } = {},
): Partial<AnalysisSnapshot> {
  const store = useProject.getState();
  const restoredKoordinater = decodeWithSchema(
    project.address_koordinater,
    addressKoordinaterSchema,
  );

  store.setCurrentProjectId(project.id);

  if (
    project.address_full &&
    (project.address_adresseid || project.address_bbr || options.routeAddressId)
  ) {
    const resolvedAdresseid =
      project.address_adresseid ?? project.address_bbr ?? options.routeAddressId ?? "";
    const resolvedAdgangsadresseid =
      project.address_bbr ?? project.address_adresseid ?? options.routeAddressId ?? "";
    store.setAddress({
      adresseid: resolvedAdresseid,
      adresse: project.address_full,
      postnr: project.address_postnr ?? "",
      postnrnavn: project.address_postnrnavn ?? "",
      kommune: project.address_kommune ?? "",
      kommunekode: "",
      matrikel: project.address_matrikel,
      adgangsadresseid: resolvedAdgangsadresseid,
      grundareal: project.grundareal_m2 ?? null,
      koordinater: restoredKoordinater ?? { lat: 0, lng: 0 },
      bbrId: null,
      ejerlavskode: project.address_ejerlavskode ?? null,
      matrikelnummer: project.address_matrikelnummer ?? null,
    });
  }

  store.resetByggeoenske();
  const byggeoenske = decodeWithSchema(project.design_byggeoenske, byggeoenskeSchema);
  if (byggeoenske) {
    store.setByggeoenske(byggeoenske);
  }

  const husDna = decodeWithSchema(project.design_hus_dna, husDnaSchema);
  store.setHusDna(husDna);

  const designPlacement = decodeWithSchema(project.design_placement, designPlacementSchema);
  store.setDesignPlacement(designPlacement);

  const cd = parseComplianceData(project.compliance_data);
  if (cd) {
    if (cd.bbr) store.setBbrData(cd.bbr);
    store.setComplianceFlags(cd.flags);
    store.setLokalplaner(cd.lokalplaner);
    if (cd.kommuneplanramme) store.setKommuneplanramme(cd.kommuneplanramme);
    if (cd.byggeanalyseResultat) store.setByggeanalyseResultat(cd.byggeanalyseResultat);
    if (cd.vurderingData) store.setVurderingData(cd.vurderingData);
    if (project.compliance_done) store.setComplianceDone(true);
  }

  const snapshot: Partial<AnalysisSnapshot> = {
    lokalplaner: cd?.lokalplaner ?? [],
    geusRisk: objectField<RuleEngineGeusRiskData>(
      project.compliance_data,
      "geusRisk",
      ruleEngineGeusRiskDataSchema,
    ),
    servitutter: objectField<RuleEngineTinglysningResult>(
      project.compliance_data,
      "servitutter",
      ruleEngineTinglysningResultSchema,
    ),
    terrain: objectField<RuleEngineTerrainData>(
      project.compliance_data,
      "terrain",
      ruleEngineTerrainDataSchema,
    ),
    fjernvarme: objectField<FjernvarmeResultat>(
      project.compliance_data,
      "fjernvarme",
      fjernvarmeResultatSchema,
    ),
    naboer: objectField<NeighborBuildingData>(
      project.compliance_data,
      "naboer",
      neighborBuildingDataSchema,
    ),
    fbbData: objectField<RuleEngineFbbResult>(
      project.compliance_data,
      "fbbData",
      ruleEngineFbbResultSchema,
    ),
    naturbeskyttelse: objectField<RuleEngineNaturbeskyttelsesResultat>(
      project.compliance_data,
      "naturbeskyttelse",
      ruleEngineNaturbeskyttelsesResultatSchema,
    ),
    dkjord: objectField<RuleEngineDkJordResultat>(
      project.compliance_data,
      "dkjord",
      ruleEngineDkJordResultatSchema,
    ),
  };

  if (project.heritage_save_value != null) store.setHeritageSaveValue(project.heritage_save_value);
  if (project.is_fredet != null) store.setIsFredet(project.is_fredet);
  store.setHardStop(project.hard_stop ?? false, project.hard_stop_reason ?? null);
  if (project.grundareal_m2 != null) store.setGrundareal(project.grundareal_m2);
  if (project.bebygget_areal_m2 != null) store.setBebyggetAreal(project.bebygget_areal_m2);
  if (project.budget_estimate != null) store.setBudgetEstimate(project.budget_estimate);
  store.setBfeNr(project.bfe_nr ?? null);
  store.setNeighborContextFacts(
    decodeWithSchema(project.neighbor_context_facts, neighborContextFactsSchema),
  );

  const billedanalyse = decodeWithSchema(project.billedanalyse, billedeAnalyseResultatSchema);
  if (billedanalyse) {
    store.setBilledanalyse(billedanalyse);
  }

  const lastFetched = project.updated_at ?? null;
  const state = useProject.getState();
  store.setDataLastFetchedAt(lastFetched);
  store.setDataStatusBulk({
    bbr: deriveSourceStatus("bbr", state.bbrData, lastFetched),
    lokalplaner: deriveSourceStatus("lokalplaner", state.lokalplaner, lastFetched),
    kommuneplanramme: deriveSourceStatus("kommuneplanramme", state.kommuneplanramme, lastFetched),
    fbb: deriveSourceStatus(
      "fbb",
      objectField(project.compliance_data, "fbbData", ruleEngineFbbResultSchema),
      lastFetched,
    ),
    naturbeskyttelse: deriveSourceStatus(
      "naturbeskyttelse",
      objectField(
        project.compliance_data,
        "naturbeskyttelse",
        ruleEngineNaturbeskyttelsesResultatSchema,
      ),
      lastFetched,
    ),
    arealdata: deriveSourceStatus(
      "arealdata",
      objectField(project.compliance_data, "arealdataContext", ruleEngineArealdataContextSchema),
      lastFetched,
    ),
    geusRisk: deriveSourceStatus(
      "geusRisk",
      objectField(project.compliance_data, "geusRisk", ruleEngineGeusRiskDataSchema),
      lastFetched,
    ),
    servitutter: deriveSourceStatus(
      "servitutter",
      objectField(project.compliance_data, "servitutter", ruleEngineTinglysningResultSchema),
      lastFetched,
    ),
    terrain: deriveSourceStatus(
      "terrain",
      objectField(project.compliance_data, "terrain", ruleEngineTerrainDataSchema),
      lastFetched,
    ),
    fjernvarme: deriveSourceStatus(
      "fjernvarme",
      objectField(project.compliance_data, "fjernvarme", fjernvarmeResultatSchema),
      lastFetched,
    ),
    naboer: deriveSourceStatus(
      "naboer",
      project.neighbor_context_facts ??
        objectField(project.compliance_data, "naboer", neighborBuildingDataSchema),
      lastFetched,
    ),
    vurdering: deriveSourceStatus("vurdering", state.vurderingData, lastFetched),
    byggeanalyse: deriveSourceStatus("byggeanalyse", state.byggeanalyseResultat, lastFetched),
    billedanalyse: deriveSourceStatus("billedanalyse", billedanalyse, lastFetched),
    husDna: deriveSourceStatus("husDna", husDna, lastFetched),
  });

  return snapshot;
}
