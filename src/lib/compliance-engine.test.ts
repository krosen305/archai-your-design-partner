import { describe, it, expect } from "bun:test";
import { calculateComplianceMetrics } from "./compliance-engine";
import type { BbrKompliantData } from "@/integrations/bbr/client";
import type { Kommuneplanramme } from "@/integrations/plandata/client";

const baseBbr: BbrKompliantData = {
  byggeaar: "1985",
  bebygget_areal: 120,
  samlet_areal: 240,
  antal_etager: 2,
  anvendelseskode: "120",
  anvendelse_tekst: "Fritliggende enfamilieshus",
  grundareal: 800,
  bebyggelsesprocent: 15,
  beregning_mulig: true,
  fejl: null,
};

const baseRamme: Kommuneplanramme = {
  planid: "test-1",
  plannavn: "Testramme",
  plannr: "1.1.B",
  kommunenavn: "Testkommune",
  komnr: 101,
  bebygpct: 30,
  maxetager: 2,
  maxbygnhjd: 8.5,
  anvgen: 1,
  anvendelseGenerel: "Boligformål",
  fremtidigzonestatus: null,
  sforhold: null,
  plandokumentLink: null,
  datoIkraft: null,
};

describe("calculateComplianceMetrics", () => {
  it("beregner maxBygningsareal korrekt", () => {
    const m = calculateComplianceMetrics(baseBbr, baseRamme);
    // 800 m² × 30% = 240 m²
    expect(m.maxBygningsareal).toBe(240);
  });

  it("beregner remainingBygningsareal korrekt", () => {
    const m = calculateComplianceMetrics(baseBbr, baseRamme);
    // 240 - 120 = 120 m²
    expect(m.remainingBygningsareal).toBe(120);
  });

  it("returnerer erCompliant=true når inden for grænser", () => {
    const m = calculateComplianceMetrics(baseBbr, baseRamme);
    expect(m.erCompliant).toBe(true);
  });

  it("returnerer erCompliant=false når bebyggelsesprocent overskrides", () => {
    const m = calculateComplianceMetrics({ ...baseBbr, bebyggelsesprocent: 35 }, baseRamme);
    expect(m.erCompliant).toBe(false);
  });

  it("returnerer erCompliant=false når etager overskrides", () => {
    const m = calculateComplianceMetrics({ ...baseBbr, antal_etager: 3 }, baseRamme);
    expect(m.erCompliant).toBe(false);
  });

  it("håndterer null BBR", () => {
    const m = calculateComplianceMetrics(null, baseRamme);
    expect(m.grundareal).toBeNull();
    expect(m.maxBygningsareal).toBeNull();
    expect(m.erCompliant).toBe(true);
  });

  it("håndterer null ramme — ingen grænser → compliant", () => {
    const m = calculateComplianceMetrics(baseBbr, null);
    expect(m.maxBygningsareal).toBeNull();
    expect(m.remainingBygningsareal).toBeNull();
    expect(m.maxBebyggelsesprocent).toBeNull();
    expect(m.erCompliant).toBe(true);
  });

  it("passerer alle felter korrekt videre", () => {
    const m = calculateComplianceMetrics(baseBbr, baseRamme);
    expect(m.grundareal).toBe(800);
    expect(m.currentBygningsareal).toBe(120);
    expect(m.currentBebyggelsesprocent).toBe(15);
    expect(m.maxBebyggelsesprocent).toBe(30);
    expect(m.currentEtager).toBe(2);
    expect(m.maxEtager).toBe(2);
    expect(m.maxBygningshoejde).toBe(8.5);
  });

  it("runder maxBygningsareal til heltal", () => {
    // 700 × 30% = 210 — allerede heltal
    // 700 × 33% = 231 — heltal
    // 1000 × 33% = 330 — heltal
    const m = calculateComplianceMetrics({ ...baseBbr, grundareal: 1000 }, {
      ...baseRamme,
      bebygpct: 33,
    });
    expect(m.maxBygningsareal).toBe(330);
  });
});
