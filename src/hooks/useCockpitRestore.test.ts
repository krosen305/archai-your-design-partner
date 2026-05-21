import { describe, it, expect, mock } from "bun:test";

// Mock restoreProject before importing hook
const mockRestoreProject = mock(async () => null);
mock.module("@/lib/project-sync", () => ({
  restoreProject: mockRestoreProject,
  syncPatch: mock(() => {}),
}));

// Mock useProject store
const mockStoreState = {
  address: null as { adresseid: string; adgangsadresseid: string } | null,
  setCurrentProjectId: mock(() => {}),
  setAddress: mock(() => {}),
  setBbrData: mock(() => {}),
  setComplianceFlags: mock(() => {}),
  setLokalplaner: mock(() => {}),
  setKommuneplanramme: mock(() => {}),
  setByggeanalyseResultat: mock(() => {}),
  setVurderingData: mock(() => {}),
  setComplianceDone: mock(() => {}),
  setHeritageSaveValue: mock(() => {}),
  setIsFredet: mock(() => {}),
  setHardStop: mock(() => {}),
  setGrundareal: mock(() => {}),
  setBebyggetAreal: mock(() => {}),
  setBudgetEstimate: mock(() => {}),
  setBfeNr: mock(() => {}),
  setBilledanalyse: mock(() => {}),
  setHusDna: mock(() => {}),
  setDataLastFetchedAt: mock(() => {}),
  setDataStatusBulk: mock(() => {}),
  lokalplaner: [],
  kommuneplanramme: null,
  bbrData: null,
  vurderingData: null,
  byggeanalyseResultat: null,
};

mock.module("@/lib/project-store", () => ({
  useProject: Object.assign(
    (selector: (s: typeof mockStoreState) => unknown) => selector(mockStoreState),
    { getState: () => mockStoreState },
  ),
}));

import { routeMatchesAddress, objectField } from "./useCockpitRestore";

describe("routeMatchesAddress", () => {
  it("returns false when address is null", () => {
    expect(routeMatchesAddress(null, "addr-1")).toBe(false);
  });

  it("returns true when adresseid matches", () => {
    expect(
      routeMatchesAddress({ adresseid: "addr-1", adgangsadresseid: "adg-1" }, "addr-1"),
    ).toBe(true);
  });

  it("returns true when adgangsadresseid matches", () => {
    expect(
      routeMatchesAddress({ adresseid: "addr-1", adgangsadresseid: "adg-1" }, "adg-1"),
    ).toBe(true);
  });

  it("returns false when neither matches", () => {
    expect(
      routeMatchesAddress({ adresseid: "addr-1", adgangsadresseid: "adg-1" }, "other"),
    ).toBe(false);
  });
});

describe("objectField", () => {
  it("returns null for non-object", () => {
    expect(objectField("string", "key")).toBeNull();
  });

  it("returns null when field is not an object", () => {
    expect(objectField({ key: "value" }, "key")).toBeNull();
  });

  it("returns the object field when it is an object", () => {
    const inner = { x: 1 };
    expect(objectField({ key: inner }, "key")).toEqual(inner);
  });
});
