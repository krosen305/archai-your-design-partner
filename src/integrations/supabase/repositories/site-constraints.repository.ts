// SERVER-SIDE ONLY.
// Pure derivation of site_constraints patch + Supabase upsert.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import type { NeighborContextFacts } from "@/domain/contracts/surroundings.types";
import type { ProjectPatch } from "@/integrations/supabase/project-persistence";
import { logServerEvent } from "@/lib/server-logger";
import { recordAnalysisEvent, type AnalysisTraceContext } from "@/lib/analysis-tracing";
import { z } from "zod";
import {
  deriveSiteConstraintsPatch as deriveSiteConstraintsPatchPure,
  deriveSoilContaminationStatus as deriveSoilContaminationStatusPure,
} from "./site-constraints.derivation";

type SiteConstraintsUpsert = Database["public"]["Tables"]["site_constraints"]["Insert"];
type ProjectUpdate = Database["public"]["Tables"]["projects"]["Update"];

const neighborContextFactsRowSchema = z.object({
  neighbor_building_count_40m: z.number().int().nonnegative().nullable(),
  neighbor_nearest_building_distance_m: z.number().nonnegative().nullable(),
  road_nearest_centerline_distance_m: z.number().nonnegative().nullable(),
  access_road_nearby: z.boolean().nullable(),
  neighbor_context_confidence: z.enum(["covered", "source_unavailable", "unknown"]).nullable(),
});

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

export async function getNeighborContextFacts(
  addressId: string,
): Promise<NeighborContextFacts | null> {
  const { data, error } = await supabaseAdmin
    .from("site_constraints")
    .select(
      "neighbor_building_count_40m, neighbor_nearest_building_distance_m, road_nearest_centerline_distance_m, access_road_nearby, neighbor_context_confidence",
    )
    .eq("address_id", addressId)
    .maybeSingle();

  if (error) {
    logServerEvent({
      module: "site-constraints.repository",
      operation: "getNeighborContextFacts",
      severity: "degraded",
      message: "select neighbor context facts fejlede",
      error: error.message,
      trace: null,
    });
    return null;
  }

  if (!data) return null;

  const parsed = neighborContextFactsRowSchema.safeParse(data);
  if (!parsed.success) {
    logServerEvent({
      module: "site-constraints.repository",
      operation: "getNeighborContextFacts",
      severity: "degraded",
      message: "neighbor context row matchede ikke forventet schema",
      error: parsed.error.message,
      trace: null,
      metadata: { addressId },
    });
    return null;
  }

  const row = parsed.data;
  const hasFacts =
    row.neighbor_building_count_40m !== null ||
    row.neighbor_nearest_building_distance_m !== null ||
    row.road_nearest_centerline_distance_m !== null ||
    row.access_road_nearby !== null ||
    row.neighbor_context_confidence !== null;

  if (!hasFacts) return null;

  return {
    buildingCount40m: row.neighbor_building_count_40m,
    nearestBuildingDistanceM: row.neighbor_nearest_building_distance_m,
    nearestRoadCenterlineDistanceM: row.road_nearest_centerline_distance_m,
    accessRoadNearby: row.access_road_nearby,
    confidence: row.neighbor_context_confidence,
  };
}
