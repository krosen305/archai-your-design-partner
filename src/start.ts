// Global TanStack Start configuration.
// Registers attachSupabaseAuth as a global function middleware so every
// createServerFn call from the browser automatically includes the Bearer token
// in the Authorization header — enabling requireSupabaseAuth to work.
import { createStart } from "@tanstack/react-start";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
}));
