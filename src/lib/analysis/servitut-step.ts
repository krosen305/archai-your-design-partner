// src/lib/analysis/servitut-step.ts
// SERVER-SIDE ONLY. Layer 3: Tinglysning servitut extraction with cache.

import { getCachedServitut, setCachedServitut } from "@/integrations/cache/client";
import { logServerEvent } from "@/lib/server-logger";
import { traceStep } from "@/lib/analysis-tracing";
import { toJsonValue } from "@/lib/json-value";
import type { AnalysisTraceContext } from "@/lib/analysis-tracing";
import type { RuleEngineTinglysningResult } from "@/domain/contracts/rule-engine.types";
import { ruleEngineTinglysningResultSchema } from "@/types/project-restore.schemas";

export async function runServitutStep(
  addressId: string,
  ejerlavskode: number | null,
  matrikelnummer: string | null,
  trace: AnalysisTraceContext,
): Promise<RuleEngineTinglysningResult | null> {
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
    if (cachedServitut) {
      const parsedCached = ruleEngineTinglysningResultSchema.safeParse(cachedServitut);
      if (parsedCached.success) return parsedCached.data;
      return null;
    }

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
      () => setCachedServitut(addressId, toJsonValue(result) ?? null),
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
