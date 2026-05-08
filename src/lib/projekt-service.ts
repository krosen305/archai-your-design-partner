// CRUD-lag for `projekter`-tabellen (ARCH-81).
// Bruger den autentificerede Supabase-klient (RLS) — gæster er no-ops.
//
// Kald kun client-side (i React-komponenter eller createServerFn) da
// supabase-klienten kræver VITE_SUPABASE_* env vars i browseren.

import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { Byggeoenske, Projekt, ProjektInsert } from "@/lib/byggeoenske";
import type { ByggeanalyseResultat } from "@/integrations/ai/byggeanalyse";

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
// gemProjekt — opret eller upsert projekt for indlogget bruger.
// Gæst: returnerer null (ingen Supabase-kald).
// ---------------------------------------------------------------------------

export async function gemProjekt(data: ProjektInsert): Promise<Projekt | null> {
  const userId = await getUserId();
  if (!userId) return null;

  const insertData = {
    user_id: userId,
    adresse: data.adresse ?? null,
    adresse_dar_id: data.adresse_dar_id ?? null,
    byggeoenske: (data.byggeoenske ?? null) as Json | null,
    bbr_data: (data.bbr_data ?? null) as Json | null,
    dar_data: (data.dar_data ?? null) as Json | null,
    mat_data: (data.mat_data ?? null) as Json | null,
    byggeanalyse_resultat: (data.byggeanalyse_resultat ?? null) as Json | null,
  };

  const { data: row, error } = await supabase
    .from("projekter")
    .insert(insertData)
    .select()
    .single();

  if (error) throw new Error(`[ProjektService] gemProjekt fejlede: ${error.message}`);
  return row as unknown as Projekt;
}

// ---------------------------------------------------------------------------
// hentProjekt — hent ét projekt på id (kun eget via RLS).
// ---------------------------------------------------------------------------

export async function hentProjekt(id: string): Promise<Projekt | null> {
  const { data, error } = await supabase.from("projekter").select("*").eq("id", id).maybeSingle();

  if (error) throw new Error(`[ProjektService] hentProjekt fejlede: ${error.message}`);
  return data as unknown as Projekt | null;
}

// ---------------------------------------------------------------------------
// opdaterByggeoenske — gem/opdater byggeønsker på eksisterende projekt.
// ---------------------------------------------------------------------------

export async function opdaterByggeoenske(id: string, b: Byggeoenske): Promise<void> {
  const { error } = await supabase
    .from("projekter")
    .update({ byggeoenske: b as unknown as Json })
    .eq("id", id);

  if (error) throw new Error(`[ProjektService] opdaterByggeoenske fejlede: ${error.message}`);
}

// ---------------------------------------------------------------------------
// opdaterByggeanalyseResultat — gem analyse-output (ARCH-83).
// ---------------------------------------------------------------------------

export async function opdaterByggeanalyseResultat(
  id: string,
  resultat: ByggeanalyseResultat,
): Promise<void> {
  const { error } = await supabase
    .from("projekter")
    .update({ byggeanalyse_resultat: resultat as unknown as Json })
    .eq("id", id);

  if (error)
    throw new Error(`[ProjektService] opdaterByggeanalyseResultat fejlede: ${error.message}`);
}

// ---------------------------------------------------------------------------
// listProjekter — hent alle projekter for indlogget bruger (nyeste først).
// Gæst: returnerer tom liste.
// ---------------------------------------------------------------------------

export async function listProjekter(): Promise<Projekt[]> {
  const userId = await getUserId();
  if (!userId) return [];

  // projects-tabellen er den autoritative kilde — syncPatch() skriver hertil.
  // projekter-tabellen bruges ikke fra wizard-flowet og er altid tom.
  const { data, error } = await supabase
    .from("projects")
    .select(
      "id, user_id, created_at, updated_at, address_full, address_adresseid, compliance_done, current_step",
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
  }));
}

// ---------------------------------------------------------------------------
// migrerGaestTilBruger — kald når gæst opretter konto.
// ---------------------------------------------------------------------------

export async function migrerGaestTilBruger(data: ProjektInsert): Promise<string | null> {
  const projekt = await gemProjekt(data);
  return projekt?.id ?? null;
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

/**
 * Uploader ét inspirationsbillede til Supabase Storage og returnerer en signed URL.
 *
 * Kaster ved ugyldigt filformat/størrelse, ikke-indlogget bruger, eller max-antal overskredet.
 * Gæster skal gemme base64 i lokalt state og kalde denne funktion efter login.
 */
export async function uploadInspirationsbillede(projektId: string, file: File): Promise<string> {
  if (!ALLOWED_TYPES.includes(file.type as (typeof ALLOWED_TYPES)[number])) {
    throw new Error(`Filtype ikke tilladt: ${file.type}. Kun JPEG og PNG accepteres.`);
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`Filen er for stor: ${(file.size / 1024 / 1024).toFixed(1)} MB. Max 10 MB.`);
  }

  const userId = await getUserId();
  if (!userId) throw new Error("Upload kræver indlogget bruger");

  // Tæl eksisterende billeder
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

  return signed.signedUrl;
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
