import type { ReadinessReason } from "@/domain/drawing/decision-engine";

export function validateKælderFeasibility(input: {
  hasKælder: boolean;
  kælderGulvKoteM: number | null;
  groundwaterDepthM: number | null;
  terrainKoteM: number | null;
}): ReadinessReason[] {
  const { hasKælder, kælderGulvKoteM, groundwaterDepthM, terrainKoteM } = input;

  if (!hasKælder) return [];

  const reasons: ReadinessReason[] = [];

  if (kælderGulvKoteM === null) {
    reasons.push({
      code: "KAELDER_GULVKOTE_MISSING",
      severity: "warning",
      message: "Kælderens gulvkote (DVR90) er ikke angivet — kloak- og grundvandscheck kan ikke udføres",
      affectedLayer: "proposed",
    });
    return reasons;
  }

  // Groundwater Hard Stop: basement floor must be ≥ water table kote + 0.5m safety
  if (terrainKoteM !== null && groundwaterDepthM !== null) {
    const waterTableKoteM = terrainKoteM - groundwaterDepthM;
    const safeFloorKoteM = waterTableKoteM + 0.5;
    if (kælderGulvKoteM < safeFloorKoteM) {
      reasons.push({
        code: "KAELDER_UNDER_GRUNDVAND",
        severity: "blocking",
        message: `Kældergulv (DVR90 +${kælderGulvKoteM.toFixed(2)} m) er under estimeret grundvandsspejl + 0,5 m sikkerhed (DVR90 +${safeFloorKoteM.toFixed(2)} m). Kræver geoteknisk undersøgelse.`,
        affectedLayer: "proposed",
      });
    }
  }

  // Sewer pump warning: conservative nationwide sewer depth = 1.2m below terrain.
  // Only applied when no groundwater data is available — if groundwater data exists,
  // the groundwater check above is more authoritative.
  if (terrainKoteM !== null && groundwaterDepthM === null) {
    const estimatedSewerInvertKoteM = terrainKoteM - 1.2;
    if (kælderGulvKoteM < estimatedSewerInvertKoteM) {
      reasons.push({
        code: "KAELDER_PUMP_LIKELY",
        severity: "warning",
        message: `Kældergulv (DVR90 +${kælderGulvKoteM.toFixed(2)} m) er sandsynligvis under kloakledningens bundkote (estimeret DVR90 +${estimatedSewerInvertKoteM.toFixed(2)} m, 1,2 m konservativt estimat). Pumpebrønd sandsynligvis nødvendig — bekræftes af aut. kloakmester.`,
        affectedLayer: "utilities",
      });
    }
  }

  return reasons;
}
