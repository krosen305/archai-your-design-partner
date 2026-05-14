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
import type { FbbResultat } from "@/integrations/fbb/client";
import { fetchLayer1 } from "@/lib/compliance-layer1";

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

    const [layer1Settled, naturSettled, saveSettled] = await Promise.allSettled([
      fetchLayer1({
        adgangsadresseid,
        ejerlavskode,
        matrikelnummer,
        koordinater,
        grundareal: data.grundareal ?? null,
      }),
      koordinater
        ? import("@/integrations/sdfi/naturbeskyttelse")
            .then(({ NaturbeskyttelseService }) => NaturbeskyttelseService.getTilstand(koordinater))
            .catch(() => null as NaturbeskyttelsesResultat | null)
        : Promise.resolve(null as NaturbeskyttelsesResultat | null),
      koordinater
        ? import("@/integrations/save/client")
            .then(({ SaveService }) => SaveService.getBevaringsdata(koordinater))
            .catch(() => null as SaveData | null)
        : Promise.resolve(null as SaveData | null),
    ]);

    const labels = ["Layer1", "Naturbeskyttelse", "SaveService"];
    [layer1Settled, naturSettled, saveSettled].forEach((r, i) => {
      if (r.status === "rejected")
        console.warn(`[preCheckAdresse] ${labels[i]} fejlede:`, r.reason);
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
    const save = saveSettled.status === "fulfilled" ? saveSettled.value : null;
    const vurdering = layer1.vurderingData;

    // FBB: kræver integer BBR building IDs fra BBR Public Service — køres separat efter BBR-fasen (ARCH-131)
    let fbbData: FbbResultat | null = null;
    const bygningIds = bbr?.alle_bbr_public_ids ?? [];
    if (bygningIds.length) {
      fbbData = await import("@/integrations/fbb/client")
        .then(({ FbbService }) => FbbService.getSaveData(bygningIds))
        .catch((e: Error) => {
          console.warn("[preCheckAdresse] FBB fejlede:", e.message);
          return null;
        });
    }

    // ── Compliance metrics ────────────────────────────────────────────────────
    const { calculateComplianceMetrics } = await import("@/lib/compliance-engine");
    const complianceMetrics = calculateComplianceMetrics(bbr, layer1.kommuneplanramme);

    // ── Compliance flags ──────────────────────────────────────────────────────
    const flags = buildPreCheckFlags(bbr, layer1.kommuneplanramme, naturbeskyttelse, save, fbbData);

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
  });

// ---------------------------------------------------------------------------
// Flag-generering (kun de checks der er relevante på adresse-tidspunktet)
// ---------------------------------------------------------------------------

function buildPreCheckFlags(
  bbr: BbrKompliantData | null,
  ramme: Kommuneplanramme | null,
  naturbeskyttelse: NaturbeskyttelsesResultat | null,
  save: SaveData | null,
  fbbData: FbbResultat | null,
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

  // SAVE-bevaringsværdi 1-3: stor advarsel ved alle byggetyper (ARCH-131)
  const saveScore = fbbData?.fbb_bedste_bygning?.bevaringsvaerdi ?? null;
  if (saveScore !== null && saveScore !== undefined && saveScore <= 3) {
    flags.push({
      id: "save-bevaringsvaerdi",
      label: `Høj bevaringsværdi (SAVE ${saveScore})`,
      status: "advarsel",
      detalje: `Bygningen er registreret med høj bevaringsværdi (SAVE ${saveScore}/9) i Kulturmiljøregisteret — nedrivning og væsentlig ombygning kræver særlig kommunal tilladelse (Planlovens §14).`,
      aktuelVærdi: `SAVE ${saveScore}`,
      tilladt: null,
      kilde: "bbr",
      dispensationMulig: true,
      dispensationMyndighed: "Kommunen",
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
