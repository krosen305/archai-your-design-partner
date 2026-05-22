import { useState, useEffect } from "react";
import { useProject } from "@/lib/project-store";
import { parseComplianceData, deriveSourceStatus } from "@/types/project-state";
import { restoreProject } from "@/lib/project-sync";
import { logger } from "@/lib/logger";
import type { FjernvarmeResultat, NeighborBuildingData } from "@/domain/contracts/analysis.types";
import type {
  RuleEngineDkJordResultat,
  RuleEngineFbbResult,
  RuleEngineGeusRiskData,
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
  ruleEngineDkJordResultatSchema,
  ruleEngineFbbResultSchema,
  ruleEngineGeusRiskDataSchema,
  ruleEngineNaturbeskyttelsesResultatSchema,
  ruleEngineTerrainDataSchema,
  ruleEngineTinglysningResultSchema,
} from "@/types/project-restore.schemas";
import type { AnalysisSnapshot } from "./useCockpitAnalysis";
import { decodeWithSchema, routeMatchesAddress, objectField } from "@/hooks/cockpit-restore-utils";

export { routeMatchesAddress, objectField };

export type RestorePhase = "pending" | "checked";

export function useCockpitRestore(params: {
  adresseId: string;
  searchProjectId: string | undefined;
  onSnapshotRestored: (snapshot: Partial<AnalysisSnapshot>) => void;
}): { restorePhase: RestorePhase } {
  const { adresseId, searchProjectId, onSnapshotRestored } = params;
  const address = useProject((s) => s.address);

  const [restorePhase, setRestorePhase] = useState<RestorePhase>(
    routeMatchesAddress(address, adresseId) ? "checked" : "pending",
  );

  useEffect(() => {
    if (routeMatchesAddress(address, adresseId)) {
      setRestorePhase("checked");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const pid = searchProjectId ?? null;
        const project = await restoreProject(pid, adresseId);
        if (cancelled) return;
        if (project?.address_full && (project?.address_adresseid || project?.address_bbr)) {
          const store = useProject.getState();
          const restoredKoordinater = decodeWithSchema(
            project.address_koordinater,
            addressKoordinaterSchema,
          );
          store.setCurrentProjectId(project.id);
          const resolvedAdresseid = project.address_adresseid ?? project.address_bbr ?? adresseId;
          const resolvedAdgangsadresseid =
            project.address_bbr ?? project.address_adresseid ?? adresseId;
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
          store.resetByggeoenske();
          const byggeoenske = decodeWithSchema(project.design_byggeoenske, byggeoenskeSchema);
          if (byggeoenske) {
            store.setByggeoenske(byggeoenske);
          }
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
          onSnapshotRestored(snapshot);
          if (project.heritage_save_value != null)
            store.setHeritageSaveValue(project.heritage_save_value);
          if (project.is_fredet != null) store.setIsFredet(project.is_fredet);
          store.setHardStop(project.hard_stop ?? false, project.hard_stop_reason ?? null);
          const { setGrundareal, setBebyggetAreal, setBudgetEstimate, setBfeNr } =
            useProject.getState();
          if (project.grundareal_m2 != null) setGrundareal(project.grundareal_m2);
          if (project.bebygget_areal_m2 != null) setBebyggetAreal(project.bebygget_areal_m2);
          if (project.budget_estimate != null) setBudgetEstimate(project.budget_estimate);
          setBfeNr(project.bfe_nr ?? null);
          const billedanalyse = decodeWithSchema(
            project.billedanalyse,
            billedeAnalyseResultatSchema,
          );
          if (billedanalyse) {
            store.setBilledanalyse(billedanalyse);
          }
          const husDna = decodeWithSchema(project.design_hus_dna, husDnaSchema);
          store.setHusDna(husDna);
          const designPlacement = decodeWithSchema(project.design_placement, designPlacementSchema);
          store.setDesignPlacement(designPlacement);
          const lastFetched = project.updated_at ?? null;
          const s = useProject.getState();
          store.setDataLastFetchedAt(lastFetched);
          store.setDataStatusBulk({
            bbr: deriveSourceStatus("bbr", s.bbrData, lastFetched),
            lokalplaner: deriveSourceStatus("lokalplaner", s.lokalplaner, lastFetched),
            kommuneplanramme: deriveSourceStatus(
              "kommuneplanramme",
              s.kommuneplanramme,
              lastFetched,
            ),
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
            geusRisk: deriveSourceStatus(
              "geusRisk",
              objectField(project.compliance_data, "geusRisk", ruleEngineGeusRiskDataSchema),
              lastFetched,
            ),
            servitutter: deriveSourceStatus(
              "servitutter",
              objectField(
                project.compliance_data,
                "servitutter",
                ruleEngineTinglysningResultSchema,
              ),
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
              objectField(project.compliance_data, "naboer", neighborBuildingDataSchema),
              lastFetched,
            ),
            vurdering: deriveSourceStatus("vurdering", s.vurderingData, lastFetched),
            byggeanalyse: deriveSourceStatus("byggeanalyse", s.byggeanalyseResultat, lastFetched),
            billedanalyse: deriveSourceStatus("billedanalyse", billedanalyse, lastFetched),
            husDna: deriveSourceStatus("husDna", husDna, lastFetched),
          });
        }
      } catch (e) {
        logger.warn("[Cockpit] restore-by-url fejlede:", (e as Error).message);
      } finally {
        if (!cancelled) setRestorePhase("checked");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { restorePhase };
}
