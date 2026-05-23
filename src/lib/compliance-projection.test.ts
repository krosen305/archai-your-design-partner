import { describe, it, expect } from "bun:test";
import {
  calculateProjectedSamletAreal,
  calculateProjectedBebyggelsespct,
} from "./compliance-projection";

describe("calculateProjectedSamletAreal", () => {
  it("returns only oensketAreal for nybyg", () => {
    expect(calculateProjectedSamletAreal("nybyg", 120, 80)).toBe(120);
  });

  it("returns existing + oensket for tilbyg", () => {
    expect(calculateProjectedSamletAreal("tilbyg", 40, 80)).toBe(120);
  });

  it("returns existing only for ombyg (no new footprint)", () => {
    expect(calculateProjectedSamletAreal("ombyg", 40, 80)).toBe(80);
  });

  it("returns existing when byggetype is undefined", () => {
    expect(calculateProjectedSamletAreal(undefined, 40, 80)).toBe(80);
  });

  it("treats null eksisterendeAreal as 0", () => {
    expect(calculateProjectedSamletAreal("tilbyg", 40, null)).toBe(40);
  });
});

describe("calculateProjectedBebyggelsespct", () => {
  it("returns null when grundareal is null", () => {
    expect(calculateProjectedBebyggelsespct(100, null)).toBeNull();
  });

  it("returns null when samlet is 0", () => {
    expect(calculateProjectedBebyggelsespct(0, 800)).toBeNull();
  });

  it("computes percentage correctly", () => {
    expect(calculateProjectedBebyggelsespct(160, 800)).toBe(20);
  });
});
