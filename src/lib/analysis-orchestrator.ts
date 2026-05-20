// SERVER-SIDE ONLY – never import this from browser code.
//
// Cache-first orchestrator for address analysis (ARCH-32: fuldt paralleliseret).
// Checks Supabase before making any AI or data API calls.
// Each layer (BBR/Plandata, lokalplan PDF, servitut) is cached independently.
//
// Paralleliseringsstrategi:
//   Layer 1: BBR + Plandata (parallel)
//   Layer 2+3+4: lokalplan PDF, servitutter, geodata (alle tre parallel efter Layer 1)
//   Target: < 5 sekunder live (primært begrænset af PDF-udtræk ~2s)
//
// A returning user for a previously-analysed address pays $0.00 in AI costs.
//
// Current layer status:
//   compliance_result   ✅  BBR + MAT + Plandata pipeline (live)
//   lokalplan_extracted ✅  live Anthropic PDF-parsing (ARCH-53)
//   naturbeskyttelse    ✅  live DAI WFS — ARCH-65 (verificeret 2026-05-08, alle 5 typenames)
//   dkjord              ⏳  IS_MOCK=true — ARCH-66 (dkjord.mst.dk ikke tilgængelig fra dev)
//   geus                ⏳  IS_MOCK=true — ARCH-101 (radon-layer eksisterer ikke i GEUS WFS)
//   servitut_extracted  ⏳  IS_MOCK=true — ARCH-30 (TingbogenV2 kræver særskilt Datafordeler-abonnement)
//   terrain             ⏳  IS_MOCK=true — ARCH-102 (DHM WCS kræver særskilt Datafordeler-abonnement)
//   naboer              ⏳  deaktiveret — DAWA (dawa.aws.dk) er forbudt (ARCH-226)
//   fjernvarme          ✅  live Plandata WFS pdk:theme_pdk_varmeplansomraade_vedtaget_v (ARCH-111)
//   fbbData             ✅  live Kulturarv GeoServer fbb:view_bygningslag (ARCH-29)
//   report_text         ⏳  ARCH-27 (AI compliance summarizer not yet built)

import { validateEnv } from "@/lib/env";
validateEnv();

import type { BbrKompliantData } from "@/integrations/bbr/client";
import type { Lokalplan, Kommuneplanramme } from "@/integrations/plandata/client";
import type { LokalplanExtract } from "@/integrations/ai/pdf-extractor";
import type { NaturbeskyttelsesResultat } from "@/integrations/sdfi/naturbeskyttelse";
import type { DkJordResultat } from "@/integrations/miljoe/dkjord";
import type { GeusRiskData } from "@/integrations/geus/client";
import type { TinglysningResult } from "@/integrations/tinglysning/client";
import type { TerrainData } from "@/integrations/sdfi/dhm-client";
import type { NeighborBuildingData } from "@/integrations/bbr/neighbor-client";
import type { MatParcelGeometryPayload } from "@/integrations/mat/geometry";
import type { FjernvarmeResultat } from "@/integrations/plandata/fjernvarme";
import type { FbbResultat } from "@/integrations/fbb/client";
import type { RuleEngineResult } from "@/lib/rule-engine/types";
import type { VurData } from "@/integrations/vur/client";
import type { Json } from "@/integrations/supabase/types";
import { fetchBbrWithMat, fetchPlandata, fetchVurViaEbr } from "@/lib/compliance-layer1";
import {
  getCachedCompliance,
  setCachedCompliance,
  getCachedLokalplan,
  setCachedLokalplan,
  getCachedServitut,
  setCachedServitut,
} from "@/integrations/cache/client";
import {
  finishAnalysisRun,
  recordAnalysisEvent,
  startAnalysisRun,
  traceStep,
  type AnalysisTraceContext,
} from "@/lib/analysis-tracing";
import { summarizeSourceResult } from "@/lib/source-result";
import type { SourceResult } from "@/lib/source-result";

// ---------------------------------------------------------------------------
// Shared ComplianceResult type (ARCH-6)
// ---------------------------------------------------------------------------

