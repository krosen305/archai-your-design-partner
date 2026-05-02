// Tynd wrapper omkring Supabase auth + gæste-tilstand i sessionStorage.
// Bruges af / (auth-side) og /projekt/start.

import { supabase } from "@/integrations/supabase/client";

const GUEST_KEY = "archai:guestMode";

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  clearGuest();
}

export async function signUp(email: string, password: string) {
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin + "/projekt/start" },
  });
  if (error) throw error;
  clearGuest();
}

export async function signOut() {
  await supabase.auth.signOut();
  clearGuest();
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function isGuest(): boolean {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(GUEST_KEY) === "1";
}

export function setGuest() {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(GUEST_KEY, "1");
}

export function clearGuest() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(GUEST_KEY);
}
