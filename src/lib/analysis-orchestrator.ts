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
//   save                ✅  live DAI WFS dmp:FREDEDE_BYGNINGER (ARCH-29, verificeret 2026-05-08)
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
import type { SaveData } from "@/integrations/save/client";
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
  save: SaveData | null;
  fbbData: FbbResultat | null; // ARCH-131: SAVE-bevaringsværdi (1-9) fra FBB
  vurderingData: VurData | null; // ARCH-119: EBR+VUR ejendomsværdi og grundværdi
  ruleEngine?: RuleEngineResult; // sættes af runByggeanalyse (ARCH-109)
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
};

// ---------------------------------------------------------------------------
// analyseAddress: cache-first orchestration
// ---------------------------------------------------------------------------

export async function analyseAddress(input: AnalysisInput): Promise<ComplianceResult> {
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
      const dar = await DarService.getAddressDetails(addressId);
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
    | "save"
    | "fbbData"
    | "ruleEngine"
  >;
  let complianceBase: ComplianceBase | null = null;
  try {
    const cached = await getCachedCompliance(addressId);
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
      }),
      fetchPlandata(koordinater),
      fetchVurViaEbr(adgangsadresseid),
    ]);
    complianceBase = {
      bbr: bbrResult,
      lokalplaner: plandataResult.lokalplaner,
      kommuneplanramme: plandataResult.kommuneplanramme,
      analysedAt: new Date().toISOString(),
      vurderingData: vurderingResult,
    };
    try {
      await setCachedCompliance(addressId, {
        ...complianceBase,
        lokalplanExtract: null,
        naturbeskyttelse: null,
        dkjord: null,
        geusRisk: null,
        servitutter: null,
        terrain: null,
        naboer: null,
        fjernvarme: null,
        save: null,
        fbbData: null,
        vurderingData: complianceBase.vurderingData,
      });
    } catch (e) {
      console.warn(
        "[Orchestrator] compliance-cache-skriv fejlede (returnerer resultat uncached):",
        (e as Error).message,
      );
    }
  }

  // ── Layers 2 + 3 + 4: kører parallelt — ingen indbyrdes afhængighed ──────
  // Layer 2 (lokalplan PDF), Layer 3 (servitutter) og Layer 4 (geodata)
  // behøver alle kun Layer 1's output. Parallel Promise.all sparer ~2s live.
  const primaryPdfUrl = complianceBase.lokalplaner[0]?.plandokumentLink ?? null;

  const [lokalplanExtract, servitutter, layer4] = await Promise.all([
    // ── Layer 2: lokalplan_extracted ────────────────────────────────────
    (async (): Promise<LokalplanExtract | null> => {
      try {
        const cached = await getCachedLokalplan(addressId, primaryPdfUrl ?? undefined);
        if (cached) return cached as unknown as LokalplanExtract;
        if (primaryPdfUrl) {
          const { PdfExtractorService } = await import("@/integrations/ai/pdf-extractor");
          const extract = await PdfExtractorService.extractLokalplan(primaryPdfUrl);
          await setCachedLokalplan(addressId, primaryPdfUrl, extract as unknown as Json);
          return extract;
        }
        return null;
      } catch (e) {
        console.warn("[Orchestrator] lokalplan PDF-udtræk fejlede:", (e as Error).message);
        return null;
      }
    })(),

    // ── Layer 3: servitut_extracted (IS_MOCK=true — ARCH-104) ───────────
    (async (): Promise<TinglysningResult | null> => {
      try {
        const cachedServitut = await getCachedServitut(addressId);
        if (cachedServitut) return cachedServitut as unknown as TinglysningResult;
        const { TinglysningService } = await import("@/integrations/tinglysning/client");
        const result = await TinglysningService.getServitutter(
          addressId,
          ejerlavskode,
          matrikelnummer,
        );
        await setCachedServitut(addressId, result as unknown as Json);
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
      let save: SaveData | null = null;
      let fbbData: FbbResultat | null = null;

      // FBB: kræver integer BBR building IDs fra BBR Public Service — uafhængig af koordinater
      const bygningIds = complianceBase.bbr?.alle_bbr_public_ids ?? [];
      if (bygningIds.length) {
        fbbData = await import("@/integrations/fbb/client")
          .then(({ FbbService }) => FbbService.getSaveData(bygningIds))
          .catch((e: Error) => {
            console.warn("[Orchestrator] FBB fejlede:", e.message);
            return null;
          });
      }

      if (koordinater) {
        const [natur, jord, geus, terr, nabo, varme, saveResult] = await Promise.all([
          import("@/integrations/sdfi/naturbeskyttelse")
            .then(({ NaturbeskyttelseService }) => NaturbeskyttelseService.getTilstand(koordinater))
            .catch((e: Error) => {
              console.warn("[Orchestrator] naturbeskyttelse fejlede:", e.message);
              return null;
            }),
          import("@/integrations/miljoe/dkjord")
            .then(({ DkJordService }) => DkJordService.getTilstand(koordinater))
            .catch((e: Error) => {
              console.warn("[Orchestrator] DK-Jord fejlede:", e.message);
              return null;
            }),
          import("@/integrations/geus/client")
            .then(({ GeusService }) => GeusService.getRiskData(koordinater.lat, koordinater.lng))
            .catch((e: Error) => {
              console.warn("[Orchestrator] GEUS fejlede:", e.message);
              return null;
            }),
          import("@/integrations/sdfi/dhm-client")
            .then(({ DhmService, bboxFromPoint }) => {
              const bbox = bboxFromPoint(koordinater.lat, koordinater.lng, preFetchedGrundareal);
              return DhmService.getTerrainData(bbox, koordinater.lat, koordinater.lng);
            })
            .catch((e: Error) => {
              console.warn("[Orchestrator] DHM terrain fejlede:", e.message);
              return null;
            }),
          import("@/integrations/bbr/neighbor-client")
            .then(({ NaboService }) =>
              NaboService.getNaboer(koordinater.lat, koordinater.lng, adgangsadresseid),
            )
            .catch((e: Error) => {
              console.warn("[Orchestrator] NaboService fejlede:", e.message);
              return null;
            }),
          import("@/integrations/plandata/fjernvarme")
            .then(({ FjernvarmeService }) => FjernvarmeService.getDaekning(koordinater))
            .catch((e: Error) => {
              console.warn("[Orchestrator] FjernvarmeService fejlede:", e.message);
              return null;
            }),
          import("@/integrations/save/client")
            .then(({ SaveService }) => SaveService.getBevaringsdata(koordinater))
            .catch((e: Error) => {
              console.warn("[Orchestrator] SaveService fejlede:", e.message);
              return null;
            }),
        ]);
        naturbeskyttelse = natur;
        dkjord = jord;
        geusRisk = geus;
        terrain = terr;
        naboer = nabo;
        fjernvarme = varme;
        save = saveResult;
      }

      return { naturbeskyttelse, dkjord, geusRisk, terrain, naboer, fjernvarme, save, fbbData };
    })(),
  ]);

  const { naturbeskyttelse, dkjord, geusRisk, terrain, naboer, fjernvarme, save, fbbData } = layer4;

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
    save,
    fbbData,
    vurderingData: complianceBase.vurderingData,
  };
}
