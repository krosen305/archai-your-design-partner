// Reaktiv compliance-compute — client-safe, ingen API-kald, ingen server-deps.
//
// Samler de tre eksisterende pure functions til én enkelt kald:
//   calculateComplianceMetrics → assembleRuleEngineInput → runRuleEngine → deriveComplianceFlags
//
// Bruges i boligoensker-wizard til at opdatere ComplianceMetrics + flags
// øjeblikkeligt når brugeren ændrer Byggeoenske-felter — uden at røre Datafordeler.
// Statiske data (BBR, plandata) er allerede i project-store fra preCheck/analyseAddress.

import { calculateComplianceMetrics } from "@/lib/compliance-engine";
import { assembleRuleEngineInput } from "@/lib/rule-engine/input-assembler";
import { runRuleEngine } from "@/lib/rule-engine/engine";
import { deriveComplianceFlags } from "@/lib/compliance-flags";
import type {
  RuleEngineBbrData,
  RuleEngineDkJordResultat,
  RuleEngineFbbResult,
  RuleEngineGeusRiskData,
  RuleEngineKommuneplanramme,
  RuleEngineLokalplan,
  RuleEngineLokalplanExtract,
  RuleEngineNaturbeskyttelsesResultat,
  RuleEngineTerrainData,
  RuleEngineTinglysningResult,
} from "@/domain/contracts/rule-engine.types";
import type { Byggeoenske, ComplianceFlag } from "@/types/project-state";
import type { ComplianceMetrics } from "@/lib/compliance-engine";
import type { RuleEngineResult } from "@/lib/rule-engine/types";
import type { GeoJsonPolygon25832, NaturbeskyttelseLayer } from "@/domain/drawing/beliggenhedsplan.types";
import type { ReadinessReason } from "@/domain/drawing/decision-engine";
import { validateNaturbeskyttelse } from "@/lib/rule-engine/rules/nature-protection-rules";
import { validateKælderFeasibility } from "@/lib/rule-engine/rules/basement-rules";
import { validateJordvarmePermit } from "@/lib/rule-engine/rules/utility-rules";

export type PartialUpdateParams = {
  bbr: RuleEngineBbrData;
  ramme: RuleEngineKommuneplanramme | null;
  lokalplanExtract: RuleEngineLokalplanExtract | null;
  lokalplaner: RuleEngineLokalplan[];
  naturbeskyttelse: RuleEngineNaturbeskyttelsesResultat | null;
  geusRisk: RuleEngineGeusRiskData | null;
  servitutter: RuleEngineTinglysningResult | null;
  terrain: RuleEngineTerrainData | null;
  fbbData: RuleEngineFbbResult | null;
  dkjord: RuleEngineDkJordResultat | null;
  byggeoenske: Byggeoenske;
  municipality: string;
  kommunekode: string;
  // Drawing validations — alle valgfrie, breaking change undgås
  proposedFootprint25832?: GeoJsonPolygon25832 | null;
  naturbeskyttelseZoner?: NaturbeskyttelseLayer[];
  harKælder?: boolean;
  kælderGulvKoteM?: number | null;
  harJordvarme?: boolean;
};

export type PartialUpdateResult = {
  complianceMetrics: ComplianceMetrics;
  complianceFlags: ComplianceFlag[];
  ruleEngineResult: RuleEngineResult;
  drawingReasons?: ReadinessReason[];
};

export function computePartialUpdate(params: PartialUpdateParams): PartialUpdateResult {
  const {
    bbr,
    ramme,
    lokalplanExtract,
    lokalplaner,
    naturbeskyttelse,
    geusRisk,
    servitutter,
    terrain,
    fbbData,
    dkjord,
    byggeoenske,
    municipality,
    kommunekode,
  } = params;

  const complianceMetrics = calculateComplianceMetrics(bbr, ramme);

  const { input, missingFields } = assembleRuleEngineInput({
    bbr,
    kommuneplanramme: ramme,
    lokalplaner,
    lokalplanExtract,
    naturbeskyttelse,
    geusRisk,
    servitutter,
    terrain,
    fbbData,
    dkjord,
    plandataContext: null,
    arealdataContext: null,
    byggeoenske,
    municipality,
    kommunekode,
  });

  const ruleEngineResult = runRuleEngine(input, missingFields);

  const complianceFlags = deriveComplianceFlags(
    bbr,
    ramme,
    naturbeskyttelse,
    dkjord,
    geusRisk,
    ruleEngineResult,
    null,
    byggeoenske,
  );

  const drawingReasons: ReadinessReason[] = [
    ...validateNaturbeskyttelse(params.naturbeskyttelseZoner ?? []),
    ...validateKælderFeasibility({
      hasKælder: params.harKælder ?? false,
      kælderGulvKoteM: params.kælderGulvKoteM ?? null,
      groundwaterDepthM: geusRisk?.groundwaterDepthM ?? null,
      terrainKoteM: terrain?.avgElevationM ?? null,
    }),
    ...validateJordvarmePermit({ hasJordvarme: params.harJordvarme ?? false }),
  ];

  return { complianceMetrics, complianceFlags, ruleEngineResult, drawingReasons };
}
