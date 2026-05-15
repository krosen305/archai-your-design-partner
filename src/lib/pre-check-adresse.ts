// ARCH-121: preCheckAdresse — hurtig Layer-1-fetch umiddelbart efter adressevalg.
//
// Kører BBR+MAT, Plandata, NaturbeskyttelseService og EBR+VUR
// parallelt (Promise.allSettled) og returnerer compliance-flags + kontekstdata
// til brug i adresse-gaten (ARCH-122) og boligoensker-hints (ARCH-123).
// Fredningsstatus hentes fra FBB (fbb_er_fredet) — SaveService fjernet (ARCH-29).
//
// Handler-koden er server-side only. createServerFn gør filen importerbar
// på klienten (som kaldestubbe) uden at bryde server-boundary.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ComplianceFlag } from "@/lib/project-store";
import type { BbrKompliantData } from "@/integrations/bbr/client";
import type { Lokalplan, Kommuneplanramme } from "@/integrations/plandata/client";
import type { VurData } from "@/integrations/vur/client";
import type { ComplianceMetrics } from "@/lib/compliance-engine";
import type { NaturbeskyttelsesResultat } from "@/integrations/sdfi/naturbeskyttelse";
import type { FbbResultat } from "@/integrations/fbb/client";
import { fetchLayer1 } from "@/lib/compliance-layer1";
import {
  finishAnalysisRun,
  recordAnalysisEvent,
  startAnalysisRun,
  traceStep,
  type AnalysisTraceContext,
} from "@/lib/analysis-tracing";

// ---------------------------------------------------------------------------
// Input-validering (ARCH-173): strict Zod-schema forhindrer at serverfunctionen
// bruges som uauthentificeret proxy mod Datafordeler.
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidField = z.string().regex(UUID_RE, "Ugyldigt UUID-format").max(64);

const preCheckSchema = z.object({
  adgangsadresseid: uuidField,
  adresseid: uuidField,
  ejerlavskode: z.number().int().positive().max(999999).nullable(),
  matrikelnummer: z.string().max(20).nullable(),
  // Koordinater begrænses til Danmark (ca. bounding box + margin)
  koordinater: z
    .object({ lat: z.number().gte(54).lte(58), lng: z.number().gte(7).lte(16) })
    .nullable(),
  grundareal: z.number().positive().max(500_000).nullable().optional(),
  vejnavn: z.string().max(120).nullable().optional(),
  kommunenavn: z.string().max(120).nullable().optional(),
});

// ---------------------------------------------------------------------------
// Input / Output typer
// ---------------------------------------------------------------------------

export type AdressePreCheckInput = {
  adgangsadresseid: string;
  adresseid: string;
  ejerlavskode: number | null;
  matrikelnummer: string | null;
  koordinater: { lat: number; lng: number } | null;
  grundareal?: number | null;
  /** Vejnavn + husnr til FBB adresse-fallback, fx "Hasselvej 48" (ARCH-151) */
  vejnavn?: string | null;
  /** Kommunenavn til FBB adresse-fallback, fx "Lyngby-Taarbæk" (ARCH-151) */
  kommunenavn?: string | null;
};

export type AdressePreCheckResultat = {
  analysisRunId?: string | null;
  blockers: ComplianceFlag[];
  advarsler: ComplianceFlag[];
  kontekst: {
    grundareal: number | null;
    bebyggetAreal: number | null;
    bebyggelsesprocent: number | null;
    antalEtager: number | null;
    maxBebyggelsesprocent: number | null;
    maxEtager: number | null;
    maxBygningshoejde: number | null;
    restBygningsareal: number | null;
    ejendomsvaerdi: number | null;
    grundvaerdi: number | null;
  };
  // Rådata til store-population (ARCH-122)
  bbr: BbrKompliantData | null;
  lokalplaner: Lokalplan[];
  kommuneplanramme: Kommuneplanramme | null;
  vurderingData: VurData | null;
  complianceMetrics: ComplianceMetrics | null;
};

// ---------------------------------------------------------------------------
// Server function
// ---------------------------------------------------------------------------

