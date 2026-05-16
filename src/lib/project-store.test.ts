import { describe, it, expect, beforeEach } from "bun:test";
import { useProject } from "./project-store";
import type { Address, HusDna } from "./project-store";
import type { PersistedProject } from "@/integrations/supabase/project-persistence";

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

const makeHusDna = (): HusDna => ({
  stil: "minimalistisk",
  bruttoareal: "120",
  etager: "1",
  tagform: "fladt tag",
  energiklasse: "A2015",
  saerligeKrav: [],
  confidence: 90,
  kilde: "mock",
});

beforeEach(() => {
  useProject.getState().reset();
});

describe("husDna persistence — ARCH-197", () => {
  it("husDna er null ved opstart", () => {
    expect(useProject.getState().husDna).toBeNull();
  });

  it("setHusDna gemmer DNA i store", () => {
    useProject.getState().setHusDna(makeHusDna());
    expect(useProject.getState().husDna?.stil).toBe("minimalistisk");
    expect(useProject.getState().husDna?.confidence).toBe(90);
  });

  it("reset() rydder husDna", () => {
    useProject.getState().setHusDna(makeHusDna());
    useProject.getState().reset();
    expect(useProject.getState().husDna).toBeNull();
  });

  it("setHusDna gemmer alle felter korrekt", () => {
    const dna = makeHusDna();
    useProject.getState().setHusDna(dna);
    const stored = useProject.getState().husDna;
    expect(stored?.etager).toBe("1");
    expect(stored?.tagform).toBe("fladt tag");
    expect(stored?.energiklasse).toBe("A2015");
    expect(stored?.kilde).toBe("mock");
    expect(stored?.saerligeKrav).toEqual([]);
  });

  it("PersistedProject type accepterer hus_dna felt", () => {
    // Verificerer at typen har feltet — compile-fejl synlig via bun build
    const _: PersistedProject["hus_dna"] = null;
    expect(_).toBeNull();
  });
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
