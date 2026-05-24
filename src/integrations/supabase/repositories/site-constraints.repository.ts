// SERVER-SIDE ONLY.
// Pure derivation of site_constraints patch + Supabase upsert.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import type { ProjectPatch } from "@/integrations/supabase/project-persistence";
import { logServerEvent } from "@/lib/server-logger";
import { recordAnalysisEvent, type AnalysisTraceContext } from "@/lib/analysis-tracing";
import {
  deriveSiteConstraintsPatch as deriveSiteConstraintsPatchPure,
  deriveSoilContaminationStatus as deriveSoilContaminationStatusPure,
} from "./site-constraints.derivation";

type SiteConstraintsUpsert = Database["public"]["Tables"]["site_constraints"]["Insert"];
type ProjectUpdate = Database["public"]["Tables"]["projects"]["Update"];

export function deriveSiteConstraintsPatch(
  addressId: string | null,
  patch: ProjectPatch,
  update: ProjectUpdate,
): SiteConstraintsUpsert | null {
  return deriveSiteConstraintsPatchPure(addressId, patch, update);
}

export const deriveSoilContaminationStatus = deriveSoilContaminationStatusPure;

export async function syncSiteConstraints(
  sitePatch: SiteConstraintsUpsert,
  trace: AnalysisTraceContext | null,
): Promise<void> {
  const startedAt = Date.now();
  const { error } = await supabaseAdmin
    .from("site_constraints")
    .upsert(sitePatch, { onConflict: "address_id" });

  await recordAnalysisEvent(trace, {
    eventType: "db_write",
    phase: "persistence",
    service: "Supabase",
    operation: "site_constraints.upsert",
    status: error ? "error" : "ok",
    durationMs: Date.now() - startedAt,
    errorMessage: error?.message,
    metadata: {
      table: "site_constraints",
      address_id: sitePatch.address_id,
      fields: Object.keys(sitePatch),
    },
  });

  if (error) {
    logServerEvent({
      module: "site-constraints.repository",
      operation: "syncSiteConstraints",
      severity: "degraded",
      message: "site_constraints sync fejlede",
      error: error.message,
      trace,
    });
  }
}

export type SiteConstraintsSnapshot = {
  save_value: number | null;
  is_fredet: boolean | null;
  strandbeskyttelse: boolean;
  fredskov: boolean;
  klitfredning: boolean;
};

export async function getSiteConstraints(
  addressId: string,
): Promise<SiteConstraintsSnapshot | null> {
  const { data, error } = await supabaseAdmin
    .from("site_constraints")
    .select("save_value, is_fredet, strandbeskyttelse, fredskov, klitfredning")
    .eq("address_id", addressId)
    .maybeSingle();

  if (error) {
    logServerEvent({
      module: "site-constraints.repository",
      operation: "getSiteConstraints",
      severity: "degraded",
      message: "select site_constraints fejlede",
      error: error.message,
      trace: null,
    });
    return null;
  }

  if (!data) return null;

  return {
    save_value: data.save_value,
    is_fredet: data.is_fredet,
    strandbeskyttelse: data.strandbeskyttelse ?? false,
    fredskov: data.fredskov ?? false,
    klitfredning: data.klitfredning ?? false,
  };
}
