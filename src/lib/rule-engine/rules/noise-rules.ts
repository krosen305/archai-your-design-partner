import type { RuleEngineInput, RuleViolation } from "@/lib/rule-engine/types";

const ROAD_LDEN_THRESHOLD_DB = 58;
const RAIL_LDEN_THRESHOLD_DB = 64;
const AIR_LDEN_THRESHOLD_DB = 55;

export function checkNoiseRules(input: RuleEngineInput): RuleViolation[] {
  const noise = input.noise;
  if (!noise) return [];

  const violations: RuleViolation[] = [];

  if (
    noise.coverageStatus === "outside_mapped_area" ||
    noise.coverageStatus === "unknown"
  ) {
    violations.push({
      rule: "noise_coverage_unknown",
      severity: "warning",
      reason:
        "Støjkortlægningen dækker ikke sikkert grunden. Støjforholdene er ukendte — dette må ikke tolkes som fravær af støjrisiko. Indhent kommunal oplysning eller bestil akustisk vurdering.",
      authority: "Kommunen/Akustiker",
    });
    return violations;
  }

  if (noise.roadLdenDb !== null && noise.roadLdenDb >= ROAD_LDEN_THRESHOLD_DB) {
    violations.push({
      rule: "noise_road_threshold",
      severity: "warning",
      reason: `Vejstøjniveauet (Lden ${noise.roadLdenDb} dB) overstiger Miljøstyrelsens vejledende grænseværdi på ${ROAD_LDEN_THRESHOLD_DB} dB for boligformål. Akustisk vurdering anbefales.`,
      authority: "Kommunen/Akustiker",
    });
  }

  if (noise.railLdenDb !== null && noise.railLdenDb >= RAIL_LDEN_THRESHOLD_DB) {
    violations.push({
      rule: "noise_rail_threshold",
      severity: "warning",
      reason: `Togstøjniveauet (Lden ${noise.railLdenDb} dB) overstiger Miljøstyrelsens vejledende grænseværdi på ${RAIL_LDEN_THRESHOLD_DB} dB for boligformål. Akustisk vurdering anbefales.`,
      authority: "Kommunen/Akustiker",
    });
  }

  if (noise.airLdenDb !== null && noise.airLdenDb >= AIR_LDEN_THRESHOLD_DB) {
    violations.push({
      rule: "noise_air_threshold",
      severity: "warning",
      reason: `Flystøjniveauet (Lden ${noise.airLdenDb} dB) overstiger Miljøstyrelsens vejledende grænseværdi på ${AIR_LDEN_THRESHOLD_DB} dB for boligformål. Akustisk vurdering anbefales.`,
      authority: "Kommunen/Akustiker",
    });
  }

  if (noise.industryLdenDb !== null) {
    violations.push({
      rule: "noise_industry_review",
      severity: "warning",
      reason:
        "Der er registreret virksomhedsstøj i nærheden. Der er ingen entydig statslig grænseværdi — en akustiker og kommunen skal vurdere det konkrete niveau og krav.",
      authority: "Kommunen/Akustiker",
    });
  }

  if (noise.requiresAcousticReview === true) {
    violations.push({
      rule: "noise_acoustic_review_required",
      severity: "warning",
      reason:
        "Støjscreeningen angiver at akustisk vurdering er nødvendig inden køb eller design. Indhent rapporten fra en certificeret akustiker.",
      authority: "Akustiker",
    });
  }

  return violations;
}
