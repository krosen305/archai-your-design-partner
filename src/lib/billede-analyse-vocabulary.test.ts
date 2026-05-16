import { describe, expect, test } from "bun:test";
import {
  BILLEDE_ANALYSE_SYSTEM_PROMPT,
  BILLEDE_ANALYSE_VOCAB,
  type BilledeAnalyseResultat,
} from "./billede-analyse-vocabulary";

const KATEGORIER = [
  "facade",
  "tagform",
  "vinduer",
  "materialer",
  "saerligeTraek",
  "farver",
  "stil",
] as const;

describe("BILLEDE_ANALYSE_VOCAB", () => {
  test("alle 7 kategorier eksisterer", () => {
    for (const kategori of KATEGORIER) {
      expect(BILLEDE_ANALYSE_VOCAB[kategori]).toBeDefined();
    }
  });

  test("hver kategori har mindst 5 termer", () => {
    for (const kategori of KATEGORIER) {
      expect(BILLEDE_ANALYSE_VOCAB[kategori].length).toBeGreaterThanOrEqual(5);
    }
  });

  test("ingen dubletter inden for en kategori", () => {
    for (const kategori of KATEGORIER) {
      const termer = BILLEDE_ANALYSE_VOCAB[kategori];
      expect(new Set(termer).size).toBe(termer.length);
    }
  });
});

describe("BILLEDE_ANALYSE_SYSTEM_PROMPT", () => {
  test("indeholder alle kategorinavne", () => {
    for (const kategori of KATEGORIER) {
      expect(BILLEDE_ANALYSE_SYSTEM_PROMPT).toContain(kategori);
    }
  });

  test("indeholder JSON-format-skabelon", () => {
    expect(BILLEDE_ANALYSE_SYSTEM_PROMPT).toContain('"kategorier"');
    expect(BILLEDE_ANALYSE_SYSTEM_PROMPT).toContain('"konflikter"');
    expect(BILLEDE_ANALYSE_SYSTEM_PROMPT).toContain('"ekstraTags"');
    expect(BILLEDE_ANALYSE_SYSTEM_PROMPT).toContain('"confidence"');
  });

  test("indeholder cache-venligt VOCAB-afsnit", () => {
    expect(BILLEDE_ANALYSE_SYSTEM_PROMPT).toContain("VOCAB:");
  });

  test("resultattypen matcher kategorierne", () => {
    const resultat: BilledeAnalyseResultat = {
      kategorier: {
        facade: [],
        tagform: [],
        vinduer: [],
        materialer: [],
        saerligeTraek: [],
        farver: [],
        stil: [],
      },
      konflikter: [],
      ekstraTags: [],
      confidence: 100,
      kilde: "mock",
    };

    expect(Object.keys(resultat.kategorier)).toEqual([...KATEGORIER]);
  });
});
