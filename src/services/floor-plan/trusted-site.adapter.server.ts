// src/services/floor-plan/trusted-site.adapter.server.ts
//
// SERVER-SIDE ONLY. TrustedSitePort implementation for floor-plan verification.
//
// The trusted building footprint (byggefelt) in EPSG:25832 will come from the
// design placement / beliggenhedsplan pipeline. That source is WGS84-based and
// needs a dedicated 25832 projection step, so it is wired separately. Until then
// this adapter returns null, which makes verification emit FP-GEO-003
// (review_required: footprint ukendt) rather than fabricating a placement.

import type { TrustedSitePort } from "./verify-floor-plan.service";
import type { GeoJsonPolygon25832 } from "@/domain/drawing/beliggenhedsplan.types";

export class TrustedSiteAdapter implements TrustedSitePort {
  async loadFootprint25832(_projectId: string): Promise<GeoJsonPolygon25832 | null> {
    // TODO(floor-plan): load proposed footprint from design_iterations placement
    // and project WGS84 -> EPSG:25832 before returning.
    return null;
  }
}
