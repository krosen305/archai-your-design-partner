import { create } from "zustand";
import type { BbrKompliantData } from "@/integrations/bbr/client";
import type { Lokalplan, Kommuneplanramme } from "@/integrations/plandata/client";
import type { LokalplanExtract } from "@/integrations/ai/pdf-extractor";
import type { NaturbeskyttelsesResultat } from "@/integrations/sdfi/naturbeskyttelse";
import type { DkJordResultat } from "@/integrations/miljoe/dkjord";
import type { GeusRiskData } from "@/integrations/geus/client";
import type { FjernvarmeResultat } from "@/integrations/plandata/fjernvarme";
import type { VurData } from "@/integrations/vur/client";
import type { RuleEngineResult } from "@/lib/rule-engine/types";
import type { ComplianceMetrics } from "@/lib/compliance-engine";
import type { AdressePreCheckResultat } from "@/lib/pre-check-adresse";
export type { ByggeanalyseResultat } from "@/integrations/ai/byggeanalyse";
export type { ComplianceMetrics } from "@/lib/compliance-engine";

// ---------------------------------------------------------------------------
// Adresse
// ---------------------------------------------------------------------------

export type Address = {
  adresseid: string; // DAR/DAWA UUID — cache key for address_analysis
  adresse: string;
  postnr: string;
  postnrnavn: string;
  kommune: string;
  kommunekode: string;
  matrikel: string | null;
  adgangsadresseid: string;
  koordinater: { lat: number; lng: number };
  bbrId: string | null;
  ejerlavskode: number | null;
  matrikelnummer: string | null;
  grundareal: number | null;
  centroid?: { lat: number; lng: number } | null;
  rotationDeg?: number;
  footprintAreaM2?: number | null;
  minDistanceToBoundaryM?: number | null;
  outsideParcelAreaM2?: number;
};

// ---------------------------------------------------------------------------
// Projekt-formdata (wizard step 3)
// ---------------------------------------------------------------------------

export type ProjectData = {
  area?: string;
  floors?: string;
  budget?: string;
  timeline?: string;
  description?: string;
  inspirations?: string[];
};

// ---------------------------------------------------------------------------
// 5-fase arkitektur
// ---------------------------------------------------------------------------

export type PhaseName = "hus-dna" | "match" | "finans" | "engineering" | "udbud";

export type PhaseStatus = "locked" | "active" | "complete" | "error";

// ---------------------------------------------------------------------------
// Hus-DNA (Phase 1) — Lovable UI bruger disse felter
// ---------------------------------------------------------------------------

export type HusDna = {
  stil: string;
  bruttoareal: string;
  etager: string;
  tagform: string;
  energiklasse: string;
  saerligeKrav: string[];
  confidence: number; // 0-100
  kilde: "mock" | "anthropic";
};

// ---------------------------------------------------------------------------
// Byggeønske (Phase 1) — 22-trins guidet wizard
// ---------------------------------------------------------------------------

export type Byggeoenske = {
  // Trin 1-5: Grundlæggende
  byggetype?: "nybyg" | "tilbyg" | "ombyg";
  husstandsstoerrelse?: number;
  voksne?: number;
  boern?: number;
  livsfase?: "ung" | "etableret" | "senior";
  // Trin 6-10: Areal & rum
  oensketAreal?: number;
  antalEtager?: 1 | 1.5 | 2 | 3;
  antalSovevaerelser?: number;
  antalBadevaerelser?: number;
  hjemmekontor?: boolean;
  // Trin 11-15: Stil & arkitektur
  arkitektoniskStil?: "moderne" | "klassisk" | "skandinavisk" | "industriel" | "minimalistisk";
  tagform?: "fladt" | "saddeltag" | "valm" | "ensidig";
  facademateriale?: "tegl" | "trae" | "puds" | "metal" | "kombineret";
  vinduesandel?: "lille" | "mellem" | "stor";
  udeomraade?: "terrasse" | "have" | "altan" | "tagterrasse";
  // Trin 16-20: Bæredygtighed & teknik
  energiklasse?: "BR18" | "lavenergi" | "passiv" | "plusenergi";
  varmekilde?: "varmepumpe" | "fjernvarme" | "jordvarme" | "solvarme";
  solceller?: boolean;
  ventilation?: "naturlig" | "mekanisk" | "balanceret";
  ladestander?: boolean;
  // Trin 21-22: Budget & inspiration
  budget?: "under-3" | "3-5" | "5-8" | "8-12" | "over-12";
  inspirationsbilleder?: string[]; // signed URLs til visning (udløber efter 1t)
  inspirationsbilledePaths?: string[]; // Storage paths til URL-fornyelse (ARCH-174)
  // AI-design hero (cockpit)
  designDroem?: string;
  valgteDesignforslag?: string;
  genererededDesignforslag?: string[];
};

