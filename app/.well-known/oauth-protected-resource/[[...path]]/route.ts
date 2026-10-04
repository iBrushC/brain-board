import { metadataCorsOptionsRequestHandler, protectedResourceHandler } from "mcp-handler";

/**
 * RFC 9728 metadata for the MCP endpoint: tells an MCP client that tokens for
 * it come from this project's Supabase Auth, which is the OAuth server.
 *
 * Served at the bare path and with the resource's path appended
 * (`/.well-known/oauth-protected-resource/api/mcp`), the two places RFC 9728
 * clients look. The reported `resource` is derived from whichever was asked for.
 */
const handler = protectedResourceHandler({
  authServerUrls: [`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`],
});

const corsHandler = metadataCorsOptionsRequestHandler();

export { handler as GET, corsHandler as OPTIONS };
