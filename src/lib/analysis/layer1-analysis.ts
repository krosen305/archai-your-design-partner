// src/lib/analysis/layer1-analysis.ts
// SERVER-SIDE ONLY.

import { getCachedCompliance, setCachedCompliance } from "@/integrations/cache/client";
import type { VurData } from "@/domain/contracts/analysis.types";
import type {
  RuleEngineBbrData,
  RuleEngineKommuneplanramme,
  RuleEngineLokalplan,
} from "@/domain/contracts/rule-engine.types";
import { fetchBbrWithMat, fetchPlandata, fetchVurViaEbr } from "@/lib/compliance-layer1";
import { logServerEvent } from "@/lib/server-logger";
import { traceStep, recordAnalysisEvent } from "@/lib/analysis-tracing";
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

  // Cache read
  try {
    const cached = await traceStep(
      trace,
      {
        eventType: "cache_read",
        phase: "cache",
        service: "Supabase",
        operation: "address_analysis.compliance_result.read",
        inputSummary: `adresseid=${addressId}`,
      },
      () => getCachedCompliance(addressId),
      {
        cacheHit: (value) => !!value,
        outputSummary: (v) =>
          v ? `cache_hit=true bbr=${v.bbr ? "present" : "null"}` : "cache_hit=false",
      },
    );
    if (cached) {
      // Bypass stale cache if BBR is missing grundareal and we can recover it —
      // either via the pre-fetched grundareal or via MatService (requires ejerlavskode+matrikelnummer).
      const canRecoverGrundareal =
        grundareal !== null || (ejerlavskode !== null && matrikelnummer !== null);
      if (cached.bbr?.grundareal === null && canRecoverGrundareal) {
        logServerEvent({
          module: "layer1-analysis",
          operation: "cache.compliance.stale_bypass",
          severity: "ignored",
          message: "Stale cache bypassed — grundareal mangler, genberegner",
          trace,
          metadata: { grundareal, ejerlavskode, matrikelnummer },
        });
      } else {
        const base: ComplianceBase = {
          bbr: cached.bbr,
          lokalplaner: cached.lokalplaner,
          kommuneplanramme: cached.kommuneplanramme,
          analysedAt: cached.analysedAt,
          vurderingData: cached.vurderingData ?? null,
        };
        states.bbr = "cache_hit";
        states.lokalplaner = "cache_hit";
        states.kommuneplanramme = "cache_hit";
        states.vurdering = "cache_hit";
        return { complianceBase: base, states };
      }
    }
  } catch (e) {
    logServerEvent({
      module: "layer1-analysis",
      operation: "cache.compliance.read",
      severity: "degraded",
      message: "cache-læsning fejlede (behandles som cache-miss)",
      error: e,
      trace,
    });
  }

  // Live fetch
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

  // Cache write (non-blocking best-effort)
  try {
    await traceStep(
      trace,
      {
        eventType: "cache_write",
        phase: "cache",
        service: "Supabase",
        operation: "address_analysis.compliance_result.write",
      },
      () =>
        setCachedCompliance(addressId, {
          ...complianceBase,
          lokalplanExtract: null,
          naturbeskyttelse: null,
          dkjord: null,
          geusRisk: null,
          servitutter: null,
          terrain: null,
          naboer: null,
          fjernvarme: null,
          fbbData: null,
          matGeometri: null,
        }),
    );
  } catch (e) {
    logServerEvent({
      module: "layer1-analysis",
      operation: "cache.compliance.write",
      severity: "degraded",
      message: "compliance-cache-skriv fejlede",
      error: e,
      trace,
    });
  }

  return { complianceBase, states };
}
