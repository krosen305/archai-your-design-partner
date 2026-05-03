import { create } from "zustand";
import type { BbrKompliantData } from "@/integrations/bbr/client";
import type { Lokalplan, Kommuneplanramme } from "@/integrations/plandata/client";
import type { LokalplanExtract } from "@/integrations/ai/pdf-extractor";
import type { NaturbeskyttelsesResultat } from "@/integrations/sdfi/naturbeskyttelse";
import type { DkJordResultat } from "@/integrations/miljoe/dkjord";
export type { ByggeanalyseResultat } from "@/integrations/ai/byggeanalyse";

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
  inspirationsbilleder?: string[]; // Supabase Storage URLs
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
  kilde: "bbr" | "plandata" | "servitut" | "beregnet" | "sdfi" | "dkjord";
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
  complianceFlags: ComplianceFlag[];
  lokalplaner: Lokalplan[];
  lokalplanExtract: LokalplanExtract | null;
  kommuneplanramme: Kommuneplanramme | null;

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
  resetByggeoenske: () => void;
  setComplianceFlags: (flags: ComplianceFlag[]) => void;
  setLokalplaner: (lp: Lokalplan[]) => void;
  setLokalplanExtract: (extract: LokalplanExtract | null) => void;
  setKommuneplanramme: (ramme: Kommuneplanramme | null) => void;

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
  complianceFlags: [],
  lokalplaner: [],
  lokalplanExtract: null,
  kommuneplanramme: null,

  setAddress: (address) => set({ address }),
  setBbrData: (bbrData) => set({ bbrData }),
  setComplianceDone: (v) => set({ complianceDone: v }),
  setProject: (p) => set((s) => ({ project: { ...s.project, ...p } })),
  setBriefDone: (v) => set({ briefDone: v }),
  setPhase: (phase, status) => set((s) => ({ phases: { ...s.phases, [phase]: status } })),
  setHusDna: (husDna) => set({ husDna }),
  setByggeoenske: (b) => set((s) => ({ byggeoenske: { ...s.byggeoenske, ...b } })),
  setByggeanalyseResultat: (byggeanalyseResultat) => set({ byggeanalyseResultat }),
  resetByggeoenske: () => set({ byggeoenske: {} }),
  setComplianceFlags: (complianceFlags) => set({ complianceFlags }),
  setLokalplaner: (lokalplaner) => set({ lokalplaner }),
  setLokalplanExtract: (lokalplanExtract) => set({ lokalplanExtract }),
  setKommuneplanramme: (kommuneplanramme) => set({ kommuneplanramme }),

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
      complianceFlags: [],
      lokalplaner: [],
      lokalplanExtract: null,
      kommuneplanramme: null,
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
    if (dkjord.v2Kortlagt) {
      flags.push({
        id: "dkjord-v2",
        label: "V2-kortlagt grund",
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
        label: "V1-kortlagt grund",
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
        label: "Olietank registreret",
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
        label: "Områdeklassificering",
        status: "advarsel",
        detalje: "Krav om jordsundhedsattest ved jordflytning — kontakt kommunen",
        aktuelVærdi: dkjord.omraadeklassificering,
        tilladt: null,
        kilde: "dkjord",
      });
    }
  }

  return flags;
}
