import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { BilledeAnalyseResultat } from "@/lib/billede-analyse-vocabulary";
import { withAuth } from "@/lib/server-auth";

const uploadBilledeSchema = z.object({
  base64: z.string().min(1),
  mimeType: z.enum(["image/jpeg", "image/png"]),
  projektId: z.string().uuid(),
  accessToken: z.string().min(1),
});

const analyserBillederSchema = z.object({
  billedUrls: z.array(z.string().url()).min(1).max(4),
});

export type UploadBilledeResult = {
  path: string;
  signedUrl: string;
};

export const uploadBillede = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => uploadBilledeSchema.parse(data))
  .handler(async ({ data }): Promise<UploadBilledeResult> => {
    return withAuth(data.accessToken, async (userId) => {
      const { uploadBilledeForProject } = await import("@/lib/billede-analyse.server");
      return uploadBilledeForProject({
        userId,
        projektId: data.projektId,
        base64: data.base64,
        mimeType: data.mimeType,
      });
    });
  });

export const analyserBillederFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => analyserBillederSchema.parse(data))
  .handler(async ({ data }): Promise<BilledeAnalyseResultat> => {
    const { BilledeAnalyseService } = await import("@/integrations/ai/billede-analyse");
    return BilledeAnalyseService.analyser(data.billedUrls);
  });
