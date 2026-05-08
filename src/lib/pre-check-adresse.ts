// ARCH-121: preCheckAdresse — hurtig Layer-1-fetch umiddelbart efter adressevalg.
//
// Kører BBR+MAT, Plandata, NaturbeskyttelseService, SaveService og EBR+VUR
// parallelt (Promise.allSettled) og returnerer compliance-flags + kontekstdata
// til brug i adresse-gaten (ARCH-122) og boligoensker-hints (ARCH-123).
//
// Handler-koden er server-side only. createServerFn gør filen importerbar
// på klienten (som kaldestubbe) uden at bryde server-boundary.

import { createServerFn } from "@tanstack/react-start";
import type { ComplianceFlag } from "@/lib/project-store";
import type { BbrKompliantData } from "@/integrations/bbr/client";
import type { Lokalplan, Kommuneplanramme } from "@/integrations/plandata/client";
import type { VurData } from "@/integrations/vur/client";
import type { ComplianceMetrics } from "@/lib/compliance-engine";
import type { NaturbeskyttelsesResultat } from "@/integrations/sdfi/naturbeskyttelse";
import type { SaveData } from "@/integrations/save/client";

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
};

export type AdressePreCheckResultat = {
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
  .inputValidator((data: AdressePreCheckInput) => data)
  .handler(async ({ data }): Promise<AdressePreCheckResultat> => {
    const { adgangsadresseid, ejerlavskode, matrikelnummer, koordinater } = data;
    const grundareal = data.grundareal ?? null;

    // ── 5 parallelle kald — én fejl stopper ikke resten ──────────────────────
    const [bbrSettled, plandataSettled, naturSettled, saveSettled, vurSettled] =
      await Promise.allSettled([
        // 1. BBR + MAT (grundareal, beskyttelseslinjer, fredning)
        (async (): Promise<BbrKompliantData | null> => {
          let resolvedGrundareal = grundareal;
          let mat_strandbeskyttelse: boolean | null = null;
          let mat_fredskov: boolean | null = null;
          let mat_klitfredning: boolean | null = null;

          if (ejerlavskode && matrikelnummer) {
            const { MatService } = await import("@/integrations/mat/client");
            const mat = await MatService.getGrundareal(ejerlavskode, matrikelnummer);
            if (resolvedGrundareal === null && mat.registreretAreal !== null) {
              resolvedGrundareal = mat.registreretAreal;
            }
            mat_strandbeskyttelse = mat.strandbeskyttelse;
            mat_fredskov = mat.fredskov;
            mat_klitfredning = mat.klitfredning;
          }

          const { BbrService } = await import("@/integrations/bbr/client");
          const bbr = await BbrService.getKompliantData(adgangsadresseid, resolvedGrundareal);
          if (bbr) {
            bbr.mat_strandbeskyttelse = mat_strandbeskyttelse;
            bbr.mat_fredskov = mat_fredskov;
            bbr.mat_klitfredning = mat_klitfredning;
          }
          return bbr;
        })(),

        // 2. Plandata (lokalplan + kommuneplanramme)
        koordinater
          ? (async (): Promise<{
              lokalplaner: Lokalplan[];
              kommuneplanramme: Kommuneplanramme | null;
            }> => {
              const { PlandataService } = await import("@/integrations/plandata/client");
              const [lpResult, rammeResult] = await Promise.all([
                PlandataService.getLokalplanerForKoordinat(
                  koordinater.lng,
                  koordinater.lat,
                  true,
                ).catch(() => ({ lokalplaner: [], fejl: null, rawCount: 0 })),
                PlandataService.getKommuneplanrammeForKoordinat(
                  koordinater.lng,
                  koordinater.lat,
                ).catch(() => ({ ramme: null, fejl: null })),
              ]);
              return {
                lokalplaner: lpResult.lokalplaner,
                kommuneplanramme: rammeResult.ramme,
              };
            })()
          : Promise.resolve({ lokalplaner: [] as Lokalplan[], kommuneplanramme: null }),

        // 3. NaturbeskyttelseService (strandbeskyttelse, skovbyggelinje, søbeskyttelse, åbeskyttelse)
        koordinater
          ? import("@/integrations/sdfi/naturbeskyttelse")
              .then(({ NaturbeskyttelseService }) =>
                NaturbeskyttelseService.getTilstand(koordinater),
              )
              .catch(() => null as NaturbeskyttelsesResultat | null)
          : Promise.resolve(null as NaturbeskyttelsesResultat | null),

        // 4. SaveService (spatial fredning — dmp:FREDEDE_BYGNINGER)
        koordinater
          ? import("@/integrations/save/client")
              .then(({ SaveService }) => SaveService.getBevaringsdata(koordinater))
              .catch(() => null as SaveData | null)
          : Promise.resolve(null as SaveData | null),

        // 5. EBR → VUR (ejendomsværdi + grundværdi)
        (async (): Promise<VurData | null> => {
          const { EbrService } = await import("@/integrations/ebr/client");
          const ebr = await EbrService.getBfeNr(adgangsadresseid);
          if (ebr.fejl || !ebr.bfeNr) return null;
          const { VurService } = await import("@/integrations/vur/client");
          return VurService.getVurdering(ebr.bfeNr);
        })(),
      ]);

    // Log eventuelle fejl uden at blokere
    const labels = ["BBR+MAT", "Plandata", "Naturbeskyttelse", "SaveService", "EBR+VUR"];
    [bbrSettled, plandataSettled, naturSettled, saveSettled, vurSettled].forEach((r, i) => {
      if (r.status === "rejected") {
        console.warn(`[preCheckAdresse] ${labels[i]} fejlede:`, r.reason);
      }
    });

    const bbr = bbrSettled.status === "fulfilled" ? bbrSettled.value : null;
    const plandata =
      plandataSettled.status === "fulfilled"
        ? plandataSettled.value
        : { lokalplaner: [] as Lokalplan[], kommuneplanramme: null };
    const naturbeskyttelse = naturSettled.status === "fulfilled" ? naturSettled.value : null;
    const save = saveSettled.status === "fulfilled" ? saveSettled.value : null;
    const vurdering = vurSettled.status === "fulfilled" ? vurSettled.value : null;

    // ── Compliance metrics ────────────────────────────────────────────────────
    const { calculateComplianceMetrics } = await import("@/lib/compliance-engine");
    const complianceMetrics = calculateComplianceMetrics(bbr, plandata.kommuneplanramme);

    // ── Compliance flags ──────────────────────────────────────────────────────
    const flags = buildPreCheckFlags(bbr, plandata.kommuneplanramme, naturbeskyttelse, save);

    return {
      blockers: flags.filter((f) => f.status === "blocker"),
      advarsler: flags.filter((f) => f.status === "advarsel"),
      kontekst: {
        grundareal: bbr?.grundareal ?? null,
        bebyggetAreal: bbr?.bebygget_areal ?? null,
        bebyggelsesprocent: bbr?.bebyggelsesprocent ?? null,
        antalEtager: bbr?.antal_etager ?? null,
        maxBebyggelsesprocent: plandata.kommuneplanramme?.bebygpct ?? null,
        maxEtager: plandata.kommuneplanramme?.maxetager ?? null,
        maxBygningshoejde: plandata.kommuneplanramme?.maxbygnhjd ?? null,
        restBygningsareal: complianceMetrics.remainingBygningsareal,
        ejendomsvaerdi: vurdering?.ejendomsvaerdi ?? null,
        grundvaerdi: vurdering?.grundvaerdi ?? null,
      },
      bbr,
      lokalplaner: plandata.lokalplaner,
      kommuneplanramme: plandata.kommuneplanramme,
      vurderingData: vurdering,
      complianceMetrics,
    };
  });

// ---------------------------------------------------------------------------
// Flag-generering (kun de checks der er relevante på adresse-tidspunktet)
// ---------------------------------------------------------------------------

function buildPreCheckFlags(
  bbr: BbrKompliantData | null,
  ramme: Kommuneplanramme | null,
  naturbeskyttelse: NaturbeskyttelsesResultat | null,
  save: SaveData | null,
): ComplianceFlag[] {
  const flags: ComplianceFlag[] = [];

  if (!bbr) return flags;

  // Fredning (BBR byg070 + SaveService spatial check)
  if (bbr.fredet || save?.fredet) {
    flags.push({
      id: "fredet",
      label: "Fredet bygning",
      status: "blocker",
      detalje:
        "Bygningen er fredet — alle ændringer kræver tilladelse fra Slots- og Kulturstyrelsen",
      aktuelVærdi: "Fredet",
      tilladt: "Ingen ændringer uden dispensation",
      kilde: bbr.fredet ? "bbr" : "sdfi",
      dispensationMulig: true,
      dispensationMyndighed: "Slots- og Kulturstyrelsen",
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
