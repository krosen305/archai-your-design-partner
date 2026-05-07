// Projekt-readiness tracker — definitioner og score-engine (ARCH-105).
//
// Dækker ~63 manuelle datapunkter i sektionerne 3 og 5-11.
// Disse kan aldrig hentes automatisk — de kræver arkitekt/ingeniørbeslutninger.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DataPointStatus = "not_started" | "in_progress" | "done" | "not_applicable";

export type DataPointEntry = {
  fieldId: string;
  status: DataPointStatus;
  note?: string;
  updatedAt: string;
};

export type DataStatusMap = Record<string, DataPointEntry>;

export type Phase = "skitse" | "myndighed" | "udbud";

export type DataPointDef = {
  id: string;
  section: number;
  sectionLabel: string;
  label: string;
  description: string;
  kritisk: boolean;
  phase: Phase;
};

export type RiskFlag = {
  fieldId: string;
  label: string;
  severity: "high" | "medium";
  message: string;
};

export type ReadinessScore = {
  phase: Phase;
  label: string;
  done: number;
  total: number;
  pct: number;
};

// ---------------------------------------------------------------------------
// Felter
// ---------------------------------------------------------------------------

export const DATA_POINT_DEFS: DataPointDef[] = [
  // ── Sektion 3: Bygherrekrav ──────────────────────────────────────────────
  {
    id: "rumprogram",
    section: 3,
    sectionLabel: "Bygherrekrav",
    label: "Rumprogram",
    description: "Liste over alle rum med krav til areal og funktion",
    kritisk: true,
    phase: "skitse",
  },
  {
    id: "arealkrav",
    section: 3,
    sectionLabel: "Bygherrekrav",
    label: "Arealkrav per rum",
    description: "Specificerede m²-krav for hvert enkelt rum",
    kritisk: false,
    phase: "skitse",
  },
  {
    id: "byggetid",
    section: 3,
    sectionLabel: "Bygherrekrav",
    label: "Byggetidsplan",
    description: "Overordnet tidsplan fra godkendelse til indflytning",
    kritisk: false,
    phase: "myndighed",
  },
  {
    id: "budget_byggesum",
    section: 3,
    sectionLabel: "Bygherrekrav",
    label: "Budget: byggesum",
    description: "Samlet budget for entreprise ekskl. arkitekt og rådgivning",
    kritisk: true,
    phase: "skitse",
  },
  {
    id: "boligtype_valgt",
    section: 3,
    sectionLabel: "Bygherrekrav",
    label: "Boligtype besluttet",
    description: "Nybyg / tilbyg / ombygning er endeligt besluttet",
    kritisk: true,
    phase: "skitse",
  },
  {
    id: "etager_valgt",
    section: 3,
    sectionLabel: "Bygherrekrav",
    label: "Etageantal besluttet",
    description: "Antal etager inkl. eventuel udnyttet tagetage og kælder",
    kritisk: true,
    phase: "skitse",
  },
  {
    id: "kælder",
    section: 3,
    sectionLabel: "Bygherrekrav",
    label: "Kælder besluttet",
    description: "Kælder ja/nej — påvirker fundamentering og økonomi markant",
    kritisk: true,
    phase: "skitse",
  },
  {
    id: "garage_carport",
    section: 3,
    sectionLabel: "Bygherrekrav",
    label: "Garage / carport",
    description: "Type, placering og størrelse af evt. garage eller carport",
    kritisk: false,
    phase: "skitse",
  },
  {
    id: "udendørs_areal",
    section: 3,
    sectionLabel: "Bygherrekrav",
    label: "Udendørs areal",
    description: "Terrasse, have, hegn — placering og omfang besluttet",
    kritisk: false,
    phase: "skitse",
  },
  {
    id: "tilgængelighed",
    section: 3,
    sectionLabel: "Bygherrekrav",
    label: "Tilgængelighed (handicap)",
    description: "BR18 §61: adgangs- og anvendelseskrav for bevægelseshæmmede",
    kritisk: false,
    phase: "myndighed",
  },
  {
    id: "særlige_krav",
    section: 3,
    sectionLabel: "Bygherrekrav",
    label: "Særlige bygherrekrav",
    description: "Specifikke ønsker der afviger fra standard (fx lydisoleret hjemmekontor)",
    kritisk: false,
    phase: "skitse",
  },

  // ── Sektion 5: Tegninger + Geometri ─────────────────────────────────────
  {
    id: "skitseprojekt",
    section: 5,
    sectionLabel: "Tegninger + Geometri",
    label: "Skitseprojekt",
    description: "Første tegningssæt godkendt af bygherre",
    kritisk: true,
    phase: "skitse",
  },
  {
    id: "dispositionsforslag",
    section: 5,
    sectionLabel: "Tegninger + Geometri",
    label: "Dispositionsforslag",
    description: "Arkitektens dispositionsforslag præsenteret og godkendt",
    kritisk: false,
    phase: "skitse",
  },
  {
    id: "foreløbig_situationsplan",
    section: 5,
    sectionLabel: "Tegninger + Geometri",
    label: "Foreløbig situationsplan",
    description: "Bygning placeret på grund med afstande til skel angivet",
    kritisk: true,
    phase: "skitse",
  },
  {
    id: "planløsning_godkendt",
    section: 5,
    sectionLabel: "Tegninger + Geometri",
    label: "Planløsning godkendt",
    description: "Endelig plantegning godkendt — ingen ændringer efter dette punkt",
    kritisk: true,
    phase: "skitse",
  },
  {
    id: "layout_frozen",
    section: 5,
    sectionLabel: "Tegninger + Geometri",
    label: "Plantegning frosset",
    description: "Plantegning låst: ændringer nu koster ekstra. Fremdrift kræver dette punkt.",
    kritisk: true,
    phase: "skitse",
  },
  {
    id: "facader_skitseret",
    section: 5,
    sectionLabel: "Tegninger + Geometri",
    label: "Facader",
    description: "Alle 4 facader tegnet med vindues- og dørplacering",
    kritisk: false,
    phase: "skitse",
  },
  {
    id: "snit_skitseret",
    section: 5,
    sectionLabel: "Tegninger + Geometri",
    label: "Snit",
    description: "Mindst ét tværsnit der viser etagehøjder og tagkonstruktion",
    kritisk: false,
    phase: "skitse",
  },
  {
    id: "tagplan",
    section: 5,
    sectionLabel: "Tegninger + Geometri",
    label: "Tagplan",
    description: "Tagplan med hældning, tagrender og udluftning",
    kritisk: false,
    phase: "myndighed",
  },
  {
    id: "afsætningsplan",
    section: 5,
    sectionLabel: "Tegninger + Geometri",
    label: "Afsætningsplan",
    description: "Præcis placering af bygning i koordinater (til ansøgning)",
    kritisk: false,
    phase: "myndighed",
  },
  {
    id: "beliggenhedsplan",
    section: 5,
    sectionLabel: "Tegninger + Geometri",
    label: "Beliggenhedsplan",
    description: "Kortudsnit der viser ejendommens beliggenhed",
    kritisk: false,
    phase: "myndighed",
  },
  {
    id: "terrænkoter",
    section: 5,
    sectionLabel: "Tegninger + Geometri",
    label: "Terrænkoter",
    description: "Eksisterende og fremtidigt terrænkoter indlagt på situationsplan",
    kritisk: false,
    phase: "myndighed",
  },
  {
    id: "volumenstudie",
    section: 5,
    sectionLabel: "Tegninger + Geometri",
    label: "Volumenstudier",
    description: "3D-volumenstudier til bygherre og evt. naboorienteringsmøde",
    kritisk: false,
    phase: "skitse",
  },
  {
    id: "3d_visualisering",
    section: 5,
    sectionLabel: "Tegninger + Geometri",
    label: "3D-visualisering",
    description: "Renderings til bygherre-godkendelse og evt. naboorientation",
    kritisk: false,
    phase: "skitse",
  },

  // ── Sektion 6: Geoteknik ─────────────────────────────────────────────────
  {
    id: "jordbundsundersøgelse",
    section: 6,
    sectionLabel: "Geoteknik",
    label: "Jordbundsundersøgelse",
    description: "DGF klasse 1a (minimum) — grundlag for fundamenteringsvalg",
    kritisk: true,
    phase: "myndighed",
  },
  {
    id: "grundvandsniveau",
    section: 6,
    sectionLabel: "Geoteknik",
    label: "Grundvandsniveau",
    description: "Målt grundvandsniveau — afgørende ved kælder og fundament",
    kritisk: true,
    phase: "myndighed",
  },
  {
    id: "fundamenteringstype",
    section: 6,
    sectionLabel: "Geoteknik",
    label: "Fundamenteringstype",
    description: "Støbt betonfundament / pæle / terrændæk besluttet af geotekniker",
    kritisk: true,
    phase: "myndighed",
  },
  {
    id: "radon_afværge",
    section: 6,
    sectionLabel: "Geoteknik",
    label: "Radon: afværgeforanstaltning",
    description: "BR18 §301: radonmembran, udsugning eller andet tiltag besluttet",
    kritisk: false,
    phase: "myndighed",
  },

  // ── Sektion 7: Konstruktion ──────────────────────────────────────────────
  {
    id: "bærende_system",
    section: 7,
    sectionLabel: "Konstruktion",
    label: "Bærende system",
    description: "Murværk / træ / stål / beton — systemvalg med begrundelse",
    kritisk: true,
    phase: "myndighed",
  },
  {
    id: "fundament_dimensioneret",
    section: 7,
    sectionLabel: "Konstruktion",
    label: "Fundament dimensioneret",
    description: "Fundamentdybde og armering specificeret af konstruktionsingeniør",
    kritisk: true,
    phase: "myndighed",
  },
  {
    id: "bjælker_søjler",
    section: 7,
    sectionLabel: "Konstruktion",
    label: "Bjælker og søjler",
    description: "Spænd og tværsnit dimensioneret",
    kritisk: false,
    phase: "myndighed",
  },
  {
    id: "tagkonstruktion",
    section: 7,
    sectionLabel: "Konstruktion",
    label: "Tagkonstruktion",
    description: "Spær, åse, bjælker dimensioneret og tegnet",
    kritisk: false,
    phase: "myndighed",
  },
  {
    id: "udv_vægge_opbygning",
    section: 7,
    sectionLabel: "Konstruktion",
    label: "Udvendige vægge",
    description: "Opbygning med U-værdier, dampspærre og ventileret hulrum specificeret",
    kritisk: false,
    phase: "myndighed",
  },
  {
    id: "indv_vægge_placering",
    section: 7,
    sectionLabel: "Konstruktion",
    label: "Indvendige vægge",
    description: "Bærende vs. ikke-bærende identificeret og placeret på plantegning",
    kritisk: false,
    phase: "myndighed",
  },
  {
    id: "etageadskillelse",
    section: 7,
    sectionLabel: "Konstruktion",
    label: "Etageadskillelse",
    description: "Konstruktion og brand/lydkrav specificeret (BR18 §81)",
    kritisk: false,
    phase: "myndighed",
  },
  {
    id: "brandkrav_konstruktion",
    section: 7,
    sectionLabel: "Konstruktion",
    label: "Brandkrav",
    description: "Brandklasse og brandmodstandskrav til konstruktion verificeret",
    kritisk: false,
    phase: "myndighed",
  },

  // ── Sektion 8: Energi ────────────────────────────────────────────────────
  {
    id: "energiramme_klasse",
    section: 8,
    sectionLabel: "Energi",
    label: "Energiramme (BR18)",
    description: "Lavenergiklasse A / A2020 / BR18 standard besluttet",
    kritisk: true,
    phase: "myndighed",
  },
  {
    id: "varmeinstallation",
    section: 8,
    sectionLabel: "Energi",
    label: "Varmeinstallation",
    description: "Varmepumpe / fjernvarme / jordvarme valgt",
    kritisk: true,
    phase: "myndighed",
  },
  {
    id: "ventilation_system",
    section: 8,
    sectionLabel: "Energi",
    label: "Ventilationssystem",
    description: "Naturlig / mekanisk afkast / balanceret med varmegenvinding (MVHR)",
    kritisk: false,
    phase: "myndighed",
  },
  {
    id: "klimaskærm_u_værdier",
    section: 8,
    sectionLabel: "Energi",
    label: "Klimaskærm U-værdier",
    description: "Tag, ydervæg, gulv, vinduer/døre — U-værdier fastlagt til energiberegning",
    kritisk: false,
    phase: "myndighed",
  },
  {
    id: "solceller",
    section: 8,
    sectionLabel: "Energi",
    label: "Solceller",
    description: "Kapacitet (kWp), orientering og tagareal besluttet",
    kritisk: false,
    phase: "myndighed",
  },
  {
    id: "energiberegning",
    section: 8,
    sectionLabel: "Energi",
    label: "Energiberegning",
    description: "Formel energiberegning (BE10 / PHPP) udarbejdet og godkendt",
    kritisk: false,
    phase: "myndighed",
  },

  // ── Sektion 9: VVS / El / Kloak ──────────────────────────────────────────
  {
    id: "vandinstallation",
    section: 9,
    sectionLabel: "VVS / El / Kloak",
    label: "Vandinstallation",
    description: "Koldt- og varmtvandsrør dimensioneret og lagt ud på plan",
    kritisk: false,
    phase: "udbud",
  },
  {
    id: "afløbsinstallation",
    section: 9,
    sectionLabel: "VVS / El / Kloak",
    label: "Afløbsinstallation",
    description: "Afløb fra køkken, bad og vaske lagt ud — faldretning verificeret",
    kritisk: false,
    phase: "udbud",
  },
  {
    id: "kloak_tilslutning",
    section: 9,
    sectionLabel: "VVS / El / Kloak",
    label: "Kloaktilslutning",
    description: "Spildevand/regnvand separeret eller fælles — kommunal tilladelse afklaret",
    kritisk: true,
    phase: "udbud",
  },
  {
    id: "stærkstrøm",
    section: 9,
    sectionLabel: "VVS / El / Kloak",
    label: "Stærkstrøm",
    description: "El-tavle placering, sikringsstørrelser og kabeltyper specificeret",
    kritisk: false,
    phase: "udbud",
  },
  {
    id: "svagstrøm_it",
    section: 9,
    sectionLabel: "VVS / El / Kloak",
    label: "Svagstrøm og IT",
    description: "Datanet, antenne, dørtelefon og videoovervågning planlagt",
    kritisk: false,
    phase: "udbud",
  },
  {
    id: "ladestander",
    section: 9,
    sectionLabel: "VVS / El / Kloak",
    label: "Ladestander",
    description: "El-kapacitet til elbil-lader reserveret (min 11 kW) og placering bestemt",
    kritisk: false,
    phase: "udbud",
  },
  {
    id: "belysningsplan",
    section: 9,
    sectionLabel: "VVS / El / Kloak",
    label: "Belysningsplan",
    description: "Armaturer, dimmer-zoner og stikkontakter placeret på plan",
    kritisk: false,
    phase: "udbud",
  },
  {
    id: "alarmsystem",
    section: 9,
    sectionLabel: "VVS / El / Kloak",
    label: "Alarmsystem",
    description: "Indbrudsalarm / brandalarmsystem planlagt og kabler reserveret",
    kritisk: false,
    phase: "udbud",
  },
  {
    id: "sol_el_tilslutning",
    section: 9,
    sectionLabel: "VVS / El / Kloak",
    label: "Sol/el-produktion",
    description: "Nettilslutning af solceller: aftale med netselskab",
    kritisk: false,
    phase: "udbud",
  },
  {
    id: "skel_forsyning",
    section: 9,
    sectionLabel: "VVS / El / Kloak",
    label: "Forsyning til skel",
    description: "El, vand og evt. fjernvarme til skel — leveringstidspunkt afklaret",
    kritisk: true,
    phase: "udbud",
  },
  {
    id: "gasledning",
    section: 9,
    sectionLabel: "VVS / El / Kloak",
    label: "Gasinstallation",
    description: "Gastilslutning og installation planlagt (hvis relevant)",
    kritisk: false,
    phase: "udbud",
  },

  // ── Sektion 10: Byggetilladelse ──────────────────────────────────────────
  {
    id: "anmeldelse_eller_tilladelse",
    section: 10,
    sectionLabel: "Byggetilladelse",
    label: "Anmeldelse vs. tilladelse",
    description: "Afklaret om projektet kræver byggetilladelse eller kun anmeldelse (BR18 §1.5)",
    kritisk: true,
    phase: "myndighed",
  },
  {
    id: "naboorientering",
    section: 10,
    sectionLabel: "Byggetilladelse",
    label: "Naboorientering",
    description: "Naboer orienteret iht. planloven §20 ved dispensationsansøgning",
    kritisk: false,
    phase: "myndighed",
  },
  {
    id: "tegninger_byggesag",
    section: 10,
    sectionLabel: "Byggetilladelse",
    label: "Ansøgningstegninger",
    description: "Situationsplan, planer, facader og snit klar i byggesagsformat (PDF/DWG)",
    kritisk: true,
    phase: "myndighed",
  },
  {
    id: "tekniske_bilag",
    section: 10,
    sectionLabel: "Byggetilladelse",
    label: "Tekniske bilag",
    description: "Statisk dokumentation, energiberegning og geoteknisk rapport vedlagt",
    kritisk: false,
    phase: "myndighed",
  },
  {
    id: "byggesagsgebyr",
    section: 10,
    sectionLabel: "Byggetilladelse",
    label: "Byggesagsgebyr",
    description: "Gebyr estimeret og budgetteret (typisk 0,15% af byggesum + grundbeløb)",
    kritisk: false,
    phase: "myndighed",
  },

  // ── Sektion 11: Udbud ────────────────────────────────────────────────────
  {
    id: "entrepriseform",
    section: 11,
    sectionLabel: "Udbud",
    label: "Entrepriseform",
    description: "Fagentreprise / hovedentreprise / totalentreprise valgt",
    kritisk: true,
    phase: "udbud",
  },
  {
    id: "udbudsmateriale",
    section: 11,
    sectionLabel: "Udbud",
    label: "Udbudsmateriale",
    description: "Arbejdsbeskrivelser, tegningsliste og mængdeliste klar til tilbud",
    kritisk: true,
    phase: "udbud",
  },
  {
    id: "tilbudsgivere",
    section: 11,
    sectionLabel: "Udbud",
    label: "Tilbudsgivere",
    description: "Mindst 3 kvalificerede håndværkere / totalentreprenører identificeret",
    kritisk: false,
    phase: "udbud",
  },
  {
    id: "tidsplan_udbud",
    section: 11,
    sectionLabel: "Udbud",
    label: "Tidsplan for udbud",
    description: "Udbuds-, evaluerings- og kontrakttildelingstidsplan fastlagt",
    kritisk: false,
    phase: "udbud",
  },
  {
    id: "kontraktform",
    section: 11,
    sectionLabel: "Udbud",
    label: "Kontraktform",
    description: "AB18 / ABT18 / ABR18 — kontraktgrundlag valgt med bygherre",
    kritisk: true,
    phase: "udbud",
  },
];

