// Pure derivation functions — no Supabase, no env vars, no side effects.
// Importable in tests without live DB or Supabase credentials.

import type { Database } from "@/integrations/supabase/types";
import { evaluateHardStop } from "@/lib/rule-engine/hard-stop-adapter";
import { BUILDING_TASK_KEYS } from "@/types/building-platform";

type BuildingTaskInsert = Database["public"]["Tables"]["building_tasks"]["Insert"];

export type ComplianceTriggers = {
  projectId: string;
  saveValue: number | null;
  isFredet: boolean | null;
  strandbeskyttelse: boolean | null;
  fredskov: boolean | null;
  klitfredning: boolean | null;
  landzonePermitRequired: boolean | null;
  lokalplanByggefeltPresent: boolean | null;
  withinBuildingField: boolean | null;
  wastewaterPlanStatus: string | null;
  sewerAreaType: string | null;
  paragraph3Nature: boolean | null;
  natura2000: boolean | null;
  protectedDige: boolean | null;
  fortidsminde: boolean | null;
  fortidsmindeBuffer: boolean | null;
  bnbo: boolean | null;
  osd: boolean | null;
  rawMaterialArea: boolean | null;
  soilContamination: "clean" | "registered" | "contaminated" | "unknown" | null;
  jordforureningV1: boolean | null;
  jordforureningV2: boolean | null;
  omraadeklassificering: string | null;
  // ARCH-246: BBR Due-Diligence triggers
  jordforureningOlietank: boolean | null;
  bbrAfloebsforholdKode: string | null;
  bbrSaneringsRisiko: "lav" | "moderat" | "hoej" | null;
  // ARCH-247: Tjekditnet bredbånd
  tjekditnetNoFixedBroadband: boolean | null;
  // ARCH-248: Energimærke
  energimaerkeMangler: boolean | null;
};

