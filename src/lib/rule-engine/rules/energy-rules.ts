// Energiproportionalitetsregler — BR18 §13 stk. 2 (ARCH-108).
// Pure functions uden sideeffekter.
//
// BR18 §13 stk. 2: Tilbygning på mere end 25% af eksisterende etagereal
// udløser krav om, at hele bygningens energiramme skal vurderes på ny.
// Dette er en warning, ikke et hårdt stop — endelig vurdering kræver ingeniør.

import type { RuleEngineInput, RuleViolation } from "@/lib/rule-engine/types";

export function checkEnergyProportionality(input: RuleEngineInput): RuleViolation[] {
  const violations: RuleViolation[] = [];

  if (input.project.type !== "extension") return violations;

  const existingAreaM2 = input.existingBuilding?.floorAreaM2 ?? null;
  const newAreaM2 = input.newBuilding?.floorAreaM2 ?? null;

  if (existingAreaM2 === null || existingAreaM2 === 0 || newAreaM2 === null) {
    return violations;
  }

  const extensionRatio = newAreaM2 / existingAreaM2;

  if (extensionRatio > 0.25) {
    violations.push({
      rule: "energy_upgrade_likely_required",
      severity: "warning",
      reason: `Tilbygning (${newAreaM2} m²) udgør ${Math.round(extensionRatio * 100)}% af eksisterende areal (${existingAreaM2} m²). Tilbygning > 25% medfører sandsynligvis krav om ny energirammeberegning for hele bygningen (BR18 §13 stk. 2). Afklares med energirådgiver.`,
      authority: "Energistyrelsen / Byggesagsbehandler",
    });
  }

  // Yderligere: skift af varmekilde kan udløse krav om energipakke
  if (
    input.newBuilding?.heatingSource !== null &&
    input.existingBuilding?.exists &&
    input.newBuilding?.heatingSource === "varmepumpe"
  ) {
    violations.push({
      rule: "heat_pump_installation_requirement",
      severity: "warning",
      reason:
        "Montering af varmepumpe kan kræve anmeldelse til kommunen og opfyldelse af lydkrav (BR18 §394 og Miljøbeskyttelsesloven).",
      authority: "Kommunen / Miljøstyrelsen",
    });
  }

  return violations;
}
