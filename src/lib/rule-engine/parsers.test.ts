import { describe, it, expect } from "bun:test";
import { parseSetbackM, parseRoofTypes, parseZone } from "./parsers";

describe("parseSetbackM", () => {
  it("returns null for null input", () => {
    expect(parseSetbackM(null)).toBeNull();
  });
  it("extracts minimum setback from multi-value string", () => {
    expect(parseSetbackM("2,5 m fra vejskel, 2 m fra naboskel")).toBe(2);
  });
  it("handles single value with decimal comma", () => {
    expect(parseSetbackM("3,5 m")).toBe(3.5);
  });
  it("returns null for string with no meter values", () => {
    expect(parseSetbackM("ingen byggelinjer")).toBeNull();
  });
});

describe("parseRoofTypes", () => {
  it("returns null for null input", () => {
    expect(parseRoofTypes(null)).toBeNull();
  });
  it("detects sadeltag", () => {
    expect(parseRoofTypes("Sadeltag med hældning 25-45°")).toContain("saddeltag");
  });
  it("detects fladt tag", () => {
    expect(parseRoofTypes("Fladt tag tilladt")).toContain("fladt");
  });
  it("detects multiple types", () => {
    const result = parseRoofTypes("Sadeltag eller fladt tag");
    expect(result).toContain("saddeltag");
    expect(result).toContain("fladt");
  });
  it("falls back to trimmed input for unknown types", () => {
    const result = parseRoofTypes("Ukendt tagtype X");
    expect(result).toEqual(["Ukendt tagtype X"]);
  });
});

describe("parseZone", () => {
  it("returns urban for null ramme (dansk standard)", () => {
    expect(parseZone(null)).toBe("urban");
  });
  it("detects byzone", () => {
    expect(parseZone({ fremtidigzonestatus: "Byzone" } as any)).toBe("urban");
  });
  it("detects sommerhuszone", () => {
    expect(parseZone({ fremtidigzonestatus: "Sommerhuszone" } as any)).toBe("summerhouse");
  });
  it("detects landzone", () => {
    expect(parseZone({ fremtidigzonestatus: "Landzone" } as any)).toBe("rural");
  });
  it("returns unknown for unrecognized non-null ramme", () => {
    expect(parseZone({ fremtidigzonestatus: "Ukendt" } as any)).toBe("unknown");
  });
});
