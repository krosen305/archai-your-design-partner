import type { Session } from "@supabase/supabase-js";
import { fetchCompliance } from "@/lib/cockpit.functions";
import type { ComplianceResult } from "@/lib/analysis-orchestrator";
import type { Address } from "@/types/project-state";

export type CockpitComplianceWorkflowDeps = {
  fetchCompliance: typeof fetchCompliance;
  getSession: () => Promise<Session | null>;
  isGuest: () => boolean;
};

export type CockpitComplianceWorkflowResult =
  | { status: "ok"; result: ComplianceResult }
  | { status: "auth_error"; message: string }
  | { status: "missing_project" };

export async function runCockpitComplianceWorkflow(
  params: {
    address: Address;
    projectId?: string | null;
  },
  deps: CockpitComplianceWorkflowDeps,
): Promise<CockpitComplianceWorkflowResult> {
  const session = await deps.getSession();

  if (!session) {
    return {
      status: "auth_error",
      message: deps.isGuest()
        ? "Start fra adresse-trinnet som gaest for at hente grunddata."
        : "Login kraevet - log ind for at hente analyse.",
    };
  }

  // Stale-tab beskyttelse: kun logget-ind brugere med et etableret projekt
  // skal trigge en analyse. Uden projectId betyder det at URL'en blev åbnet
  // uden et samtidigt brugervalg — typisk en gammel fane med en cockpit-URL
  // peget på en adresse vi ikke har data for. Lad caller redirecte til
  // /projekt/adresse i stedet for at brænde Datafordeler-kald.
  if (!params.projectId) {
    return { status: "missing_project" };
  }

  const result = await deps.fetchCompliance({
    data: {
      addressId: params.address.adresseid,
      adgangsadresseid: params.address.adgangsadresseid,
      ejerlavskode: params.address.ejerlavskode ?? null,
      matrikelnummer: params.address.matrikelnummer ?? null,
      koordinater: params.address.koordinater ?? null,
      grundareal: params.address.grundareal ?? null,
      projectId: params.projectId,
      token: session.access_token,
    },
  });

  return { status: "ok", result };
}
