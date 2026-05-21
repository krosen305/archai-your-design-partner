import { describe, it, expect } from "bun:test";
import { mapByggetypeToProjectType, mapUsageFromBbr, mapAntalEtager } from "./mappers";

describe("mapByggetypeToProjectType", () => {
  it("maps nybyg → new_build", () => {
    expect(mapByggetypeToProjectType("nybyg")).toBe("new_build");
  });
  it("maps tilbyg → extension", () => {
    expect(mapByggetypeToProjectType("tilbyg")).toBe("extension");
  });
  it("maps ombyg → renovation", () => {
    expect(mapByggetypeToProjectType("ombyg")).toBe("renovation");
  });
  it("defaults unknown type to new_build", () => {
    expect(mapByggetypeToProjectType(undefined)).toBe("new_build");
  });
});

describe("mapUsageFromBbr", () => {
  it("returns residential for null code", () => {
    expect(mapUsageFromBbr(null)).toBe("residential");
  });
  it("returns residential for code 120", () => {
    expect(mapUsageFromBbr("120")).toBe("residential");
  });
  it("returns garage for code 910", () => {
    expect(mapUsageFromBbr("910")).toBe("garage");
  });
  it("returns commercial for code 320", () => {
    expect(mapUsageFromBbr("320")).toBe("commercial");
  });
  it("returns mixed for unrecognized code", () => {
    expect(mapUsageFromBbr("999")).toBe("mixed");
  });
});

describe("mapAntalEtager", () => {
  it("returns null for undefined", () => {
    expect(mapAntalEtager(undefined)).toBeNull();
  });
  it("rounds up fractional floors", () => {
    expect(mapAntalEtager(1.5)).toBe(2);
  });
  it("returns integer as-is", () => {
    expect(mapAntalEtager(2)).toBe(2);
  });
});
