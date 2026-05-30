import { describe, expect, it } from "bun:test";
import { phaseForRoute } from "@/lib/phases";

describe("phaseForRoute", () => {
  it("maps canonical phase routes", () => {
    expect(phaseForRoute("/projekt/start")).toBe(1);
    expect(phaseForRoute("/projekt/adresse")).toBe(2);
    expect(phaseForRoute("/projekt/abc/cockpit")).toBe(3);
    expect(phaseForRoute("/projekt/teknik")).toBe(4);
  });

  it("treats udbud as part of myndighed in phase navigation", () => {
    expect(phaseForRoute("/projekt/udbud")).toBe(4);
  });
});
