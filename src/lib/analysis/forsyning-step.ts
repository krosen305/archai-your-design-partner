// SERVER-SIDE ONLY.
//
// Forsyning step: supply/utility data sources that run in parallel with Layer 4.
// ARCH-247: Tjekditnet bredbåndsdækning (DB-query, no HTTP per address)
// ARCH-248: EMOData energimærke (SOAP; skipped if EMODATA_USERNAME/PASSWORD not set)
//
// Input: adgangsadresseid + BBR bygning UUID (both available after Layer 1).

import { TjekditnetService, type TjekditnetCoverageData } from "@/integrations/tjekditnet/client";
import { EnergyLabelService, type EnergyLabelData } from "@/integrations/energimaerke/client";
import type { AnalysisTraceContext } from "@/lib/analysis-tracing";
import { recordAnalysisEvent } from "@/lib/analysis-tracing";
import { summarizeSourceResult } from "@/lib/source-result";

export type ForsyningStepInput = {
  adgangsadresseid: string;
  bygningLokalId: string | null; // BBR UUID for energimærke lookup (null = skip)
};

export type ForsyningStepResult = {
  tjekditnetCoverage: TjekditnetCoverageData | null;
  energimaerke: EnergyLabelData | null;
};

export async function runForsyningStep(
  input: ForsyningStepInput,
  trace: AnalysisTraceContext,
): Promise<ForsyningStepResult> {
  const [tjekditnetResult, energimaerkeResult] = await Promise.all([
    TjekditnetService.getCoverage(input.adgangsadresseid),
    input.bygningLokalId
      ? EnergyLabelService.getLabel(input.bygningLokalId)
      : Promise.resolve({
          data: null,
          status: "skipped" as const,
          confidence: "unknown" as const,
          kilde: "emodata",
          fetchedAt: new Date().toISOString(),
          sourceUrl: null,
          rawFeatureCount: null,
          isMock: false,
        }),
  ]);

  await Promise.all([
    recordAnalysisEvent(trace, {
      eventType: "pipeline_step",
      phase: "layer4",
      service: "Tjekditnet",
      operation: "getCoverage",
      status: tjekditnetResult.status === "ok" ? "ok" : "error",
      outputSummary: summarizeSourceResult(
        tjekditnetResult,
        (d) =>
          `match=${d.match_type} fiber=${d.fiber_download_mbit} max_fast=${d.max_fast_download_mbit}`,
      ),
    }),
    recordAnalysisEvent(trace, {
      eventType: "pipeline_step",
      phase: "layer4",
      service: "EMOData",
      operation: "getLabel",
      status:
        energimaerkeResult.status === "ok"
          ? "ok"
          : energimaerkeResult.status === "skipped"
            ? "ok"
            : "error",
      outputSummary: summarizeSourceResult(
        energimaerkeResult,
        (d) => `match=${d.match_type} klasse=${d.energimaerke_klasse} udloebet=${d.er_udloebet}`,
      ),
    }),
  ]);

  return {
    tjekditnetCoverage: tjekditnetResult.data,
    energimaerke: energimaerkeResult.data,
  };
}
