/**
 * useCockpitRestore – hook integration test
 *
 * Rules:
 * - @/lib/project-sync IS mocked (allowed — it is not the store)
 * - @/lib/project-store is NOT mocked — real Zustand store is used
 * - happy-dom globals are loaded via preload in react-test-setup
 */
import { describe, it, expect, beforeEach, mock } from "bun:test";
import { renderHook, act, waitFor } from "@testing-library/react";
import "../testing/react-test-setup";
import { useProject } from "@/lib/project-store";
import type { PersistedProject } from "@/integrations/supabase/project-persistence";

// ---------------------------------------------------------------------------
// Minimal PersistedProject fixture — only the fields useCockpitRestore reads
// ---------------------------------------------------------------------------
const ADRESSE_ID = "0a3f50a0-aaa1-32b8-e044-0003ba298018";

const MINIMAL_PROJECT: PersistedProject = {
  id: "project-uuid-001",
  address_full: "Testgade 1, 2800 Kongens Lyngby",
  address_kommune: "Lyngby-Taarbæk",
  address_matrikel: null,
  address_bbr: null,
  address_adresseid: ADRESSE_ID,
  address_postnr: "2800",
  address_postnrnavn: "Kongens Lyngby",
  address_koordinater: { lat: 55.77, lng: 12.5 },
  address_ejerlavskode: null,
  address_matrikelnummer: null,
  compliance_data: null,
  design_byggeoenske: {
    byggetype: "tilbyg",
    oensketAreal: 60,
  },
  compliance_done: false,
  current_step: "matriklen",
  project_data_status: null,
  heritage_save_value: null,
  is_fredet: null,
  grundareal_m2: 441,
  bebygget_areal_m2: null,
  hard_stop: false,
  hard_stop_reason: null,
  budget_estimate: null,
  bfe_nr: null,
  billedanalyse: null,
  design_hus_dna: null,
  design_placement: {
    footprintGeojson: null,
    footprintAreaM2: 80,
    centroid: { lat: 55.7701, lng: 12.5001 },
    rotationDeg: 10,
    floors: 1,
    heightM: null,
    minDistanceToBoundaryM: null,
    outsideParcelAreaM2: 0,
    source: "user",
  },
  updated_at: "2026-05-22T10:00:00Z",
};

// ---------------------------------------------------------------------------
// Mock @/lib/project-sync — allowed (not the project-store)
// ---------------------------------------------------------------------------
mock.module("@/lib/project-sync", () => ({
  restoreProject: async (_pid: unknown, _adresseId: unknown) => MINIMAL_PROJECT,
  syncPatch: async () => {},
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useCockpitRestore", () => {
  beforeEach(() => {
    // Reset the real store before each test
    useProject.getState().reset();
  });

  it("restorer address ind i project store", async () => {
    // Import after mock is registered
    const { useCockpitRestore } = await import("./useCockpitRestore");

    const onSnapshotRestored = mock(() => {});

    const { result } = renderHook(() =>
      useCockpitRestore({
        adresseId: ADRESSE_ID,
        searchProjectId: undefined,
        onSnapshotRestored,
      }),
    );

    // Initially pending because store has no address
    expect(result.current.restorePhase).toBe("pending");

    // Wait for async restore to complete
    await waitFor(() => {
      expect(result.current.restorePhase).toBe("checked");
    });

    // The real store should now have the address from the mocked restoreProject
    const address = useProject.getState().address;
    expect(address).not.toBeNull();
    expect(address?.adresse).toBe("Testgade 1, 2800 Kongens Lyngby");
    expect(address?.adresseid).toBe(ADRESSE_ID);
  });

  it("restorer grundareal ind i store", async () => {
    const { useCockpitRestore } = await import("./useCockpitRestore");

    const { result } = renderHook(() =>
      useCockpitRestore({
        adresseId: ADRESSE_ID,
        searchProjectId: undefined,
        onSnapshotRestored: () => {},
      }),
    );

    await waitFor(() => {
      expect(result.current.restorePhase).toBe("checked");
    });

    expect(useProject.getState().grundareal_m2).toBe(441);
  });

  it("restorer design state ind i store", async () => {
    const { useCockpitRestore } = await import("./useCockpitRestore");

    const { result } = renderHook(() =>
      useCockpitRestore({
        adresseId: ADRESSE_ID,
        searchProjectId: undefined,
        onSnapshotRestored: () => {},
      }),
    );

    await waitFor(() => {
      expect(result.current.restorePhase).toBe("checked");
    });

    expect(useProject.getState().byggeoenske.oensketAreal).toBe(60);
    expect(useProject.getState().designPlacement?.rotationDeg).toBe(10);
  });

  it("sætter restorePhase=checked straks hvis adressen allerede matcher", async () => {
    // Pre-populate store with matching address
    useProject.getState().setAddress({
      adresseid: ADRESSE_ID,
      adgangsadresseid: ADRESSE_ID,
      adresse: "Testgade 1, 2800 Kongens Lyngby",
      postnr: "2800",
      postnrnavn: "Kongens Lyngby",
      kommune: "Lyngby-Taarbæk",
      kommunekode: "",
      matrikel: null,
      grundareal: null,
      koordinater: { lat: 55.77, lng: 12.5 },
      bbrId: null,
      ejerlavskode: null,
      matrikelnummer: null,
    });

    const { useCockpitRestore } = await import("./useCockpitRestore");

    const { result } = renderHook(() =>
      useCockpitRestore({
        adresseId: ADRESSE_ID,
        searchProjectId: undefined,
        onSnapshotRestored: () => {},
      }),
    );

    // Should be checked immediately — no async needed
    expect(result.current.restorePhase).toBe("checked");
  });
});
