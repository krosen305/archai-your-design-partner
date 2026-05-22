// src/lib/analysis/servitut-step.ts
// SERVER-SIDE ONLY. Layer 3: Tinglysning servitut extraction with cache.

import { getCachedServitut, setCachedServitut } from "@/integrations/cache/client";
import { logServerEvent } from "@/lib/server-logger";
import { traceStep } from "@/lib/analysis-tracing";
import type { AnalysisTraceContext } from "@/lib/analysis-tracing";
import type { TinglysningResult } from "@/integrations/tinglysning/client";
import type { Json } from "@/integrations/supabase/types";

export async function runServitutStep(
  addressId: string,
  ejerlavskode: number | null,
  matrikelnummer: string | null,
  trace: AnalysisTraceContext,
): Promise<TinglysningResult | null> {
  try {
    const cachedServitut = await traceStep(
      trace,
      {
        eventType: "cache_read",
        phase: "cache",
        service: "Supabase",
        operation: "address_analysis.servitut_extracted.read",
      },
      () => getCachedServitut(addressId),
      { cacheHit: (value) => !!value },
    );
    if (cachedServitut) return cachedServitut as unknown as TinglysningResult;

    const { TinglysningService } = await import("@/integrations/tinglysning/client");
    const result = await traceStep(
      trace,
      {
        eventType: "api_call",
        phase: "layer3",
        service: "Tinglysning",
        operation: "getServitutter",
      },
      () => TinglysningService.getServitutter(addressId, ejerlavskode, matrikelnummer),
    );
    await traceStep(
      trace,
      {
        eventType: "cache_write",
        phase: "cache",
        service: "Supabase",
        operation: "address_analysis.servitut_extracted.write",
      },
      () => setCachedServitut(addressId, result as unknown as Json),
    );
    return result;
  } catch (e) {
    logServerEvent({
      module: "servitut-step",
      operation: "layer3.servitut_extract",
      severity: "degraded",
      message: "servitut-udtræk fejlede",
      error: e,
      trace,
    });
    return null;
  }
}
