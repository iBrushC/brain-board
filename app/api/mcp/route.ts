import type { AuthInfo } from "@modelcontextprotocol/server";
import { createClient } from "@supabase/supabase-js";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { registerTools, SERVER_INSTRUCTIONS } from "@/lib/mcp/tools";
import type { Database } from "@/lib/database.types";

/**
 * The MCP endpoint agents connect to. Sign-in is Supabase's OAuth 2.1 server:
 * a client without a token gets a 401 pointing at
 * /.well-known/oauth-protected-resource, follows it to Supabase, and comes back
 * with an access token that is the user's own JWT. The tools then query as
 * that user, under RLS.
 */

const handler = createMcpHandler(registerTools, {
  serverInfo: { name: "brain-board", version: "0.1.0" },
  instructions: SERVER_INSTRUCTIONS,
});

/** Checks the token's signature and expiry with Supabase; `undefined` means rejected. */
async function verifyToken(_req: Request, bearerToken?: string): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await supabase.auth.getClaims(bearerToken);
  const claims = data?.claims;
  if (error || !claims?.sub) return undefined;

  return {
    token: bearerToken,
    clientId: typeof claims.client_id === "string" ? claims.client_id : "brain-board",
    scopes: typeof claims.scope === "string" ? claims.scope.split(" ").filter(Boolean) : [],
    expiresAt: claims.exp,
    extra: { userId: claims.sub },
  };
}

const authHandler = withMcpAuth(handler, verifyToken, {
  required: true,
  // Path-suffixed so the metadata's `resource` is this endpoint, not the whole origin.
  resourceMetadataPath: "/.well-known/oauth-protected-resource/api/mcp",
});

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
