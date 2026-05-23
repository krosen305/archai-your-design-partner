import { uploadBillede, analyserBillederFn } from "@/lib/billede-analyse.functions";
import { generateDesignProposals } from "@/lib/ai-design.functions";
import type { BilledeAnalyseResultat } from "@/lib/billede-analyse-vocabulary";

export async function uploadInspirationImages(params: {
  files: Array<{ base64: string; mimeType: "image/jpeg" | "image/png" }>;
  projectId: string;
  accessToken: string;
}): Promise<{ signedUrls: string[]; paths: string[] }> {
  const signedUrls: string[] = [];
  const paths: string[] = [];

  for (const file of params.files) {
    const result = await uploadBillede({
      data: {
        base64: file.base64,
        mimeType: file.mimeType,
        projektId: params.projectId,
        accessToken: params.accessToken,
      },
    });
    signedUrls.push(result.signedUrl);
    paths.push(result.path);
  }

  return { signedUrls, paths };
}

export async function analyseInspirationImages(params: {
  signedUrls: string[];
}): Promise<BilledeAnalyseResultat> {
  return analyserBillederFn({ data: { billedUrls: params.signedUrls } });
}

export async function generateDesignProposalsService(params: {
  prompt: string;
  inspirationsUrls: string[];
  stil: string | undefined;
  facademateriale: string | undefined;
  projectId: string | undefined;
  addressId: string | undefined;
}): Promise<{ images: string[] }> {
  const result = await generateDesignProposals({ data: params });
  return { images: result.images };
}
