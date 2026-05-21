// Shared auth utility for createServerFn handlers that receive the access token
// as part of the request data payload (the pre-middleware pattern).
//
// For NEW server functions, prefer the requireSupabaseAuth middleware instead —
// it reads the token from the Authorization header (automatically injected by
// attachSupabaseAuth) and avoids putting the token in the data schema at all.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Validates a Supabase access token and calls fn with the resolved userId.
 * Throws a 401 Response on missing or invalid tokens — never fails silently.
 */
export async function withAuth<T>(
  token: string | undefined | null,
  fn: (userId: string) => Promise<T>,
): Promise<T> {
  if (!token) {
    throw new Response("Uautoriseret: token mangler", { status: 401 });
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    throw new Response("Uautoriseret: ugyldig token", { status: 401 });
  }

  return fn(data.user.id);
}
