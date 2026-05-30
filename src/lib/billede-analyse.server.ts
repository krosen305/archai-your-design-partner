import { verifyProjectOwnership } from "@/integrations/supabase/repositories/projects.repository";
import {
  createProjectStorageSignedUrl,
  uploadProjectStorageObject,
} from "@/integrations/supabase/repositories/project-storage.repository";

export type UploadBilledeInput = {
  userId: string;
  projektId: string;
  base64: string;
  mimeType: "image/jpeg" | "image/png";
};

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

export async function uploadBilledeForProject(
  input: UploadBilledeInput,
): Promise<UploadBilledeResult> {
  const owned = await verifyProjectOwnership(input.projektId, input.userId);
  if (!owned) {
    throw new Response("Projekt ikke fundet", { status: 404 });
  }

  const ext = input.mimeType === "image/png" ? "png" : "jpg";
  const path = `${input.userId}/${input.projektId}/${crypto.randomUUID()}.${ext}`;
  const fileBody = base64ToArrayBuffer(input.base64);

  await uploadProjectStorageObject({
    path,
    body: fileBody,
    contentType: input.mimeType,
  });

  const signedUrl = await createProjectStorageSignedUrl(path, 60 * 60);
  return { path, signedUrl };
}
