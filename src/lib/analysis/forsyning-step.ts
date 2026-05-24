// SERVER-SIDE ONLY.
//
// Forsyning step: supply/utility data sources that run in parallel with Layer 4.
// Currently includes: Tjekditnet bredbåndsdækning (ARCH-247).
// Extended by ARCH-248 with: EMOData energimærke.
//
// Input: adgangsadresseid (DAR UUID) — already available after Layer 1.

import { TjekditnetService, type TjekditnetCoverageData } from "@/integrations/tjekditnet/client";
import type { AnalysisTraceContext } from "@/lib/analysis-tracing";
import { recordAnalysisEvent } from "@/lib/analysis-tracing";
import { summarizeSourceResult } from "@/lib/source-result";

export type ForsyningStepInput = {
  adgangsadresseid: string;
};

export type ForsyningStepResult = {
  tjekditnetCoverage: TjekditnetCoverageData | null;
};

export async function runForsyningStep(
  input: ForsyningStepInput,
  trace: AnalysisTraceContext,
): Promise<ForsyningStepResult> {
  const tjekditnetResult = await TjekditnetService.getCoverage(input.adgangsadresseid);

  await recordAnalysisEvent(trace, {
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
  });

  return { tjekditnetCoverage: tjekditnetResult.data };
}
