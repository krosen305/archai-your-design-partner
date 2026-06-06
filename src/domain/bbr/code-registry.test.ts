import { describe, expect, it } from "bun:test";
import { resolveBbrCode } from "./code-registry";

describe("resolveBbrCode", () => {
  it("resolves building usage labels from the official BBR codelist", () => {
    expect(resolveBbrCode("BygAnvendelse", "131")?.label).toBe("Række-, kæde- og klyngehus");
    expect(resolveBbrCode("BygAnvendelse", "910")?.label).toBe("Garage");
  });

  it("resolves material and technical-installation labels", () => {
    expect(resolveBbrCode("Tagdaekningsmateriale", "2")?.label).toBe("Tagpap med stor hældning");
    expect(resolveBbrCode("YdervaeggenesMateriale", "5")?.label).toBe("Træ");
    expect(resolveBbrCode("Sloejfning", "3")?.label).toBe("Tanken er tømt, afblændet og opfyldt");
  });

  it("marks disabled codes without hiding the official label", () => {
    const result = resolveBbrCode("GruAfloebsforhold", "10");
    expect(result?.label).toBe("Afløb til offentligt kloaksystem");
    expect(result?.disabled).toBe(true);
  });

  it("returns a controlled fallback for unknown codes", () => {
    const result = resolveBbrCode("BygAnvendelse", "does-not-exist");
    expect(result?.known).toBe(false);
    expect(result?.label).toBe("Ukendt BBR-kode does-not-exist");
  });
});
