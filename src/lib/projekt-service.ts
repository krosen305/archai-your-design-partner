// CRUD-lag for `projekter`-tabellen (ARCH-81).
// Bruger den autentificerede Supabase-klient (RLS) — gæster er no-ops.
//
// Kald kun client-side (i React-komponenter eller createServerFn) da
// supabase-klienten kræver VITE_SUPABASE_* env vars i browseren.

import { supabase } from "@/integrations/supabase/client";
import type { Byggeoenske, Projekt, ProjektInsert } from "@/lib/byggeoenske";

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

  const { data: row, error } = await supabase
    .from("projekter")
    .insert({ ...data, user_id: userId })
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
    .update({ byggeoenske: b as unknown as Record<string, unknown> })
    .eq("id", id);

  if (error) throw new Error(`[ProjektService] opdaterByggeoenske fejlede: ${error.message}`);
}

// ---------------------------------------------------------------------------
// listProjekter — hent alle projekter for indlogget bruger (nyeste først).
// Gæst: returnerer tom liste.
// ---------------------------------------------------------------------------

export async function listProjekter(): Promise<Projekt[]> {
  const userId = await getUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from("projekter")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(`[ProjektService] listProjekter fejlede: ${error.message}`);
  return (data ?? []) as unknown as Projekt[];
}

// ---------------------------------------------------------------------------
// migrerGaestTilBruger — kald når gæst opretter konto.
// Opretter et nyt projekt med det lokale state og returnerer projekt-id.
// ---------------------------------------------------------------------------

export async function migrerGaestTilBruger(data: ProjektInsert): Promise<string | null> {
  const projekt = await gemProjekt(data);
  return projekt?.id ?? null;
}