// ---------------------------------------------------------------------------
// Design placement (ARCH-179) — georefereret bygningsplacering fra korteditor
// ---------------------------------------------------------------------------

type GeoJsonPolygon = {
  type: "Polygon";
  coordinates: [number, number][][];
};

export type DesignPlacement = {
  footprintGeojson: GeoJsonPolygon | null; // WGS84 — gemmes som JSONB i design_iterations
  footprintAreaM2: number | null; // beregnet fra polygon via @turf/area
  centroid: { lat: number; lng: number } | null;
  rotationDeg: number; // 0–360, nord = 0
  floors: number | null; // override af newBuilding.storeys
  heightM: number | null; // override af newBuilding.heightM
  minDistanceToBoundaryM: number | null; // korteste afstand til parcelgrænse (m)
  outsideParcelAreaM2: number; // > 0 = bygning overlapper skel (hard stop)
  source: "user" | "generated";
};

// ---------------------------------------------------------------------------
// Hus-DNA (afledt af Byggeønske via AI)
// ---------------------------------------------------------------------------

export type ComplianceFlag = {
  id: string;
  label: string;
  status: "ok" | "advarsel" | "blocker";
  detalje: string | null;
  aktuelVærdi: string | null;
  tilladt: string | null;
  kilde:
    | "bbr"
    | "plandata"
    | "servitut"
    | "beregnet"
    | "sdfi"
    | "dkjord"
    | "geus"
    | "regelkerne"
    | "fbb";
  dispensationMulig?: boolean;
  dispensationMyndighed?: string;
};

// ---------------------------------------------------------------------------
// ARCH-124: Boligoensker valideringsstatus
// ---------------------------------------------------------------------------

export type BoligoenskeValidering = {
  etagerStatus: "ok" | "dispensation" | "ingen_data";
  arealStatus: "ok" | "dispensation" | "ingen_data";
  beregnetBebyggelsespct: number | null;
  etagerDispensationAcknowledged: boolean;
  arealDispensationAcknowledged: boolean;
};

// ---------------------------------------------------------------------------
// Datakilde-status — bruges af cockpittet til at vise hvilke kilder der er
// friske, forældede, manglende eller under genindlæsning, og til at tilbyde
// manuel refresh pr. kilde.
// ---------------------------------------------------------------------------

export type DataSourceStatus = "fresh" | "stale" | "missing" | "loading" | "error";

export type DataSourceKind =
  | "bbr"
  | "lokalplaner"
  | "kommuneplanramme"
  | "fbb"
  | "naturbeskyttelse"
  | "geusRisk"
  | "servitutter"
  | "terrain"
  | "fjernvarme"
  | "naboer"
  | "vurdering"
  | "byggeanalyse"
  | "billedanalyse"
  | "husDna";

export const DATA_SOURCE_LABELS: Record<DataSourceKind, string> = {
  bbr: "BBR & matrikel",
  lokalplaner: "Lokalplaner",
  kommuneplanramme: "Kommuneplanramme",
  fbb: "SAVE & fredning (FBB)",
  naturbeskyttelse: "Naturbeskyttelse",
  geusRisk: "Geoteknisk risiko",
  servitutter: "Servitutter",
  terrain: "Terræn (DHM)",
  fjernvarme: "Fjernvarme",
  naboer: "Nabobygninger",
  vurdering: "Ejendomsvurdering",
  byggeanalyse: "AI byggeanalyse",
  billedanalyse: "AI billedanalyse",
  husDna: "Hus-DNA",
};

