// src/integrations/plandata/normalize-kloakopland.test.ts
import { describe, it, expect } from "bun:test";
import { normalizeKloakoplandType } from "./normalize-kloakopland";

describe("normalizeKloakoplandType", () => {
  it("returnerer null for null-input", () => {
    expect(normalizeKloakoplandType(null)).toBeNull();
  });

  it("returnerer null for tom streng", () => {
    expect(normalizeKloakoplandType("")).toBeNull();
  });

  it("genkender 'Separat' fra Plandata", () => {
    expect(normalizeKloakoplandType("Separat")).toBe("separat");
  });

  it("genkender 'Separatkloak'", () => {
    expect(normalizeKloakoplandType("Separatkloak")).toBe("separat");
  });

  it("genkender 'Separatkloakeret: spildevand' (BBR-format)", () => {
    expect(normalizeKloakoplandType("Separatkloakeret: spildevand")).toBe("separat");
  });

  it("genkender 'Fælles' fra Plandata", () => {
    expect(normalizeKloakoplandType("Fælles")).toBe("faelles");
  });

  it("genkender 'Fælleskloak'", () => {
    expect(normalizeKloakoplandType("Fælleskloak")).toBe("faelles");
  });

  it("genkender 'Fælleskloakeret: spildevand + tag- og overfladevand' (BBR-format)", () => {
    expect(normalizeKloakoplandType("Fælleskloakeret: spildevand + tag- og overfladevand")).toBe(
      "faelles",
    );
  });

  it("er case-insensitiv for 'SEPARAT'", () => {
    expect(normalizeKloakoplandType("SEPARAT")).toBe("separat");
  });

  it("er case-insensitiv for 'fælles'", () => {
    expect(normalizeKloakoplandType("fælles")).toBe("faelles");
  });

  it("genkender 'faelles' (ASCII-variant)", () => {
    expect(normalizeKloakoplandType("faelles")).toBe("faelles");
  });

  it("genkender 'separat kloakeret' (med mellemrum)", () => {
    expect(normalizeKloakoplandType("separat kloakeret")).toBe("separat");
  });

  it("returnerer null for ukendt streng", () => {
    expect(normalizeKloakoplandType("Renseanlæg")).toBeNull();
  });

  it("returnerer null for streng uden genkendelige mønstre", () => {
    expect(normalizeKloakoplandType("Ingen oplysninger")).toBeNull();
  });
});
