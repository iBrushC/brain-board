import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Where the magic link lands. Supabase's stock email template sends a `code`
 * to exchange; a template customized to send `{{ .TokenHash }}` sends
 * `token_hash` + `type` instead. Both are accepted so the flow works whether
 * or not the project's email template has been edited.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  // Only ever a path on this origin, so the callback can't be aimed elsewhere.
  const next = searchParams.get("next");
  const destination = next?.startsWith("/") && !next.startsWith("//") ? next : "/projects";

  const supabase = await createClient();

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: { message: "This sign-in link is missing its token." } };

  if (error) {
    const url = new URL("/login", origin);
    url.searchParams.set(
      "error",
      "That sign-in link didn't work — it may have expired or already been used.",
    );
    return NextResponse.redirect(url);
  }

  return NextResponse.redirect(new URL(destination, origin));
}
