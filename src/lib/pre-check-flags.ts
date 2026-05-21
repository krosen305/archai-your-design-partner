import type { ComplianceFlag } from "@/types/project-state";
import type { BbrKompliantData } from "@/integrations/bbr/client";
import type { Kommuneplanramme } from "@/integrations/plandata/client";
import type { NaturbeskyttelsesResultat } from "@/integrations/sdfi/naturbeskyttelse";
import type { FbbResultat } from "@/integrations/fbb/client";
import { isSaveDispensationRequired, isSaveWarning } from "@/lib/rule-engine/hard-stop-adapter";

export function buildPreCheckFlags(
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
  if (isSaveDispensationRequired(saveScore)) {
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
  } else if (isSaveWarning(saveScore)) {
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
