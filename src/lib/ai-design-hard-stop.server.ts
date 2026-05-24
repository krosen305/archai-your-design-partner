import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { evaluateHardStop } from "@/lib/rule-engine/hard-stop-adapter";

export type HardStopCheckResult = { blocked: boolean; reason: string | null };

async function resolveHardStopFromConstraints(addressId: string): Promise<HardStopCheckResult> {
  const { data: sc } = await supabaseAdmin
    .from("site_constraints")
    .select("save_value, is_fredet, strandbeskyttelse, fredskov, klitfredning")
    .eq("address_id", addressId)
    .single();

  if (!sc) {
    return { blocked: false, reason: null };
  }

  const { hardStop, hardStopReason } = evaluateHardStop({
    saveValue: sc.save_value,
    isFredet: sc.is_fredet,
    strandbeskyttelse: sc.strandbeskyttelse,
    fredskov: sc.fredskov,
    klitfredning: sc.klitfredning,
  });

  return { blocked: hardStop, reason: hardStopReason };
}

/**
 * Loads compliance state from Supabase and evaluates the hard-stop gate.
 * Exported for unit testing — do not call from client code.
 *
 * Resolution order:
 *   1. projectId → load projects row, verify ownership, check hard_stop column
 *      If hard_stop is null → fall through to site_constraints lookup
 *   2. addressId (or as fallback) → load site_constraints, run evaluateHardStop
 */
export async function resolveHardStop(params: {
  projectId: string | undefined;
  addressId: string | undefined;
  userId: string;
}): Promise<HardStopCheckResult> {
  const { projectId, addressId, userId } = params;

  if (projectId) {
    const { data: project, error } = await supabaseAdmin
      .from("projects")
      .select("user_id, hard_stop, hard_stop_reason, address_adresseid")
      .eq("id", projectId)
      .single();

    if (error || !project) {
      throw new Error("Projekt ikke fundet.");
    }

    if (project.user_id !== userId) {
      throw new Error("Adgang nægtet: projektet tilhører ikke den aktuelle bruger.");
    }

    if (project.hard_stop === true) {
      return { blocked: true, reason: project.hard_stop_reason ?? "Aktive compliance-stop." };
    }

    const lookupId = project.address_adresseid ?? addressId;
    if (lookupId) {
      const constraintResult = await resolveHardStopFromConstraints(lookupId);
      if (constraintResult.blocked) {
        return constraintResult;
      }
    }

    return { blocked: false, reason: null };
  }

  if (addressId) {
    return resolveHardStopFromConstraints(addressId);
  }

  throw new Error("Enten projectId eller addressId er påkrævet.");
}
