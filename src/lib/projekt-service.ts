// CRUD-lag for `projects`-tabellen.
// Bruger den autentificerede Supabase-klient (RLS) — gæster er no-ops.
//
// Kald kun client-side (i React-komponenter eller createServerFn) da
// supabase-klienten kræver VITE_SUPABASE_* env vars i browseren.

import { supabase } from "@/integrations/supabase/client";
import type { Projekt } from "@/lib/byggeoenske";

// ---------------------------------------------------------------------------
// Hjælper: returnér aktiv user_id eller null (gæst)
// ---------------------------------------------------------------------------

async function getUserId(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

// ---------------------------------------------------------------------------
// listProjekter — hent alle projekter for indlogget bruger (nyeste først).
// Gæst: returnerer tom liste.
// ---------------------------------------------------------------------------

export async function listProjekter(): Promise<Projekt[]> {
  const userId = await getUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from("projects")
    .select(
      "id, user_id, created_at, updated_at, address_full, address_adresseid, address_postnr, address_postnrnavn, address_kommune, address_matrikel, address_koordinater, address_ejerlavskode, address_matrikelnummer, address_bbr, compliance_done, current_step",
    )
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(`[ProjektService] listProjekter fejlede: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    user_id: row.user_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    adresse: row.address_full,
    adresse_dar_id: row.address_adresseid,
    byggeoenske: null,
    bbr_data: null,
    dar_data: null,
    mat_data: null,
    byggeanalyse_resultat: null,
    current_step: row.current_step,
    compliance_done: row.compliance_done ?? false,
    address_postnr: row.address_postnr,
    address_postnrnavn: row.address_postnrnavn,
    address_kommune: row.address_kommune,
    address_matrikel: row.address_matrikel,
    address_koordinater: (row.address_koordinater as { lat: number; lng: number } | null) ?? null,
    address_ejerlavskode: row.address_ejerlavskode,
    address_matrikelnummer: row.address_matrikelnummer,
    address_bbr: row.address_bbr,
  }));
}

// ---------------------------------------------------------------------------
// sletProjekt — sletter projekt + alt relateret data via server fn.
// ---------------------------------------------------------------------------

export async function sletProjekt(projectId: string): Promise<void> {
  const { getSession } = await import("@/lib/auth");
  const session = await getSession();
  if (!session?.access_token) throw new Error("Du skal være logget ind for at slette projekter");
  const { serverDeleteProject } = await import("@/lib/project-sync");
  await serverDeleteProject({ data: { accessToken: session.access_token, projectId } });
}

// ---------------------------------------------------------------------------
// Supabase Storage — inspirationsbilleder (ARCH-82)
// Bucket: inspirationsbilleder (privat)
// Sti: {user_id}/{projekt_id}/{uuid}.{jpg|png}
// ---------------------------------------------------------------------------

const BUCKET = "inspirationsbilleder";
const MAX_BILLEDER = 8;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png"] as const;
const SIGNED_URL_EXPIRY_S = 3600; // 1 time

export type BilledeUploadResultat = {
  /** Storage-stien — gem denne i state/DB for at forny URLs efter udløb (ARCH-174) */
  path: string;
  /** 1-times signed URL til øjeblikkelig visning — må ikke persistes */
  signedUrl: string;
};

/**
 * Uploader ét inspirationsbillede til Supabase Storage.
 * Returnerer `{ path, signedUrl }` — gem path i state, brug signedUrl til visning.
 * Signed URLs udløber efter 1 time; brug `fornyBilledeUrl(path)` til fornyelse.
 */
export async function uploadInspirationsbillede(
  projektId: string,
  file: File,
): Promise<BilledeUploadResultat> {
  if (!ALLOWED_TYPES.includes(file.type as (typeof ALLOWED_TYPES)[number])) {
    throw new Error(`Filtype ikke tilladt: ${file.type}. Kun JPEG og PNG accepteres.`);
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`Filen er for stor: ${(file.size / 1024 / 1024).toFixed(1)} MB. Max 10 MB.`);
  }

  const userId = await getUserId();
  if (!userId) throw new Error("Upload kræver indlogget bruger");

  const { data: existing } = await supabase.storage.from(BUCKET).list(`${userId}/${projektId}`);

  if ((existing?.length ?? 0) >= MAX_BILLEDER) {
    throw new Error(`Max ${MAX_BILLEDER} billeder per projekt er nået`);
  }

  const ext = file.type === "image/jpeg" ? "jpg" : "png";
  const path = `${userId}/${projektId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type });

  if (uploadError) throw new Error(`Upload fejlede: ${uploadError.message}`);

  const { data: signed, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_EXPIRY_S);

  if (signError || !signed) {
    throw new Error(`Kunne ikke oprette signed URL: ${signError?.message}`);
  }

  return { path, signedUrl: signed.signedUrl };
}

/**
 * Sletter ét inspirationsbillede fra Storage.
 * Stien udledes fra den signed URL — eller sendes direkte som `{userId}/{projektId}/{uuid}.ext`.
 */
export async function sletInspirationsbillede(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw new Error(`Sletning fejlede: ${error.message}`);
}

/**
 * Fornyr en signed URL der er ved at udløbe.
 */
export async function fornyBilledeUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_EXPIRY_S);
  if (error || !data) throw new Error(`Fornyelse af URL fejlede: ${error?.message}`);
  return data.signedUrl;
}
