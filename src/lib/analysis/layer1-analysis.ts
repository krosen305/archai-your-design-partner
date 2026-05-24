// src/lib/analysis/layer1-analysis.ts
// SERVER-SIDE ONLY.
//
// Register data (BBR, VUR, Plandata) is always fetched live — no compliance-result cache.
// Only AI-extracted lokalplan data is cached (see lokalplan-extraction-step.ts).

import type { VurData } from "@/domain/contracts/analysis.types";
import type {
  RuleEngineBbrData,
  RuleEngineKommuneplanramme,
  RuleEngineLokalplan,
} from "@/domain/contracts/rule-engine.types";
import { fetchBbrWithMat, fetchPlandata, fetchVurViaEbr } from "@/lib/compliance-layer1";
import { recordAnalysisEvent } from "@/lib/analysis-tracing";
import type { AnalysisTraceContext } from "@/lib/analysis-tracing";
import type { DataSourceKind, PipelineServiceState } from "@/types/project-state";

export type ComplianceBase = {
  bbr: RuleEngineBbrData | null;
  lokalplaner: RuleEngineLokalplan[];
  kommuneplanramme: RuleEngineKommuneplanramme | null;
  analysedAt: string;
  vurderingData: VurData | null;
};

export type Layer1Result = {
  complianceBase: ComplianceBase;
  states: Partial<Record<DataSourceKind, PipelineServiceState>>;
};

export type Layer1Input = {
  addressId: string;
  adgangsadresseid: string;
  ejerlavskode: number | null;
  matrikelnummer: string | null;
  grundareal: number | null;
  koordinater: { lat: number; lng: number } | null;
};

export async function runLayer1Analysis(
  input: Layer1Input,
  trace: AnalysisTraceContext,
): Promise<Layer1Result> {
  const { addressId, adgangsadresseid, ejerlavskode, matrikelnummer, grundareal, koordinater } =
    input;
  const states: Partial<Record<DataSourceKind, PipelineServiceState>> = {};

  const [bbrResult, plandataResult, vurderingResult] = await Promise.all([
    fetchBbrWithMat({
      adgangsadresseid,
      adresseid: addressId,
      ejerlavskode,
      matrikelnummer,
      grundareal,
      trace,
    }),
    fetchPlandata(koordinater, trace),
    fetchVurViaEbr(adgangsadresseid, trace),
  ]);

  states.bbr = bbrResult ? "success" : "no_hit";
  states.lokalplaner = plandataResult.lokalplaner.length > 0 ? "success" : "no_hit";
  states.kommuneplanramme = plandataResult.kommuneplanramme ? "success" : "no_hit";
  states.vurdering = vurderingResult ? "success" : "no_hit";

  await recordAnalysisEvent(trace, {
    eventType: "pipeline_step",
    phase: "layer1",
    service: "ComplianceLayer1",
    operation: "bbr_plandata_vur_parallel",
    status: "ok",
    outputSummary: [
      `grundareal=${bbrResult?.grundareal ?? "null"}`,
      `lokalplaner=${plandataResult.lokalplaner.length}`,
      `vurdering=${vurderingResult != null ? "present" : "null"}`,
    ].join(" "),
  });

  const complianceBase: ComplianceBase = {
    bbr: bbrResult,
    lokalplaner: plandataResult.lokalplaner,
    kommuneplanramme: plandataResult.kommuneplanramme,
    analysedAt: new Date().toISOString(),
    vurderingData: vurderingResult,
  };

  return { complianceBase, states };
}
