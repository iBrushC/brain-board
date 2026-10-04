import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Supabase as the holder of a bearer token rather than a cookie — the MCP
 * endpoint, where an agent presents the access token Supabase's OAuth server
 * issued it. The token is the user's own JWT, so every query runs under the
 * same row-level security the board does: no service key, no second set of
 * permission checks.
 */
export function createTokenClient(accessToken: string) {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      // Nothing to persist or refresh: the agent owns the token's lifecycle.
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    },
  );
}

export type TokenClient = ReturnType<typeof createTokenClient>;