const DEFAULT_DATA_STATUS: Record<DataSourceKind, DataSourceStatus> = {
  bbr: "missing",
  lokalplaner: "missing",
  kommuneplanramme: "missing",
  fbb: "missing",
  naturbeskyttelse: "missing",
  geusRisk: "missing",
  servitutter: "missing",
  terrain: "missing",
  fjernvarme: "missing",
  naboer: "missing",
  vurdering: "missing",
  byggeanalyse: "missing",
  billedanalyse: "missing",
  husDna: "missing",
};

// ---------------------------------------------------------------------------
// Store state
// ---------------------------------------------------------------------------

type State = {
  // Eksisterende felter (backward compatible)
  address: Address | null;
  bbrData: BbrKompliantData | null;
  complianceDone: boolean;
  project: ProjectData;
  briefDone: boolean;

  // 5-fase arkitektur
  phases: Record<PhaseName, PhaseStatus>;
  husDna: HusDna | null;
  byggeoenske: Byggeoenske;
  byggeanalyseResultat: import("@/integrations/ai/byggeanalyse").ByggeanalyseResultat | null;
  billedanalyse: import("@/lib/billede-analyse-vocabulary").BilledeAnalyseResultat | null;
  complianceFlags: ComplianceFlag[];
  complianceMetrics: ComplianceMetrics | null;
  lokalplaner: Lokalplan[];
  lokalplanExtract: LokalplanExtract | null;
  kommuneplanramme: Kommuneplanramme | null;
  vurderingData: VurData | null;

  // ARCH-121: tidlig compliance-gate
  adressePreCheck: AdressePreCheckResultat | null;

  // ARCH-124: inline validering mod plangrænser i boligoensker-flow
  boligoenskeValidering: BoligoenskeValidering | null;

  // ARCH-130: aktiv Supabase-projekt-id — sørger for korrekt dataadskillelse ved flere projekter
  currentProjectId: string | null;

  // AI-gatekeeper: HusDnaGeneratorService genkaldes kun hvis disse felter ændres
  _lastHusDnaInput: { billedUrls: string[]; arkitektoniskStil: string | undefined } | null;

  // ARCH-179: bygningsplacering fra korteditor — separat slice, ikke del af Byggeoenske
  designPlacement: DesignPlacement | null;

  // ARCH-160: typede SSOT-felter fra Supabase typed kolonner — ground truth ved restore
  heritage_save_value: number | null; // FBB SAVE 1–9
  is_fredet: boolean | null; // DAI WFS kanonisk kilde
  grundareal_m2: number | null; // MAT via BBR
  bebygget_areal_m2: number | null; // BBR bebygget areal
  hard_stop: boolean; // aggregeret bloker-flag
  hard_stop_reason: string | null; // menneskelæsbar årsag
  budget_estimate: number | null; // ARCH-163: projektbudget estimat
  bfe_nr: string | null; // BFE-nummer (Bestemt Fast Ejendom) via EBR

  // Datakilde-status — bruges af cockpittet til at vise fresh/stale/missing
  // pr. kilde og tilbyde manuel genindlæsning. Status er afledt — gemmes IKKE
  // i DB; den beregnes ved restore baseret på om feltet findes + updated_at.
  dataStatus: Record<DataSourceKind, DataSourceStatus>;
  dataLastFetchedAt: string | null; // projects.updated_at fra seneste restore

  // Setters — eksisterende
  setAddress: (a: Address | null) => void;
  setBbrData: (d: BbrKompliantData | null) => void;
  setComplianceDone: (v: boolean) => void;
  setProject: (p: Partial<ProjectData>) => void;
  setBriefDone: (v: boolean) => void;

  // Setters — nye
  setPhase: (phase: PhaseName, status: PhaseStatus) => void;
  setHusDna: (dna: HusDna | null) => void;
  setByggeoenske: (b: Partial<Byggeoenske>) => void;
  setByggeanalyseResultat: (
    r: import("@/integrations/ai/byggeanalyse").ByggeanalyseResultat | null,
  ) => void;
  setBilledanalyse: (
    r: import("@/lib/billede-analyse-vocabulary").BilledeAnalyseResultat | null,
  ) => void;
  resetByggeoenske: () => void;
  setComplianceFlags: (flags: ComplianceFlag[]) => void;
  setComplianceMetrics: (m: ComplianceMetrics | null) => void;
  setLokalplaner: (lp: Lokalplan[]) => void;
  setLokalplanExtract: (extract: LokalplanExtract | null) => void;
  setKommuneplanramme: (ramme: Kommuneplanramme | null) => void;
  setVurderingData: (v: VurData | null) => void;
  setAdressePreCheck: (v: AdressePreCheckResultat | null) => void;
  setBoligoenskeValidering: (v: BoligoenskeValidering | null) => void;
  setCurrentProjectId: (id: string | null) => void;

  setLastHusDnaInput: (
    v: { billedUrls: string[]; arkitektoniskStil: string | undefined } | null,
  ) => void;
  setDesignPlacement: (p: DesignPlacement | null) => void;
  setHeritageSaveValue: (v: number | null) => void;
  setIsFredet: (v: boolean | null) => void;
  setGrundareal: (v: number | null) => void;
  setBebyggetAreal: (v: number | null) => void;
  setHardStop: (v: boolean, reason: string | null) => void;
  setBudgetEstimate: (v: number | null) => void;
  setBfeNr: (v: string | null) => void;

  reset: () => void;
};

