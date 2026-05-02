import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Supabase auth helpers
// ---------------------------------------------------------------------------

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUp(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
  clearGuestMode();
}

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getUser(): Promise<User | null> {
  const session = await getSession();
  return session?.user ?? null;
}

// ---------------------------------------------------------------------------
// Gæstetilstand — localStorage-flag, kun klient-side
// ---------------------------------------------------------------------------

const GUEST_KEY = "archai_guest_mode";

export function isGuest(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(GUEST_KEY) === "true";
}

export function setGuestMode(): void {
  if (typeof window !== "undefined") localStorage.setItem(GUEST_KEY, "true");
}

export function clearGuestMode(): void {
  if (typeof window !== "undefined") localStorage.removeItem(GUEST_KEY);
}
