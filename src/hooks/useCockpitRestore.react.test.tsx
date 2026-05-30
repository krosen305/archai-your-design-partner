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
import { MOCK_BBR } from "@/lib/mock-data";

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
  neighbor_context_facts: {
    buildingCount40m: 3,
    nearestBuildingDistanceM: 8.5,
    nearestRoadCenterlineDistanceM: 12,
    accessRoadNearby: true,
    confidence: "covered",
  },
  updated_at: "2026-05-22T10:00:00Z",
};

mock.module("@/lib/auth", () => ({
  getSession: async () => ({
    access_token: "test-token",
  }),
}));

// ---------------------------------------------------------------------------
// Mock @/lib/project-sync — allowed (not the project-store).
// loadProjectRestoreCallCount lader os verificere om restore reelt blev kaldt
// (vs. sprunget over fordi address allerede matcher).
// ---------------------------------------------------------------------------
let loadProjectRestoreCallCount = 0;

mock.module("@/lib/project-sync", () => ({
  loadProjectRestore: async (_context: unknown) => {
    loadProjectRestoreCallCount += 1;
    return MINIMAL_PROJECT;
  },
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
    loadProjectRestoreCallCount = 0;
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

  it("restorer GeoDanmark nabofakta ind i consumer read model", async () => {
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

    expect(useProject.getState().neighborContextFacts).toEqual({
      buildingCount40m: 3,
      nearestBuildingDistanceM: 8.5,
      nearestRoadCenterlineDistanceM: 12,
      accessRoadNearby: true,
      confidence: "covered",
    });
    expect(useProject.getState().dataStatus.naboer).toBe("fresh");
  });

  it("kører restore selv når adressen matcher, hvis bbrData mangler", async () => {
    // Scenario: handleFortsaet på /projekt/start kalder reset() + setAddress
    // før navigation, så når cockpit mounter matcher address URL'en, men
    // bbrData er null. Vi SKAL stadig restore'e fra Supabase i stedet for at
    // lade useCockpitAnalysis fyre en ny dyr fetchCompliance.
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

    // Restore skal være pending fordi bbrData mangler — vi har ikke compliance
    // i hukommelsen, så vi skal hente fra Supabase.
    expect(result.current.restorePhase).toBe("pending");

    await waitFor(() => {
      expect(result.current.restorePhase).toBe("checked");
    });

    expect(loadProjectRestoreCallCount).toBe(1);
    // Andre felter fra projektet skal være restored
    expect(useProject.getState().grundareal_m2).toBe(441);
  });

  it("springer restore over når adressen matcher OG bbrData allerede er sat", async () => {
    // Scenario: en analyse er allerede kørt for denne adresse i samme session,
    // bbrData er sat i hukommelsen. Ingen grund til at hente fra Supabase
    // eller starte en ny analyse.
    const store = useProject.getState();
    store.setAddress({
      adresseid: ADRESSE_ID,
      adgangsadresseid: ADRESSE_ID,
      adresse: "Testgade 1, 2800 Kongens Lyngby",
      postnr: "2800",
      postnrnavn: "Kongens Lyngby",
      kommune: "Lyngby-Taarbæk",
      kommunekode: "",
      matrikel: null,
      grundareal: 441,
      koordinater: { lat: 55.77, lng: 12.5 },
      bbrId: null,
      ejerlavskode: null,
      matrikelnummer: null,
    });
    store.setBbrData(MOCK_BBR);

    const { useCockpitRestore } = await import("./useCockpitRestore");

    const { result } = renderHook(() =>
      useCockpitRestore({
        adresseId: ADRESSE_ID,
        searchProjectId: undefined,
        onSnapshotRestored: () => {},
      }),
    );

    // Begge betingelser opfyldt → restore skal springes over straks
    expect(result.current.restorePhase).toBe("checked");
    expect(loadProjectRestoreCallCount).toBe(0);
  });
});
