import { describe, expect, it } from "bun:test";
import { buildComplianceApplication } from "@/lib/cockpit-analysis-facade";
import type { ComplianceResult } from "@/lib/analysis-orchestrator";
import type { Address } from "@/types/project-state";

const CURRENT_ADDRESS: Address = {
  adresseid: "addr-1",
  adgangsadresseid: "adg-1",
  adresse: "Testvej 1",
  postnr: "2800",
  postnrnavn: "Kongens Lyngby",
  kommune: "Lyngby-Taarbaek",
  kommunekode: "173",
  matrikel: null,
  koordinater: { lat: 55.77, lng: 12.5 },
  bbrId: null,
  ejerlavskode: null,
  matrikelnummer: null,
  grundareal: null,
};

function makeResult(overrides: Partial<ComplianceResult> = {}): ComplianceResult {
  return {
    bbr: null,
    lokalplaner: [],
    kommuneplanramme: null,
    analysedAt: "2026-05-30T10:00:00Z",
    lokalplanExtract: null,
    naturbeskyttelse: null,
    dkjord: null,
    geusRisk: null,
    servitutter: null,
    terrain: null,
    naboer: null,
    fjernvarme: null,
    fbbData: null,
    plandataContext: null,
    arealdataContext: null,
    matGeometri: null,
    vurderingData: null,
    tjekditnetCoverage: null,
    energimaerke: null,
    ...overrides,
  };
}

describe("buildComplianceApplication", () => {
  it("merges addressPatch into current address and includes it in syncPatch", () => {
    const application = buildComplianceApplication({
      result: makeResult({
        addressPatch: {
          matrikelnummer: "5fo",
          ejerlavskode: 12352,
          grundareal: 441,
        },
      }),
      currentAddress: CURRENT_ADDRESS,
      currentByggeanalyseResultat: null,
      fetchedAt: "2026-05-30T12:00:00Z",
    });

    expect(application.mergedAddress?.matrikelnummer).toBe("5fo");
    expect(application.mergedAddress?.ejerlavskode).toBe(12352);
    expect(application.syncPatch.address?.grundareal).toBe(441);
  });

  it("derives phase updates and hard-stop free status for a clean result", () => {
    const application = buildComplianceApplication({
      result: makeResult({
        bbr: {
          grundareal: 441,
          bebygget_areal: 120,
          samlet_areal: 120,
          antal_etager: 1,
          byggeaar: null,
          anvendelseskode: null,
          anvendelse_tekst: null,
          bebyggelsesprocent: 27.2,
          beregning_mulig: true,
          fejl: null,
          varmeinstallation: null,
          opvarmningsmiddel: null,
          ydervaegs_materiale: null,
          tagdaekning: null,
          fredet: false,
          mat_strandbeskyttelse: false,
          mat_fredskov: false,
          mat_klitfredning: false,
          bygning_lokal_id: null,
          fbb_reference: null,
          alle_bygning_lokal_ids: [],
          jordstykke_lokal_id: null,
          canonical_building_lokal_id: null,
          canonical_selection_reason: null,
          canonical_candidates_count: 0,
          aggregated_bebygget_areal_all_primary: null,
          bygning_samlet_boligareal: null,
          ombygningsaar: null,
          vandforsyning_kode: null,
          vandforsyning: null,
          afloebsforhold_kode: null,
          afloebsforhold: null,
          ydervaegs_materiale_kode: null,
          tagdaekning_kode: null,
        },
      }),
      currentAddress: CURRENT_ADDRESS,
      currentByggeanalyseResultat: null,
      fetchedAt: "2026-05-30T12:00:00Z",
    });

    expect(application.hardStop).toBe(false);
    expect(application.phaseUpdates).toEqual({
      sandkassen: "complete",
      matriklen: "complete",
      maskinrummet: "active",
    });
    expect(application.dataStatus.bbr).toBe("fresh");
    expect(application.syncPatch.complianceDone).toBe(true);
  });
});
