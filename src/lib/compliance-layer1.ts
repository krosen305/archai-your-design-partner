// SERVER-SIDE ONLY — shared Layer-1 fetchers for pre-check + full analysis.

import type {
  RuleEngineBbrData,
  RuleEngineKommuneplanramme,
  RuleEngineLokalplan,
} from "@/domain/contracts/rule-engine.types";
import type { VurData } from "@/domain/contracts/analysis.types";
import type { AnalysisTraceContext } from "@/lib/analysis-tracing";
import { traceStep } from "@/lib/analysis-tracing";
import { logServerEvent } from "@/lib/server-logger";

export type Layer1Input = {
  adgangsadresseid: string;
  adresseid?: string;
  ejerlavskode: number | null;
  matrikelnummer: string | null;
  koordinater: { lat: number; lng: number } | null;
  grundareal?: number | null;
  trace?: AnalysisTraceContext | null;
};

export type Layer1Result = {
  bbr: RuleEngineBbrData | null;
  lokalplaner: RuleEngineLokalplan[];
  kommuneplanramme: RuleEngineKommuneplanramme | null;
  vurderingData: VurData | null;
};

export async function fetchLayer1(input: Layer1Input): Promise<Layer1Result> {
  const [bbr, plandata, vurderingData] = await Promise.all([
    fetchBbrWithMat({ ...input }),
    fetchPlandata(input.koordinater, input.trace),
    fetchVurViaMat(null, input.trace),
  ]);

  return {
    bbr,
    lokalplaner: plandata.lokalplaner,
    kommuneplanramme: plandata.kommuneplanramme,
    vurderingData,
  };
}

export async function fetchBbrWithMat(input: {
  adgangsadresseid: string;
  adresseid?: string;
  ejerlavskode: number | null;
  matrikelnummer: string | null;
  grundareal?: number | null;
  trace?: AnalysisTraceContext | null;
}): Promise<RuleEngineBbrData | null> {
  const { adgangsadresseid, ejerlavskode, matrikelnummer } = input;

  try {
    let grundareal: number | null = input.grundareal ?? null;
    let mat_strandbeskyttelse: boolean | null = null;
    let mat_fredskov: boolean | null = null;
    let mat_klitfredning: boolean | null = null;
    let jordstykkeLokalId: string | null = null;

    if (ejerlavskode && matrikelnummer) {
      const { MatService } = await import("@/integrations/mat/client");
      const mat = await MatService.getGrundareal(
        ejerlavskode,
        matrikelnummer,
        undefined,
        input.trace,
      );
      if (grundareal === null && mat.registreretAreal !== null) grundareal = mat.registreretAreal;
      if (mat.fejl) {
        logServerEvent({
          module: "compliance-layer1",
          operation: "fetchBbrWithMat.mat",
          severity: "degraded",
          message: "MAT returnerede fejl under grundareal-opslag",
          trace: input.trace,
          metadata: { fejl: mat.fejl, ejerlavskode, matrikelnummer },
        });
      }
      if (grundareal === null && !mat.fejl) {
        logServerEvent({
          module: "compliance-layer1",
          operation: "fetchBbrWithMat.mat",
          severity: "degraded",
          message: "MAT returnerede ikke registreretAreal",
          trace: input.trace,
          metadata: { ejerlavskode, matrikelnummer },
        });
      }
      mat_strandbeskyttelse = mat.strandbeskyttelse;
      mat_fredskov = mat.fredskov;
      mat_klitfredning = mat.klitfredning;
      jordstykkeLokalId = mat.jordstykkeLokalId;
    } else {
      // Mangler ejerlavskode/matrikelnummer — forsøg GrundarealResolver (ARCH-222 option B)
      try {
        const { GrundarealResolver } = await import("@/integrations/mat/grundareal-resolver");
        const resolved = await GrundarealResolver.resolve(
          {
            adgangsadresseid: input.adgangsadresseid,
            adresseid: input.adresseid ?? "",
          },
          undefined,
          input.trace,
        );
        if (resolved.grundareal !== null) {
          grundareal = resolved.grundareal;
          mat_strandbeskyttelse =
            resolved.jordstykker.length > 0
              ? resolved.jordstykker.some((j) => j.strandbeskyttelse === true)
              : null;
          mat_fredskov =
            resolved.jordstykker.length > 0
              ? resolved.jordstykker.some((j) => j.fredskov === true)
              : null;
          mat_klitfredning =
            resolved.jordstykker.length > 0
              ? resolved.jordstykker.some((j) => j.klitfredning === true)
              : null;
          // Gem primær jordstykke-ID til MatrikelMap (ARCH-229)
          jordstykkeLokalId = resolved.jordstykker[0]?.id_lokalId ?? null;
        } else {
          logServerEvent({
            module: "compliance-layer1",
            operation: "fetchBbrWithMat.grundarealResolver",
            severity: "degraded",
            message: "GrundarealResolver returnerede ingen grundareal",
            trace: input.trace,
            metadata: { fejl: resolved.fejl, adgangsadresseid: input.adgangsadresseid },
          });
        }
      } catch (e) {
        logServerEvent({
          module: "compliance-layer1",
          operation: "fetchBbrWithMat.grundarealResolver",
          severity: "degraded",
          message: "GrundarealResolver kastede exception",
          error: e,
          trace: input.trace,
          metadata: { adgangsadresseid: input.adgangsadresseid },
        });
      }
    }

    const { BbrService } = await import("@/integrations/bbr/client");
    const bbr = await BbrService.getKompliantData(
      adgangsadresseid,
      grundareal,
      undefined,
      input.trace,
    );
    if (bbr) {
      bbr.mat_strandbeskyttelse = mat_strandbeskyttelse;
      bbr.mat_fredskov = mat_fredskov;
      bbr.mat_klitfredning = mat_klitfredning;
      bbr.jordstykke_lokal_id = jordstykkeLokalId;
    }
    return bbr;
  } catch (e) {
    logServerEvent({
      module: "compliance-layer1",
      operation: "fetchBbrWithMat",
      severity: "degraded",
      message: "BBR+MAT fetch fejlede",
      error: e,
      trace: input.trace,
      metadata: { adgangsadresseid },
    });
    return null;
  }
}

