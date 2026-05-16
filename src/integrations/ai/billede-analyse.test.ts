import { describe, test, expect } from "bun:test";
import { BilledeAnalyseService } from "./billede-analyse";

const KATEGORIER = [
  "facade",
  "tagform",
  "vinduer",
  "materialer",
  "saerligeTraek",
  "farver",
  "stil",
] as const;

describe("BilledeAnalyseService.analyser (mock)", () => {
  test("returnerer mock-resultat uden API-nøgle", async () => {
    const result = await BilledeAnalyseService.analyser(["https://example.com/hus.jpg"]);
    expect(result.kilde).toBe("mock");
  });

  test("mock-resultat har alle 7 kategorier", async () => {
    const result = await BilledeAnalyseService.analyser([]);
    for (const k of KATEGORIER) {
      expect(Array.isArray(result.kategorier[k])).toBe(true);
    }
  });

  test("mock-resultat har ingen konflikter", async () => {
    const result = await BilledeAnalyseService.analyser([]);
    expect(result.konflikter).toEqual([]);
  });

  test("confidence er et tal mellem 0 og 100", async () => {
    const result = await BilledeAnalyseService.analyser([]);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(100);
  });

  test("tom URL-array returnerer mock", async () => {
    const result = await BilledeAnalyseService.analyser([]);
    expect(result.kilde).toBe("mock");
  });

  test("mock-resultat har ekstraTags som array", async () => {
    const result = await BilledeAnalyseService.analyser([]);
    expect(Array.isArray(result.ekstraTags)).toBe(true);
  });
});
