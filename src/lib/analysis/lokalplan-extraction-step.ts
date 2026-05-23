// src/lib/analysis/lokalplan-extraction-step.ts
// SERVER-SIDE ONLY. Layer 2: lokalplan PDF extraction with cache.

import { getCachedLokalplan, setCachedLokalplan } from "@/integrations/cache/client";
import { logServerEvent } from "@/lib/server-logger";
import { traceStep, recordAnalysisEvent } from "@/lib/analysis-tracing";
import { toJsonValue } from "@/lib/json-value";
import type { AnalysisTraceContext } from "@/lib/analysis-tracing";
import type { LokalplanExtract } from "@/integrations/ai/pdf-extractor";
import { lokalplanExtractSchema } from "@/types/project-restore.schemas";

export async function runLokalplanExtractionStep(
  addressId: string,
  primaryPdfUrl: string | null,
  trace: AnalysisTraceContext,
): Promise<LokalplanExtract | null> {
  try {
    const cached = await traceStep(
      trace,
      {
        eventType: "cache_read",
        phase: "cache",
        service: "Supabase",
        operation: "address_analysis.lokalplan_extracted.read",
      },
      () => getCachedLokalplan(addressId, primaryPdfUrl ?? undefined),
      { cacheHit: (value) => !!value, metadata: { has_pdf_url: !!primaryPdfUrl } },
    );
    if (cached) {
      const parsedCached = lokalplanExtractSchema.safeParse(cached);
      if (parsedCached.success) return parsedCached.data;
      return null;
    }

    if (!primaryPdfUrl) {
      await recordAnalysisEvent(trace, {
        eventType: "pipeline_step",
        phase: "layer2",
        service: "Lokalplan",
        operation: "extract_lokalplan",
        status: "skipped",
        metadata: { reason: "missing_pdf_url" },
      });
      return null;
    }

    const { PdfExtractorService } = await import("@/integrations/ai/pdf-extractor");
    const extract = await traceStep(
      trace,
      {
        eventType: "api_call",
        phase: "layer2",
        service: "Anthropic/PDF",
        operation: "extract_lokalplan",
      },
      () => PdfExtractorService.extractLokalplan(primaryPdfUrl),
    );
    await traceStep(
      trace,
      {
        eventType: "cache_write",
        phase: "cache",
        service: "Supabase",
        operation: "address_analysis.lokalplan_extracted.write",
      },
      () => setCachedLokalplan(addressId, primaryPdfUrl, toJsonValue(extract) ?? null),
    );
    return extract;
  } catch (e) {
    logServerEvent({
      module: "lokalplan-extraction-step",
      operation: "layer2.extract_lokalplan",
      severity: "degraded",
      message: "lokalplan PDF-udtræk fejlede",
      error: e,
      trace,
    });
    return null;
  }
}