const DEFAULT_PHASES: Record<PhaseName, PhaseStatus> = {
  "hus-dna": "active",
  match: "locked",
  finans: "locked",
  engineering: "locked",
  udbud: "locked",
};

export const useProject = create<State>((set) => ({
  address: null,
  bbrData: null,
  complianceDone: false,
  project: {},
  briefDone: false,
  phases: { ...DEFAULT_PHASES },
  husDna: null,
  byggeoenske: {},
  byggeanalyseResultat: null,
  billedanalyse: null,
  complianceFlags: [],
  complianceMetrics: null,
  lokalplaner: [],
  lokalplanExtract: null,
  kommuneplanramme: null,
  vurderingData: null,
  adressePreCheck: null,
  boligoenskeValidering: null,
  currentProjectId: null,

  _lastHusDnaInput: null,
  designPlacement: null,
  heritage_save_value: null,
  is_fredet: null,
  grundareal_m2: null,
  bebygget_areal_m2: null,
  hard_stop: false,
  hard_stop_reason: null,
  budget_estimate: null,
  bfe_nr: null,

  setAddress: (address) => set({ address }),
  setBbrData: (bbrData) => set({ bbrData }),
  setComplianceDone: (v) => set({ complianceDone: v }),
  setProject: (p) => set((s) => ({ project: { ...s.project, ...p } })),
  setBriefDone: (v) => set({ briefDone: v }),
  setPhase: (phase, status) => set((s) => ({ phases: { ...s.phases, [phase]: status } })),
  setHusDna: (husDna) => set({ husDna }),
  setByggeoenske: (b) => set((s) => ({ byggeoenske: { ...s.byggeoenske, ...b } })),
  setByggeanalyseResultat: (byggeanalyseResultat) => set({ byggeanalyseResultat }),
  setBilledanalyse: (billedanalyse) => set({ billedanalyse }),
  resetByggeoenske: () => set({ byggeoenske: {} }),
  setComplianceFlags: (complianceFlags) => set({ complianceFlags }),
  setComplianceMetrics: (complianceMetrics) => set({ complianceMetrics }),
  setLokalplaner: (lokalplaner) => set({ lokalplaner }),
  setLokalplanExtract: (lokalplanExtract) => set({ lokalplanExtract }),
  setKommuneplanramme: (kommuneplanramme) => set({ kommuneplanramme }),
  setVurderingData: (vurderingData) => set({ vurderingData }),
  setAdressePreCheck: (adressePreCheck) => set({ adressePreCheck }),
  setBoligoenskeValidering: (boligoenskeValidering) => set({ boligoenskeValidering }),
  setCurrentProjectId: (currentProjectId) => set({ currentProjectId }),

  setLastHusDnaInput: (_lastHusDnaInput) => set({ _lastHusDnaInput }),
  setDesignPlacement: (designPlacement) => set({ designPlacement }),
  setHeritageSaveValue: (heritage_save_value) => set({ heritage_save_value }),
  setIsFredet: (is_fredet) => set({ is_fredet }),
  setGrundareal: (grundareal_m2) => set({ grundareal_m2 }),
  setBebyggetAreal: (bebygget_areal_m2) => set({ bebygget_areal_m2 }),
  setHardStop: (hard_stop, hard_stop_reason) => set({ hard_stop, hard_stop_reason }),
  setBudgetEstimate: (budget_estimate) => set({ budget_estimate }),
  setBfeNr: (bfe_nr) => set({ bfe_nr }),

  reset: () =>
    set({
      address: null,
      bbrData: null,
      complianceDone: false,
      project: {},
      briefDone: false,
      phases: { ...DEFAULT_PHASES },
      husDna: null,
      byggeoenske: {},
      byggeanalyseResultat: null,
      billedanalyse: null,
      complianceFlags: [],
      complianceMetrics: null,
      lokalplaner: [],
      lokalplanExtract: null,
      kommuneplanramme: null,
      vurderingData: null,
      adressePreCheck: null,
      boligoenskeValidering: null,
      currentProjectId: null,
      _lastHusDnaInput: null,
      designPlacement: null,
      heritage_save_value: null,
      is_fredet: null,
      grundareal_m2: null,
      bebygget_areal_m2: null,
      hard_stop: false,
      hard_stop_reason: null,
      budget_estimate: null,
      bfe_nr: null,
    }),
}));