// ---------------------------------------------------------------------------
// Sektioner
// ---------------------------------------------------------------------------

export const SECTIONS: { nr: number; label: string }[] = [
  { nr: 3, label: "Bygherrekrav" },
  { nr: 5, label: "Tegninger + Geometri" },
  { nr: 6, label: "Geoteknik" },
  { nr: 7, label: "Konstruktion" },
  { nr: 8, label: "Energi" },
  { nr: 9, label: "VVS / El / Kloak" },
  { nr: 10, label: "Byggetilladelse" },
  { nr: 11, label: "Udbud" },
];

// ---------------------------------------------------------------------------
// Readiness score
// ---------------------------------------------------------------------------

export const PHASE_LABELS: Record<Phase, string> = {
  skitse: "Skitsefase",
  myndighed: "Myndighedsfase",
  udbud: "Udbudsfase",
};

export function getReadinessScores(statusMap: DataStatusMap): ReadinessScore[] {
  const phases: Phase[] = ["skitse", "myndighed", "udbud"];
  return phases.map((phase) => {
    const kritisk = DATA_POINT_DEFS.filter((d) => d.phase === phase && d.kritisk);
    const done = kritisk.filter((d) => {
      const s = statusMap[d.id]?.status;
      return s === "done" || s === "not_applicable";
    });
    const total = kritisk.length;
    const pct = total > 0 ? Math.round((done.length / total) * 100) : 0;
    return { phase, label: PHASE_LABELS[phase], done: done.length, total, pct };
  });
}

