// src/integrations/supabase/repositories/floor-plan-verification.repository.ts
//
// SERVER-SIDE ONLY. Supabase adapter for floor_plan_verifications. Implements
// FloorPlanVerificationStorePort (consumed by verify-floor-plan.service.ts).
//
// floor_plan_verifications is not yet in the generated Database types — regenerate
// after deploy (jf. drawing_exports). Narrow untyped handle until then.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { FloorPlanVerificationStorePort } from "@/domain/floor-plan/ports";
import type {
  FloorPlanVerificationStatus,
  VerificationFinding,
} from "@/domain/floor-plan/verification-engine";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedSupabase = { from: (table: string) => any };
const fpDb = supabaseAdmin as unknown as UntypedSupabase;

const VERIFICATIONS = "floor_plan_verifications";

export class FloorPlanVerificationRepository implements FloorPlanVerificationStorePort {
  async saveVerification(snapshot: {
    projectId: string;
    floorPlanIterationId: string;
    inputHash: string;
    status: FloorPlanVerificationStatus;
    findingsJson: VerificationFinding[];
    missingDataPoints: string[];
    verifiedBy: string;
  }): Promise<string> {
    const insert = {
      project_id: snapshot.projectId,
      floor_plan_iteration_id: snapshot.floorPlanIterationId,
      input_hash: snapshot.inputHash,
      status: snapshot.status,
      findings_json: snapshot.findingsJson,
      missing_data_points_json: snapshot.missingDataPoints,
      verified_by: snapshot.verifiedBy,
    };
    const { data, error } = await fpDb.from(VERIFICATIONS).insert(insert).select("id").single();
    if (error || !data) {
      throw new Error(`floor_plan_verifications insert fejlede: ${error?.message}`);
    }
    return (data as { id: string }).id;
  }
}