// ---------------------------------------------------------------------------
// Type guards — bruges i __root.tsx til sikker restore fra Supabase JSONB
// ---------------------------------------------------------------------------

export function isHusDna(v: unknown): v is HusDna {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as Record<string, unknown>).stil === "string" &&
    typeof (v as Record<string, unknown>).confidence === "number"
  );
}

type ParsedComplianceData = {
  bbr: BbrKompliantData | null;
  flags: ComplianceFlag[];
  lokalplaner: Lokalplan[];
  kommuneplanramme: Kommuneplanramme | null;
  byggeanalyseResultat: import("@/integrations/ai/byggeanalyse").ByggeanalyseResultat | null;
  vurderingData: VurData | null;
};

export function parseComplianceData(v: unknown): ParsedComplianceData | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  return {
    bbr: (typeof o.bbr === "object" ? o.bbr : null) as BbrKompliantData | null,
    flags: Array.isArray(o.flags) ? (o.flags as ComplianceFlag[]) : [],
    lokalplaner: Array.isArray(o.lokalplaner) ? (o.lokalplaner as Lokalplan[]) : [],
    kommuneplanramme: (typeof o.kommuneplanramme === "object"
      ? o.kommuneplanramme
      : null) as Kommuneplanramme | null,
    byggeanalyseResultat: (typeof o.byggeanalyseResultat === "object"
      ? o.byggeanalyseResultat
      : null) as import("@/integrations/ai/byggeanalyse").ByggeanalyseResultat | null,
    vurderingData: (typeof o.vurderingData === "object" ? o.vurderingData : null) as VurData | null,
  };
}

// ---------------------------------------------------------------------------
// Hjælpefunktion: udled ComplianceFlags fra BBR + Kommuneplanramme
// ---------------------------------------------------------------------------

export function deriveComplianceFlags(
  bbr: BbrKompliantData | null,
  ramme: Kommuneplanramme | null,
  naturbeskyttelse?: NaturbeskyttelsesResultat | null,
  dkjord?: DkJordResultat | null,
  geusRisk?: GeusRiskData | null,
  ruleEngine?: RuleEngineResult | null,
  fjernvarme?: FjernvarmeResultat | null,
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
    const linjer: Array<{ key: keyof NaturbeskyttelsesResultat; label: string; detalje: string }> =
      [
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

  // ── DK-Jord forurening (ARCH-66) ───────────────────────────────��────────
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

    for (const violation of ruleEngine.violations) {
      // Beregningsregler duplikerer eksisterende BBR-flags — skip dem
      if (
        (violation.rule === "bebyggelsesprocent" && existingIds.has("bebyggelsesprocent")) ||
        (violation.rule === "etager" && existingIds.has("etager")) ||
        (violation.rule === "bygningshøjde" && existingIds.has("bygningshoejde"))
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
