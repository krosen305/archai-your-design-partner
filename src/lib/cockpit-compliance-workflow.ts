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
  | { status: "auth_error"; message: string };

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
