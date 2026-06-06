import { describe, expect, it } from "bun:test";
import { kommunekodeFraKommunenavn, kommunenavnFraKode } from "./kommuner";

describe("kommuner", () => {
  it("finder kommunenavn fra 4-cifret kommunekode", () => {
    expect(kommunenavnFraKode("0173")).toBe("Lyngby-Taarbæk");
  });

  it("finder kommunekode fra gemt kommunenavn", () => {
    expect(kommunekodeFraKommunenavn("Lyngby-Taarbæk")).toBe("0173");
  });

  it("accepterer Kommune-suffix ved legacy restore", () => {
    expect(kommunekodeFraKommunenavn("Lyngby-Taarbæk Kommune")).toBe("0173");
  });

  it("returnerer null for ukendt kommunenavn", () => {
    expect(kommunekodeFraKommunenavn("Ikke en kommune")).toBeNull();
  });
});
