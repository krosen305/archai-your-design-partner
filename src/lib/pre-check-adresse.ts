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
import type { AdressePreCheckResultat } from "@/types/project-state";
export type { AdressePreCheckResultat } from "@/types/project-state";
import type { VurData } from "@/domain/contracts/analysis.types";
import type {
  RuleEngineBbrData,
  RuleEngineFbbResult,
  RuleEngineKommuneplanramme,
  RuleEngineLokalplan,
  RuleEngineNaturbeskyttelsesResultat,
} from "@/domain/contracts/rule-engine.types";
import type { ComplianceMetrics } from "@/lib/compliance-engine";
import { fetchLayer1 } from "@/lib/compliance-layer1";
import { buildPreCheckFlags } from "@/lib/pre-check-flags";
import {
  finishAnalysisRun,
  recordAnalysisEvent,
  startAnalysisRun,
  traceStep,
  type AnalysisTraceContext,
} from "@/lib/analysis-tracing";
import { logServerEvent } from "@/lib/server-logger";

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
      adresseid: data.adresseid,
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
          .catch(() => null as RuleEngineNaturbeskyttelsesResultat | null)
      : Promise.resolve(null as RuleEngineNaturbeskyttelsesResultat | null),
  ]);

  const labels = ["Layer1", "Naturbeskyttelse"];
  [layer1Settled, naturSettled].forEach((r, i) => {
    if (r.status === "rejected") {
      logServerEvent({
        module: "pre-check-adresse",
        operation: `${labels[i]}.settled_result`,
        severity: "degraded",
        message: `${labels[i]} fejlede`,
        error: r.reason,
        trace,
      });
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
          lokalplaner: [] as RuleEngineLokalplan[],
          kommuneplanramme: null,
          vurderingData: null,
        };

  const bbr = layer1.bbr;
  const naturbeskyttelse = naturSettled.status === "fulfilled" ? naturSettled.value : null;
  const vurdering = layer1.vurderingData;

  // FBB: kræver integer BBR building IDs fra Datafordeler/BBR — køres separat efter BBR-fasen (ARCH-131)
  // Fallback til adresse-opslag når FBB ikke finder bygnings-IDs (ARCH-151).
  let fbbData: RuleEngineFbbResult | null = null;
  const bygningIds = bbr?.alle_bygning_lokal_ids ?? [];
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
        logServerEvent({
          module: "pre-check-adresse",
          operation: "fbb.getSaveData",
          severity: "degraded",
          message: "FBB fejlede",
          error: e,
          trace,
        });
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
        logServerEvent({
          module: "pre-check-adresse",
          operation: "fbb.getSaveDataByAddress",
          severity: "degraded",
          message: "FBB adresse-fallback fejlede",
          error: e,
          trace,
        });
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
