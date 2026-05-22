import { useState, useEffect } from "react";
import { useProject } from "@/lib/project-store";
import { parseComplianceData, deriveSourceStatus } from "@/types/project-state";
import { restoreProject } from "@/lib/project-sync";
import { logger } from "@/lib/logger";
import type { GeusRiskData } from "@/integrations/geus/client";
import type { TinglysningResult } from "@/integrations/tinglysning/client";
import type { TerrainData } from "@/integrations/sdfi/dhm-client";
import type { FjernvarmeResultat } from "@/integrations/plandata/fjernvarme";
import type { NeighborBuildingData } from "@/integrations/bbr/neighbor-client";
import type { FbbResultat } from "@/integrations/fbb/client";
import type { NaturbeskyttelsesResultat } from "@/integrations/sdfi/naturbeskyttelse";
import type { DkJordResultat } from "@/integrations/miljoe/dkjord";
import type { AnalysisSnapshot } from "./useCockpitAnalysis";
import { routeMatchesAddress, objectField } from "@/hooks/cockpit-restore-utils";

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
            koordinater: (project.address_koordinater as { lat: number; lng: number } | null) ?? {
              lat: 0,
              lng: 0,
            },
            bbrId: null,
            ejerlavskode: project.address_ejerlavskode ?? null,
            matrikelnummer: project.address_matrikelnummer ?? null,
          });
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
            geusRisk: objectField<GeusRiskData>(project.compliance_data, "geusRisk"),
            servitutter: objectField<TinglysningResult>(project.compliance_data, "servitutter"),
            terrain: objectField<TerrainData>(project.compliance_data, "terrain"),
            fjernvarme: objectField<FjernvarmeResultat>(project.compliance_data, "fjernvarme"),
            naboer: objectField<NeighborBuildingData>(project.compliance_data, "naboer"),
            fbbData: objectField<FbbResultat>(project.compliance_data, "fbbData"),
            naturbeskyttelse: objectField<NaturbeskyttelsesResultat>(
              project.compliance_data,
              "naturbeskyttelse",
            ),
            dkjord: objectField<DkJordResultat>(project.compliance_data, "dkjord"),
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
          if (project.billedanalyse) {
            store.setBilledanalyse(
              project.billedanalyse as import("@/lib/billede-analyse-vocabulary").BilledeAnalyseResultat,
            );
          }
          if (project.hus_dna) {
            store.setHusDna(project.hus_dna as import("@/lib/project-store").HusDna);
          }
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
              objectField(project.compliance_data, "fbbData"),
              lastFetched,
            ),
            naturbeskyttelse: deriveSourceStatus(
              "naturbeskyttelse",
              objectField(project.compliance_data, "naturbeskyttelse"),
              lastFetched,
            ),
            geusRisk: deriveSourceStatus(
              "geusRisk",
              objectField(project.compliance_data, "geusRisk"),
              lastFetched,
            ),
            servitutter: deriveSourceStatus(
              "servitutter",
              objectField(project.compliance_data, "servitutter"),
              lastFetched,
            ),
            terrain: deriveSourceStatus(
              "terrain",
              objectField(project.compliance_data, "terrain"),
              lastFetched,
            ),
            fjernvarme: deriveSourceStatus(
              "fjernvarme",
              objectField(project.compliance_data, "fjernvarme"),
              lastFetched,
            ),
            naboer: deriveSourceStatus(
              "naboer",
              objectField(project.compliance_data, "naboer"),
              lastFetched,
            ),
            vurdering: deriveSourceStatus("vurdering", s.vurderingData, lastFetched),
            byggeanalyse: deriveSourceStatus("byggeanalyse", s.byggeanalyseResultat, lastFetched),
            billedanalyse: deriveSourceStatus("billedanalyse", project.billedanalyse, lastFetched),
            husDna: deriveSourceStatus("husDna", project.hus_dna, lastFetched),
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
