import { useProject } from "@/lib/project-store";

export type PhaseStatus = "complete" | "active" | "warning" | "missing" | "locked" | "error";

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

/**
 * Status-indicators (Cockpit-paradigme):
 *   complete = grøn (data OK)
 *   warning  = gul (data hentet men advarsler/blockers)
 *   missing  = grå (data ikke hentet endnu)
 *   active   = nuværende fase
 *
 * Når en adresse er valgt er ALLE faser klikbare (cockpit-navigation, ikke wizard-låse).
 */
export function usePhaseStates(currentPath: string): PhaseStateMap {
  const { address, husDna, complianceDone, bbrData, complianceFlags } = useProject();

  const hasBlockers = complianceFlags.some((f) => f.status === "blocker");
  const hasWarnings = complianceFlags.some((f) => f.status === "advarsel");

  const statuses: Record<PhaseId, PhaseStatus> = {
    1: address ? (husDna ? "complete" : "warning") : "missing",
    2: complianceDone && bbrData
      ? hasBlockers
        ? "warning"
        : hasWarnings
          ? "warning"
          : "complete"
      : address
        ? "missing"
        : "missing",
    3: "missing",
    4: "missing",
    5: "missing",
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
