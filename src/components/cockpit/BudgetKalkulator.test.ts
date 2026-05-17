import { describe, it, expect } from "bun:test";
import {
  beregnNedrivning,
  beregnForsyning,
  beregnGeoteknik,
  beregnNybyg,
  beregnBudget,
  type BudgetInput,
} from "./BudgetKalkulator";

describe("beregnNedrivning", () => {
  it("beregner standard sats (800–1200 kr/m²)", () => {
    const r = beregnNedrivning(100, "1990");
    expect(r.min).toBe(80_000);
    expect(r.max).toBe(120_000);
    expect(r.note).toBeUndefined();
  });

  it("tillægger asbest ved byggeår < 1978", () => {
    const r = beregnNedrivning(100, "1975");
    expect(r.min).toBe(100_000);
    expect(r.max).toBe(140_000);
    expect(r.note).toContain("asbestrisiko");
  });

  it("returnerer nullresultat ved manglende areal", () => {
    const r = beregnNedrivning(null, "1990");
    expect(r.min).toBe(0);
    expect(r.max).toBe(0);
  });
});

describe("beregnForsyning", () => {
  it("ekskluderer gas ved ikke-naturgas opvarmning", () => {
    const r = beregnForsyning(false);
    expect(r.min).toBe(55_000);
    expect(r.max).toBe(110_000);
  });

  it("inkluderer gas ved naturgas", () => {
    const r = beregnForsyning(true);
    expect(r.min).toBe(65_000);
    expect(r.max).toBe(125_000);
  });
});

describe("beregnGeoteknik", () => {
  it("kategori 1: god grund", () => {
    const r = beregnGeoteknik(1);
    expect(r.min).toBe(0);
    expect(r.max).toBe(50_000);
  });

  it("kategori 3: dårlig grund / pæl", () => {
    const r = beregnGeoteknik(3);
    expect(r.min).toBe(200_000);
    expect(r.max).toBe(500_000);
  });
});

describe("beregnNybyg", () => {
  it("beregner standard sats (22.000 kr/m²)", () => {
    const r = beregnNybyg(100, null, false);
    expect(r.min).toBe(2_200_000);
    expect(r.max).toBe(2_600_000);
  });

  it("tillægger kælder (+5.000 kr/m²)", () => {
    const r = beregnNybyg(100, null, true);
    expect(r.min).toBe(2_700_000);
    expect(r.max).toBe(3_100_000);
  });

  it("returnerer nullresultat ved manglende areal", () => {
    const r = beregnNybyg(null, null, false);
    expect(r.min).toBe(0);
    expect(r.max).toBe(0);
  });

  it("tillægger lavenergi-sats ved passiv", () => {
    const r = beregnNybyg(100, "passiv", false);
    expect(r.min).toBe(2_400_000); // 100 × 24.000
    expect(r.max).toBe(2_800_000); // 100 × 28.000
  });
});

describe("beregnBudget", () => {
  it("summer alle kategorier korrekt", () => {
    const input: BudgetInput = {
      bebyggetArealM2: 100,
      byggeaar: "1990",
      oensketArealM2: 150,
      energiklasse: null,
      harKaelder: false,
      geoteknikKategori: 1,
      naturgas: false,
    };
    const r = beregnBudget(input);
    expect(r.totalMin).toBe(80_000 + 55_000 + 0 + 3_300_000);
    expect(r.totalMax).toBe(120_000 + 110_000 + 50_000 + 3_900_000);
    expect(r.totalTypisk).toBe(Math.round((r.totalMin + r.totalMax) / 2));
  });
});
