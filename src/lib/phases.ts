import { useProject } from "@/lib/project-store";

export type PhaseStatus = "complete" | "active" | "warning" | "missing" | "locked" | "error";

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
    label: "SANDKASSEN",
    shortLabel: "Sandkassen",
    route: "/projekt/start",
    description: "Inspiration, ønsker og Hus-DNA",
  },
  {
    id: 2,
    label: "MATRIKLEN",
    shortLabel: "Matriklen",
    route: "/projekt/adresse",
    description: "Adresse, plot og ejendomsdata",
  },
  {
    id: 3,
    label: "MASKINRUMMET",
    shortLabel: "Maskinrummet",
    route: "/projekt/cockpit",
    description: "Analyse, design og økonomi",
  },
  {
    id: 4,
    label: "MYNDIGHED",
    shortLabel: "Myndighed",
    route: "/projekt/teknik",
    description: "Ansøgning, teknik og dokumentation",
  },
];

const PHASE_1_ROUTES = ["/projekt/start"];

/** Hvilken fase en given route hører til (null hvis ingen). */
export function phaseForRoute(pathname: string): PhaseId | null {
  if (PHASE_1_ROUTES.includes(pathname)) return 1;
  if (pathname === "/projekt/adresse") return 2;
  if (/^\/projekt\/[^/]+\/cockpit$/.test(pathname)) return 3;
  if (pathname === "/projekt/teknik" || pathname === "/projekt/udbud") return 4;
  return null;
}

export type PhaseStateMap = Record<PhaseId, PhaseStatus>;

/**
 * Status indicators for the current product navigation.
 * This is still a UI read model, but now aligned to the canonical phase names.
 */
export function usePhaseStates(currentPath: string): PhaseStateMap {
  const { address, husDna, complianceDone, bbrData, complianceFlags } = useProject();

  const hasBlockers = complianceFlags.some((f) => f.status === "blocker");
  const hasWarnings = complianceFlags.some((f) => f.status === "advarsel");

  const statuses: Record<PhaseId, PhaseStatus> = {
    1: husDna ? "complete" : address ? "warning" : "missing",
    2: address ? (bbrData ? "complete" : "warning") : "missing",
    3:
      complianceDone && bbrData
        ? hasBlockers
          ? "warning"
          : hasWarnings
            ? "warning"
            : "complete"
        : address
          ? "missing"
          : "missing",
    4: "missing",
  };

  const activePhase = phaseForRoute(currentPath);
  const map = {} as PhaseStateMap;
  for (const p of PHASES) {
    map[p.id] = activePhase === p.id ? "active" : statuses[p.id];
  }
  return map;
}

/** Når en adresse er valgt, er alle faser klikbare. */
export function usePhaseClickable(): boolean {
  const { address } = useProject();
  return !!address;
}

/** Sub-keys vist i sidebar pr. fase. */
export function usePhaseSubKeys(): Record<PhaseId, { label: string; value: string }[]> {
  const { address, husDna, bbrData } = useProject();
  return {
    1: [{ label: "Hus-DNA", value: husDna ? "Udfyldt" : "—" }],
    2: [
      { label: "Adresse", value: address?.adresse?.split(",")[0] ?? "—" },
      { label: "Ejendom", value: bbrData ? "Hentet" : "—" },
    ],
    3: [
      { label: "BBR", value: bbrData ? "Hentet" : "—" },
      { label: "Lokalplan", value: bbrData ? "Tjekket" : "—" },
      { label: "Byggeønske", value: husDna ? "Påbegyndt" : "—" },
    ],
    4: [],
  };
}
