import { describe, it, expect } from "bun:test";
import {
  beregnNedrivning,
  beregnForsyning,
  beregnGeoteknik,
  beregnNybyg,
  beregnBudget,
} from "./budget-calculator";

describe("beregnNedrivning", () => {
  it("returns zeroes when bebyggetArealM2 is null", () => {
    const r = beregnNedrivning(null, "2000");
    expect(r.min).toBe(0);
    expect(r.max).toBe(0);
  });

  it("applies asbest rate for byggeaar < 1978", () => {
    const r = beregnNedrivning(100, "1970");
    expect(r.min).toBe(100 * 1_000);
    expect(r.max).toBe(100 * 1_400);
    expect(r.note).toContain("asbest");
  });

  it("applies standard rate for byggeaar >= 1978", () => {
    const r = beregnNedrivning(100, "1980");
    expect(r.min).toBe(100 * 800);
    expect(r.max).toBe(100 * 1_200);
    expect(r.note).toBeUndefined();
  });
});

describe("beregnForsyning", () => {
  it("adds gas surcharge when naturgas is true", () => {
    const withGas = beregnForsyning(true);
    const withoutGas = beregnForsyning(false);
    expect(withGas.min).toBeGreaterThan(withoutGas.min);
    expect(withGas.min).toBe(55_000 + 10_000);
    expect(withGas.max).toBe(110_000 + 15_000);
  });

  it("returns base range without gas", () => {
    const r = beregnForsyning(false);
    expect(r.min).toBe(55_000);
    expect(r.max).toBe(110_000);
  });
});

describe("beregnGeoteknik", () => {
  it("returns 0–50k for kategori 1", () => {
    const r = beregnGeoteknik(1);
    expect(r.min).toBe(0);
    expect(r.max).toBe(50_000);
  });

  it("returns 50k–200k for kategori 2", () => {
    const r = beregnGeoteknik(2);
    expect(r.min).toBe(50_000);
    expect(r.max).toBe(200_000);
  });

  it("returns 200k–500k for kategori 3", () => {
    const r = beregnGeoteknik(3);
    expect(r.min).toBe(200_000);
    expect(r.max).toBe(500_000);
  });
});

describe("beregnNybyg", () => {
  it("returns zeroes when arealM2 is null", () => {
    const r = beregnNybyg(null, null, false);
    expect(r.min).toBe(0);
    expect(r.max).toBe(0);
  });

  it("applies lavenergi surcharge for passiv class", () => {
    const base = beregnNybyg(100, "BR18", false);
    const lavenergi = beregnNybyg(100, "passiv", false);
    expect(lavenergi.min).toBeGreaterThan(base.min);
  });

  it("applies kælder surcharge", () => {
    const base = beregnNybyg(100, "BR18", false);
    const kaelder = beregnNybyg(100, "BR18", true);
    expect(kaelder.min).toBeGreaterThan(base.min);
  });
});

describe("beregnBudget", () => {
  it("totalTypisk is average of totalMin and totalMax", () => {
    const r = beregnBudget({
      bebyggetArealM2: 100,
      byggeaar: "1990",
      oensketArealM2: 150,
      energiklasse: "BR18",
      harKaelder: false,
      geoteknikKategori: 1,
      naturgas: false,
    });
    expect(r.totalTypisk).toBe(Math.round((r.totalMin + r.totalMax) / 2));
  });
});
