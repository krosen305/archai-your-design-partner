import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withAuth } from "@/lib/server-auth";
import { br18ProjectFactsSchema, evidenceStatusSchema } from "@/lib/br18/schemas";
import type { ApplicabilityStatus, AuthorityReadinessStatus } from "@/lib/br18/types";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const getBr18ComplianceInputSchema = z.object({
  projectId: z.string().uuid(),
  facts: br18ProjectFactsSchema,
  token: z.string().min(1),
});

const updateBr18EvidenceInputSchema = z.object({
  evidenceId: z.string().uuid(),
  status: evidenceStatusSchema,
  validationNotes: z.array(z.string()).default([]),
  token: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Serializable result DTO
// Br18ComplianceResult contains SourceFactReference.value typed as `unknown`,
// which TanStack Start's serialization validator rejects at the type level.
// This DTO narrows the shape to fully serializable primitives for transport.
// ---------------------------------------------------------------------------

type SerializableApplicabilityResult = {
  requirementId: string;
  status: ApplicabilityStatus;
  reasons: string[];
  missingInputs: string[];
};

export type Br18ComplianceResponse = {
  applicabilityResults: SerializableApplicabilityResult[];
  hardStopTriggered: boolean;
  hardStopReason: string | null;
  authorityReadiness: AuthorityReadinessStatus;
};

// ---------------------------------------------------------------------------
// Server functions — thin: validate → auth → dynamic import → return
// ---------------------------------------------------------------------------

export const getBr18Compliance = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => getBr18ComplianceInputSchema.parse(data))
  .handler(async ({ data }): Promise<Br18ComplianceResponse> => {
    return withAuth(data.token, async () => {
      const { runBr18Compliance } = await import(
        "@/lib/services/br18-compliance.service.server"
      );
      const { upsertApplicabilityResult } = await import(
        "@/integrations/supabase/repositories/br18-applicability.repository"
      );
      const { getEvidenceForProject } = await import(
        "@/integrations/supabase/repositories/br18-evidence.repository"
      );

      const evidenceItems = await getEvidenceForProject(data.projectId);
      const result = await runBr18Compliance(
        data.projectId,
        data.facts,
        { upsertApplicabilityResult },
        evidenceItems,
      );

      // Strip non-serializable `sourceFacts` (contains `unknown` values)
      // before crossing the server boundary.
      return {
        applicabilityResults: result.applicabilityResults.map((r) => ({
          requirementId: r.requirementId,
          status: r.status,
          reasons: r.reasons,
          missingInputs: r.missingInputs,
        })),
        hardStopTriggered: result.hardStopTriggered,
        hardStopReason: result.hardStopReason,
        authorityReadiness: result.authorityReadiness,
      };
    });
  });

export const updateBr18Evidence = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => updateBr18EvidenceInputSchema.parse(data))
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    return withAuth(data.token, async () => {
      const { updateEvidenceStatus } = await import(
        "@/integrations/supabase/repositories/br18-evidence.repository"
      );
      await updateEvidenceStatus(data.evidenceId, data.status, data.validationNotes);
      return { success: true };
    });
  });
