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

/**
 * Resultatet af adresse-enrichment indeholder address-felterne plus de
 * MAT-felter som Layer 1 ellers ville hente i et separat MatService-kald
 * (P2 #2). Når disse felter er udfyldt kan fetchBbrWithMat springe det
 * ekstra MAT-opslag over.
 */
export type AddressEnrichmentResult = AddressFields & {
  jordstykkeLokalId: string | null;
  matStrandbeskyttelse: boolean | null;
  matFredskov: boolean | null;
  matKlitfredning: boolean | null;
};

export async function enrichAddressDetails(
  addressId: string,
  initial: AddressFields,
  trace: AnalysisTraceContext,
): Promise<AddressEnrichmentResult> {
  const baseEmpty: AddressEnrichmentResult = {
    ...initial,
    jordstykkeLokalId: null,
    matStrandbeskyttelse: null,
    matFredskov: null,
    matKlitfredning: null,
  };
  const needsEnrichment = !initial.adgangsadresseid || initial.grundareal === null;
  if (!needsEnrichment) return baseEmpty;

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
      () => DarService.getAddressDetails(addressId, { skipKoordinaterOgPostnummer: true }, trace),
      {
        outputSummary: (r) =>
          `grundareal=${r.grundareal ?? "null"} matrikel=${r.matrikelnummer ?? "null"} ejerlavskode=${r.ejerlavskode ?? "null"} jordstykke=${r.jordstykkeLokalId ?? "null"}`,
      },
    );
    return {
      adgangsadresseid: initial.adgangsadresseid || dar.adgangsadresseid,
      ejerlavskode: initial.ejerlavskode ?? dar.ejerlavskode,
      matrikelnummer: initial.matrikelnummer ?? dar.matrikelnummer,
      grundareal: initial.grundareal ?? dar.grundareal,
      jordstykkeLokalId: dar.jordstykkeLokalId,
      matStrandbeskyttelse: dar.matStrandbeskyttelse,
      matFredskov: dar.matFredskov,
      matKlitfredning: dar.matKlitfredning,
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
    return baseEmpty;
  }
}
