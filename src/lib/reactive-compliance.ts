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
import { deriveComplianceFlags } from "@/lib/project-store";
import type { BbrKompliantData } from "@/integrations/bbr/client";
import type { Kommuneplanramme, Lokalplan } from "@/integrations/plandata/client";
import type { LokalplanExtract } from "@/integrations/ai/pdf-extractor";
import type { NaturbeskyttelsesResultat } from "@/integrations/sdfi/naturbeskyttelse";
import type { GeusRiskData } from "@/integrations/geus/client";
import type { TinglysningResult } from "@/integrations/tinglysning/client";
import type { TerrainData } from "@/integrations/sdfi/dhm-client";
import type { FbbResultat } from "@/integrations/fbb/client";
import type { Byggeoenske, ComplianceFlag } from "@/lib/project-store";
import type { ComplianceMetrics } from "@/lib/compliance-engine";
import type { RuleEngineResult } from "@/lib/rule-engine/types";

export type PartialUpdateParams = {
  bbr: BbrKompliantData;
  ramme: Kommuneplanramme | null;
  lokalplanExtract: LokalplanExtract | null;
  lokalplaner: Lokalplan[];
  naturbeskyttelse: NaturbeskyttelsesResultat | null;
  geusRisk: GeusRiskData | null;
  servitutter: TinglysningResult | null;
  terrain: TerrainData | null;
  fbbData: FbbResultat | null;
  byggeoenske: Byggeoenske;
  municipality: string;
  kommunekode: string;
};

export type PartialUpdateResult = {
  complianceMetrics: ComplianceMetrics;
  complianceFlags: ComplianceFlag[];
  ruleEngineResult: RuleEngineResult;
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
    byggeoenske,
    municipality,
    kommunekode,
  });

  const ruleEngineResult = runRuleEngine(input, missingFields);

  const complianceFlags = deriveComplianceFlags(
    bbr,
    ramme,
    naturbeskyttelse,
    null,
    geusRisk,
    ruleEngineResult,
  );

  return { complianceMetrics, complianceFlags, ruleEngineResult };
}
