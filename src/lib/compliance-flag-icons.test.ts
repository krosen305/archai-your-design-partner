import { describe, it, expect } from "bun:test";
import { flagIcon } from "./compliance-flag-icons";

describe("flagIcon", () => {
  it("returns heritage icon for fredet", () => {
    expect(flagIcon("fredet_bygning")).toBe("🏛️");
  });
  it("returns wave icon for strandbeskyttelse", () => {
    expect(flagIcon("strandbeskyttelse")).toBe("🌊");
  });
  it("returns tree icon for fredskov", () => {
    expect(flagIcon("fredskov")).toBe("🌲");
  });
  it("returns tree2 icon for skovbyggelinje", () => {
    expect(flagIcon("skovbyggelinje_buffer")).toBe("🌳");
  });
  it("returns water icon for soebeskyttelse", () => {
    expect(flagIcon("soebeskyttelse_linje")).toBe("💧");
  });
  it("returns warning icon for unknown id", () => {
    expect(flagIcon("unknown_flag")).toBe("⚠️");
  });
});
