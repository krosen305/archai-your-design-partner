import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { isGuest } from "@/lib/auth";

type AuthState = {
  user: User | null;
  guest: boolean;
  loading: boolean;
};

const AuthContext = createContext<AuthState>({ user: null, guest: false, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, guest: false, loading: true });

  useEffect(() => {
    // Initialiser fra aktiv session
    supabase.auth.getSession().then(({ data }) => {
      setState({ user: data.session?.user ?? null, guest: isGuest(), loading: false });
    });

    // Lyt på auth-ændringer (login/logout/token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setState((prev) => ({ ...prev, user: session?.user ?? null, guest: isGuest() }));
    });

    return () => subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
