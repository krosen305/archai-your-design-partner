import { create } from "zustand";
import type { BbrKompliantData } from "@/integrations/bbr/client";
import type { Kommuneplanramme } from "@/integrations/plandata/client";

// ---------------------------------------------------------------------------
// Adresse
// ---------------------------------------------------------------------------

export type Address = {
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
// Hus-DNA (Phase 1)
// ---------------------------------------------------------------------------

export type HusDna = {
  stil: string[];
  materialer: string[];
  taghældning: string | null;
  særligeKendetegn: string[];
  confidence: number;
  kilde: "mock" | "anthropic";
};

// ---------------------------------------------------------------------------
// Compliance flags (Phase 2 — Match-rapport)
// ---------------------------------------------------------------------------

export type ComplianceFlag = {
  id: string;
  label: string;
  status: "ok" | "advarsel" | "blocker";
  detalje: string | null;
  aktuelVærdi: string | null;
  tilladt: string | null;
  kilde: "bbr" | "plandata" | "servitut" | "beregnet";
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
  complianceFlags: ComplianceFlag[];

  // Setters — eksisterende
  setAddress: (a: Address) => void;
  setBbrData: (d: BbrKompliantData | null) => void;
  setComplianceDone: (v: boolean) => void;
  setProject: (p: Partial<ProjectData>) => void;
  setBriefDone: (v: boolean) => void;

  // Setters — nye
  setPhase: (phase: PhaseName, status: PhaseStatus) => void;
  setHusDna: (dna: HusDna | null) => void;
  setComplianceFlags: (flags: ComplianceFlag[]) => void;

  reset: () => void;
};

const DEFAULT_PHASES: Record<PhaseName, PhaseStatus> = {
  "hus-dna": "active",
  "match": "locked",
  "finans": "locked",
  "engineering": "locked",
  "udbud": "locked",
};

export const useProject = create<State>((set) => ({
  address: null,
  bbrData: null,
  complianceDone: false,
  project: {},
  briefDone: false,
  phases: { ...DEFAULT_PHASES },
  husDna: null,
  complianceFlags: [],

  setAddress: (address) => set({ address }),
  setBbrData: (bbrData) => set({ bbrData }),
  setComplianceDone: (v) => set({ complianceDone: v }),
  setProject: (p) => set((s) => ({ project: { ...s.project, ...p } })),
  setBriefDone: (v) => set({ briefDone: v }),
  setPhase: (phase, status) =>
    set((s) => ({ phases: { ...s.phases, [phase]: status } })),
  setHusDna: (husDna) => set({ husDna }),
  setComplianceFlags: (complianceFlags) => set({ complianceFlags }),

  reset: () =>
    set({
      address: null,
      bbrData: null,
      complianceDone: false,
      project: {},
      briefDone: false,
      phases: { ...DEFAULT_PHASES },
      husDna: null,
      complianceFlags: [],
    }),
}));

// ---------------------------------------------------------------------------
// Hjælpefunktion: udled ComplianceFlags fra BBR + Kommuneplanramme
// ---------------------------------------------------------------------------

export function deriveComplianceFlags(
  bbr: BbrKompliantData | null,
  ramme: Kommuneplanramme | null
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
      status: max === null ? "advarsel" : pct > max ? "blocker" : pct > max * 0.9 ? "advarsel" : "ok",
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

  // Lokalplan-zone (altid tilføjet som info hvis kommuneplanramme eksisterer)
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

  return flags;
}
