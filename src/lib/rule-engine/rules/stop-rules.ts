// Stopregler — fredning, beskyttelseslinjer og SAVE-bevaringsværdi (ARCH-108).
// Pure functions uden sideeffekter.
// Illegal-violations kan ikke dispenseres. dispensation_required kan.

import type { RuleEngineInput, RuleViolation } from "@/lib/rule-engine/types";

export function checkStopRules(input: RuleEngineInput): RuleViolation[] {
  const violations: RuleViolation[] = [];

  // ── Fredede bygninger ────────────────────────────────────────────────────
  if (input.heritage.listedBuilding === true) {
    if (input.project.type === "demolition_and_new") {
      violations.push({
        rule: "listed_building_demolition",
        severity: "illegal",
        reason:
          "Nedrivning af fredet bygning er forbudt (Bygningsfredningsloven §10). Ingen dispensation mulig.",
        authority: "Slots- og Kulturstyrelsen",
      });
    } else if (input.project.type === "renovation") {
      violations.push({
        rule: "listed_building_major_alteration",
        severity: "dispensation_required",
        reason:
          "Ombygning af fredet bygning kræver forudgående tilladelse fra Slots- og Kulturstyrelsen (BFL §10).",
        authority: "Slots- og Kulturstyrelsen",
      });
    } else if (input.project.type === "extension") {
      violations.push({
        rule: "listed_building_extension",
        severity: "dispensation_required",
        reason:
          "Tilbygning til fredet bygning kræver tilladelse fra Slots- og Kulturstyrelsen (BFL §10).",
        authority: "Slots- og Kulturstyrelsen",
      });
    }
  }

  // ── SAVE-bevaringsværdi ──────────────────────────────────────────────────
  // SAVE 1-3: høj bevaringsværdi — nedrivning kræver dispensation fra kommunen
  if (input.heritage.saveValue !== null && input.heritage.saveValue <= 3) {
    if (input.project.type === "demolition_and_new" || input.project.type === "renovation") {
      violations.push({
        rule: "save_1_3_demolition",
        severity: "dispensation_required",
        reason: `Bygningen har høj bevaringsværdi (SAVE ${input.heritage.saveValue}). Nedrivning/ombygning kræver kommunens tilladelse (Planlovens §14).`,
        authority: "Kommunen",
      });
    }
  }

  // ── Naturbeskyttelseslinjer ──────────────────────────────────────────────
  type ProtKey = keyof typeof input.heritage.protectionLines;
  const protectionChecks: Array<{
    key: ProtKey;
    label: string;
    law: string;
    authority: string;
  }> = [
    {
      key: "coastal",
      label: "strandbeskyttelseslinje (300m)",
      law: "Naturbeskyttelseslovens §15",
      authority: "Kystdirektoratet",
    },
    {
      key: "forest",
      label: "skovbyggelinje (300m)",
      law: "Naturbeskyttelseslovens §17",
      authority: "Miljøstyrelsen",
    },
    {
      key: "lakeRiver",
      label: "åbeskyttelseslinje (150m)",
      law: "Naturbeskyttelseslovens §16",
      authority: "Kommunen",
    },
    {
      key: "lake",
      label: "søbeskyttelseslinje (150m)",
      law: "Naturbeskyttelseslovens §16",
      authority: "Kommunen",
    },
    {
      key: "clitFredning",
      label: "klitfredning",
      law: "Naturbeskyttelseslovens §8",
      authority: "Kystdirektoratet",
    },
    {
      key: "churchSurroundings",
      label: "kirkebyggelinje (300m)",
      law: "Naturbeskyttelseslovens §19",
      authority: "Kommunen",
    },
  ];

  for (const { key, label, law, authority } of protectionChecks) {
    if (input.heritage.protectionLines[key]) {
      violations.push({
        rule: `protection_line_${key}`,
        severity: "dispensation_required",
        reason: `Ejendommen er inden for ${label} — ny bebyggelse kræver dispensation (${law}).`,
        authority,
      });
    }
  }

  return violations;
}
