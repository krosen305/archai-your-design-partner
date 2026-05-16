import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { BilledeAnalyseResultat } from "@/lib/billede-analyse-vocabulary";

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

function base64ToArrayBuffer(value: string): ArrayBuffer {
  const base64 = value.includes(",") ? (value.split(",").pop() ?? "") : value;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
}

export const uploadBillede = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => uploadBilledeSchema.parse(data))
  .handler(async ({ data }): Promise<UploadBilledeResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(data.accessToken);
    if (authError || !authData.user) {
      throw new Response("Uautoriseret", { status: 401 });
    }

    const userId = authData.user.id;
    const { data: project, error: projectError } = await supabaseAdmin
      .from("projects")
      .select("id")
      .eq("id", data.projektId)
      .eq("user_id", userId)
      .maybeSingle();

    if (projectError) {
      throw new Error(`Projektkontrol fejlede: ${projectError.message}`);
    }
    if (!project) {
      throw new Response("Projekt ikke fundet", { status: 404 });
    }

    const ext = data.mimeType === "image/png" ? "png" : "jpg";
    const path = `${userId}/${data.projektId}/${crypto.randomUUID()}.${ext}`;
    const fileBody = base64ToArrayBuffer(data.base64);

    const { error: uploadError } = await supabaseAdmin.storage
      .from("inspirationsbilleder")
      .upload(path, fileBody, {
        contentType: data.mimeType,
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Upload fejlede: ${uploadError.message}`);
    }

    const { data: urlData, error: signedUrlError } = await supabaseAdmin.storage
      .from("inspirationsbilleder")
      .createSignedUrl(path, 60 * 60);

    if (signedUrlError || !urlData?.signedUrl) {
      throw new Error(
        `Kunne ikke generere signed URL: ${signedUrlError?.message ?? "ukendt fejl"}`,
      );
    }

    return { path, signedUrl: urlData.signedUrl };
  });

export const analyserBillederFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => analyserBillederSchema.parse(data))
  .handler(async ({ data }): Promise<BilledeAnalyseResultat> => {
    const { BilledeAnalyseService } = await import("@/integrations/ai/billede-analyse");
    return BilledeAnalyseService.analyser(data.billedUrls);
  });
