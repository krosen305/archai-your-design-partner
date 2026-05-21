// src/lib/analysis/address-enrichment.ts
// SERVER-SIDE ONLY.

import { logServerEvent } from "@/lib/server-logger";
import { traceStep } from "@/lib/analysis-tracing";
import type { AnalysisTraceContext } from "@/lib/analysis-tracing";

export type AddressFields = {
  adgangsadresseid: string;
  ejerlavskode: number | null;
  matrikelnummer: string | null;
  grundareal: number | null;
};

export async function enrichAddressDetails(
  addressId: string,
  initial: AddressFields,
  trace: AnalysisTraceContext,
): Promise<AddressFields> {
  const needsEnrichment = !initial.adgangsadresseid || initial.grundareal === null;
  if (!needsEnrichment) return initial;

  try {
    const { DarService } = await import("@/integrations/dar/client");
    const dar = await traceStep(
      trace,
      {
        eventType: "pipeline_step",
        phase: "address_enrichment",
        service: "DAR",
        operation: "getAddressDetails",
        inputSummary: `adresseid=${addressId}`,
      },
      () => DarService.getAddressDetails(addressId, undefined, trace),
      {
        outputSummary: (r) =>
          `grundareal=${r.grundareal ?? "null"} matrikel=${r.matrikelnummer ?? "null"} ejerlavskode=${r.ejerlavskode ?? "null"}`,
      },
    );
    return {
      adgangsadresseid: initial.adgangsadresseid || dar.adgangsadresseid,
      ejerlavskode: initial.ejerlavskode ?? dar.ejerlavskode,
      matrikelnummer: initial.matrikelnummer ?? dar.matrikelnummer,
      grundareal: initial.grundareal ?? dar.grundareal,
    };
  } catch (e) {
    logServerEvent({
      module: "address-enrichment",
      operation: "dar.getAddressDetails",
      severity: "degraded",
      message: "DAR opslag fejlede",
      error: e,
      trace,
    });
    return initial;
  }
}