// ---------------------------------------------------------------------------
// Risk flags
// ---------------------------------------------------------------------------

const HIGH_RISK_IDS = new Set([
  "layout_frozen",
  "jordbundsundersøgelse",
  "anmeldelse_eller_tilladelse",
  "entrepriseform",
]);

const MEDIUM_RISK_IDS = new Set([
  "energiramme_klasse",
  "bærende_system",
  "udbudsmateriale",
  "kloak_tilslutning",
]);

export function getRiskFlags(statusMap: DataStatusMap): RiskFlag[] {
  const flags: RiskFlag[] = [];

  for (const def of DATA_POINT_DEFS) {
    const status = statusMap[def.id]?.status ?? "not_started";
    if (status === "done" || status === "not_applicable") continue;

    if (HIGH_RISK_IDS.has(def.id)) {
      flags.push({
        fieldId: def.id,
        label: def.label,
        severity: "high",
        message: `${def.label} mangler — blokerer fremskridt i ${PHASE_LABELS[def.phase].toLowerCase()}`,
      });
    } else if (MEDIUM_RISK_IDS.has(def.id) && status === "not_started") {
      flags.push({
        fieldId: def.id,
        label: def.label,
        severity: "medium",
        message: `${def.label} er ikke igangsat`,
      });
    }
  }

  return flags;
}
