import { create } from "zustand";
import type { BbrKompliantData } from "@/integrations/bbr/client";

export type Address = {
  adresse: string;
  postnr: string;
  postnrnavn: string;
  kommune: string;          // kommunenavn
  kommunekode: string;
  matrikel: string | null;
  adgangsadresseid: string; // påkrævet til BBR-opslag
  koordinater: { lat: number; lng: number };
  bbrId: string | null;
};

export type ProjectData = {
  area?: string;
  floors?: string;
  budget?: string;
  timeline?: string;
  description?: string;
  inspirations?: string[];
};

type State = {
  address: Address | null;
  bbrData: BbrKompliantData | null;
  complianceDone: boolean;
  project: ProjectData;
  briefDone: boolean;
  setAddress: (a: Address) => void;
  setBbrData: (d: BbrKompliantData | null) => void;
  setComplianceDone: (v: boolean) => void;
  setProject: (p: Partial<ProjectData>) => void;
  setBriefDone: (v: boolean) => void;
  reset: () => void;
};

export const useProject = create<State>((set) => ({
  address: null,
  bbrData: null,
  complianceDone: false,
  project: {},
  briefDone: false,
  setAddress: (address) => set({ address }),
  setBbrData: (bbrData) => set({ bbrData }),
  setComplianceDone: (v) => set({ complianceDone: v }),
  setProject: (p) => set((s) => ({ project: { ...s.project, ...p } })),
  setBriefDone: (v) => set({ briefDone: v }),
  reset: () =>
    set({
      address: null,
      bbrData: null,
      complianceDone: false,
      project: {},
      briefDone: false,
    }),
}));