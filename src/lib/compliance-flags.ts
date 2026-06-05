// Pure function — no Zustand dependency. Derives ComplianceFlag[] from pipeline data.

import type { FjernvarmeResultat } from "@/domain/contracts/analysis.types";
import type {
  RuleEngineBbrData,
  RuleEngineDkJordResultat,
  RuleEngineGeusRiskData,
  RuleEngineKommuneplanramme,
  RuleEngineNaturbeskyttelsesResultat,
} from "@/domain/contracts/rule-engine.types";
import type { RuleEngineResult } from "@/lib/rule-engine/types";
import type { Byggeoenske, ComplianceFlag } from "@/types/project-state";

const MODERN_BUILDING_REVIEW_YEARS = 50;
const SELECTIVE_DEMOLITION_AREA_M2 = 250;

export function deriveComplianceFlags(
  bbr: RuleEngineBbrData | null,
  ramme: RuleEngineKommuneplanramme | null,
  naturbeskyttelse?: RuleEngineNaturbeskyttelsesResultat | null,
  dkjord?: RuleEngineDkJordResultat | null,
  geusRisk?: RuleEngineGeusRiskData | null,
  ruleEngine?: RuleEngineResult | null,
  fjernvarme?: FjernvarmeResultat | null,
  byggeoenske?: Byggeoenske | null,
): ComplianceFlag[] {
  const flags: ComplianceFlag[] = [];

  if (!bbr) return flags;

  // Bebyggelsesprocent
  if (bbr.bebyggelsesprocent !== null) {
    const max = ramme?.bebygpct ?? null;
    const pct = bbr.bebyggelsesprocent;
    flags.push({
      id: "bebyggelsesprocent",
      label: "Bebyggelsesprocent",
      status:
        max === null ? "advarsel" : pct > max ? "blocker" : pct > max * 0.9 ? "advarsel" : "ok",
      detalje: max === null ? "Ingen kommuneplanramme fundet" : null,
      aktuelVærdi: `${pct}%`,
      tilladt: max !== null ? `${max}%` : null,
      kilde: "beregnet",
    });
  }

  // Max etager
  if (bbr.antal_etager !== null) {
    const max = ramme?.maxetager ?? null;
    const etager = bbr.antal_etager;
    flags.push({
      id: "etager",
      label: "Antal etager",
      status: max === null ? "advarsel" : etager > max ? "blocker" : "ok",
      detalje: max === null ? "Ingen kommuneplanramme fundet" : null,
      aktuelVærdi: `${etager}`,
      tilladt: max !== null ? `${max}` : null,
      kilde: "bbr",
    });
  }

  // Max bygningshøjde
  if (ramme?.maxbygnhjd !== null && ramme?.maxbygnhjd !== undefined) {
    flags.push({
      id: "bygningshoejde",
      label: "Max bygningshøjde",
      status: "ok",
      detalje: null,
      aktuelVærdi: null,
      tilladt: `${ramme.maxbygnhjd} m`,
      kilde: "plandata",
    });
  }

  // Lokalplan-zone
  if (ramme?.anvendelseGenerel) {
    flags.push({
      id: "anvendelse",
      label: "Planlagt anvendelse",
      status: "ok",
      detalje: ramme.sforhold ?? null,
      aktuelVærdi: bbr.anvendelse_tekst ?? null,
      tilladt: ramme.anvendelseGenerel,
      kilde: "plandata",
    });
  }

  // ── Beskyttelseslinjer fra MAT_Jordstykke (autoritative kildedata) ────────
  // Supplerer eller erstatter SDFI naturbeskyttelse (IS_MOCK=true) for de tre
  // typer MAT_Jordstykke registrerer: strandbeskyttelse, fredskov, klitfredning.
  if (bbr) {
    if (bbr.mat_strandbeskyttelse) {
      flags.push({
        id: "mat-strandbeskyttelse",
        label: "Strandbeskyttelseslinje",
        status: "blocker",
        detalje:
          "Jordstykket er registreret inden for strandbeskyttelseslinje i Matrikelregistret — byggestop uden dispensation fra Kystdirektoratet",
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
          "Jordstykket er udlagt som fredskov i Matrikelregistret — skovlovens §28 forbyder byggeri uden dispensation fra Miljøstyrelsen",
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
        detalje:
          "Jordstykket er klitfredet i Matrikelregistret — byggestop uden dispensation fra Kystdirektoratet",
        aktuelVærdi: "Inden for klitfredet zone",
        tilladt: "Ingen byggeri uden dispensation",
        kilde: "bbr",
        dispensationMulig: true,
        dispensationMyndighed: "Kystdirektoratet",
      });
    }
  }

  // ── Fredning fra BBR byg070 (ARCH-118) ────────────────────────────────────
  // Autoritativ fredningsmarkering fra BBR — supplerer/erstatter SaveService (IS_MOCK=true)
  if (bbr?.fredet) {
    flags.push({
      id: "bbr-fredet",
      label: "Fredet bygning",
      status: "blocker",
      detalje:
        "Bygningen er registreret som fredet i BBR (byg070) — alle ændringer kræver tilladelse fra Slots- og Kulturstyrelsen",
      aktuelVærdi: "Fredet",
      tilladt: "Ingen ændringer uden dispensation",
      kilde: "bbr",
      dispensationMulig: true,
      dispensationMyndighed: "Slots- og Kulturstyrelsen",
    });
  }

  if (byggeoenske?.byggetype === "nybyg") {
    const byggeaar = bbr.byggeaar !== null ? Number.parseInt(bbr.byggeaar, 10) : null;
    const currentYear = new Date().getFullYear();
    if (
      byggeaar !== null &&
      Number.isFinite(byggeaar) &&
      byggeaar >= currentYear - MODERN_BUILDING_REVIEW_YEARS
    ) {
      flags.push({
        id: "ressource-nyere-bygning-nybyg",
        label: "Nyere bygning ønskes revet ned",
        status: "advarsel",
        detalje:
          "Der er ikke en generel juridisk aldersgrænse for nedrivning, men renovering bør afklares tidligt før nybyg, fordi nyere bygninger ofte har væsentlig restlevetid og indlejrede materialer.",
        aktuelVærdi: `Opført ${byggeaar}`,
        tilladt: "Afklar renovering, LCA og ressourcekortlægning",
        kilde: "beregnet",
        appliesTo: ["byggetype"],
      });
    }

    if (bbr.samlet_areal !== null && bbr.samlet_areal >= SELECTIVE_DEMOLITION_AREA_M2) {
      flags.push({
        id: "ressource-selektiv-nedrivning",
        label: "Selektiv nedrivning skal planlægges",
        status: "advarsel",
        detalje:
          "Nedrivning af bygninger på 250 m² eller mere kræver særskilt planlægning for selektiv nedrivning, affald og genbrug/genanvendelse.",
        aktuelVærdi: `${bbr.samlet_areal} m² samlet areal`,
        tilladt: "Nedrivningsplan og ressource-/miljøkortlægning",
        kilde: "beregnet",
        appliesTo: ["byggetype", "oensketAreal"],
      });
    }
  }

  // ── Fjernvarme-mismatch (ARCH-117) ──────────────────────────────────────
  // Sammenligner BBR byg056 med Plandata fjernvarmedækning (live data)
  if (bbr && fjernvarme && fjernvarme.fjernvarmeDaekket !== null) {
    const harFjernvarmeBbr =
      bbr.varmeinstallation !== null && bbr.varmeinstallation.toLowerCase().includes("fjernvarme");
    if (harFjernvarmeBbr && !fjernvarme.fjernvarmeDaekket) {
      flags.push({
        id: "fjernvarme-mismatch-ingen-daekning",
        label: "Mulig fejlregistrering: fjernvarme",
        status: "advarsel",
        detalje:
          "BBR registrerer fjernvarme (byg056) men Plandata viser ingen fjernvarmedækning på adressen — kontrollér med forsyningsselskabet",
        aktuelVærdi: bbr.varmeinstallation,
        tilladt: null,
        kilde: "bbr",
      });
    } else if (!harFjernvarmeBbr && fjernvarme.fjernvarmeDaekket) {
      flags.push({
        id: "fjernvarme-tilslutningspligt",
        label: "Mulig tilslutningspligt: fjernvarme",
        status: "advarsel",
        detalje:
          "Adressen er dækket af fjernvarmeforsyningsområde — kommunen kan pålægge tilslutningspligt ved ny bebyggelse",
        aktuelVærdi: bbr.varmeinstallation ?? "Ingen fjernvarme",
        tilladt: null,
        kilde: "bbr",
      });
    }
  }

  // ── Naturbeskyttelseslinjer (ARCH-65) ───────────────────────────────────
  if (naturbeskyttelse) {
    const linjer: Array<{
      key: keyof RuleEngineNaturbeskyttelsesResultat;
      label: string;
      detalje: string;
    }> = [
      {
        key: "strandbeskyttelse",
        label: "Strandbeskyttelseslinje",
        detalje: "300 m fra kyst — byggestop uden dispensation fra Kystdirektoratet",
      },
      {
        key: "skovbyggelinje",
        label: "Skovbyggelinje",
        detalje: "300 m fra statsskov — byggestop uden dispensation",
      },
      {
        key: "soebeskyttelse",
        label: "Søbeskyttelseslinje",
        detalje: "150 m fra søer >3 ha — byggestop uden dispensation",
      },
      {
        key: "aabeskyttelse",
        label: "Åbeskyttelseslinje",
        detalje: "150 m fra vandløb — byggestop uden dispensation",
      },
      { key: "klitfredning", label: "Klitfredning", detalje: "Byggestop i klitfredet område" },
      {
        key: "kirkebyggelinje",
        label: "Kirkebyggelinje",
        detalje: "Op til 300 m fra kirke — højdebegrænsning",
      },
    ];

    for (const { key, label, detalje } of linjer) {
      if (naturbeskyttelse[key]) {
        flags.push({
          id: `naturbeskyttelse-${key}`,
          label,
          status: "blocker",
          detalje,
          aktuelVærdi: "Inden for zone",
          tilladt: "Ingen byggeri uden dispensation",
          kilde: "sdfi",
        });
      }
    }
  }

  // ── DK-Jord forurening (ARCH-66) ────────────────────────────────────────────
  if (dkjord) {
    const dkjordLabelPrefix = dkjord.kilde === "mock" ? "MOCK: " : "";

    if (dkjord.v2Kortlagt) {
      flags.push({
        id: "dkjord-v2",
        label: `${dkjordLabelPrefix}V2-kortlagt grund`,
        status: "blocker",
        detalje:
          "Dokumenteret forurening — oprensning kræves inden byggeri. Potentielt 500.000+ kr.",
        aktuelVærdi: "V2-kortlagt",
        tilladt: null,
        kilde: "dkjord",
      });
    }
    if (dkjord.v1Kortlagt) {
      flags.push({
        id: "dkjord-v1",
        label: `${dkjordLabelPrefix}V1-kortlagt grund`,
        status: "advarsel",
        detalje: "Mulig forurening — miljøteknisk undersøgelse kræves inden byggeri",
        aktuelVærdi: "V1-kortlagt",
        tilladt: null,
        kilde: "dkjord",
      });
    }
    if (dkjord.olietank.eksisterer) {
      flags.push({
        id: "dkjord-olietank",
        label: `${dkjordLabelPrefix}Olietank registreret`,
        status: "advarsel",
        detalje: `Gammel olietank${dkjord.olietank.driftsstatus ? ` (${dkjord.olietank.driftsstatus})` : ""} — prøvetagning af jord kræves`,
        aktuelVærdi: dkjord.olietank.driftsstatus ?? "registreret",
        tilladt: null,
        kilde: "dkjord",
      });
    }
    if (dkjord.omraadeklassificering) {
      flags.push({
        id: "dkjord-omraade",
        label: `${dkjordLabelPrefix}Områdeklassificering`,
        status: "advarsel",
        detalje: "Krav om jordsundhedsattest ved jordflytning — kontakt kommunen",
        aktuelVærdi: dkjord.omraadeklassificering,
        tilladt: null,
        kilde: "dkjord",
      });
    }
  }

  // ── GEUS geoteknisk risiko (ARCH-101) ──────────────────────────────────────
  if (geusRisk) {
    if (geusRisk.radonRisk === "high") {
      flags.push({
        id: "geus-radon",
        label: "Høj radonrisiko",
        status: "blocker",
        detalje: "Høj radonkoncentration i undergrunden — radonafskærmning påkrævet jf. BR18 §301",
        aktuelVærdi: "Høj",
        tilladt: "Lav–middel",
        kilde: "geus",
      });
    } else if (geusRisk.radonRisk === "medium") {
      flags.push({
        id: "geus-radon",
        label: "Middel radonrisiko",
        status: "advarsel",
        detalje: "Middel radonkoncentration — anbefalet med radonspærre i konstruktionen",
        aktuelVærdi: "Middel",
        tilladt: null,
        kilde: "geus",
      });
    }
    if (geusRisk.groundwaterDepthM !== null && geusRisk.groundwaterDepthM < 1.0) {
      flags.push({
        id: "geus-grundvand",
        label: "Højt grundvand",
        status: "blocker",
        detalje: `Grundvand ${geusRisk.groundwaterDepthM.toFixed(1)} m under terræn — drænforanstaltninger og vandtæt kælder kræves`,
        aktuelVærdi: `${geusRisk.groundwaterDepthM.toFixed(1)} m`,
        tilladt: ">1,0 m",
        kilde: "geus",
      });
    } else if (geusRisk.groundwaterDepthM !== null && geusRisk.groundwaterDepthM < 2.0) {
      flags.push({
        id: "geus-grundvand",
        label: "Lavt grundvand",
        status: "advarsel",
        detalje: `Grundvand ${geusRisk.groundwaterDepthM.toFixed(1)} m under terræn — dræning anbefalet ved kælder eller terrændæk`,
        aktuelVærdi: `${geusRisk.groundwaterDepthM.toFixed(1)} m`,
        tilladt: null,
        kilde: "geus",
      });
    }
  }

  // ── Regelkerne violations (ARCH-109) ──────────────────────────────────────
  if (ruleEngine) {
    // Eksisterende flag-IDs — undgå duplikering med BBR/plandata-beregninger
    const existingIds = new Set(flags.map((f) => f.id));
    const existingStatus = (id: string) => flags.find((f) => f.id === id)?.status ?? null;

    for (const violation of ruleEngine.violations) {
      // Beregningsregler duplikerer eksisterende BBR-flags — skip dem
      if (
        (violation.rule === "bebyggelsesprocent" &&
          existingStatus("bebyggelsesprocent") !== null &&
          existingStatus("bebyggelsesprocent") !== "ok") ||
        (violation.rule === "etager" &&
          existingStatus("etager") !== null &&
          existingStatus("etager") !== "ok") ||
        (violation.rule === "bygningshøjde" &&
          existingStatus("bygningshoejde") !== null &&
          existingStatus("bygningshoejde") !== "ok")
      ) {
        continue;
      }
      // Beskyttelseslinjer duplikerer sdfi-flags — skip dem
      if (
        violation.rule.startsWith("protection_line_") &&
        existingIds.has(`naturbeskyttelse-${violation.rule.replace("protection_line_", "")}`)
      ) {
        continue;
      }

      const status: ComplianceFlag["status"] =
        violation.severity === "illegal"
          ? "blocker"
          : violation.severity === "dispensation_required"
            ? "blocker"
            : "advarsel";

      flags.push({
        id: `regelkerne-${violation.rule}`,
        label: violation.authority
          ? `${violation.rule.replace(/_/g, " ")} (${violation.authority})`
          : violation.rule.replace(/_/g, " "),
        status,
        detalje: violation.reason,
        aktuelVærdi: null,
        tilladt: null,
        kilde: "regelkerne",
        dispensationMulig: violation.severity === "dispensation_required",
        dispensationMyndighed: violation.authority,
      });
    }
  }

  return flags;
}
