import { describe, it, expect } from "bun:test";
import {
  uniqueTags,
  addTag,
  removeTag,
  resolveKonflikt,
  removeExtraTag,
  isRemoteImageUrl,
} from "./billedanalyse-tags";
import type { BilledeAnalyseResultat } from "@/lib/billede-analyse-vocabulary";

function makeResultat(overrides: Partial<BilledeAnalyseResultat> = {}): BilledeAnalyseResultat {
  return {
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
    confidence: 0.9,
    kilde: "haiku",
    ...overrides,
  };
}

describe("uniqueTags", () => {
  it("removes exact duplicates", () => {
    expect(uniqueTags(["tegl", "tegl", "beton"])).toEqual(["tegl", "beton"]);
  });

  it("deduplicates case-insensitively", () => {
    expect(uniqueTags(["Tegl", "tegl"])).toEqual(["Tegl"]);
  });

  it("filters empty strings", () => {
    expect(uniqueTags(["tegl", "", "  "])).toEqual(["tegl"]);
  });

  it("returns empty array for empty input", () => {
    expect(uniqueTags([])).toEqual([]);
  });
});

describe("addTag", () => {
  it("adds tag to the specified category", () => {
    const r = makeResultat();
    const next = addTag("facade", "tegl", r);
    expect(next.kategorier.facade).toContain("tegl");
  });

  it("ignores empty string tags", () => {
    const r = makeResultat();
    const next = addTag("facade", "  ", r);
    expect(next.kategorier.facade).toHaveLength(0);
  });

  it("deduplicates on add", () => {
    const r = makeResultat({ kategorier: { ...makeResultat().kategorier, facade: ["tegl"] } });
    const next = addTag("facade", "tegl", r);
    expect(next.kategorier.facade).toHaveLength(1);
  });

  it("does not mutate the original", () => {
    const r = makeResultat();
    addTag("facade", "tegl", r);
    expect(r.kategorier.facade).toHaveLength(0);
  });
});

describe("removeTag", () => {
  it("removes the specified tag", () => {
    const r = makeResultat({ kategorier: { ...makeResultat().kategorier, facade: ["tegl", "beton"] } });
    const next = removeTag("facade", "tegl", r);
    expect(next.kategorier.facade).toEqual(["beton"]);
  });

  it("does not mutate the original", () => {
    const r = makeResultat({ kategorier: { ...makeResultat().kategorier, facade: ["tegl"] } });
    removeTag("facade", "tegl", r);
    expect(r.kategorier.facade).toHaveLength(1);
  });
});

describe("resolveKonflikt", () => {
  it("merges chosen tags into category and removes the conflict", () => {
    const r = makeResultat({
      konflikter: [
        { kategori: "facade", muligheder: [["tegl"], ["beton"]], billedAntal: [2, 1] },
      ],
    });
    const next = resolveKonflikt("facade", ["tegl"], r);
    expect(next.kategorier.facade).toContain("tegl");
    expect(next.konflikter).toHaveLength(0);
  });

  it("only removes the conflict for the resolved category", () => {
    const r = makeResultat({
      konflikter: [
        { kategori: "facade", muligheder: [["tegl"], ["beton"]], billedAntal: [2, 1] },
        { kategori: "tagform", muligheder: [["fladt tag"], ["sadeltag"]], billedAntal: [1, 2] },
      ],
    });
    const next = resolveKonflikt("facade", ["tegl"], r);
    expect(next.konflikter).toHaveLength(1);
    expect(next.konflikter[0].kategori).toBe("tagform");
  });
});

describe("removeExtraTag", () => {
  it("removes the tag from ekstraTags", () => {
    const r = makeResultat({ ekstraTags: ["a", "b", "c"] });
    const next = removeExtraTag("b", r);
    expect(next.ekstraTags).toEqual(["a", "c"]);
  });
});

describe("isRemoteImageUrl", () => {
  it("returns true for https URL", () => {
    expect(isRemoteImageUrl("https://example.com/img.jpg")).toBe(true);
  });

  it("returns true for http URL", () => {
    expect(isRemoteImageUrl("http://example.com/img.jpg")).toBe(true);
  });

  it("returns false for data URL", () => {
    expect(isRemoteImageUrl("data:image/jpeg;base64,abc")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isRemoteImageUrl("")).toBe(false);
  });
});
