// src/routes/api.drawing.ts
// Thin server function adapter for beliggenhedsplan export.
// Business logic lives in application services — this handler only validates,
// authenticates and delegates.

import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const ExportBeliggenhedsplanInputSchema = z.object({
  projectId: z.string().uuid(),
  matrikelId: z.string().min(1),
  kommunekode: z.string().min(1),
  addressId: z.string().min(1),
});

type ExportInput = z.infer<typeof ExportBeliggenhedsplanInputSchema>;

// ---------------------------------------------------------------------------
// Server function
// ---------------------------------------------------------------------------

export const exportBeliggenhedsplanFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: ExportInput) => ExportBeliggenhedsplanInputSchema.parse(data))
  .handler(async ({ data }) => {
    const { assembleBeliggenhedsplan } = await import(
      "@/services/drawing/assemble-beliggenhedsplan.service"
    );
    const { exportDrawing } = await import("@/services/drawing/export-drawing.service");
    const { GeoDanmarkDrawingLayersAdapter } = await import(
      "@/integrations/geodanmark/drawing-layers"
    );
    const { DrawingRepository } = await import(
      "@/integrations/supabase/repositories/drawing.repository"
    );

    const assembled = await assembleBeliggenhedsplan({
      matrikelId: data.matrikelId,
      kommunekode: data.kommunekode,
      addressId: data.addressId,
      proposedFootprint25832: {
        type: "Polygon",
        crs: "EPSG:25832",
        coordinates: [
          [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
            [0, 0],
          ],
        ],
      },
      projectId: data.projectId,
      metadata: {
        title: "Beliggenhedsplan",
        address: data.addressId,
        matrikel: data.matrikelId,
        bygherre: null,
        sagNr: data.projectId,
        revisions: [],
        bfeNr: null,
        buildingCode: null,
        draughtsman: null,
        responsibleFirm: null,
        areaTable: null,
        date: new Date().toISOString().slice(0, 10),
        scale: 250 as const,
        paperSize: "A3" as const,
      },
      geometrySource: new GeoDanmarkDrawingLayersAdapter(),
      survey: null,
    });

    if (!assembled.plan) throw new Error(assembled.readiness.status);

    return exportDrawing({
      plan: assembled.plan,
      readiness: assembled.readiness,
      projectId: data.projectId,
      store: new DrawingRepository(),
    });
  });

// ---------------------------------------------------------------------------
// Route (required by TanStack Router file-based routing)
// ---------------------------------------------------------------------------

function ApiDrawingRoute() {
  return null;
}

export const Route = createFileRoute("/api/drawing")({
  component: ApiDrawingRoute,
});
