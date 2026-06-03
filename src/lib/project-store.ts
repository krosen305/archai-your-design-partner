import { create } from "zustand";
import type { FjernvarmeResultat, VurData } from "@/domain/contracts/analysis.types";
import type {
  RuleEngineBbrData,
  RuleEngineKommuneplanramme,
  RuleEngineLokalplan,
  RuleEnginePlandataContext,
  RuleEngineArealdataContext,
  MatParcelGeometryPayload,
} from "@/domain/contracts/rule-engine.types";
import type { TjekditnetCoverageData } from "@/integrations/tjekditnet/client";
import type { EnergyLabelData } from "@/integrations/energimaerke/client";
import type { LokalplanExtract } from "@/integrations/ai/pdf-extractor";
import type { RuleEngineResult } from "@/lib/rule-engine/types";
import type { ComplianceMetrics } from "@/lib/compliance-engine";
import type {
  Address,
  ProjectData,
  PhaseName,
  PhaseStatus,
  HusDna,
  Byggeoenske,
  DesignPlacement,
  ComplianceFlag,
  BoligoenskeValidering,
  DataSourceStatus,
  DataSourceKind,
  PipelineServiceState,
  NeighborContextFacts,
} from "@/types/project-state";
export type {
  Address,
  ProjectData,
  PhaseName,
  PhaseStatus,
  HusDna,
  Byggeoenske,
  DesignPlacement,
  ComplianceFlag,
  BoligoenskeValidering,
  DataSourceStatus,
  DataSourceKind,
  PipelineServiceState,
  NeighborContextFacts,
} from "@/types/project-state";
export type { ByggeanalyseResultat } from "@/integrations/ai/byggeanalyse";
export type { ComplianceMetrics } from "@/lib/compliance-engine";

// ---------------------------------------------------------------------------
// Store state
// ---------------------------------------------------------------------------

type State = {
  // Eksisterende felter (backward compatible)
  address: Address | null;
  bbrData: RuleEngineBbrData | null;
  complianceDone: boolean;
  project: ProjectData;
  briefDone: boolean;

  // Kanoniske faser
  phases: Record<PhaseName, PhaseStatus>;
  husDna: HusDna | null;
  byggeoenske: Byggeoenske;
  byggeanalyseResultat: import("@/integrations/ai/byggeanalyse").ByggeanalyseResultat | null;
  billedanalyse: import("@/lib/billede-analyse-vocabulary").BilledeAnalyseResultat | null;
  complianceFlags: ComplianceFlag[];
  complianceMetrics: ComplianceMetrics | null;
  lokalplaner: RuleEngineLokalplan[];
  lokalplanExtract: LokalplanExtract | null;
  kommuneplanramme: RuleEngineKommuneplanramme | null;
  vurderingData: VurData | null;

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
  neighborContextFacts: NeighborContextFacts | null; // GeoDanmark typed nabofakta fra site_constraints

  // Datakilde-status — bruges af cockpittet til at vise fresh/stale/missing
  // pr. kilde og tilbyde manuel genindlæsning. Status er afledt — gemmes IKKE
  // i DB; den beregnes ved restore baseret på om feltet findes + updated_at.
  dataStatus: Record<DataSourceKind, DataSourceStatus>;
  dataLastFetchedAt: string | null; // projects.updated_at fra seneste restore

  // Pipeline-servicetilstand — hvad skete der da pipelinen senest kørte
  serviceStates: Partial<Record<DataSourceKind, PipelineServiceState>>;

  // Setters — eksisterende
  setAddress: (a: Address | null) => void;
  setBbrData: (d: RuleEngineBbrData | null) => void;
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
  setLokalplaner: (lp: RuleEngineLokalplan[]) => void;
  setLokalplanExtract: (extract: LokalplanExtract | null) => void;
  setKommuneplanramme: (ramme: RuleEngineKommuneplanramme | null) => void;
  setVurderingData: (v: VurData | null) => void;
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
  setNeighborContextFacts: (v: NeighborContextFacts | null) => void;

  setDataStatus: (kind: DataSourceKind, status: DataSourceStatus) => void;
  setDataStatusBulk: (patch: Partial<Record<DataSourceKind, DataSourceStatus>>) => void;
  setDataLastFetchedAt: (iso: string | null) => void;

  reset: () => void;
};

const DEFAULT_PHASES: Record<PhaseName, PhaseStatus> = {
  sandkassen: "active",
  matriklen: "locked",
  maskinrummet: "locked",
  myndighed: "locked",
};

const DEFAULT_DATA_STATUS: Record<DataSourceKind, DataSourceStatus> = {
  bbr: "missing",
  lokalplaner: "missing",
  kommuneplanramme: "missing",
  fbb: "missing",
  naturbeskyttelse: "missing",
  arealdata: "missing",
  dkjord: "missing",
  geusRisk: "missing",
  servitutter: "missing",
  terrain: "missing",
  fjernvarme: "missing",
  naboer: "missing",
  matGeometri: "missing",
  vurdering: "missing",
  byggeanalyse: "missing",
  billedanalyse: "missing",
  husDna: "missing",
  tjekditnet: "missing",
  energimaerke: "missing",
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
  neighborContextFacts: null,
  dataStatus: { ...DEFAULT_DATA_STATUS },
  dataLastFetchedAt: null,
  serviceStates: {},

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
  setNeighborContextFacts: (neighborContextFacts) => set({ neighborContextFacts }),

  setDataStatus: (kind, status) =>
    set((s) => ({ dataStatus: { ...s.dataStatus, [kind]: status } })),
  setDataStatusBulk: (patch) => set((s) => ({ dataStatus: { ...s.dataStatus, ...patch } })),
  setDataLastFetchedAt: (dataLastFetchedAt) => set({ dataLastFetchedAt }),

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
      neighborContextFacts: null,
      dataStatus: { ...DEFAULT_DATA_STATUS },
      dataLastFetchedAt: null,
      serviceStates: {},
    }),
}));
