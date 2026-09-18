import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";

/** Paths reachable without a session: the sign-in screen and the email callback. */
function isPublic(pathname: string): boolean {
  return pathname.startsWith("/login") || pathname.startsWith("/auth");
}

/**
 * Refreshes the auth cookie on every request and bounces signed-out visitors to
 * /login. This is an optimistic check only — it keeps the session alive and
 * saves a render, but every page still verifies the user itself (see lib/auth.ts),
 * because a cookie alone is spoofable.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          for (const [key, value] of Object.entries(headers)) {
            response.headers.set(key, value);
          }
        },
      },
    },
  );

  // Nothing may run between createServerClient and getClaims: anything that
  // defers the refresh here is how users end up randomly signed out.
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims && !isPublic(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Must be returned as-is; building a different response here without copying
  // these cookies over desynchronizes the browser and ends the session early.
  return response;
}
