import { describe, expect, it } from "bun:test";
import { loadBr18Catalog, getCatalogVersions } from "./catalog";

describe("loadBr18Catalog", () => {
  it("returnerer ikke-tom array af validerede krav", () => {
    const catalog = loadBr18Catalog("2024");
    expect(catalog.length).toBeGreaterThan(0);
  });

  it("kaster ved ukendt version", () => {
    expect(() => loadBr18Catalog("1990")).toThrow(/Unknown BR18 version/);
  });

  it("alle krav har sourceUrl der starter med https://", () => {
    const catalog = loadBr18Catalog("2024");
    for (const req of catalog) {
      expect(req.sourceUrl).toStartWith("https://");
    }
  });

  it("alle krav har unik id", () => {
    const catalog = loadBr18Catalog("2024");
    const ids = catalog.map((r) => r.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});

describe("getCatalogVersions", () => {
  it("returnerer mindst version 2024", () => {
    expect(getCatalogVersions()).toContain("2024");
  });
});
