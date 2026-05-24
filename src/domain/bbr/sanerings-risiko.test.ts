import { describe, expect, it } from "bun:test";
import { deriveSaneringsRisiko } from "@/domain/bbr/sanerings-risiko";

describe("deriveSaneringsRisiko", () => {
  it("returns null when byggeaar is null", () => {
    expect(deriveSaneringsRisiko(null, null, null)).toBeNull();
  });

  it("returns hoej for pre-1950 building", () => {
    expect(deriveSaneringsRisiko(1930, null, null)).toBe("hoej");
    expect(deriveSaneringsRisiko(1949, null, null)).toBe("hoej");
  });

  it("returns moderat for 1950-1979 buildings", () => {
    expect(deriveSaneringsRisiko(1965, null, null)).toBe("moderat");
    expect(deriveSaneringsRisiko(1979, null, null)).toBe("moderat");
  });

  it("returns lav for post-1984 building with no asbestos materials", () => {
    expect(deriveSaneringsRisiko(1990, "1", "1")).toBe("lav");
  });

  it("returns moderat for pre-1985 building with eternit ydervæg (byg032 kode 5)", () => {
    expect(deriveSaneringsRisiko(1982, "5", null)).toBe("moderat");
  });

  it("returns moderat for pre-1985 building with eternit tagdækning (byg033 kode 2)", () => {
    // tagdækning kode 2 = Eternit/fibercement (NOT kode 5 which is straw)
    expect(deriveSaneringsRisiko(1983, "1", "2")).toBe("moderat");
  });

  it("returns lav for post-1985 building even with eternit ydervæg", () => {
    expect(deriveSaneringsRisiko(1988, "5", "2")).toBe("lav");
  });

  it("returns hoej for 1948 building regardless of materials", () => {
    expect(deriveSaneringsRisiko(1948, "1", "1")).toBe("hoej");
  });
});
