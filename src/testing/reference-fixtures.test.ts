import { describe, it, expect } from "bun:test";
import {
  GOLDEN_REFERENCE_FIXTURES,
  type ReferenceFixture,
} from "./reference-fixtures";

describe("GOLDEN_REFERENCE_FIXTURES", () => {
  it("har mindst 5 cases", () => {
    expect(GOLDEN_REFERENCE_FIXTURES.length).toBeGreaterThanOrEqual(5);
  });

  it("alle cases har unikke caseId'er", () => {
    const ids = GOLDEN_REFERENCE_FIXTURES.map((f) => f.caseId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("alle cases har label, why og expected-felter", () => {
    for (const f of GOLDEN_REFERENCE_FIXTURES) {
      expect(typeof f.label).toBe("string");
      expect(typeof f.why).toBe("string");
      expect(typeof f.expected).toBe("object");
    }
  });

  it("live-tier cases har adresseid", () => {
    const liveCases = GOLDEN_REFERENCE_FIXTURES.filter((f) => f.tier === "live");
    expect(liveCases.length).toBeGreaterThanOrEqual(1);
    for (const f of liveCases) {
      expect(typeof f.adresseid).toBe("string");
      expect((f.adresseid as string).length).toBeGreaterThan(10);
    }
  });

  it("hasselvej-48 har grundareal=441 og save_value=3", () => {
    const f = GOLDEN_REFERENCE_FIXTURES.find((f) => f.caseId === "hasselvej-48");
    expect(f).toBeDefined();
    expect(f!.expected.grundareal).toBe(441);
    expect(f!.expected.save_value).toBe(3);
    expect(f!.expected.fbb_hit).toBe(true);
    expect(f!.expected.hard_stop).toBe(false);
  });

  it("strandbeskyttelse-case har hard_stop=true", () => {
    const f = GOLDEN_REFERENCE_FIXTURES.find((f) => f.caseId === "strandbeskyttelse-hardstop");
    expect(f).toBeDefined();
    expect(f!.expected.hard_stop).toBe(true);
    expect(f!.expected.naturbeskyttelse_strandbeskyttelse).toBe(true);
  });
});
