"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * The two answers to an agent asking for access. Supabase records the
 * decision against the signed-in user and hands back the URL that returns the
 * browser to the client — with an authorization code on approval, with
 * `access_denied` otherwise.
 */

export async function decideAuthorization(formData: FormData): Promise<void> {
  const authorizationId = String(formData.get("authorization_id") ?? "");
  const approve = formData.get("decision") === "approve";
  if (!authorizationId) redirect("/projects");

  const supabase = await createClient();
  const options = { skipBrowserRedirect: true };
  const { data, error } = approve
    ? await supabase.auth.oauth.approveAuthorization(authorizationId, options)
    : await supabase.auth.oauth.denyAuthorization(authorizationId, options);

  if (error || !data) {
    const message = error?.message ?? "The request could not be completed.";
    redirect(
      `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}&error=${encodeURIComponent(message)}`,
    );
  }

  redirect(data.redirect_url);
}
