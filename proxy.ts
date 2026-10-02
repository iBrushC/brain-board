import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Everything but static assets, so auth redirects can't swallow CSS or images.
    // The export viewer is generic code with no board data in it.
    "/((?!_next/static|_next/image|favicon.ico|export-viewer/|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