export const preCheckAdresse = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => preCheckSchema.parse(data))
  .handler(async ({ data }): Promise<AdressePreCheckResultat> => {
    const startedAt = Date.now();
    const trace = await startAnalysisRun({
      runKind: "precheck",
      addressId: data.adresseid,
      source: "preCheckAdresse",
      metadata: {
        has_coordinates: !!data.koordinater,
        has_prefetched_grundareal: data.grundareal !== undefined && data.grundareal !== null,
      },
    });

    try {
      const result = await runPreCheckAdresse(data, trace);
      await finishAnalysisRun(trace, "done", startedAt);
      return { ...result, analysisRunId: trace.runId };
    } catch (e) {
      await finishAnalysisRun(trace, "failed", startedAt, e);
      throw e;
    }
  });

async function runPreCheckAdresse(
  data: z.infer<typeof preCheckSchema>,
  trace: AnalysisTraceContext,
): Promise<Omit<AdressePreCheckResultat, "analysisRunId">> {
  const { adgangsadresseid, ejerlavskode, matrikelnummer, koordinater } = data;

  const [layer1Settled, naturSettled] = await Promise.allSettled([
    fetchLayer1({
      adgangsadresseid,
      ejerlavskode,
      matrikelnummer,
      koordinater,
      grundareal: data.grundareal ?? null,
      trace,
    }),
    koordinater
      ? import("@/integrations/sdfi/naturbeskyttelse")
          .then(({ NaturbeskyttelseService }) =>
            traceStep(
              trace,
              {
                eventType: "api_call",
                phase: "precheck",
                service: "DAI WFS",
                operation: "naturbeskyttelse.getTilstand",
              },
              () => NaturbeskyttelseService.getTilstand(koordinater),
            ),
          )
          .catch(() => null as NaturbeskyttelsesResultat | null)
      : Promise.resolve(null as NaturbeskyttelsesResultat | null),
  ]);

  const labels = ["Layer1", "Naturbeskyttelse"];
  [layer1Settled, naturSettled].forEach((r, i) => {
    if (r.status === "rejected") {
      console.warn(`[preCheckAdresse] ${labels[i]} fejlede:`, r.reason);
      void recordAnalysisEvent(trace, {
        eventType: "pipeline_step",
        phase: "precheck",
        service: labels[i],
        operation: "settled_result",
        status: "error",
        errorMessage: r.reason instanceof Error ? r.reason.message : String(r.reason),
      });
    }
  });

  const layer1 =
    layer1Settled.status === "fulfilled"
      ? layer1Settled.value
      : {
          bbr: null,
          lokalplaner: [] as Lokalplan[],
          kommuneplanramme: null,
          vurderingData: null,
        };

  const bbr = layer1.bbr;
  const naturbeskyttelse = naturSettled.status === "fulfilled" ? naturSettled.value : null;
  const vurdering = layer1.vurderingData;

  // FBB: kræver integer BBR building IDs fra BBR Public Service — køres separat efter BBR-fasen (ARCH-131)
  // Fallback til adresse-opslag når BBR Public Service returnerer 404/tom (ARCH-151).
  let fbbData: FbbResultat | null = null;
  const bygningIds = bbr?.alle_bbr_public_ids ?? [];
  if (bygningIds.length) {
    fbbData = await import("@/integrations/fbb/client")
      .then(({ FbbService }) =>
        traceStep(
          trace,
          {
            eventType: "api_call",
            phase: "precheck",
            service: "FBB WFS",
            operation: "getSaveData",
          },
          () => FbbService.getSaveData(bygningIds),
          { metadata: { building_ids_count: bygningIds.length } },
        ),
      )
      .catch((e: Error) => {
        console.warn("[preCheckAdresse] FBB fejlede:", e.message);
        return null;
      });
  } else if (data.vejnavn && data.kommunenavn) {
    fbbData = await import("@/integrations/fbb/client")
      .then(({ FbbService }) =>
        traceStep(
          trace,
          {
            eventType: "api_call",
            phase: "precheck",
            service: "FBB WFS",
            operation: "getSaveDataByAddress",
          },
          () => FbbService.getSaveDataByAddress(data.vejnavn!, data.kommunenavn!),
        ),
      )
      .catch((e: Error) => {
        console.warn("[preCheckAdresse] FBB adresse-fallback fejlede:", e.message);
        return null;
      });
  }

  // ── Compliance metrics ────────────────────────────────────────────────────
  const { calculateComplianceMetrics } = await import("@/lib/compliance-engine");
  const complianceMetrics = calculateComplianceMetrics(bbr, layer1.kommuneplanramme);

  // ── Compliance flags ──────────────────────────────────────────────────────
  const flags = buildPreCheckFlags(bbr, layer1.kommuneplanramme, naturbeskyttelse, fbbData);

  return {
    blockers: flags.filter((f) => f.status === "blocker"),
    advarsler: flags.filter((f) => f.status === "advarsel"),
    kontekst: {
      grundareal: bbr?.grundareal ?? null,
      bebyggetAreal: bbr?.bebygget_areal ?? null,
      bebyggelsesprocent: bbr?.bebyggelsesprocent ?? null,
      antalEtager: bbr?.antal_etager ?? null,
      maxBebyggelsesprocent: layer1.kommuneplanramme?.bebygpct ?? null,
      maxEtager: layer1.kommuneplanramme?.maxetager ?? null,
      maxBygningshoejde: layer1.kommuneplanramme?.maxbygnhjd ?? null,
      restBygningsareal: complianceMetrics.remainingBygningsareal,
      ejendomsvaerdi: vurdering?.ejendomsvaerdi ?? null,
      grundvaerdi: vurdering?.grundvaerdi ?? null,
    },
    bbr,
    lokalplaner: layer1.lokalplaner,
    kommuneplanramme: layer1.kommuneplanramme,
    vurderingData: vurdering,
    complianceMetrics,
  };
}

