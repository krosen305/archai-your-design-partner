// Hook til upload af inspirationsbilleder i Cockpit.
// Udtrukket fra UploadField i src/components/cockpit/index.tsx.
//
// Håndterer:
//  - Autentificeret upload via Supabase Storage (signedUrl + path)
//  - Uautentificeret fallback: base64 data-URL (gæst-flow)
//  - Max 8 billeder per projekt
//  - Opdaterer inspirationsbilledePaths i project-store

import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { uploadInspirationsbillede } from "@/lib/projekt-service";
import { useProject } from "@/lib/project-store";

export type UseCockpitUploadReturn = {
  uploading: boolean;
  handleFiles: (files: FileList | null, currentUrls: string[]) => Promise<string[]>;
};

/**
 * Giver `uploading`-state og en `handleFiles`-funktion der:
 *  1. Uploader filer til Supabase Storage (autentificeret) og returnerer signedUrls
 *  2. Falder tilbage til base64 data-URL for gæster
 *  3. Opdaterer `inspirationsbilledePaths` i project-store
 *
 * `handleFiles` returnerer de nye URLs der skal tilføjes til den eksisterende liste.
 */
export function useCockpitUpload(): UseCockpitUploadReturn {
  const [uploading, setUploading] = useState(false);
  const { currentProjectId, byggeoenske, setByggeoenske } = useProject();

  const handleFiles = async (files: FileList | null, currentUrls: string[]): Promise<string[]> => {
    if (!files?.length) return [];
    setUploading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      const uploadedUrls: string[] = [];
      const uploadedPaths: string[] = [];
      for (const file of Array.from(files).slice(0, 8 - currentUrls.length)) {
        if (userId) {
          if (!currentProjectId) continue;
          try {
            // ARCH-174: gem path (til URL-fornyelse) + signedUrl (til visning)
            const { path, signedUrl } = await uploadInspirationsbillede(currentProjectId, file);
            uploadedUrls.push(signedUrl);
            uploadedPaths.push(path);
          } catch {
            continue;
          }
        } else {
          const reader = new FileReader();
          const b64 = await new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          uploadedUrls.push(b64);
        }
      }
      if (uploadedPaths.length > 0) {
        setByggeoenske({
          inspirationsbilledePaths: [
            ...(byggeoenske.inspirationsbilledePaths ?? []),
            ...uploadedPaths,
          ],
        });
      }
      return uploadedUrls;
    } finally {
      setUploading(false);
    }
  };

  return { uploading, handleFiles };
}