export type ComplianceResult = {
  bbr: BbrKompliantData | null;
  lokalplaner: Lokalplan[];
  kommuneplanramme: Kommuneplanramme | null;
  analysedAt: string;
  lokalplanExtract: LokalplanExtract | null;
  naturbeskyttelse: NaturbeskyttelsesResultat | null;
  dkjord: DkJordResultat | null;
  geusRisk: GeusRiskData | null;
  servitutter: TinglysningResult | null;
  terrain: TerrainData | null;
  naboer: NeighborBuildingData | null;
  fjernvarme: FjernvarmeResultat | null;
  fbbData: FbbResultat | null; // ARCH-131: SAVE-bevaringsværdi (1-9) + fredningsstatus fra FBB
  matGeometri: MatParcelGeometryPayload | null; // ARCH-240: parcelpolygon + skel-metrics
  vurderingData: VurData | null; // ARCH-119: EBR+VUR ejendomsværdi og grundværdi
  ruleEngine?: RuleEngineResult; // sættes af runByggeanalyse (ARCH-109)
  analysisRunId?: string | null;
  serviceStates?: Partial<
    Record<
      import("@/lib/project-store").DataSourceKind,
      import("@/lib/project-store").PipelineServiceState
    >
  >;
};

// ---------------------------------------------------------------------------
// Input type
// ---------------------------------------------------------------------------

export type AnalysisInput = {
  addressId: string; // DAWA adresseid — used as cache key
  adgangsadresseid: string; // for BBR lookup
  ejerlavskode: number | null; // for MAT (grundareal) — fallback hvis grundareal mangler
  matrikelnummer: string | null; // for MAT (grundareal) — fallback hvis grundareal mangler
  koordinater: { lat: number; lng: number } | null; // for Plandata
  grundareal?: number | null; // Pre-fetched fra DAR_Jordstykke — skip MAT-kald hvis tilgængeligt
  projectId?: string | null;
  userId?: string | null;
};

// ---------------------------------------------------------------------------
// analyseAddress: cache-first orchestration
// ---------------------------------------------------------------------------

export async function analyseAddress(input: AnalysisInput): Promise<ComplianceResult> {
  const startedAt = Date.now();
  const trace = await startAnalysisRun({
    runKind: "full_analysis",
    projectId: input.projectId ?? null,
    addressId: input.addressId,
    userId: input.userId ?? null,
    source: "analyseAddress",
    metadata: {
      has_prefetched_grundareal: input.grundareal !== undefined && input.grundareal !== null,
      has_coordinates: !!input.koordinater,
    },
  });

  try {
    const result = await analyseAddressWithTrace(input, trace);
    await finishAnalysisRun(trace, "done", startedAt);
    return { ...result, analysisRunId: trace.runId };
  } catch (e) {
    await finishAnalysisRun(trace, "failed", startedAt, e);
    throw e;
  }
}

