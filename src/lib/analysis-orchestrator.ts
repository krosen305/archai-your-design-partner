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
//   naboer              ✅  live DAWA REST (ARCH-103)
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
  vurderingData: VurData | null; // ARCH-119: EBR+VUR ejendomsværdi og grundværdi
  ruleEngine?: RuleEngineResult; // sættes af runByggeanalyse (ARCH-109)
  analysisRunId?: string | null;
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
        },
        () => DarService.getAddressDetails(addressId, undefined, trace),
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
      },
      () => getCachedCompliance(addressId),
      { cacheHit: (value) => !!value },
    );
    if (cached) {
      // Bypass stale cache: hvis cached BBR mangler grundareal men vi nu har det,
      // re-beregn så bebyggelsesprocent vises korrekt.
      if (cached.bbr?.grundareal === null && preFetchedGrundareal !== null) {
        console.warn("[Orchestrator] Stale cache bypassed — re-beregner med grundareal fra DAR");
      } else {
        complianceBase = cached;
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
        ejerlavskode,
        matrikelnummer,
        grundareal: preFetchedGrundareal,
        trace,
      }),
      fetchPlandata(koordinater, trace),
      fetchVurViaEbr(adgangsadresseid, trace),
    ]);
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
  const primaryPdfUrl = complianceBase.lokalplaner[0]?.plandokumentLink ?? null;

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
        return { naturbeskyttelse, dkjord, geusRisk, terrain, naboer, fjernvarme, fbbData };
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
            .then(({ DkJordService }) =>
              traceStep(
                trace,
                {
                  eventType: "api_call",
                  phase: "layer4",
                  service: "DK-Jord WFS",
                  operation: "getTilstand",
                },
                () => DkJordService.getTilstand(koordinater),
              ),
            )
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
          import("@/integrations/bbr/neighbor-client")
            .then(({ NaboService }) =>
              traceStep(
                trace,
                {
                  eventType: "api_call",
                  phase: "layer4",
                  service: "DAWA",
                  operation: "naboer.getNaboer",
                },
                () => NaboService.getNaboer(koordinater.lat, koordinater.lng, adgangsadresseid),
              ),
            )
            .catch((e: Error) => {
              console.warn("[Orchestrator] NaboService fejlede:", e.message);
              return null;
            }),
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
        dkjord = jord;
        geusRisk = geus;
        terrain = terr;
        naboer = nabo;
        fjernvarme = varme;
      }

      return { naturbeskyttelse, dkjord, geusRisk, terrain, naboer, fjernvarme, fbbData };
    })(),
  ]);

  const { naturbeskyttelse, dkjord, geusRisk, terrain, naboer, fjernvarme, fbbData } = layer4;

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
    vurderingData: complianceBase.vurderingData,
  };
}
