import { describe, it, expect } from "bun:test";
import { beregnProjektReadiness } from "./projekt-readiness";
import type { DataSourceKind, DataSourceStatus, ComplianceFlag } from "@/types/project-state";

describe("beregnProjektReadiness", () => {
  const handlingsbarKilder: DataSourceKind[] = [
    "bbr",
    "lokalplaner",
    "kommuneplanramme",
    "fbb",
    "naturbeskyttelse",
    "arealdata",
    "dkjord",
    "geusRisk",
    "servitutter",
    "terrain",
    "fjernvarme",
    "naboer",
    "matGeometri",
    "vurdering",
    "tjekditnet",
    "energimaerke",
  ];

  // Helper: create a complete dataStatus object with all sources at the given status
  function createDataStatus(status: DataSourceStatus): Record<DataSourceKind, DataSourceStatus> {
    const result: Record<DataSourceKind, DataSourceStatus> = {
      bbr: status,
      lokalplaner: status,
      kommuneplanramme: status,
      fbb: status,
      naturbeskyttelse: status,
      arealdata: status,
      dkjord: status,
      geusRisk: status,
      servitutter: status,
      terrain: status,
      fjernvarme: status,
      naboer: status,
      matGeometri: status,
      vurdering: status,
      byggeanalyse: "loading", // secondary AI pipeline source — not counted
      billedanalyse: "loading", // secondary AI pipeline source — not counted
      husDna: "loading", // secondary AI pipeline source — not counted
      tjekditnet: status,
      energimaerke: status,
    };
    return result;
  }

  // Helper: create a partial dataStatus object, allowing selective override
  function makeStatus(
    overrides: Partial<Record<DataSourceKind, DataSourceStatus>>,
  ): Record<DataSourceKind, DataSourceStatus> {
    const defaults: Record<DataSourceKind, DataSourceStatus> = {
      bbr: "missing",
      lokalplaner: "missing",
      kommuneplanramme: "missing",
      fbb: "missing",
      naturbeskyttelse: "missing",
      arealdata: "missing",
      dkjord: "missing",
      geusRisk: "missing",
      servitutter: "missing",
      terrain: "missing",
      fjernvarme: "missing",
      naboer: "missing",
      matGeometri: "missing",
      vurdering: "missing",
      byggeanalyse: "loading",
      billedanalyse: "loading",
      husDna: "loading",
      tjekditnet: "missing",
      energimaerke: "missing",
    };
    return { ...defaults, ...overrides };
  }

  it("should return 100 when all handlingsbare kilder are fresh and no flags", () => {
    const dataStatus = createDataStatus("fresh");
    const flags: ComplianceFlag[] = [];
    const result = beregnProjektReadiness(dataStatus, flags);
    expect(result).toBe(100);
  });

  it("should return 40 when all handlingsbare kilder are missing and no flags", () => {
    // missing sources → data 0%, no flags → compliance 100%
    // 0 * 0.6 + 100 * 0.4 = 40
    const dataStatus = createDataStatus("missing");
    const flags: ComplianceFlag[] = [];
    const result = beregnProjektReadiness(dataStatus, flags);
    expect(result).toBe(40);
  });

  it("should return 70 when all handlingsbare kilder are stale and no flags", () => {
    // stale sources → data 50%, no flags → compliance 100%
    // 50 * 0.6 + 100 * 0.4 = 30 + 40 = 70
    const dataStatus = createDataStatus("stale");
    const flags: ComplianceFlag[] = [];
    const result = beregnProjektReadiness(dataStatus, flags);
    expect(result).toBe(70);
  });

  it("should return 80 when data is fresh and compliance is 50% (1 ok, 1 advarsel)", () => {
    // fresh sources → data 100%, 1 ok + 1 advarsel → compliance 50%
    // 100 * 0.6 + 50 * 0.4 = 60 + 20 = 80
    const dataStatus = createDataStatus("fresh");
    const flags: ComplianceFlag[] = [
      {
        id: "1",
        label: "Test OK",
        status: "ok",
        detalje: null,
        aktuelVærdi: null,
        tilladt: null,
        kilde: "beregnet",
      },
      {
        id: "2",
        label: "Test Advarsel",
        status: "advarsel",
        detalje: null,
        aktuelVærdi: null,
        tilladt: null,
        kilde: "beregnet",
      },
    ];
    const result = beregnProjektReadiness(dataStatus, flags);
    expect(result).toBe(80);
  });

  it("should return 60 when data is fresh and compliance is 0% (1 blocker)", () => {
    // fresh sources → data 100%, 1 blocker (0 ok) → compliance 0%
    // 100 * 0.6 + 0 * 0.4 = 60
    const dataStatus = createDataStatus("fresh");
    const flags: ComplianceFlag[] = [
      {
        id: "1",
        label: "Hard Stop",
        status: "blocker",
        detalje: null,
        aktuelVærdi: null,
        tilladt: null,
        kilde: "regelkerne",
      },
    ];
    const result = beregnProjektReadiness(dataStatus, flags);
    expect(result).toBe(60);
  });

  it("sekundære AI-pipeline-kilder (byggeanalyse, billedanalyse, husDna) ignoreres", () => {
    const status = makeStatus({
      bbr: "missing",
      lokalplaner: "missing",
      kommuneplanramme: "missing",
      fbb: "missing",
      naturbeskyttelse: "missing",
      arealdata: "missing",
      dkjord: "missing",
      geusRisk: "missing",
      servitutter: "missing",
      terrain: "missing",
      fjernvarme: "missing",
      naboer: "missing",
      matGeometri: "missing",
      vurdering: "missing",
      tjekditnet: "missing",
      energimaerke: "missing",
      // these three are "fresh" but SHOULD be ignored
      byggeanalyse: "fresh",
      billedanalyse: "fresh",
      husDna: "fresh",
    });
    // All handlingsbare are missing → data = 0%, compliance = 100% → 40
    const flags: ComplianceFlag[] = [];
    const result = beregnProjektReadiness(status, flags);
    expect(result).toBe(40);
  });

  it("blandet: halvdelen fresh, én ok og én advarsel → 50", () => {
    // 8 fresh out of 16 → dataPct = 0.5
    const status = makeStatus({
      bbr: "fresh",
      lokalplaner: "fresh",
      kommuneplanramme: "fresh",
      fbb: "fresh",
      naturbeskyttelse: "fresh",
      arealdata: "fresh",
      dkjord: "fresh",
      geusRisk: "fresh",
      servitutter: "missing",
      terrain: "missing",
      fjernvarme: "missing",
      naboer: "missing",
      matGeometri: "missing",
      vurdering: "missing",
      tjekditnet: "missing",
      energimaerke: "missing",
    });
    const flags: ComplianceFlag[] = [
      {
        id: "1",
        label: "OK",
        status: "ok",
        detalje: null,
        aktuelVærdi: null,
        tilladt: null,
        kilde: "bbr",
      },
      {
        id: "2",
        label: "Advarsel",
        status: "advarsel",
        detalje: null,
        aktuelVærdi: null,
        tilladt: null,
        kilde: "plandata",
      },
    ];
    // dataPct = 0.5, compliancePct = 0.5
    // 0.6 * 0.5 * 100 + 0.4 * 0.5 * 100 = 30 + 20 = 50
    const result = beregnProjektReadiness(status, flags);
    expect(result).toBe(50);
  });
});
