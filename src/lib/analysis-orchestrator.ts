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
//   naturbeskyttelse    ⏳  IS_MOCK=true — ARCH-65 (DAI WFS endpoint afventer verifikation)
//   dkjord              ⏳  IS_MOCK=true — ARCH-66 (dkjord.mst.dk ikke tilgængelig fra dev)
//   geus                ⏳  IS_MOCK=true — ARCH-101 (layer-navne afventer GetCapabilities)
//   servitut_extracted  ⏳  IS_MOCK=true — ARCH-104 (TingbogenV2 schema afventer verificering)
//   terrain             ⏳  IS_MOCK=true — ARCH-102 (DHM WCS GetCoverage afventer verificering)
//   naboer              ✅  live DAWA REST (ARCH-103)
//   fjernvarme          ⏳  IS_MOCK=true — ARCH-111 (layer-navn afventer GetCapabilities-verifikation)
//   save                ⏳  IS_MOCK=true — ARCH-29 (DAI WFS + Kulturmiljøregisteret afventer verifikation)
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
import type { RuleEngineResult } from "@/lib/rule-engine/types";
import type { VurData } from "@/integrations/vur/client";
import type { Json } from "@/integrations/supabase/types";
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
      fetchBbr(adgangsadresseid, ejerlavskode, matrikelnummer, preFetchedGrundareal),
      fetchPlandata(koordinater),
      fetchVur(adgangsadresseid),
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

    // ── Layer 4: naturbeskyttelse + dkjord + geus + terrain + naboer + fjernvarme ─
    (async () => {
      let naturbeskyttelse: NaturbeskyttelsesResultat | null = null;
      let dkjord: DkJordResultat | null = null;
      let geusRisk: GeusRiskData | null = null;
      let terrain: TerrainData | null = null;
      let naboer: NeighborBuildingData | null = null;
      let fjernvarme: FjernvarmeResultat | null = null;
      let save: SaveData | null = null;

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

      return { naturbeskyttelse, dkjord, geusRisk, terrain, naboer, fjernvarme, save };
    })(),
  ]);

  const { naturbeskyttelse, dkjord, geusRisk, terrain, naboer, fjernvarme, save } = layer4;

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
    vurderingData: complianceBase.vurderingData,
  };
}

// ---------------------------------------------------------------------------
// Internal fetchers (mirrors the existing compliance server function logic)
// ---------------------------------------------------------------------------

async function fetchBbr(
  adgangsadresseid: string,
  ejerlavskode: number | null,
  matrikelnummer: string | null,
  preFetchedGrundareal: number | null = null,
): Promise<BbrKompliantData | null> {
  try {
    let grundareal: number | null = preFetchedGrundareal;
    let mat_strandbeskyttelse: boolean | null = null;
    let mat_fredskov: boolean | null = null;
    let mat_klitfredning: boolean | null = null;

    // Kald altid MAT hvis ejerlavskode + matrikelnummer er tilgængeligt:
    //   1. Grundareal (fallback når DAR-opslaget fejlede)
    //   2. Beskyttelseslinjer (strandbeskyttelse, fredskov, klitfredning) — nul ekstra kost
    if (ejerlavskode && matrikelnummer) {
      const { MatService } = await import("@/integrations/mat/client");
      const mat = await MatService.getGrundareal(ejerlavskode, matrikelnummer);
      if (grundareal === null && mat.registreretAreal !== null) {
        grundareal = mat.registreretAreal;
      }
      if (mat.fejl) {
        console.warn("[Orchestrator] MAT fejl:", mat.fejl);
      }
      mat_strandbeskyttelse = mat.strandbeskyttelse;
      mat_fredskov = mat.fredskov;
      mat_klitfredning = mat.klitfredning;
    } else if (grundareal === null) {
      console.warn(
        "[Orchestrator] Grundareal ikke tilgængeligt — ejerlavskode/matrikelnummer mangler.",
        { ejerlavskode, matrikelnummer },
      );
    }

    const { BbrService } = await import("@/integrations/bbr/client");
    const bbrResult = await BbrService.getKompliantData(adgangsadresseid, grundareal);
    if (bbrResult) {
      bbrResult.mat_strandbeskyttelse = mat_strandbeskyttelse;
      bbrResult.mat_fredskov = mat_fredskov;
      bbrResult.mat_klitfredning = mat_klitfredning;
    }
    return bbrResult;
  } catch (e) {
    console.error("[Orchestrator] BBR fejlede:", (e as Error).message);
    return null;
  }
}

async function fetchPlandata(
  koordinater: { lat: number; lng: number } | null,
): Promise<{ lokalplaner: Lokalplan[]; kommuneplanramme: Kommuneplanramme | null }> {
  if (!koordinater) return { lokalplaner: [], kommuneplanramme: null };

  const { PlandataService } = await import("@/integrations/plandata/client");

  const [lokalplanerResult, kommuneplanrammeResult] = await Promise.all([
    PlandataService.getLokalplanerForKoordinat(koordinater.lng, koordinater.lat, true).catch(
      () => ({ lokalplaner: [], fejl: null, rawCount: 0 }),
    ),
    PlandataService.getKommuneplanrammeForKoordinat(koordinater.lng, koordinater.lat).catch(() => ({
      ramme: null,
      fejl: null,
    })),
  ]);

  return {
    lokalplaner: lokalplanerResult.lokalplaner,
    kommuneplanramme: kommuneplanrammeResult.ramme,
  };
}

async function fetchVur(adgangsadresseid: string): Promise<VurData | null> {
  if (!adgangsadresseid) return null;
  try {
    const { EbrService } = await import("@/integrations/ebr/client");
    const ebr = await EbrService.getBfeNr(adgangsadresseid);
    if (ebr.fejl || !ebr.bfeNr) {
      console.warn("[Orchestrator] EBR fejl — VUR springes over:", ebr.fejl);
      return null;
    }
    const { VurService } = await import("@/integrations/vur/client");
    return await VurService.getVurdering(ebr.bfeNr);
  } catch (e) {
    console.warn("[Orchestrator] VUR fejlede:", (e as Error).message);
    return null;
  }
}