export function deriveAutoTasks(t: ComplianceTriggers): BuildingTaskInsert[] {
  const tasks: BuildingTaskInsert[] = [];

  const { violations } = evaluateHardStop({
    saveValue: t.saveValue,
    isFredet: t.isFredet,
    strandbeskyttelse: t.strandbeskyttelse,
    fredskov: t.fredskov,
    klitfredning: t.klitfredning,
    projectType: "demolition_and_new",
  });
  const violationRules = new Set(violations.map((v) => v.rule));

  if (violationRules.has("listed_building_demolition")) {
    tasks.push({
      project_id: t.projectId,
      task_key: BUILDING_TASK_KEYS.FREDNING_JURIDISK,
      title: "Fredningsstatus — juridisk afklaring påkrævet",
      description:
        "Bygningen er registreret som fredet (DAI WFS). Kontakt Slots- og Kulturstyrelsen inden nedrivning eller væsentlig ombygning.",
      phase: "myndighed",
      status: "blocked",
      priority: 0,
      is_auto_generated: true,
      blocked_by_constraint: "is_fredet",
      metadata: { kilde: "DAI WFS FREDEDE_BYGNINGER" },
    });
  }

  if (violationRules.has("save_1_3_demolition")) {
    tasks.push({
      project_id: t.projectId,
      task_key: BUILDING_TASK_KEYS.SAVE_DISPENSATION,
      title: `Dispensation fra Slots- og Kulturstyrelsen krævet (SAVE ${t.saveValue})`,
      description: `Bygningen har høj bevaringsværdi (SAVE ${t.saveValue}/9). Nedrivning eller væsentlig ombygning kræver forudgående tilladelse fra Slots- og Kulturstyrelsen.`,
      phase: "myndighed",
      status: "blocked",
      priority: 1,
      is_auto_generated: true,
      blocked_by_constraint: "heritage_save_value",
      metadata: { save_value: t.saveValue, myndighed: "Slots- og Kulturstyrelsen" },
    });
  }

  if (violationRules.has("save_4_paragraph14_risk")) {
    tasks.push({
      project_id: t.projectId,
      task_key: BUILDING_TASK_KEYS.SAVE_4_PARAGRAPH14,
      title: "Undersøg §14-forbud risiko (SAVE 4)",
      description:
        "Bygningen har bevaringsværdi SAVE 4. Kommunen kan nedlægge §14-forbud mod nedrivning. Kontakt kommunens tekniske forvaltning tidligt i processen — gerne inden budgetlåsning.",
      phase: "matriklen",
      status: "pending",
      priority: 2,
      is_auto_generated: true,
      blocked_by_constraint: "heritage_save_value",
      metadata: {
        save_value: 4,
        myndighed: "Kommunens tekniske forvaltning",
        lovgrundlag: "Planlovens §14",
      },
    });
  }

  if (violationRules.has("protection_line_coastal")) {
    tasks.push({
      project_id: t.projectId,
      task_key: BUILDING_TASK_KEYS.STRANDBESKYTTELSE_DISPENSATION,
      title: "Strandbeskyttelse — dispensation påkrævet",
      description:
        "Grunden er inden for strandbeskyttelseslinjen (300 m fra kyst). Nybyggeri kræver dispensation fra Kystdirektoratet. Behandlingstid typisk 3–6 måneder.",
      phase: "myndighed",
      status: "blocked",
      priority: 0,
      is_auto_generated: true,
      blocked_by_constraint: "strandbeskyttelse",
      metadata: { myndighed: "Kystdirektoratet" },
    });
  }

  if (violationRules.has("protection_line_forest")) {
    tasks.push({
      project_id: t.projectId,
      task_key: BUILDING_TASK_KEYS.FREDSKOV_DISPENSATION,
      title: "Fredskov — dispensation påkrævet",
      description:
        "Ejendommen er beliggende i fredskov (Skovloven). Byggeaktivitet kræver dispensation fra Miljøministeriet.",
      phase: "myndighed",
      status: "blocked",
      priority: 0,
      is_auto_generated: true,
      blocked_by_constraint: "fredskov",
      metadata: { myndighed: "Miljøministeriet" },
    });
  }

  if (violationRules.has("protection_line_clitFredning")) {
    tasks.push({
      project_id: t.projectId,
      task_key: BUILDING_TASK_KEYS.KLITFREDNING_DISPENSATION,
      title: "Klitfredning — dispensation påkrævet",
      description:
        "Grunden er inden for klitfredningslinjen. Byggeaktivitet kræver dispensation fra Kystdirektoratet.",
      phase: "myndighed",
      status: "blocked",
      priority: 0,
      is_auto_generated: true,
      blocked_by_constraint: "klitfredning",
      metadata: { myndighed: "Kystdirektoratet" },
    });
  }

  if (t.landzonePermitRequired === true) {
    tasks.push({
      project_id: t.projectId,
      task_key: BUILDING_TASK_KEYS.LANDZONE_TILLADELSE,
      title: "Landzonetilladelse skal afklares",
      description:
        "Ejendommen ligger i landzone. Nybyggeri eller væsentlige ændringer kræver som udgangspunkt landzonetilladelse fra kommunen, før projektet kan modnes videre.",
      phase: "myndighed",
      status: "pending",
      priority: 1,
      is_auto_generated: true,
      blocked_by_constraint: "landzone_permit_required",
      metadata: { myndighed: "Kommunen", lovgrundlag: "Planloven" },
    });
  }

  if (t.lokalplanByggefeltPresent === true && t.withinBuildingField === false) {
    tasks.push({
      project_id: t.projectId,
      task_key: BUILDING_TASK_KEYS.BYGGEFELT_DISPENSATION,
      title: "Byggefelt overskrides – dispensation skal afklares",
      description:
        "Lokalplanen ser ud til at definere byggefelter, men parcelens planmæssige kontekst ligger uden for registreret byggefelt. Projektet kræver planfaglig afklaring eller dispensation, før det kan behandles som realistisk.",
      phase: "myndighed",
      status: "blocked",
      priority: 1,
      is_auto_generated: true,
      blocked_by_constraint: "within_building_field",
      metadata: { kilde: "Plandata WFS byggefelt", myndighed: "Kommunen" },
    });
  }

  if (t.wastewaterPlanStatus !== null || t.sewerAreaType !== null) {
    tasks.push({
      project_id: t.projectId,
      task_key: BUILDING_TASK_KEYS.KLOAK_NEDSIVNING_AFKLARING,
      title: "Kloak- og nedsivningsforhold skal afklares",
      description: `Plandata viser spildevandsforhold${t.sewerAreaType ? ` (${t.sewerAreaType})` : ""}. Kloakopland, nedsivning eller udtræden skal afklares med kommune/forsyning før projektets teknik og budget låses.`,
      phase: "maskinrummet",
      status: "pending",
      priority: 2,
      is_auto_generated: true,
      blocked_by_constraint: "wastewater_plan_status",
      metadata: {
        wastewater_plan_status: t.wastewaterPlanStatus,
        sewer_area_type: t.sewerAreaType,
        myndighed: "Kommune/Forsyning",
      },
    });
  }

  if (t.paragraph3Nature === true) {
    tasks.push({
      project_id: t.projectId,
      task_key: BUILDING_TASK_KEYS.PARAGRAF3_AFKLARING,
      title: "§3-beskyttet natur skal afklares",
      description:
        "Arealet overlapper registreret §3-beskyttet natur. Projektet kraever tidlig myndighedsafklaring eller mulig dispensation, foer design og budget laases.",
      phase: "myndighed",
      status: "blocked",
      priority: 1,
      is_auto_generated: true,
      blocked_by_constraint: "paragraph3_nature",
      metadata: { myndighed: "Kommunen", lovgrundlag: "Naturbeskyttelsesloven §3" },
    });
  }

  if (t.natura2000 === true) {
    tasks.push({
      project_id: t.projectId,
      task_key: BUILDING_TASK_KEYS.NATURA2000_AFKLARING,
      title: "Natura 2000-screening skal afklares",
      description:
        "Arealet overlapper Natura 2000-interesser. Habitat- og artsforhold boer screenes tidligt med kommune/myndighed, foer projektet modnes videre.",
      phase: "matriklen",
      status: "pending",
      priority: 2,
      is_auto_generated: true,
      blocked_by_constraint: "natura2000",
      metadata: { myndighed: "Kommune/Miljoestyrelsen" },
    });
  }

  if (t.protectedDige === true) {
    tasks.push({
      project_id: t.projectId,
      task_key: BUILDING_TASK_KEYS.DIGE_BESKYTTELSE,
      title: "Beskyttet dige skal afklares",
      description:
        "Arealet overlapper registreret beskyttet sten- eller jorddige. Indgreb skal afklares med kommunen, og dispensation kan vaere noedvendig.",
      phase: "myndighed",
      status: "blocked",
      priority: 1,
      is_auto_generated: true,
      blocked_by_constraint: "protected_dige",
      metadata: { myndighed: "Kommunen" },
    });
  }

  if (t.fortidsminde === true || t.fortidsmindeBuffer === true) {
    tasks.push({
      project_id: t.projectId,
      task_key: BUILDING_TASK_KEYS.FORTIDSMINDE_AFKLARING,
      title: "Fortidsminde og arkæologi skal afklares",
      description:
        "Arealet overlapper fortidsminde eller fortidsmindebeskyttelseslinje. Jordarbejde og byggeri boer afklares tidligt med kulturarvsmyndigheden.",
      phase: "myndighed",
      status: t.fortidsminde === true ? "blocked" : "pending",
      priority: 1,
      is_auto_generated: true,
      blocked_by_constraint: t.fortidsminde === true ? "fortidsminde" : "fortidsminde_buffer",
      metadata: { myndighed: "Slots- og Kulturstyrelsen" },
    });
  }

  if (t.bnbo === true || t.osd === true) {
    tasks.push({
      project_id: t.projectId,
      task_key: BUILDING_TASK_KEYS.BNBO_OSD_AFKLARING,
      title: "BNBO/OSD-forhold skal afklares",
      description:
        "Arealet ligger i BNBO eller OSD. Vand-, jord- og kemiforhold boer afklares tidligt med kommune og/eller vandforsyning.",
      phase: "matriklen",
      status: "pending",
      priority: 2,
      is_auto_generated: true,
      blocked_by_constraint: t.bnbo === true ? "bnbo" : "osd",
      metadata: { myndighed: "Kommune/Vandforsyning" },
    });
  }

  if (t.rawMaterialArea === true) {
    tasks.push({
      project_id: t.projectId,
      task_key: BUILDING_TASK_KEYS.RAASTOF_AFKLARING,
      title: "Råstofinteresser skal afklares",
      description:
        "Arealet overlapper raastofinteresser. Projektet boer screenes tidligt for plan- og miljoekonflikter med regionen.",
      phase: "matriklen",
      status: "pending",
      priority: 2,
      is_auto_generated: true,
      blocked_by_constraint: "raw_material_area",
      metadata: { myndighed: "Regionen" },
    });
  }

  if (t.jordforureningV2 === true) {
    tasks.push({
      project_id: t.projectId,
      task_key: BUILDING_TASK_KEYS.JORDFORURENING_V2_UNDERSOEGELSE,
      title: "Miljøteknisk undersøgelse af V2-kortlagt grund",
      description:
        "Grunden er V2-kortlagt (dokumenteret forurening). Oprensning kan koste 500.000 kr+. " +
        "En miljøteknisk undersøgelse er påkrævet inden byggestart (Jordforureningslovens §72). " +
        "Budgettér undersøgelse + oprensning som en separat post.",
      phase: "matriklen",
      status: "blocked",
      priority: 1,
      is_auto_generated: true,
      blocked_by_constraint: "jordforurening_v2",
      metadata: { kortlaeggingsklasse: "V2", myndighed: "Miljøstyrelsen" },
    });
  }

  if (t.jordforureningV1 === true) {
    tasks.push({
      project_id: t.projectId,
      task_key: BUILDING_TASK_KEYS.JORDFORURENING_V1_SCREENING,
      title: "Miljøscreening af V1-kortlagt grund",
      description:
        "Grunden er V1-kortlagt (mulig forurening). En indledende miljøscreening anbefales " +
        "inden køb og er nødvendig inden nedrivningsansøgning.",
      phase: "matriklen",
      status: "pending",
      priority: 2,
      is_auto_generated: true,
      blocked_by_constraint: "jordforurening_v1",
      metadata: { kortlaeggingsklasse: "V1", myndighed: "Miljøstyrelsen" },
    });
  }

  if (t.omraadeklassificering !== null) {
    tasks.push({
      project_id: t.projectId,
      task_key: BUILDING_TASK_KEYS.JORDFLYTNING_ATTEST,
      title: "Indhent jordsundhedsattest inden jordflytning",
      description:
        `Grunden er i et områdeklassificeret område (${t.omraadeklassificering}). ` +
        "Jordflytning fra grunden kræver jordsundhedsattest fra kommunen.",
      phase: "maskinrummet",
      status: "pending",
      priority: 3,
      is_auto_generated: true,
      blocked_by_constraint: "omraadeklassificering",
      metadata: { omraadeklassificering: t.omraadeklassificering, myndighed: "Kommunen" },
    });
  }

  if (t.soilContamination === "unknown") {
    tasks.push({
      project_id: t.projectId,
      task_key: BUILDING_TASK_KEYS.MILJOEUNDERSOEGELSE,
      title: "DkJord-data utilgængeligt — jordforureningskortlægning påkrævet",
      description:
        "DkJord-opslaget kunne ikke gennemføres. En miljøundersøgelse af grunden er nødvendig for at fastlægge status for jordforurening inden byggestart.",
      phase: "matriklen",
      status: "pending",
      priority: 3,
      is_auto_generated: true,
      blocked_by_constraint: "soil_contamination_status",
      metadata: { kortlaeggingsklasse: "unknown", reason: "dkjord_api_unavailable" },
    });
  }

  // ARCH-246: Olietank (from DK-Jord WFS — jordforurening_olietank column)
  if (t.jordforureningOlietank === true) {
    tasks.push({
      project_id: t.projectId,
      task_key: BUILDING_TASK_KEYS.OLIETANK_MILJOESCREENING,
      title: "Olietank registreret — miljøscreening påkrævet",
      description:
        "DK-Jord registrerer en olietank på eller nær grunden. En miljøteknisk undersøgelse " +
        "(jordprøver) er nødvendig inden nedrivning eller byggestart for at fastlægge eventuel forurening.",
      phase: "matriklen",
      status: "pending",
      priority: 2,
      is_auto_generated: true,
      blocked_by_constraint: "jordforurening_olietank",
      metadata: { kilde: "DK-Jord WFS olietank", myndighed: "Miljøstyrelsen" },
    });
  }

  // ARCH-246: Asbest/PCB saneringsrisiko (from BBR byggeår + materialer)
  if (t.bbrSaneringsRisiko === "hoej" || t.bbrSaneringsRisiko === "moderat") {
    tasks.push({
      project_id: t.projectId,
      task_key: BUILDING_TASK_KEYS.ASBEST_PCB_SCREENING,
      title: `Asbest/PCB-screening anbefales (${t.bbrSaneringsRisiko === "hoej" ? "høj risiko" : "moderat risiko"})`,
      description:
        t.bbrSaneringsRisiko === "hoej"
          ? "Byggeår og materialer indikerer høj risiko for asbest, PCB og bly. " +
            "En miljøscreening er lovpligtig inden nedrivning (Affaldsbekendtgørelsen). " +
            "Budgettér screeningsrapport + evt. sanering som separat post."
          : "Byggeår eller materialer (fx eternit) indikerer moderat risiko for asbestcement eller PCB. " +
            "En screening anbefales inden nedrivning eller større renovering.",
      phase: "matriklen",
      status: t.bbrSaneringsRisiko === "hoej" ? "blocked" : "pending",
      priority: t.bbrSaneringsRisiko === "hoej" ? 1 : 2,
      is_auto_generated: true,
      blocked_by_constraint: "bbr_sanerings_risiko",
      metadata: {
        saneringsrisiko: t.bbrSaneringsRisiko,
        lovgrundlag: "Affaldsbekendtgørelsen §57",
        myndighed: "Kommunen (byggesag)",
      },
    });
  }

  // ARCH-247: Tjekditnet — ingen fast bredbåndsdækning
  if (t.tjekditnetNoFixedBroadband === true) {
    tasks.push({
      project_id: t.projectId,
      task_key: BUILDING_TASK_KEYS.KORTLAEG_FORSYNINGER,
      title: "Bredbåndsdækning mangler — forsyningsforhold skal kortlægges",
      description:
        "Tjekditnet registrerer ingen teknisk mulig fast bredbåndsdækning (fiber, kabel-tv, xDSL eller fast trådløst) " +
        "på adressen. Mobildata er normalt ikke tilstrækkeligt til fjernarbejde. " +
        "Undersøg muligheder for fiberfremføring med kommunen eller lokalt forsyningsselskab.",
      phase: "matriklen",
      status: "pending",
      priority: 3,
      is_auto_generated: true,
      blocked_by_constraint: "broadband_fiber_mbit",
      metadata: { kilde: "Tjekditnet (Digitaliseringsstyrelsen)" },
    });
  }

  // ARCH-248: Energimærke mangler eller udløbet
  if (t.energimaerkeMangler === true) {
    tasks.push({
      project_id: t.projectId,
      task_key: BUILDING_TASK_KEYS.ENERGIMAERKE_RAPPORT,
      title: "Energimærke mangler eller udløbet — indhent rapport",
      description:
        "Der er ikke fundet et gyldigt energimærke for ejendommen. Et energimærke er " +
        "lovpligtigt ved salg og kan være afgørende for 'renover vs. riv ned'-beslutningen. " +
        "Kontakt en certificeret energikonsulent. Gyldighed: 7-10 år.",
      phase: "matriklen",
      status: "pending",
      priority: 3,
      is_auto_generated: true,
      blocked_by_constraint: "energimaerke_er_udloebet",
      metadata: { myndighed: "Certificeret energikonsulent", lovgrundlag: "Energimærkningsloven" },
    });
  }

  // ARCH-246: BBR afløb — nedsivning/samletank kræver forsyningsafklaring
  // Kode 4=nedsivning, 5=bundfælldningstank, 6=samletank, 7=ingen afledning
  const AFLOEB_KODER_MED_AFKLARING = new Set(["4", "5", "6", "7"]);
  if (t.bbrAfloebsforholdKode !== null && AFLOEB_KODER_MED_AFKLARING.has(t.bbrAfloebsforholdKode)) {
    tasks.push({
      project_id: t.projectId,
      task_key: BUILDING_TASK_KEYS.KLOAK_NEDSIVNING_AFKLARING,
      title: "Kloak- og afløbsforhold skal afklares",
      description:
        `BBR registrerer ikke offentlig kloak (afløbstype: kode ${t.bbrAfloebsforholdKode}). ` +
        "Nedsivning, samletank eller manglende afledning skal afklares med kommunen/forsyningen " +
        "inden projektet budgetteres og myndighedsbehandles.",
      phase: "maskinrummet",
      status: "pending",
      priority: 2,
      is_auto_generated: true,
      blocked_by_constraint: "bbr_afloebsforhold_kode",
      metadata: {
        afloebsforhold_kode: t.bbrAfloebsforholdKode,
        kilde: "BBR byg031Afloebsforhold",
        myndighed: "Kommune/Forsyning",
      },
    });
  }

  return tasks;
}
