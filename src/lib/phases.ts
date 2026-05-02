import { useProject } from "@/lib/project-store";

export type PhaseStatus = "complete" | "active" | "locked" | "error";

export type PhaseId = 1 | 2 | 3 | 4 | 5;

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
    description: "Adresse, byggeønske & ejendom",
  },
  {
    id: 2,
    label: "BYGGEANALYSE",
    shortLabel: "Byggeanalyse",
    route: "/projekt/byggeanalyse",
    description: "Lokalplan & krav",
  },
  {
    id: 3,
    label: "ØKONOMI",
    shortLabel: "Økonomi",
    route: "/projekt/oekonomi",
    description: "Bank & forsikring",
  },
  {
    id: 4,
    label: "TEKNIK",
    shortLabel: "Teknik",
    route: "/projekt/teknik",
    description: "BR18 & statik",
  },
  {
    id: 5,
    label: "UDBUD",
    shortLabel: "Udbud",
    route: "/projekt/udbud",
    description: "Udbud & kontrakt",
  },
];

const PHASE_1_ROUTES = [
  "/projekt/start",
  "/projekt/adresse",
  "/projekt/boligoenske",
  "/projekt/ejendom",
];

/** Hvilken fase en given route hører til (null hvis ingen). */
export function phaseForRoute(pathname: string): PhaseId | null {
  if (PHASE_1_ROUTES.includes(pathname)) return 1;
  if (pathname === "/projekt/byggeanalyse") return 2;
  if (pathname === "/projekt/oekonomi") return 3;
  if (pathname === "/projekt/teknik") return 4;
  if (pathname === "/projekt/udbud") return 5;
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
    5: false,
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
      { label: "Byggeønske", value: husDna ? "Udfyldt" : "—" },
      { label: "Ejendom", value: bbrData ? "Hentet" : "—" },
    ],
    2: [
      { label: "BBR", value: bbrData ? "Hentet" : "—" },
      { label: "Lokalplan", value: bbrData ? "Tjekket" : "—" },
    ],
    3: [],
    4: [],
    5: [],
  };
}
