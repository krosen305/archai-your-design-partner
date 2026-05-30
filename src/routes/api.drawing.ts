// src/routes/api.drawing.ts
// Thin server function adapter for beliggenhedsplan export.
// Business logic lives in application services — this handler only validates,
// authenticates and delegates.

import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { GeoJsonPolygon25832 } from "@/domain/drawing/beliggenhedsplan.types";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const GeoJsonPolygonSchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))).min(1),
});

const ExportBeliggenhedsplanInputSchema = z.object({
  projectId: z.string().uuid(),
  matrikelId: z.string().min(1),
  kommunekode: z.string().min(1),
  addressId: z.string().min(1),
  addressText: z.string().optional().nullable(),
  footprintGeojson: GeoJsonPolygonSchema.optional().nullable(),
  bygherre: z.string().max(200).optional().nullable(),
  sokkelKoteM: z.number().min(-10).max(100).optional().nullable(),
  heightM: z.number().min(0).max(30).optional().nullable(),
});

type ExportInput = z.infer<typeof ExportBeliggenhedsplanInputSchema>;

// ---------------------------------------------------------------------------
// Server function
// ---------------------------------------------------------------------------

export const exportBeliggenhedsplanFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: ExportInput) => ExportBeliggenhedsplanInputSchema.parse(data))
  .handler(async ({ data }) => {
    const { assembleBeliggenhedsplan } =
      await import("@/services/drawing/assemble-beliggenhedsplan.service");
    const { exportDrawing } = await import("@/services/drawing/export-drawing.service");
    const { GeoDanmarkDrawingLayersAdapter } =
      await import("@/integrations/geodanmark/drawing-layers");
    const { DrawingRepository } =
      await import("@/integrations/supabase/repositories/drawing.repository");
    const { decodeGeoJsonFootprint } =
      await import("@/integrations/import/geojson-footprint-decoder");
    const { getProjectDrawingData } =
      await import("@/integrations/supabase/repositories/projects.repository");

    let proposedFootprint25832: GeoJsonPolygon25832;
    if (data.footprintGeojson) {
      proposedFootprint25832 = decodeGeoJsonFootprint(data.footprintGeojson);
    } else {
      proposedFootprint25832 = {
        type: "Polygon",
        crs: "EPSG:25832",
        coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
      };
    }

    const projectData = await getProjectDrawingData(data.projectId);
    const grundarealM2 = projectData?.grundarealM2 ?? null;
    const bebyggetArealM2 = projectData?.bebyggetArealM2 ?? null;
    const bfeNr = projectData?.bfeNr ?? null;

    const assembled = await assembleBeliggenhedsplan({
      matrikelId: data.matrikelId,
      kommunekode: data.kommunekode,
      addressId: data.addressId,
      proposedFootprint25832,
      projectId: data.projectId,
      sokkelKoteM: data.sokkelKoteM ?? null,
      heightM: data.heightM ?? null,
      metadata: {
        title: "Beliggenhedsplan",
        address: data.addressText ?? data.addressId,
        matrikel: data.matrikelId,
        bygherre: data.bygherre ?? null,
        sagNr: data.projectId,
        bfeNr,
        revisions: [],
        buildingCode: "BR18",
        draughtsman: null,
        responsibleFirm: null,
        areaTable:
          grundarealM2 !== null && bebyggetArealM2 !== null
            ? {
                grundarealM2,
                groundFloorM2: bebyggetArealM2,
                firstFloorM2: null,
                doubleHeightDeductionM2: 0,
                totalResidentialM2: bebyggetArealM2,
                coveragePercent: Math.round((bebyggetArealM2 / grundarealM2) * 1000) / 10,
                calculationBasis: "BR18 §452",
              }
            : null,
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
