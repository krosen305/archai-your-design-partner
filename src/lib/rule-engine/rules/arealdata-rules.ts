import type { RuleEngineInput, RuleViolation } from "@/lib/rule-engine/types";

export function checkArealdataRules(input: RuleEngineInput): RuleViolation[] {
  const environmental = input.environmental;
  if (!environmental) return [];

  const violations: RuleViolation[] = [];

  if (environmental.paragraph3Nature === true) {
    violations.push({
      rule: "paragraph3_nature",
      severity: "dispensation_required",
      reason:
        "Parcelen overlapper registreret §3-beskyttet natur. Byggeri eller terrænaendringer kraever normalt forudgaaende myndighedsafklaring eller dispensation.",
      authority: "Kommunen",
    });
  }

  if (environmental.natura2000 === true) {
    violations.push({
      rule: "natura2000_screening",
      severity: "warning",
      reason:
        "Parcelen overlapper Natura 2000-interesser. Projektet boer screenes tidligt for habitat- og artskonsekvenser, foer design og budget laases.",
      authority: "Kommunen/Miljoestyrelsen",
    });
  }

  if (environmental.protectedDige === true) {
    violations.push({
      rule: "protected_dige",
      severity: "dispensation_required",
      reason:
        "Der er registreret beskyttet sten- eller jorddige paa eller ved projektarealet. Indgreb kraever myndighedsafklaring eller dispensation.",
      authority: "Kommunen",
    });
  }

  if (environmental.fortidsminde === true) {
    violations.push({
      rule: "fortidsminde",
      severity: "dispensation_required",
      reason:
        "Der er registreret fredet fortidsminde paa arealet. Jordarbejde og byggeri kraever tidlig afklaring med kulturarvsmyndigheden.",
      authority: "Slots- og Kulturstyrelsen",
    });
  }

  if (environmental.fortidsmindeBuffer === true) {
    violations.push({
      rule: "fortidsminde_buffer",
      severity: "warning",
      reason:
        "Arealet ligger i fortidsmindebeskyttelseslinje. Projektet boer screenes tidligt for arkaeologiske og kulturhistoriske bindinger.",
      authority: "Kommunen/Slots- og Kulturstyrelsen",
    });
  }

  if (environmental.bnbo === true) {
    violations.push({
      rule: "bnbo",
      severity: "warning",
      reason:
        "Arealet overlapper BNBO. Vand-, jord- og kemiforhold boer afklares tidligt med kommune/vandforsyning.",
      authority: "Kommune/Vandforsyning",
    });
  }

  if (environmental.osd === true) {
    violations.push({
      rule: "osd",
      severity: "warning",
      reason:
        "Arealet ligger i Omraade med Saerlige Drikkevandsinteresser (OSD). Projektets vand- og jordpaavirkning boer afklares tidligt.",
      authority: "Kommunen",
    });
  }

  if (environmental.rawMaterialArea === true) {
    violations.push({
      rule: "raw_material_area",
      severity: "warning",
      reason:
        "Arealet overlapper raastofinteresser. Projektet boer screenes for plan- og miljoekonflikter tidligt.",
      authority: "Regionen",
    });
  }

  return violations;
}
