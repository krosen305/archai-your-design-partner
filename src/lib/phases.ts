import { useProject } from "@/lib/project-store";

export type PhaseStatus = "complete" | "active" | "locked" | "error";

export type PhaseId = 1 | 2 | 3 | 4;

export type Phase = {
  id: PhaseId;
  label: string;
  shortLabel: string;
  route: string;
  description: string;
};

export const PHASES: Phase[] = [
  {
    id: 1,
    label: "GRUNDLAGET",
    shortLabel: "Grundlaget",
    route: "/projekt/adresse",
    description: "Adresse & ejendomsdata",
  },
  {
    id: 2,
    label: "COCKPIT",
    shortLabel: "Cockpit",
    route: "/projekt/cockpit",
    description: "Analyse, design & økonomi",
  },
  {
    id: 3,
    label: "TEKNIK",
    shortLabel: "Teknik",
    route: "/projekt/teknik",
    description: "BR18 & statik",
  },
  {
    id: 4,
    label: "UDBUD",
    shortLabel: "Udbud",
    route: "/projekt/udbud",
    description: "Udbud & kontrakt",
  },
];

const PHASE_1_ROUTES = ["/projekt/start", "/projekt/adresse"];

/** Hvilken fase en given route hører til (null hvis ingen). */
export function phaseForRoute(pathname: string): PhaseId | null {
  if (PHASE_1_ROUTES.includes(pathname)) return 1;
  if (/^\/projekt\/[^/]+\/cockpit$/.test(pathname)) return 2;
  if (pathname === "/projekt/teknik") return 3;
  if (pathname === "/projekt/udbud") return 4;
  return null;
}

export type PhaseStateMap = Record<PhaseId, PhaseStatus>;

export function usePhaseStates(currentPath: string): PhaseStateMap {
  const { address, husDna, complianceDone, bbrData } = useProject();

  const completed: Record<PhaseId, boolean> = {
    1: !!address && !!husDna,
    2: complianceDone && !!bbrData,
    3: false,
    4: false,
  };

  const activePhase = phaseForRoute(currentPath);

  const map = {} as PhaseStateMap;
  for (const p of PHASES) {
    if (activePhase === p.id) {
      map[p.id] = "active";
    } else if (completed[p.id]) {
      map[p.id] = "complete";
    } else {
      map[p.id] = "locked";
    }
  }
  return map;
}

/** Sub-keys vist i sidebar pr. fase. */
export function usePhaseSubKeys(): Record<PhaseId, { label: string; value: string }[]> {
  const { address, husDna, bbrData } = useProject();
  return {
    1: [
      { label: "Adresse", value: address?.adresse?.split(",")[0] ?? "—" },
      { label: "Ejendom", value: bbrData ? "Hentet" : "—" },
    ],
    2: [
      { label: "BBR", value: bbrData ? "Hentet" : "—" },
      { label: "Lokalplan", value: bbrData ? "Tjekket" : "—" },
      { label: "Byggeønske", value: husDna ? "Udfyldt" : "—" },
    ],
    3: [],
    4: [],
  };
}
