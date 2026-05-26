import { describe, expect, it } from "bun:test";
import { mapRuleEngineViolationsToBr18 } from "./rule-engine-bridge";
import type { RuleViolation } from "@/lib/rule-engine/types";

describe("mapRuleEngineViolationsToBr18", () => {
  it("returnerer tom array ved ingen violations", () => {
    const result = mapRuleEngineViolationsToBr18([]);
    expect(result).toEqual([]);
  });

  it("mapper bebyggelsesprocent-violation til BR18-8.3.1-bebyggelsesprocent", () => {
    const violations: RuleViolation[] = [
      {
        rule: "bebyggelsesprocent",
        severity: "dispensation_required",
        reason: "Bebyggelsesprocent: 35% overskriver grænsen på 30% (kilde: BR18 standard).",
        authority: "Kommunen",
        confidence: 1.0,
      },
    ];

    const result = mapRuleEngineViolationsToBr18(violations);

    expect(result).toHaveLength(1);
    expect(result[0].requirementId).toBe("BR18-8.3.1-bebyggelsesprocent");
    expect(result[0].status).toBe("relevant");
    expect(result[0].reasons).toContain(violations[0].reason);
    expect(result[0].missingInputs).toEqual([]);
    expect(result[0].sourceFacts).toEqual([]);
  });

  it("mapper bygningshøjde-violation til BR18-8.4.1-bygningshoejde", () => {
    const violations: RuleViolation[] = [
      {
        rule: "bygningshøjde",
        severity: "dispensation_required",
        reason: "Bygningshøjde: 9 m overskriver grænsen på 8.5 m (kilde: BR18 standard).",
        authority: "Kommunen",
        confidence: 1.0,
      },
    ];

    const result = mapRuleEngineViolationsToBr18(violations);

    expect(result).toHaveLength(1);
    expect(result[0].requirementId).toBe("BR18-8.4.1-bygningshoejde");
    expect(result[0].status).toBe("relevant");
  });

  it("mapper etager-violation til BR18-8.4.2-etager", () => {
    const violations: RuleViolation[] = [
      {
        rule: "etager",
        severity: "dispensation_required",
        reason: "Etager: 3 etager overskriver grænsen på 2 etager (kilde: BR18 standard).",
        authority: "Kommunen",
        confidence: 1.0,
      },
    ];

    const result = mapRuleEngineViolationsToBr18(violations);

    expect(result).toHaveLength(1);
    expect(result[0].requirementId).toBe("BR18-8.4.2-etager");
  });

  it("mapper skelafstand-violation til BR18-8.4.3-skelafstand", () => {
    const violations: RuleViolation[] = [
      {
        rule: "skelafstand",
        severity: "dispensation_required",
        reason: "Skelafstand: 1.5 m er under minimumsgrænsen 2.5 m (BR18 §181).",
        authority: "Kommunen",
        confidence: 1.0,
      },
    ];

    const result = mapRuleEngineViolationsToBr18(violations);

    expect(result).toHaveLength(1);
    expect(result[0].requirementId).toBe("BR18-8.4.3-skelafstand");
  });

  it("ignorerer violations der ikke matcher kendte BR18-krav", () => {
    const violations: RuleViolation[] = [
      {
        rule: "listed_building_demolition",
        severity: "illegal",
        reason: "Nedrivning af fredet bygning er forbudt.",
        authority: "Slots- og Kulturstyrelsen",
      },
      {
        rule: "jordforurening_v2",
        severity: "warning",
        reason: "Grunden er V2-kortlagt.",
        authority: "Miljøstyrelsen",
      },
    ];

    const result = mapRuleEngineViolationsToBr18(violations);

    expect(result).toHaveLength(0);
  });

  it("mapper kun kendte violations og ignorerer ukendte i blandet liste", () => {
    const violations: RuleViolation[] = [
      {
        rule: "bebyggelsesprocent",
        severity: "dispensation_required",
        reason: "Bebyggelsesprocent overskrider grænse.",
        authority: "Kommunen",
        confidence: 1.0,
      },
      {
        rule: "landzone_permit_required",
        severity: "warning",
        reason: "Ejendommen ligger i landzone.",
        authority: "Kommunen",
      },
      {
        rule: "skelafstand",
        severity: "dispensation_required",
        reason: "Skelafstand under minimumskravet.",
        authority: "Kommunen",
        confidence: 1.0,
      },
    ];

    const result = mapRuleEngineViolationsToBr18(violations);

    // Only bebyggelsesprocent and skelafstand have BR18 mappings
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.requirementId)).toContain("BR18-8.3.1-bebyggelsesprocent");
    expect(result.map((r) => r.requirementId)).toContain("BR18-8.4.3-skelafstand");
  });
});
