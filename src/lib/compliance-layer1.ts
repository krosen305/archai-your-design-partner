// SERVER-SIDE ONLY — shared Layer-1 fetchers for pre-check + full analysis.

import type { BbrKompliantData } from "@/integrations/bbr/client";
import type { Lokalplan, Kommuneplanramme } from "@/integrations/plandata/client";
import type { VurData } from "@/integrations/vur/client";
import type { AnalysisTraceContext } from "@/lib/analysis-tracing";
import { traceStep } from "@/lib/analysis-tracing";

export type Layer1Input = {
  adgangsadresseid: string;
  ejerlavskode: number | null;
  matrikelnummer: string | null;
  koordinater: { lat: number; lng: number } | null;
  grundareal?: number | null;
  trace?: AnalysisTraceContext | null;
};

export type Layer1Result = {
  bbr: BbrKompliantData | null;
  lokalplaner: Lokalplan[];
  kommuneplanramme: Kommuneplanramme | null;
  vurderingData: VurData | null;
};

export async function fetchLayer1(input: Layer1Input): Promise<Layer1Result> {
  const [bbr, plandata, vurderingData] = await Promise.all([
    fetchBbrWithMat(input),
    fetchPlandata(input.koordinater, input.trace),
    fetchVurViaEbr(input.adgangsadresseid, input.trace),
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
  ejerlavskode: number | null;
  matrikelnummer: string | null;
  grundareal?: number | null;
  trace?: AnalysisTraceContext | null;
}): Promise<BbrKompliantData | null> {
  const { adgangsadresseid, ejerlavskode, matrikelnummer } = input;

  try {
    let grundareal: number | null = input.grundareal ?? null;
    let mat_strandbeskyttelse: boolean | null = null;
    let mat_fredskov: boolean | null = null;
    let mat_klitfredning: boolean | null = null;

    if (ejerlavskode && matrikelnummer) {
      const { MatService } = await import("@/integrations/mat/client");
      const mat = await MatService.getGrundareal(
        ejerlavskode,
        matrikelnummer,
        undefined,
        input.trace,
      );
      if (grundareal === null && mat.registreretAreal !== null) grundareal = mat.registreretAreal;
      if (mat.fejl) console.warn("[Layer1] MAT fejl:", mat.fejl);
      if (grundareal === null && !mat.fejl)
        console.error("[Layer1] MatService returnerede null registreretAreal for ejerlavskode:", ejerlavskode, "matrikelnummer:", matrikelnummer);
      mat_strandbeskyttelse = mat.strandbeskyttelse;
      mat_fredskov = mat.fredskov;
      mat_klitfredning = mat.klitfredning;
    } else if (!ejerlavskode || !matrikelnummer) {
      console.warn("[Layer1] Mangler ejerlavskode/matrikelnummer — MatService-fallback springes over", { ejerlavskode, matrikelnummer });
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
    }
    return bbr;
  } catch (e) {
    console.warn("[Layer1] BBR+MAT fejlede:", (e as Error).message);
    return null;
  }
}

export async function fetchPlandata(
  koordinater: { lat: number; lng: number } | null,
  trace?: AnalysisTraceContext | null,
): Promise<{ lokalplaner: Lokalplan[]; kommuneplanramme: Kommuneplanramme | null }> {
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

export async function fetchVurViaEbr(
  adgangsadresseid: string,
  trace?: AnalysisTraceContext | null,
): Promise<VurData | null> {
  if (!adgangsadresseid) return null;
  try {
    const { EbrService } = await import("@/integrations/ebr/client");
    const ebr = await EbrService.getBfeNr(adgangsadresseid, undefined, trace);
    if (ebr.fejl || !ebr.bfeNr) return null;
    const { VurService } = await import("@/integrations/vur/client");
    return await VurService.getVurdering(ebr.bfeNr, undefined, trace);
  } catch (e) {
    console.warn("[Layer1] VUR fejlede:", (e as Error).message);
    return null;
  }
}