// ---------------------------------------------------------------------------
// Flag-generering (kun de checks der er relevante på adresse-tidspunktet)
// ---------------------------------------------------------------------------

function buildPreCheckFlags(
  bbr: BbrKompliantData | null,
  ramme: Kommuneplanramme | null,
  naturbeskyttelse: NaturbeskyttelsesResultat | null,
  fbbData: FbbResultat | null,
): ComplianceFlag[] {
  const flags: ComplianceFlag[] = [];

  if (!bbr) return flags;

  // Fredning: BBR byg070 ELLER FBB fredningsstatus (fbb_er_fredet)
  if (bbr.fredet || fbbData?.fbb_er_fredet) {
    flags.push({
      id: "fredet",
      label: "Fredet bygning",
      status: "blocker",
      detalje:
        "Bygningen er fredet — alle ændringer kræver tilladelse fra Slots- og Kulturstyrelsen",
      aktuelVærdi: "Fredet",
      tilladt: "Ingen ændringer uden dispensation",
      kilde: bbr.fredet ? "bbr" : "fbb",
      dispensationMulig: true,
      dispensationMyndighed: "Slots- og Kulturstyrelsen",
    });
  }

  // SAVE-bevaringsværdi — konsistent med stop-rules.ts (ARCH-176, ARCH-159)
  const saveScore = fbbData?.fbb_bedste_bygning?.bevaringsvaerdi ?? null;
  if (saveScore !== null && saveScore !== undefined && saveScore <= 3) {
    flags.push({
      id: "save-bevaringsvaerdi",
      label: `Høj bevaringsværdi (SAVE ${saveScore})`,
      status: "blocker",
      detalje: `Bygningen er registreret med høj bevaringsværdi (SAVE ${saveScore}/9) — nedrivning og væsentlig ombygning kræver særlig kommunal tilladelse (Planlovens §14).`,
      aktuelVærdi: `SAVE ${saveScore}`,
      tilladt: null,
      kilde: "bbr",
      dispensationMulig: true,
      dispensationMyndighed: "Kommunen",
    });
  } else if (saveScore === 4) {
    flags.push({
      id: "save-4-paragraph14",
      label: "Bevaringsværdi SAVE 4 — §14-forbud muligt",
      status: "advarsel",
      detalje:
        "Kommunen kan nedlægge §14-forbud mod nedrivning (Planlovens §14). Afklar med kommunens tekniske forvaltning inden budgetlåsning.",
      aktuelVærdi: "SAVE 4",
      tilladt: null,
      kilde: "bbr",
      dispensationMulig: false,
    });
  }

  // MAT beskyttelseslinjer (autoritative registrerede data)
  if (bbr.mat_strandbeskyttelse) {
    flags.push({
      id: "mat-strandbeskyttelse",
      label: "Strandbeskyttelseslinje",
      status: "blocker",
      detalje:
        "Jordstykket er registreret inden for strandbeskyttelseslinje — byggestop uden dispensation fra Kystdirektoratet",
      aktuelVærdi: "Inden for zone",
      tilladt: "Ingen byggeri uden dispensation",
      kilde: "bbr",
      dispensationMulig: true,
      dispensationMyndighed: "Kystdirektoratet",
    });
  }
  if (bbr.mat_fredskov) {
    flags.push({
      id: "mat-fredskov",
      label: "Fredskov",
      status: "blocker",
      detalje:
        "Jordstykket er udlagt som fredskov — skovlovens §28 forbyder byggeri uden dispensation fra Miljøstyrelsen",
      aktuelVærdi: "Fredskov",
      tilladt: "Ingen byggeri uden dispensation",
      kilde: "bbr",
      dispensationMulig: true,
      dispensationMyndighed: "Miljøstyrelsen",
    });
  }
  if (bbr.mat_klitfredning) {
    flags.push({
      id: "mat-klitfredning",
      label: "Klitfredning",
      status: "blocker",
      detalje: "Jordstykket er klitfredet — byggestop uden dispensation fra Kystdirektoratet",
      aktuelVærdi: "Inden for klitfredet zone",
      tilladt: "Ingen byggeri uden dispensation",
      kilde: "bbr",
      dispensationMulig: true,
      dispensationMyndighed: "Kystdirektoratet",
    });
  }

  // Allerede over max bebyggelsesprocent (ingen ny bebyggelse mulig uden dispensation)
  const pct = bbr.bebyggelsesprocent;
  const maxPct = ramme?.bebygpct ?? null;
  if (pct !== null && maxPct !== null && pct > maxPct) {
    flags.push({
      id: "allerede_over_max_pct",
      label: "Bebyggelsesprocent overskredet",
      status: "blocker",
      detalje: `Eksisterende bebyggelse (${pct}%) overstiger kommuneplanrammens max (${maxPct}%) — tilbyg kræver dispensation`,
      aktuelVærdi: `${pct}%`,
      tilladt: `${maxPct}%`,
      kilde: "beregnet",
      dispensationMulig: true,
      dispensationMyndighed: "Kommunen",
    });
  }

  // NaturbeskyttelseService (spatiale checks — supplerer MAT)
  if (naturbeskyttelse) {
    if (naturbeskyttelse.strandbeskyttelse) {
      flags.push({
        id: "naturbeskyttelse-strandbeskyttelse",
        label: "Strandbeskyttelseslinje",
        status: "blocker",
        detalje: "300 m fra kyst — byggestop uden dispensation fra Kystdirektoratet",
        aktuelVærdi: "Inden for zone",
        tilladt: "Ingen byggeri uden dispensation",
        kilde: "sdfi",
        dispensationMulig: true,
        dispensationMyndighed: "Kystdirektoratet",
      });
    }
    if (naturbeskyttelse.soebeskyttelse) {
      flags.push({
        id: "naturbeskyttelse-soebeskyttelse",
        label: "Søbeskyttelseslinje",
        status: "blocker",
        detalje: "150 m fra søer >3 ha — byggestop uden dispensation",
        aktuelVærdi: "Inden for zone",
        tilladt: "Ingen byggeri uden dispensation",
        kilde: "sdfi",
        dispensationMulig: true,
        dispensationMyndighed: "Kommunen",
      });
    }
    if (naturbeskyttelse.aabeskyttelse) {
      flags.push({
        id: "naturbeskyttelse-aabeskyttelse",
        label: "Åbeskyttelseslinje",
        status: "blocker",
        detalje: "150 m fra vandløb — byggestop uden dispensation",
        aktuelVærdi: "Inden for zone",
        tilladt: "Ingen byggeri uden dispensation",
        kilde: "sdfi",
        dispensationMulig: true,
        dispensationMyndighed: "Kommunen",
      });
    }
    if (naturbeskyttelse.skovbyggelinje) {
      flags.push({
        id: "naturbeskyttelse-skovbyggelinje",
        label: "Skovbyggelinje",
        status: "advarsel",
        detalje: "300 m fra statsskov — byggestop uden dispensation",
        aktuelVærdi: "Inden for zone",
        tilladt: null,
        kilde: "sdfi",
        dispensationMulig: true,
        dispensationMyndighed: "Miljøstyrelsen",
      });
    }
  }

  return flags;
}