export async function fetchPlandata(
  koordinater: { lat: number; lng: number } | null,
  trace?: AnalysisTraceContext | null,
): Promise<{
  lokalplaner: RuleEngineLokalplan[];
  kommuneplanramme: RuleEngineKommuneplanramme | null;
}> {
  if (!koordinater) return { lokalplaner: [], kommuneplanramme: null };

  const { PlandataService } = await import("@/integrations/plandata/client");

  const [lokalplanerResult, kommuneplanrammeResult] = await Promise.all([
    traceStep(
      trace,
      {
        eventType: "api_call",
        phase: "layer1",
        service: "Plandata WFS",
        operation: "lokalplaner_for_koordinat",
      },
      () => PlandataService.getLokalplanerForKoordinat(koordinater.lng, koordinater.lat, true),
      { metadata: (result) => ({ raw_count: result.rawCount, has_error: !!result.fejl }) },
    ).catch(() => ({ lokalplaner: [], fejl: null, rawCount: 0 })),
    traceStep(
      trace,
      {
        eventType: "api_call",
        phase: "layer1",
        service: "Plandata WFS",
        operation: "kommuneplanramme_for_koordinat",
      },
      () => PlandataService.getKommuneplanrammeForKoordinat(koordinater.lng, koordinater.lat),
      { metadata: (result) => ({ has_ramme: !!result.ramme, has_error: !!result.fejl }) },
    ).catch(() => ({
      ramme: null,
      fejl: null,
    })),
  ]);

  return {
    lokalplaner: lokalplanerResult.lokalplaner,
    kommuneplanramme: kommuneplanrammeResult.ramme,
  };
}

/**
 * Henter VUR-data via MAT_SamletFastEjendom → BFE → VUR.
 * Erstatter EBR-baseret opslag (EBR v2 eksisterer ikke, v1 kræver anden API-nøgle).
 *
 * Kæde: MAT_Jordstykke.samletFastEjendomLokalId → MAT_SamletFastEjendom.BFEnummer → VUR
 */
export async function fetchVurViaMat(
  samletFastEjendomLokalId: string | null,
  trace?: AnalysisTraceContext | null,
): Promise<VurData | null> {
  if (!samletFastEjendomLokalId) return null;
  try {
    const { runtimeConfig } = await import("@/lib/runtime-config");
    const { getEnvRequired } = await import("@/lib/env");
    const { datafordelerGraphqlFetch } = await import(
      "@/integrations/datafordeler/graphql-client"
    );
    const { currentBitemporalArgs } = await import("@/integrations/datafordeler/bitemporal");
    const { z } = await import("zod");

    const apiKey = getEnvRequired("DATAFORDELER_API_KEY");
    const url = new URL(runtimeConfig.integrations.datafordeler.matEndpoint);
    url.searchParams.set("apiKey", apiKey);

    const sfeSchema = z.object({
      MAT_SamletFastEjendom: z.object({
        nodes: z.array(z.object({ BFEnummer: z.string().nullable().optional().default(null) })),
      }),
    });

    const sfeData = await datafordelerGraphqlFetch(
      url,
      `query VurSfe($id: String!, $virkningstid: DafDateTime!, $registreringstid: DafDateTime!) {
  MAT_SamletFastEjendom(
    where: { id_lokalId: { eq: $id } }
    virkningstid: $virkningstid
    registreringstid: $registreringstid
    first: 1
  ) {
    nodes { BFEnummer }
  }
}`,
      { id: samletFastEjendomLokalId, ...currentBitemporalArgs() },
      "MAT_SamletFastEjendom_vur",
      sfeSchema,
      { trace, phase: "layer1", metadata: { via: "MAT_SFE" } },
    );

    const bfeNr = sfeData.MAT_SamletFastEjendom.nodes[0]?.BFEnummer ?? null;
    if (!bfeNr) return null;

    const { VurService } = await import("@/integrations/vur/client");
    return await VurService.getVurdering(bfeNr, undefined, trace);
  } catch (e) {
    logServerEvent({
      module: "compliance-layer1",
      operation: "fetchVurViaMat",
      severity: "degraded",
      message: "VUR-opslag via MAT fejlede",
      error: e,
      trace,
      metadata: { samletFastEjendomLokalId },
    });
    return null;
  }
}
