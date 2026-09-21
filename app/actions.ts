"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/accounts";

/**
 * Mutations that change who you are or who is in the organization. These are
 * Server Actions rather than browser calls because each one has to reshape the
 * session or the cached page afterwards — sign out clears cookies, accepting an
 * invitation moves the account, an invite refreshes the member rail.
 */

export type ActionResult = { error: string } | undefined;

export async function signOut(): Promise<never> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * Join the organization that invited this account's email address. The match
 * is made in the database against the signed-in user's own email, so accepting
 * someone else's invitation isn't expressible from here.
 *
 * Every account already has a workspace by the time it can click this, so the
 * move only goes through if the one being left is empty — no boards, nobody
 * else in it. `accept_invitation` decides that, and drops the vacated
 * workspace afterwards.
 */
export async function acceptInvitation(): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_invitation");

  if (error) {
    return {
      error:
        error.code === "P0002"
          ? "No pending invitation for your email address."
          : error.message,
    };
  }

  revalidatePath("/", "layout");
  redirect("/projects");
}

/**
 * Invite someone into the viewer's workspace, as a user or as the admin who
 * reads across it. Who may do this is settled by RLS: an admin of the
 * workspace, or the person it was provisioned for.
 */
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
        ? "You can only invite people into a workspace of your own."
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
