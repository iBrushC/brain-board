"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/accounts";

/**
 * Mutations that change who you are or who is in the organization. These are
 * Server Actions rather than browser calls because each one has to reshape the
 * session or the cached page afterwards — sign out clears cookies, placement
 * moves you off /welcome, an invite refreshes the member rail.
 */

export type ActionResult = { error: string } | undefined;

export async function signOut(): Promise<never> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * Start a new organization and become its admin. Guarded in Postgres too —
 * `create_organization` refuses if the caller already belongs to one, so this
 * can't be used to hop between organizations.
 */
export async function createOrganization(formData: FormData): Promise<ActionResult> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Enter a name for the workspace." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_organization", { org_name: name });

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect("/projects");
}

/**
 * Join the organization that invited this account's email address. The match
 * is made in the database against the signed-in user's own email, so accepting
 * someone else's invitation isn't expressible from here.
 */
export async function acceptInvitation(): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_invitation");

  if (error) {
    return {
      error:
        error.code === "P0002"
          ? "No pending invitation for your email address. Ask your admin to send one."
          : error.message,
    };
  }

  revalidatePath("/", "layout");
  redirect("/projects");
}

/** Admin-only, enforced by RLS on `organization_invites`. */
export async function inviteMember(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const role: Role = formData.get("role") === "admin" ? "admin" : "user";

  if (!email.includes("@")) return { error: "Enter a valid email address." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id) return { error: "You are not in a workspace yet." };

  const { error } = await supabase
    .from("organization_invites")
    .insert({ org_id: profile.org_id, email, role, invited_by: user.id });

  if (error) {
    return {
      error: error.message.includes("row-level security")
        ? "Only an admin can invite members."
        : error.message,
    };
  }

  revalidatePath("/projects");
}

export async function revokeInvite(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing invitation." };

  const supabase = await createClient();
  const { error } = await supabase.from("organization_invites").delete().eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/projects");
}
