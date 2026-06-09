// Application service: assembles DrawingCompleteness from persisted project data.
// Does not perform live WFS/DHM calls — fields requiring them appear as "missing".

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { computeDrawingCompleteness } from "@/domain/drawing/completeness-engine";
import type { DrawingCompleteness } from "@/domain/drawing/completeness-engine";
import { designPlacementSchema } from "@/types/project-restore.schemas";

type ReadinessInput = {
  projectId: string;
  userId: string;
};

export async function computeDrawingReadiness(input: ReadinessInput): Promise<DrawingCompleteness> {
  const { projectId, userId } = input;

  const { data: row } = await supabaseAdmin
    .from("projects")
    .select("address_matrikel, tagform, taghaldning_grad, compliance_data")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();

  const { data: iterRow } = await supabaseAdmin
    .from("design_iterations")
    .select("placement_footprint_geojson")
    .eq("project_id", projectId)
    .eq("is_active", true)
    .maybeSingle();

  const hasParcelPolygon = !!row?.address_matrikel;
  const hasFootprint = !!iterRow?.placement_footprint_geojson;

  const tagform = (row?.tagform as "sadeltag" | "fladt" | "mansard" | "pulttag" | null) ?? null;
  const taghaldningGrad = (row?.taghaldning_grad as number | null) ?? null;

  const complianceData =
    typeof row?.compliance_data === "object" && row.compliance_data !== null
      ? (row.compliance_data as Record<string, unknown>)
      : null;
  const plandataContext = complianceData?.plandataContext as
    | { sewerAreaType?: string | null }
    | null
    | undefined;
  const kloakoplandType: "separat" | "faelles" | null =
    plandataContext?.sewerAreaType === "separat"
      ? "separat"
      : plandataContext?.sewerAreaType === "faelles"
        ? "faelles"
        : null;

  return computeDrawingCompleteness({
    hasParcelPolygon,
    proposedFootprintSource: hasFootprint ? "generated" : null,
    sokkelKoteM: null,
    sokkelSource: null,
    tagform,
    taghaldningGrad,
    rygningsKoteM: null,
    vejLayer: null,
    terrainLayer: null,
    surveyTerrainPointCount: 0,
    kloakoplandType,
    siteUseLayers: [],
    naturbeskyttelseFetchedAt: null,
  });
}
