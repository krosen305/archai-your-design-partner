import { create } from "zustand";

export type Address = {
  adresse: string;
  postnr: string;
  kommune: string;
  matrikel: string | null;
  bbrId: string | null;
  byggeaar?: string;
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
  complianceDone: boolean;
  project: ProjectData;
  briefDone: boolean;
  setAddress: (a: Address) => void;
  setComplianceDone: (v: boolean) => void;
  setProject: (p: Partial<ProjectData>) => void;
  setBriefDone: (v: boolean) => void;
  reset: () => void;
};

export const useProject = create<State>((set) => ({
  address: null,
  complianceDone: false,
  project: {},
  briefDone: false,
  setAddress: (address) => set({ address }),
  setComplianceDone: (v) => set({ complianceDone: v }),
  setProject: (p) => set((s) => ({ project: { ...s.project, ...p } })),
  setBriefDone: (v) => set({ briefDone: v }),
  reset: () =>
    set({ address: null, complianceDone: false, project: {}, briefDone: false }),
}));
