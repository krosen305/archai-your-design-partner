import { describe, it, expect } from "bun:test";
import { classifyLokalplaner } from "./lokalplan-classifier";
import type { RuleEngineLokalplan } from "@/domain/contracts/rule-engine.types";

function lp(planid: string, status: string | null): RuleEngineLokalplan {
  return {
    planid,
    plannavn: "Test",
    plannr: null,
    kommunenavn: null,
    komnr: null,
    anvgen: null,
    anvendelseGenerel: null,
    fremtidigzonestatus: null,
    sforhold: null,
    planstatus: null,
    datoIkraft: null,
    datoVedtaget: null,
    plandokumentLink: null,
    plantype: null,
    status,
  };
}

describe("classifyLokalplaner", () => {
  it("classifies null status as vedtaget", () => {
    const { vedtagne, forslag } = classifyLokalplaner([lp("1", null)]);
    expect(vedtagne).toHaveLength(1);
    expect(forslag).toHaveLength(0);
  });

  it("classifies 'Vedtaget' as vedtaget", () => {
    const { vedtagne, forslag } = classifyLokalplaner([lp("1", "Vedtaget")]);
    expect(vedtagne).toHaveLength(1);
    expect(forslag).toHaveLength(0);
  });

  it("classifies 'vedtaget' (lowercase) as vedtaget", () => {
    const { vedtagne } = classifyLokalplaner([lp("1", "vedtaget")]);
    expect(vedtagne).toHaveLength(1);
  });

  it("classifies 'Forslag' as forslag", () => {
    const { vedtagne, forslag } = classifyLokalplaner([lp("1", "Forslag")]);
    expect(vedtagne).toHaveLength(0);
    expect(forslag).toHaveLength(1);
  });

  it("classifies 'Lokalplanforslag' as forslag", () => {
    const { forslag } = classifyLokalplaner([lp("1", "Lokalplanforslag")]);
    expect(forslag).toHaveLength(1);
  });

  it("classifies 'forslag' (lowercase) as forslag", () => {
    const { forslag } = classifyLokalplaner([lp("1", "forslag")]);
    expect(forslag).toHaveLength(1);
  });

  it("handles mixed arrays correctly", () => {
    const plans = [lp("1", null), lp("2", "Vedtaget"), lp("3", "Forslag"), lp("4", "forslag")];
    const { vedtagne, forslag } = classifyLokalplaner(plans);
    expect(vedtagne).toHaveLength(2);
    expect(forslag).toHaveLength(2);
  });

  it("returns empty arrays for empty input", () => {
    const { vedtagne, forslag } = classifyLokalplaner([]);
    expect(vedtagne).toHaveLength(0);
    expect(forslag).toHaveLength(0);
  });
});
