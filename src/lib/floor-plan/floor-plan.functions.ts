// src/lib/floor-plan/floor-plan.functions.ts
//
// Inbound adapters (createServerFn) for the floor-plan feature. Thin per Rule 3:
// validate input -> auth (withAuth) -> resolve typed principal from verified
// project ownership -> dynamic import service/repositories -> return result.
// No business logic, no inline Supabase queries, no compliance decisions here.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withAuth } from "@/lib/server-auth";
import { FloorPlanCommandSchema } from "@/domain/floor-plan/command.schemas";
import type { FloorPlanDocument } from "@/domain/floor-plan/floor-plan.types";
import type { FloorPlanVerificationResult } from "@/services/floor-plan/verify-floor-plan.service";
import type { ApplyFloorPlanCommandResult } from "@/services/floor-plan/apply-floor-plan-command.service";
import type { ExportFloorPlanResult } from "@/services/floor-plan/export-floor-plan.service";

// --- Schemas ---------------------------------------------------------------

const loadActiveFloorPlanInput = z.object({
  projectId: z.string().uuid(),
  token: z.string().min(1),
});

const verifyFloorPlanInput = z.object({
  projectId: z.string().uuid(),
  floorPlanIterationId: z.string().uuid(),
  token: z.string().min(1),
});

const applyFloorPlanCommandInput = z.object({
  projectId: z.string().uuid(),
  floorPlanIterationId: z.string().uuid(),
  command: FloorPlanCommandSchema,
  source: z.enum(["drag", "keyboard", "ai", "system"]).default("drag"),
  token: z.string().min(1),
});

const exportFloorPlanInput = z.object({
  projectId: z.string().uuid(),
  floorPlanIterationId: z.string().uuid(),
  levelId: z.string().min(1).optional(),
  token: z.string().min(1),
});

// --- Handlers --------------------------------------------------------------

export const loadActiveFloorPlanFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => loadActiveFloorPlanInput.parse(data))
  .handler(
    async ({ data }): Promise<{ iterationId: string; document: FloorPlanDocument } | null> => {
      return withAuth(data.token, async (userId) => {
        const { verifyProjectOwnership } =
          await import("@/integrations/supabase/repositories/projects.repository");
        const { buildOwnerPrincipal } = await import("@/services/floor-plan/principal");
        const { FloorPlanRepository } =
          await import("@/integrations/supabase/repositories/floor-plan.repository");

        buildOwnerPrincipal(userId, await verifyProjectOwnership(data.projectId, userId));
        return new FloorPlanRepository().loadActiveByProject(data.projectId);
      });
    },
  );

export const verifyFloorPlanFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => verifyFloorPlanInput.parse(data))
  .handler(async ({ data }): Promise<FloorPlanVerificationResult> => {
    return withAuth(data.token, async (userId) => {
      const { verifyProjectOwnership } =
        await import("@/integrations/supabase/repositories/projects.repository");
      const { buildOwnerPrincipal } = await import("@/services/floor-plan/principal");
      const { verifyFloorPlan } = await import("@/services/floor-plan/verify-floor-plan.service");
      const { TrustedSiteAdapter } =
        await import("@/services/floor-plan/trusted-site.adapter.server");
      const { FloorPlanRepository } =
        await import("@/integrations/supabase/repositories/floor-plan.repository");
      const { FloorPlanVerificationRepository } =
        await import("@/integrations/supabase/repositories/floor-plan-verification.repository");

      const principal = buildOwnerPrincipal(
        userId,
        await verifyProjectOwnership(data.projectId, userId),
      );
      return verifyFloorPlan(
        { projectId: data.projectId, floorPlanIterationId: data.floorPlanIterationId },
        principal,
        {
          read: new FloorPlanRepository(),
          site: new TrustedSiteAdapter(),
          store: new FloorPlanVerificationRepository(),
        },
      );
    });
  });

export const applyFloorPlanCommandFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => applyFloorPlanCommandInput.parse(data))
  .handler(async ({ data }): Promise<ApplyFloorPlanCommandResult> => {
    return withAuth(data.token, async (userId) => {
      const { verifyProjectOwnership } =
        await import("@/integrations/supabase/repositories/projects.repository");
      const { buildOwnerPrincipal } = await import("@/services/floor-plan/principal");
      const { applyFloorPlanCommand } =
        await import("@/services/floor-plan/apply-floor-plan-command.service");
      const { FloorPlanRepository } =
        await import("@/integrations/supabase/repositories/floor-plan.repository");

      const principal = buildOwnerPrincipal(
        userId,
        await verifyProjectOwnership(data.projectId, userId),
      );
      const repo = new FloorPlanRepository();
      return applyFloorPlanCommand(
        {
          projectId: data.projectId,
          floorPlanIterationId: data.floorPlanIterationId,
          command: data.command,
          source: data.source,
        },
        principal,
        { read: repo, write: repo },
      );
    });
  });

export const exportFloorPlanFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => exportFloorPlanInput.parse(data))
  .handler(async ({ data }): Promise<ExportFloorPlanResult> => {
    return withAuth(data.token, async (userId) => {
      const { verifyProjectOwnership } =
        await import("@/integrations/supabase/repositories/projects.repository");
      const { buildOwnerPrincipal } = await import("@/services/floor-plan/principal");
      const { verifyFloorPlan } = await import("@/services/floor-plan/verify-floor-plan.service");
      const { exportFloorPlan } = await import("@/services/floor-plan/export-floor-plan.service");
      const { TrustedSiteAdapter } =
        await import("@/services/floor-plan/trusted-site.adapter.server");
      const { FloorPlanRepository } =
        await import("@/integrations/supabase/repositories/floor-plan.repository");
      const { FloorPlanVerificationRepository } =
        await import("@/integrations/supabase/repositories/floor-plan-verification.repository");
      const { FloorPlanExportRepository } =
        await import("@/integrations/supabase/repositories/floor-plan-export.repository");

      const principal = buildOwnerPrincipal(
        userId,
        await verifyProjectOwnership(data.projectId, userId),
      );

      const repo = new FloorPlanRepository();
      const document = await repo.loadActiveDocument(data.projectId, data.floorPlanIterationId);
      if (!document) throw new Response("Plantegning ikke fundet", { status: 404 });

      // Verification is the server-side authority for export readiness (§17.5).
      const verification = await verifyFloorPlan(
        { projectId: data.projectId, floorPlanIterationId: data.floorPlanIterationId },
        principal,
        {
          read: repo,
          site: new TrustedSiteAdapter(),
          store: new FloorPlanVerificationRepository(),
        },
      );

      return exportFloorPlan(
        {
          projectId: data.projectId,
          floorPlanIterationId: data.floorPlanIterationId,
          document,
          levelId: data.levelId ?? document.levels[0]!.id,
          verificationStatus: verification.status,
          inputHash: verification.inputHash,
        },
        principal,
        { store: new FloorPlanExportRepository() },
      );
    });
  });
