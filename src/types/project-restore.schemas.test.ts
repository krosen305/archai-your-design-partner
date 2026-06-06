import { describe, expect, it } from "bun:test";
import { existingProjectSnapshotSchema, persistedProjectSchema } from "./project-restore.schemas";

describe("persistedProjectSchema", () => {
  it("accepts a valid persisted project row", () => {
    const parsed = persistedProjectSchema.safeParse({
      id: "project-1",
      address_full: "Testvej 1",
      address_kommune: "Kobenhavn",
      address_kommunekode: "0101",
      address_matrikel: null,
      address_bbr: "addr-1",
      address_adresseid: "addr-1",
      address_postnr: "2100",
      address_postnrnavn: "Kobenhavn O",
      address_koordinater: { lat: 55.7, lng: 12.6 },
      address_ejerlavskode: 123,
      address_matrikelnummer: "1a",
      compliance_data: {},
      design_byggeoenske: { budget: "3-5" },
      compliance_done: false,
      current_step: "adresse",
      project_data_status: null,
      heritage_save_value: null,
      is_fredet: null,
      grundareal_m2: 800,
      bebygget_areal_m2: 120,
      hard_stop: false,
      hard_stop_reason: null,
      budget_estimate: null,
      bfe_nr: null,
      billedanalyse: null,
      design_hus_dna: null,
      design_placement: null,
      neighbor_context_facts: null,
      updated_at: "2026-05-22T10:00:00.000Z",
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.address_kommunekode).toBe("0101");
    expect(parsed.data.compliance_data).toEqual({
      bbr: null,
      bbrDueDiligence: null,
      flags: [],
      lokalplaner: [],
      kommuneplanramme: null,
      plandataContext: null,
      arealdataContext: null,
      byggeanalyseResultat: null,
      vurderingData: null,
    });
  });

  it("rejects invalid coordinate payloads", () => {
    const parsed = persistedProjectSchema.safeParse({
      id: "project-1",
      address_full: "Testvej 1",
      address_kommune: "Kobenhavn",
      address_kommunekode: "0101",
      address_matrikel: null,
      address_bbr: "addr-1",
      address_adresseid: "addr-1",
      address_postnr: "2100",
      address_postnrnavn: "Kobenhavn O",
      address_koordinater: ["invalid"],
      address_ejerlavskode: 123,
      address_matrikelnummer: "1a",
      compliance_data: {},
      design_byggeoenske: null,
      compliance_done: false,
      current_step: "adresse",
      project_data_status: null,
      heritage_save_value: null,
      is_fredet: null,
      grundareal_m2: null,
      bebygget_areal_m2: null,
      hard_stop: false,
      hard_stop_reason: null,
      budget_estimate: null,
      bfe_nr: null,
      billedanalyse: null,
      design_hus_dna: null,
      design_placement: null,
      neighbor_context_facts: null,
      updated_at: null,
    });

    expect(parsed.success).toBe(false);
  });
});

describe("existingProjectSnapshotSchema", () => {
  it("rejects non-object compliance snapshots", () => {
    const parsed = existingProjectSnapshotSchema.safeParse({
      compliance_data: ["bad-shape"],
      address_adresseid: "addr-1",
    });

    expect(parsed.success).toBe(false);
  });
});