async function analyseAddressWithTrace(
  input: AnalysisInput,
  trace: AnalysisTraceContext,
): Promise<ComplianceResult> {
  const { addressId, koordinater } = input;

  const states: Partial<
    Record<
      import("@/lib/project-store").DataSourceKind,
      import("@/lib/project-store").PipelineServiceState
    >
  > = {};

  // Løs manglende adressefelter server-side via DAR.
  // Udløses når adgangsadresseid mangler ELLER grundareal er null — det sikrer at
  // bebyggelsesprocent kan beregnes selv hvis klientens DAR-opslag fejlede.
  let adgangsadresseid = input.adgangsadresseid;
  let ejerlavskode = input.ejerlavskode;
  let matrikelnummer = input.matrikelnummer;
  let preFetchedGrundareal = input.grundareal ?? null;

  if (!adgangsadresseid || preFetchedGrundareal === null) {
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
      if (!adgangsadresseid) adgangsadresseid = dar.adgangsadresseid;
      if (preFetchedGrundareal === null) preFetchedGrundareal = dar.grundareal;
      if (ejerlavskode === null) ejerlavskode = dar.ejerlavskode;
      if (matrikelnummer === null) matrikelnummer = dar.matrikelnummer;
    } catch (e) {
      console.warn("[Orchestrator] DAR opslag fejlede:", (e as Error).message);
    }
  }

  // ── Layer 1: compliance_result (BBR + MAT + Plandata) ──────────────────
  type ComplianceBase = Omit<
    ComplianceResult,
    | "lokalplanExtract"
    | "naturbeskyttelse"
    | "dkjord"
    | "geusRisk"
    | "servitutter"
    | "terrain"
    | "naboer"
    | "fjernvarme"
    | "fbbData"
    | "matGeometri"
    | "ruleEngine"
  >;
  let complianceBase: ComplianceBase | null = null;
  try {
    const cached = await traceStep(
      trace,
      {
        eventType: "cache_read",
        phase: "cache",
        service: "Supabase",
        operation: "address_analysis.compliance_result.read",
        inputSummary: `adresseid=${addressId}`,
      },
      () => getCachedCompliance(addressId),
      {
        cacheHit: (value) => !!value,
        outputSummary: (v) =>
          v ? `cache_hit=true bbr=${v.bbr ? "present" : "null"}` : "cache_hit=false",
      },
    );
    if (cached) {
      // Bypass stale cache hvis BBR mangler grundareal og vi kan genskabe det —
      // enten via preFetchedGrundareal (fra DAR) eller via MatService (kræver ejerlavskode+matrikelnummer).
      const canRecoverGrundareal =
        preFetchedGrundareal !== null || (ejerlavskode !== null && matrikelnummer !== null);
      if (cached.bbr?.grundareal === null && canRecoverGrundareal) {
        console.warn("[Orchestrator] Stale cache bypassed — grundareal mangler, genberegner", {
          preFetchedGrundareal,
          ejerlavskode,
          matrikelnummer,
        });
      } else {
        complianceBase = cached;
        states.bbr = "cache_hit";
        states.lokalplaner = "cache_hit";
        states.kommuneplanramme = "cache_hit";
        states.vurdering = "cache_hit";
      }
    }
  } catch (e) {
    console.warn(
      "[Orchestrator] cache-læsning fejlede (behandles som cache-miss):",
      (e as Error).message,
    );
  }

  if (!complianceBase) {
    const [bbrResult, plandataResult, vurderingResult] = await Promise.all([
      fetchBbrWithMat({
        adgangsadresseid,
        adresseid: addressId,
        ejerlavskode,
        matrikelnummer,
        grundareal: preFetchedGrundareal,
        trace,
      }),
      fetchPlandata(koordinater, trace),
      fetchVurViaEbr(adgangsadresseid, trace),
    ]);
    states.bbr = bbrResult ? "success" : "no_hit";
    states.lokalplaner = plandataResult.lokalplaner.length > 0 ? "success" : "no_hit";
    states.kommuneplanramme = plandataResult.kommuneplanramme ? "success" : "no_hit";
    states.vurdering = vurderingResult ? "success" : "no_hit";

    await recordAnalysisEvent(trace, {
      eventType: "pipeline_step",
      phase: "layer1",
      service: "ComplianceLayer1",
      operation: "bbr_plandata_vur_parallel",
      status: "ok",
      outputSummary: [
        `grundareal=${bbrResult?.grundareal ?? "null"}`,
        `lokalplaner=${plandataResult.lokalplaner.length}`,
        `vurdering=${vurderingResult != null ? "present" : "null"}`,
      ].join(" "),
    });

    const computedBase: ComplianceBase = {
      bbr: bbrResult,
      lokalplaner: plandataResult.lokalplaner,
      kommuneplanramme: plandataResult.kommuneplanramme,
      analysedAt: new Date().toISOString(),
      vurderingData: vurderingResult,
    };
    complianceBase = computedBase;
    try {
      await traceStep(
        trace,
        {
          eventType: "cache_write",
          phase: "cache",
          service: "Supabase",
          operation: "address_analysis.compliance_result.write",
        },
        () =>
          setCachedCompliance(addressId, {
            ...computedBase,
            lokalplanExtract: null,
            naturbeskyttelse: null,
            dkjord: null,
            geusRisk: null,
            servitutter: null,
            terrain: null,
            naboer: null,
            fjernvarme: null,
            fbbData: null,
            matGeometri: null,
            vurderingData: computedBase.vurderingData,
          }),
      );
    } catch (e) {
      console.warn(
        "[Orchestrator] compliance-cache-skriv fejlede (returnerer resultat uncached):",
        (e as Error).message,
      );
    }
  }

  if (!complianceBase) {
    throw new Error("[Orchestrator] Compliance base kunne ikke opbygges");
  }

  // ARCH-167: Hard Stop gate — spring dyre WFS/API-kald i Layer 4 over når
  // Layer 1 (BBR/MAT) allerede afslører et absolut byggestop.
  // FBB køres stadig (kræves til SAVE-værdien); naturbeskyttelse supplerer MAT.
  const bbrHardStop =
    complianceBase.bbr?.fredet === true ||
    complianceBase.bbr?.mat_strandbeskyttelse === true ||
    complianceBase.bbr?.mat_fredskov === true ||
    complianceBase.bbr?.mat_klitfredning === true;

  // ── Layers 2 + 3 + 4: kører parallelt — ingen indbyrdes afhængighed ──────
  // Layer 2 (lokalplan PDF), Layer 3 (servitutter) og Layer 4 (geodata)
  // behøver alle kun Layer 1's output. Parallel Promise.all sparer ~2s live.
  const { selectPrimaryLokalplanForPdf } = await import("@/integrations/plandata/client");
  const primaryLokalplan = selectPrimaryLokalplanForPdf(complianceBase.lokalplaner);
  const primaryPdfUrl = primaryLokalplan?.plandokumentLink ?? null;

  const [lokalplanExtract, servitutter, layer4] = await Promise.all([
    // ── Layer 2: lokalplan_extracted ────────────────────────────────────
    (async (): Promise<LokalplanExtract | null> => {
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
        if (cached) return cached as unknown as LokalplanExtract;
        if (primaryPdfUrl) {
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
            () => setCachedLokalplan(addressId, primaryPdfUrl, extract as unknown as Json),
          );
          return extract;
        }
        await recordAnalysisEvent(trace, {
          eventType: "pipeline_step",
          phase: "layer2",
          service: "Lokalplan",
          operation: "extract_lokalplan",
          status: "skipped",
          metadata: { reason: "missing_pdf_url" },
        });
        return null;
      } catch (e) {
        console.warn("[Orchestrator] lokalplan PDF-udtræk fejlede:", (e as Error).message);
        return null;
      }
    })(),

    // ── Layer 3: servitut_extracted (IS_MOCK=true — ARCH-104) ───────────
    (async (): Promise<TinglysningResult | null> => {
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
        console.warn("[Orchestrator] servitut-udtræk fejlede:", (e as Error).message);
        return null;
      }
    })(),

    // ── Layer 4: naturbeskyttelse + dkjord + geus + terrain + naboer + fjernvarme + FBB ─
    (async () => {
      let naturbeskyttelse: NaturbeskyttelsesResultat | null = null;
      let dkjord: DkJordResultat | null = null;
      let geusRisk: GeusRiskData | null = null;
      let terrain: TerrainData | null = null;
      let naboer: NeighborBuildingData | null = null;
      let fjernvarme: FjernvarmeResultat | null = null;
      let fbbData: FbbResultat | null = null;
      let matGeometri: MatParcelGeometryPayload | null = null;

      // MAT geometry: fetch canonical parcel polygon + compute metrics.
      // Runs before the parallel block so bbox25832 is available for GeoDanmark.
      const jordstykkeId = complianceBase.bbr?.jordstykke_lokal_id ?? null;
      if (jordstykkeId) {
        const matGeoResult = await traceStep(
          trace,
          {
            eventType: "api_call",
            phase: "layer4",
            service: "Datafordeler MAT WFS",
            operation: "MatGeometryService.getParcelGeometry",
            inputSummary: `jordstykkeId=${jordstykkeId}`,
          },
          () =>
            import("@/integrations/mat/geometry").then(({ MatGeometryService }) =>
              MatGeometryService.getParcelGeometry(
                jordstykkeId,
                complianceBase.bbr?.grundareal ?? null,
              ),
            ),
          {
            outputSummary: (r) =>
              summarizeSourceResult(
                r,
                (d) =>
                  `area=${d.polygonAreaM2?.toFixed(0) ?? "null"} canonical=${d.hasCanonicalPolygon}`,
              ),
            metadata: (r) => ({
              source: r.kilde,
              isMock: r.isMock,
              feature_count: r.rawFeatureCount,
            }),
          },
        ).catch((e: Error) => {
          console.warn("[Orchestrator] MatGeometryService fejlede:", e.message);
          return null;
        });
        matGeometri = matGeoResult?.data ?? null;
        (states as Record<string, unknown>).matGeometri =
          matGeoResult == null
            ? "error"
            : matGeoResult.status === "mock"
              ? "mock"
              : matGeoResult.status === "error"
                ? "error"
                : matGeoResult.data != null
                  ? "success"
                  : "no_hit";
      } else {
        (states as Record<string, unknown>).matGeometri = "no_hit";
      }

      // FBB: kræver integer BBR building IDs — kører altid (SAVE-værdi er nødvendig
      // selv på hard-stopped grunde for korrekt flag-visning)
      const bygningIds = complianceBase.bbr?.alle_bbr_public_ids ?? [];
      if (bygningIds.length) {
        fbbData = await import("@/integrations/fbb/client")
          .then(({ FbbService }) =>
            traceStep(
              trace,
              {
                eventType: "api_call",
                phase: "layer4",
                service: "FBB WFS",
                operation: "getSaveData",
              },
              () => FbbService.getSaveData(bygningIds),
              { metadata: { building_ids_count: bygningIds.length } },
            ),
          )
          .catch((e: Error) => {
            console.warn("[Orchestrator] FBB fejlede:", e.message);
            return null;
          });
      }

      // ARCH-167: skip dyre WFS/API-kald (geus, dkjord, terrain, naboer, fjernvarme)
      // når Layer 1 allerede viser absolut byggestop — spar ~3-5s responstid.
      // naturbeskyttelse kører stadig (supplerer MAT-data med WFS-verifikation).
      if (bbrHardStop) {
        await recordAnalysisEvent(trace, {
          eventType: "pipeline_step",
          phase: "layer4",
          service: "Orchestrator",
          operation: "skip_expensive_layer4",
          status: "skipped",
          metadata: { reason: "bbr_hard_stop" },
        });
        if (koordinater) {
          naturbeskyttelse = await import("@/integrations/sdfi/naturbeskyttelse")
            .then(({ NaturbeskyttelseService }) =>
              traceStep(
                trace,
                {
                  eventType: "api_call",
                  phase: "layer4",
                  service: "DAI WFS",
                  operation: "naturbeskyttelse.getTilstand",
                },
                () => NaturbeskyttelseService.getTilstand(koordinater),
              ),
            )
            .catch(() => null);
        }
        return {
          naturbeskyttelse,
          dkjord,
          geusRisk,
          terrain,
          naboer,
          fjernvarme,
          fbbData,
          matGeometri,
        };
      }

      if (koordinater) {
        const [natur, jord, geus, terr, nabo, varme] = await Promise.all([
          import("@/integrations/sdfi/naturbeskyttelse")
            .then(({ NaturbeskyttelseService }) =>
              traceStep(
                trace,
                {
                  eventType: "api_call",
                  phase: "layer4",
                  service: "DAI WFS",
                  operation: "naturbeskyttelse.getTilstand",
                },
                () => NaturbeskyttelseService.getTilstand(koordinater),
              ),
            )
            .catch((e: Error) => {
              console.warn("[Orchestrator] naturbeskyttelse fejlede:", e.message);
              return null;
            }),
          import("@/integrations/miljoe/dkjord")
            .then(async ({ DkJordService }) => {
              const { getCachedJordstykkePolygon } = await import("@/integrations/cache/client");
              const polygon = await getCachedJordstykkePolygon(addressId).catch(() => null);

              return traceStep(
                trace,
                {
                  eventType: "api_call",
                  phase: "layer4",
                  service: "DK-Jord WFS",
                  operation: "getTilstand",
                  inputSummary: `koordinater=${koordinater.lat.toFixed(4)},${koordinater.lng.toFixed(4)} polygon=${polygon ? "yes" : "no"}`,
                },
                () => DkJordService.getTilstand(koordinater, polygon),
                {
                  outputSummary: (r) =>
                    summarizeSourceResult(r, (d) => `v1=${d.v1Kortlagt} v2=${d.v2Kortlagt}`),
                  metadata: (r) => ({
                    source: r.kilde,
                    isMock: r.isMock,
                    feature_count: r.rawFeatureCount,
                  }),
                },
              );
            })
            .catch((e: Error) => {
              console.warn("[Orchestrator] DK-Jord fejlede:", e.message);
              return null;
            }),
          import("@/integrations/geus/client")
            .then(({ GeusService }) =>
              traceStep(
                trace,
                {
                  eventType: "api_call",
                  phase: "layer4",
                  service: "GEUS",
                  operation: "getRiskData",
                },
                () => GeusService.getRiskData(koordinater.lat, koordinater.lng),
              ),
            )
            .catch((e: Error) => {
              console.warn("[Orchestrator] GEUS fejlede:", e.message);
              return null;
            }),
          import("@/integrations/sdfi/dhm-client")
            .then(({ DhmService, bboxFromPoint }) => {
              const bbox = bboxFromPoint(koordinater.lat, koordinater.lng, preFetchedGrundareal);
              return traceStep(
                trace,
                {
                  eventType: "api_call",
                  phase: "layer4",
                  service: "SDFI DHM",
                  operation: "getTerrainData",
                },
                () => DhmService.getTerrainData(bbox, koordinater.lat, koordinater.lng),
              );
            })
            .catch((e: Error) => {
              console.warn("[Orchestrator] DHM terrain fejlede:", e.message);
              return null;
            }),
          (async () => {
            const { createBboxAroundPoint } = await import("@/lib/map-proxy");
            const fallbackBboxRaw = koordinater ? createBboxAroundPoint(koordinater, 150) : null;
            if (!fallbackBboxRaw) return null;
            const fallbackBbox: [number, number, number, number] = [
              fallbackBboxRaw.minX,
              fallbackBboxRaw.minY,
              fallbackBboxRaw.maxX,
              fallbackBboxRaw.maxY,
            ];
            return import("@/integrations/geodanmark/client")
              .then(({ GeoDanmarkNaboService }) =>
                traceStep(
                  trace,
                  {
                    eventType: "api_call",
                    phase: "layer4",
                    service: "GeoDanmark WFS",
                    operation: "getNabobygninger",
                    inputSummary: `hasParcelBbox=${!!matGeometri?.bbox25832}`,
                  },
                  () =>
                    GeoDanmarkNaboService.getNabobygninger(
                      matGeometri?.bbox25832 ?? null,
                      fallbackBbox,
                      complianceBase.bbr?.jordstykke_lokal_id ?? null,
                    ),
                  {
                    outputSummary: (r) =>
                      summarizeSourceResult(r, (d) => `count=${d.count} kilde=${d.kilde}`),
                    metadata: (r) => ({
                      source: r.kilde,
                      isMock: r.isMock,
                      feature_count: r.rawFeatureCount,
                    }),
                  },
                ),
              )
              .catch((e: Error) => {
                console.warn("[Orchestrator] GeoDanmarkNaboService fejlede:", e.message);
                return null;
              });
          })(),
          import("@/integrations/plandata/fjernvarme")
            .then(({ FjernvarmeService }) =>
              traceStep(
                trace,
                {
                  eventType: "api_call",
                  phase: "layer4",
                  service: "Plandata WFS",
                  operation: "fjernvarme.getDaekning",
                },
                () => FjernvarmeService.getDaekning(koordinater),
              ),
            )
            .catch((e: Error) => {
              console.warn("[Orchestrator] FjernvarmeService fejlede:", e.message);
              return null;
            }),
        ]);
        naturbeskyttelse = natur;
        dkjord = jord?.data ?? null;
        states.dkjord =
          jord === null ? "error" : jord.isMock ? "mock" : jord.data != null ? "success" : "no_hit";
        geusRisk = geus;
        terrain = terr;
        naboer = nabo?.data ?? null;
        states.naboer =
          nabo == null
            ? "error"
            : nabo.status === "mock"
              ? "mock"
              : nabo.status === "error"
                ? "error"
                : nabo.data != null
                  ? "success"
                  : "no_hit";
        fjernvarme = varme;
      }

      return {
        naturbeskyttelse,
        dkjord,
        geusRisk,
        terrain,
        naboer,
        fjernvarme,
        fbbData,
        matGeometri,
      };
    })(),
  ]);

  const { naturbeskyttelse, dkjord, geusRisk, terrain, naboer, fjernvarme, fbbData, matGeometri } =
    layer4;

  // Set Layer 4 service states after all parallel work resolves.
  states.fbb = fbbData ? "success" : "no_hit";
  states.naturbeskyttelse = naturbeskyttelse ? "success" : "no_hit";
  // geus and terrain are IS_MOCK=true services.
  states.geusRisk = bbrHardStop ? "skipped" : "mock";
  states.terrain = bbrHardStop ? "skipped" : "mock";
  // servitutter is IS_MOCK=true (TingbogenV2 — feature flag).
  states.servitutter = "mock";
  // fjernvarme is live.
  states.fjernvarme = fjernvarme ? "success" : "no_hit";

  return {
    ...complianceBase,
    lokalplanExtract,
    naturbeskyttelse,
    dkjord,
    geusRisk,
    servitutter,
    terrain,
    naboer,
    fjernvarme,
    fbbData,
    matGeometri,
    vurderingData: complianceBase.vurderingData,
    serviceStates: states,
  };
}
