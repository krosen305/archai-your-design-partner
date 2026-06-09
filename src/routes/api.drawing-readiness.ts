// src/routes/api.drawing-readiness.ts
// Thin server function: loads project state from DB and returns DrawingCompleteness.
// Computes a best-effort completeness check from persisted data — fields that
// require live WFS calls (vej, terrain) appear as "missing" until a full export runs.

import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { DrawingCompleteness } from "@/domain/drawing/completeness-engine";

const DrawingReadinessInputSchema = z.object({
  projectId: z.string().uuid(),
  addressId: z.string().min(1),
});

type DrawingReadinessInput = z.infer<typeof DrawingReadinessInputSchema>;

export const fetchDrawingReadinessFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: DrawingReadinessInput) => DrawingReadinessInputSchema.parse(data))
  .handler(async ({ data, context }): Promise<DrawingCompleteness> => {
    const { computeDrawingReadiness } =
      await import("@/services/drawing/drawing-readiness.service");
    return computeDrawingReadiness({
      projectId: data.projectId,
      userId: context.userId,
    });
  });

export const Route = createFileRoute("/api/drawing-readiness")({
  component: () => null,
});
