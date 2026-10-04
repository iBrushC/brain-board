import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Everything but static assets, so auth redirects can't swallow CSS or images.
    // The export viewer is generic code with no board data in it. The MCP
    // endpoint and its OAuth metadata authenticate by bearer token, not cookie,
    // and must answer 401 rather than be redirected to /login.
    "/((?!_next/static|_next/image|favicon.ico|export-viewer/|api/mcp|\\.well-known/|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
