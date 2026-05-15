import { describe, it, expect, beforeEach } from "bun:test";
import { useProject } from "./project-store";
import type { Address } from "./project-store";

const makeAddress = (label: string): Address => ({
  adresseid: `addr-${label}`,
  adresse: `${label}vej 1, 2000 Frederiksberg`,
  postnr: "2000",
  postnrnavn: "Frederiksberg",
  kommune: "Frederiksberg",
  kommunekode: "147",
  matrikel: `${label}-mat`,
  adgangsadresseid: `bbr-${label}`,
  koordinater: { lat: 55.68, lng: 12.53 },
  bbrId: null,
  ejerlavskode: 12345,
  matrikelnummer: "1a",
  grundareal: 500,
});

beforeEach(() => {
  useProject.getState().reset();
});

describe("project selection — ARCH-147", () => {
  it("reset() clears address so a subsequent restore can load the correct project", () => {
    const { setAddress, setCurrentProjectId, reset } = useProject.getState();

    // Simulate project A already loaded
    setAddress(makeAddress("A"));
    setCurrentProjectId("project-a");

    expect(useProject.getState().address?.adresseid).toBe("addr-A");
    expect(useProject.getState().currentProjectId).toBe("project-a");

    // User clicks "Fortsæt" on project B — reset must clear address first
    reset();
    setCurrentProjectId("project-b");

    expect(useProject.getState().address).toBeNull();
    expect(useProject.getState().currentProjectId).toBe("project-b");
  });

  it("older project selection does not retain address from newer project", () => {
    const { setAddress, setCurrentProjectId, reset } = useProject.getState();

    // Simulate newer project loaded first (most recent by updated_at)
    setAddress(makeAddress("newer"));
    setCurrentProjectId("project-newer");

    // User explicitly selects the older project from the list
    reset();
    setCurrentProjectId("project-older");

    // Address must be null — the __root.tsx guard (if address) return is now bypassed
    expect(useProject.getState().address).toBeNull();
    expect(useProject.getState().currentProjectId).toBe("project-older");
  });
});
